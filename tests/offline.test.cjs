const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
function worker(){
  const events={},stores=new Map();let network=true,calls=0,changed=false,claimed=false,skipped=false;
  const key=r=>typeof r==='string'?r:r.url;
  const fetch=async r=>{calls++;if(!network)throw Error('offline');const pathname=new URL(key(r)).pathname;const file=path.join(root,'dist',pathname==='/'?'index.html':pathname);return new Response(changed&&pathname==='/app.js'?'different release':fs.readFileSync(file));};
  const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {match:async r=>store.get(key(r))?.clone(),put:async(r,v)=>store.set(key(r),v.clone()),addAll:async requests=>{const responses=await Promise.all(requests.map(fetch));requests.forEach((r,i)=>store.set(key(r),responses[i]));}};},keys:async()=>[...stores.keys()],delete:async n=>stores.delete(n)};
  const ctx=vm.createContext({URL,Request,Response,Set,crypto:webcrypto,fetch,caches,self:{location:{href:'https://tabi.test/sw.js'},clients:{claim:async()=>{claimed=true;}},skipWaiting:async()=>{skipped=true;},addEventListener:(n,h)=>events[n]=h}});
  vm.runInContext(fs.readFileSync(path.join(root,'dist/sw.js'),'utf8'),ctx);
  return {ctx,stores,network:v=>network=v,changed:v=>changed=v,calls:()=>calls,claimed:()=>claimed,skipped:()=>skipped,
    install:()=>new Promise((resolve,reject)=>events.install({waitUntil:p=>p.then(resolve,reject)})),
    activate:()=>new Promise((resolve,reject)=>events.activate({waitUntil:p=>p.then(resolve,reject)})),
    request:r=>{let result;events.fetch({request:r,respondWith:p=>result=p});return result;},
    message:type=>new Promise((resolve,reject)=>events.message({data:{type},ports:[{postMessage:resolve}],waitUntil:p=>p.catch(reject)})),
    skip:()=>new Promise(resolve=>events.message({data:{type:'SKIP_WAITING'},waitUntil:p=>p.then(resolve)}))};
}
test('every essential asset and navigation reload work with the network unavailable',async()=>{
  const w=worker();await w.install();await w.activate();w.network(false);let before=w.calls();
  const resources=vm.runInContext('PRECACHE',w.ctx);
  for(const file of resources){const response=await w.request(new Request('https://tabi.test'+file));assert.equal(response.status,200,file);assert.ok((await response.arrayBuffer()).byteLength>0,file);}
  const response=await w.request({url:'https://tabi.test/?source=home-screen',method:'GET',mode:'navigate'});
  assert.match(await response.text(),/pwa.js/);assert.equal(w.calls(),before,'cached lessons must not call the network');
  const check=await w.message('VERIFY_OFFLINE');assert.equal(check.ready,true);assert.equal(check.files,resources.length);assert.equal(w.claimed(),true);
});
test('external links, API paths and non-GET requests are not intercepted',async()=>{
  const w=worker();await w.install();
  assert.equal(w.request(new Request('https://external.test/app.js')),undefined);
  assert.equal(w.request(new Request('https://tabi.test/api/anything')),undefined);
  assert.equal(w.request(new Request('https://tabi.test/app.js',{method:'POST'})),undefined);
  assert.equal(w.request({url:'https://tabi.test/signin-with-chatgpt',method:'GET',mode:'navigate'}),undefined);
});
test('a missing file is reported and can be repaired without clearing progress or mixing releases',async()=>{
  const w=worker();await w.install();const name=vm.runInContext('CACHE_NAME',w.ctx);w.stores.get(name).delete('https://tabi.test/app.js');
  assert.equal((await w.message('OFFLINE_STATUS')).ready,false);
  w.changed(true);const mismatch=await w.message('REPAIR_OFFLINE');assert.equal(mismatch.mismatch,true);assert.equal(mismatch.ready,false);
  w.changed(false);assert.equal((await w.message('REPAIR_OFFLINE')).ready,true);
});
test('activation clears only obsolete Tabi releases and updates wait for user intent',async()=>{
  const w=worker();w.stores.set('tabi-offline-older',new Map());w.stores.set('unrelated-app',new Map());await w.install();assert.equal(w.skipped(),false);await w.activate();assert.equal(w.stores.has('tabi-offline-older'),false);assert.equal(w.stores.has('unrelated-app'),true);await w.skip();assert.equal(w.skipped(),true);
});
test('an interrupted first download cannot falsely report ready',async()=>{
  const w=worker();w.network(false);await assert.rejects(w.install());assert.equal((await w.message('OFFLINE_STATUS')).ready,false);
});
test('manifest icons exist at installable sizes and all dependencies are local',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.webmanifest')));assert.equal(m.display,'standalone');assert.equal(m.start_url,'/');assert.equal(m.id,'/');
  for(const icon of m.icons){const b=fs.readFileSync(path.join(root,'dist',icon.src));const size=+icon.sizes.split('x')[0];assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);}
  const css=fs.readFileSync(path.join(root,'dist/style.css'),'utf8'),html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');assert.doesNotMatch(css,/@import|https?:\/\//);assert.doesNotMatch(html,/(?:src|href)="https?:/);assert.match(html,/apple-touch-icon/);assert.match(html,/manifest.webmanifest/);
});
function learning(){const nodes={};const fake=()=>({innerHTML:'',textContent:'',classList:{add(){},remove(){}},style:{},focus(){}});const memory={};let available=[],spoken=null;
 const ctx=vm.createContext({console,Date,Math,JSON,Set,URL,Blob,setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=v},navigator:{onLine:false},window:{addEventListener(){},speechSynthesis:{getVoices:()=>available,addEventListener(){}}},speechSynthesis:{cancel(){},speak:u=>spoken=u},SpeechSynthesisUtterance:function(t){this.text=t;},document:{querySelector:s=>nodes[s]||(nodes[s]=fake()),querySelectorAll:()=>[],body:{style:{}},addEventListener(){}},confirm:()=>true});
 vm.runInContext(fs.readFileSync(path.join(root,'dist/content.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),ctx);
 return {ctx,memory,voices:v=>available=v,spoken:()=>spoken,run:s=>vm.runInContext(s,ctx)};
}
test('offline audio chooses a local Japanese voice and never a remote-only voice',()=>{
 const app=learning();app.voices([{lang:'ja-JP',localService:false}]);assert.equal(app.run('hasVoice()'),false);app.run('speak("こんにちは")');assert.equal(app.spoken(),null);
 const local={lang:'ja-JP',localService:true};app.voices([{lang:'ja-JP',localService:false},local]);assert.equal(app.run('hasVoice()'),true);app.run('speak("こんにちは")');assert.equal(app.spoken().voice,local);
});
test('offline progress, XP and favourites persist with the original storage key',()=>{
 const app=learning();assert.equal(app.run('cards.length'),120);app.run('state.completed=["0-0"];state.saved=["0-0-0"];schedule("0-0-0",true);addXP(30,"0-0");save();');const s=JSON.parse(app.memory['tabi.learning.v1']);assert.deepEqual(s.completed,['0-0']);assert.deepEqual(s.saved,['0-0-0']);assert.equal(Object.values(s.history)[0].xp,30);assert.ok(s.reviews['0-0-0'].due>Date.now());assert.equal(app.run('validate(JSON.parse(localStorage.getItem(KEY))).completed.length'),1);
});
test('first installation clears the transient update indicator once the worker activates',async()=>{
 const handlers={};let installingHandler,resolveReady;
 const ready=new Promise(resolve=>resolveReady=resolve);
 const installing={state:'installing',addEventListener:(name,cb)=>installingHandler=cb};
 const reg={active:null,waiting:null,installing,addEventListener:(name,cb)=>handlers[name]=cb};
 const nav={onLine:true,serviceWorker:{register:async()=>reg,ready,addEventListener(){}}};
 const win={isSecureContext:true,matchMedia:()=>({matches:false}),navigator:nav,addEventListener(){},dispatchEvent(){}};
 class Channel{constructor(){this.port1={onmessage:null,close(){}};this.port2={postMessage:data=>this.port1.onmessage({data})};}}
 const ctx=vm.createContext({navigator:nav,window:win,document:{readyState:'complete',addEventListener(){}},CustomEvent:function(){},MessageChannel:Channel,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(root,'dist/pwa.js'),'utf8'),ctx);
 await new Promise(resolve=>setImmediate(resolve));
 reg.waiting={postMessage(){}};handlers.updatefound();installing.state='installed';installingHandler();assert.equal(win.TabiPWA.snapshot().update,true);
 reg.waiting=null;reg.active={postMessage:(data,ports)=>ports[0].postMessage({ready:true,files:11})};resolveReady(reg);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(win.TabiPWA.snapshot().phase,'ready');assert.equal(win.TabiPWA.snapshot().update,false);
});
