(() => {
  'use strict';
  const {stories, grammar, placement}=TABI_STUDIO_DATA;
  const lexicon=new Map(TABI_STUDIO_DATA.dictionary.split('\n').map(line=>{
    const [jp,reading,gloss]=line.split('|');
    return [jp,{reading,gloss}];
  }));
  const levels=['A1','A2','B1'];
  const readingLevels={A1:'Beginner',A2:'Elementary',B1:'Intermediate',B2:'Upper intermediate'};
  const skills=['Read','Listen','Words','Grammar','Speak','Write'];
  const tabs=['Today','Read','Words','Grammar','Speak','Write','Stats'];
  const jpText=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const list=v=>Array.isArray(v)?v:[];
  const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';
  const count=(v,max=100000)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):0;
  const key=v=>typeof v==='string'&&/^[a-z0-9-]{1,80}$/.test(v);
  const level=v=>levels.includes(v)?v:'A1';
  const answerIndex=v=>Number.isInteger(v)&&v>=0&&v<3?v:null;
  const fresh=()=>({level:'A1',minutes:15,topic:'All',placement:null,words:{},grammar:{},read:{},imports:[],journal:[],activity:{},input:0});
  function restore(raw){
    const v=object(raw), s=fresh();
    s.level=level(v.level);s.minutes=[10,15,25].includes(v.minutes)?v.minutes:15;
    s.topic=['Travel','Food','Everyday'].includes(v.topic)?v.topic:'All';
    s.input=count(v.input,100000000);
    if(v.placement&&Array.isArray(v.placement.scores)&&v.placement.scores.length===3)
      s.placement={scores:v.placement.scores.map(n=>count(n,3)),total:count(v.placement.total,9)};
    const savedWords=Object.entries(object(v.words));
    if(savedWords.length>1500)savedWords.sort((a,b)=>Number(b[1]?.saved===true)-Number(a[1]?.saved===true));
    for(const [jp,w] of savedWords.slice(0,1500)){
      if(!jpText.test(jp)||jp.length>80)continue;
      s.words[jp]={reading:str(w?.reading,100),gloss:str(w?.gloss,220),example:str(w?.example,420),translation:str(w?.translation,350),seen:count(w?.seen),lookups:count(w?.lookups),saved:w?.saved===true,reps:count(w?.reps,6),due:count(w?.due,Number.MAX_SAFE_INTEGER)};
    }
    for(const [id,g] of Object.entries(object(v.grammar)))if(grammar.some(x=>x[0]===id))
      s.grammar[id]={tries:count(g?.tries),correct:count(g?.correct)};
    for(const [id,r] of Object.entries(object(v.read)).slice(0,100))if(key(id))
      s.read[id]={
        done:r?.done===true,heard:r?.heard===true,answer:answerIndex(r?.answer),
        section:count(r?.section,31),answers:list(r?.answers).slice(0,3).map(answerIndex),
        heardParts:[...new Set(list(r?.heardParts).filter(n=>Number.isInteger(n)&&n>=0&&n<32))]
      };
    s.imports=list(v.imports).slice(0,14).filter(d=>key(d?.id)&&d.id.startsWith('local-')).map(d=>({
      id:d.id,title:str(d.title,80)||'Imported reading',level:level(d.level),kind:d.kind==='Custom story'?'Custom story':'Import',topic:'Personal',art:'book',
      lines:list(d.lines).slice(0,180).filter(l=>typeof l?.[0]==='string'&&Array.isArray(l)).map(l=>[str(l[0],600),str(l[1],350),Number.isFinite(l[2])&&l[2]>=0?l[2]:null]),
      media:['audio','video'].includes(d.media)?d.media:''
    })).filter(d=>d.lines.length);
    s.journal=list(v.journal).slice(0,40).filter(e=>key(e?.id)).map(e=>({id:e.id,day:str(e.day,10),title:str(e.title,80),text:str(e.text,2000)}));
    for(const [day,a] of Object.entries(object(v.activity)).sort(([a],[b])=>b.localeCompare(a)).slice(0,366)){
      if(/^\d{4}-\d{2}-\d{2}$/.test(day))s.activity[day]=Object.fromEntries(skills.map(x=>[x,list(a?.[x]).filter(key).slice(0,60)]));
    }
    return s;
  }

  let tab='Today', readingId=null, practiceId=null, filter='All', format='Story', wordTab='Saved';
  let placementAnswers=null, quiz=null, patternAnswer=null, draft='', writingFeedback=null, showModel=false;
  let audioRun=0, mediaUrl=null, microphone=null, clipUrl=null;
  let readerEnglish=false, readerRomaji=false, readerSpeed='Normal';
  const data=()=>state.studio;
  const doc=id=>[...stories,...data().imports].find(d=>d.id===id);
  function practiceDoc(){
    const source=doc(practiceId);
    if(!source)return stories.find(d=>d.level===data().level&&!d.chapter);
    if(source.model)return source;
    const firstLine=source.lines[0][0];
    return {...source,prompt:'Choose a detail from this reading and say it in a full Japanese sentence.',model:lineText(firstLine),reading:words(firstLine).map(w=>definition(w).reading||w).join(' ')};
  }
  const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const words=line=>line.split(' ').filter(Boolean);
  const lineText=line=>words(line).join('');
  const chip=text=>`<span class="pill">${esc(text)}</span>`;
  const button=(action,label,value='',style='secondary',extra='')=>`<button type="button" class="${style}" data-studio-action="${action}" data-value="${esc(value)}" ${extra}>${label}</button>`;
  function answerLabel(answer){
    const reading=state.settings.romaji?lexicon.get(answer)?.reading:null;
    return reading?`<span class="option-copy"><span lang="ja">${esc(answer)}</span><span class="option-romaji">${esc(reading)}</span></span>`:esc(answer);
  }
  const options=(action,answers,selected,correct)=>`<div class="studio-options">${answers.map((a,i)=>button(action,answerLabel(a),i,`secondary ${selected===i?(i===correct?'studio-right':'studio-wrong'):''}`)).join('')}</div>`;
  const heading=(label,title,detail='',actions='')=>`<div class="studio-top"><div><p class="eyebrow">${label}</p><h2>${esc(title)}</h2>${detail?`<p class="muted">${esc(detail)}</p>`:''}</div><div class="studio-controls">${actions}</div></div>`;
  const panel=html=>`<div class="studio-panel studio-pad">${html}</div>`;
  const select=(name,values,current)=>`<select name="${name}" id="studio-${name}">${values.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
  function activity(skill,id){
    const daily=data().activity[dateKey()]??(data().activity[dateKey()]={});
    const bucket=daily[skill]??(daily[skill]=[]);
    if(!bucket.includes(id)&&bucket.length<60)bucket.push(id);
  }
  function word(jp){
    return data().words[jp]??(data().words[jp]={reading:'',gloss:'',example:'',translation:'',seen:0,lookups:0,saved:false,reps:0,due:0});
  }
  function definition(jp){
    const w=data().words[jp], d=lexicon.get(jp);
    return {reading:w?.reading||d?.reading||'',gloss:w?.gloss||d?.gloss||''};
  }
  const tier=w=>w?.reps>=5?'Mastered':w?.reps>=3?'Known':w?.seen>1||w?.reps?'Familiar':'New';
  const due=()=>Object.entries(data().words).filter(([,w])=>w.saved&&w.due<=Date.now()).sort((a,b)=>a[1].due-b[1].due).map(([jp])=>jp);
  const progress=id=>data().read[id]??(data().read[id]={done:false,heard:false,answer:null,section:0,answers:[],heardParts:[]});
  const dayCount=day=>Object.values(data().activity[day]||{}).reduce((n,v)=>n+v.length,0);
  function countEncounters(lines){
    const terms=lines.flatMap(([line])=>words(line).filter(w=>jpText.test(w)&&w.length<=80));
    data().input+=terms.length;
    terms.forEach(jp=>{word(jp).seen++;});
  }
  function markInput(d,skill){
    const p=progress(d.id), field=skill==='Read'?'done':'heard';
    if(!p[field]){
      p[field]=true;
      countEncounters(d.lines);
    }
    activity(skill,d.id);save();
  }
  function markPartListened(d,section){
    if(section.total===1){markInput(d,'Listen');return;}
    const p=progress(d.id);
    if(!p.heard&&!p.heardParts.includes(section.index)){
      p.heardParts.push(section.index);
      countEncounters(d.lines.slice(section.start,section.end));
      p.heard=p.heardParts.length===section.total;
    }
    activity('Listen',d.id);save();
  }
  function changeSection(index){
    const d=doc(readingId);
    if(!Number.isInteger(index)||index<0||index>=(d?.sections?.length||0))return;
    stopAudio();progress(d.id).section=index;save();render();window.scrollTo(0,0);
    $('.studio-section-heading h3')?.focus({preventScroll:true});
  }
  function highlight(i,j=-1){
    document.querySelectorAll('.studio-line-live,.studio-word-live').forEach(el=>el.classList.remove('studio-line-live','studio-word-live'));
    const line=$(`[data-studio-line="${i}"]`);
    line?.classList.add('studio-line-live');
    if(j>=0)line?.querySelector(`[data-token="${j}"]`)?.classList.add('studio-word-live');
  }
  function stopAudio(){audioRun++;window.speechSynthesis?.cancel();$('#studio-media')?.pause();highlight(-1);}
  function releaseRecording(){
    if(microphone){
      const entry=microphone;microphone=null;
      clearTimeout(entry.timer);
      if(entry.recorder.state!=='inactive')entry.recorder.stop();
      entry.stream.getTracks().forEach(track=>track.stop());
    }
    if(clipUrl){URL.revokeObjectURL(clipUrl);clipUrl=null;}
  }
  function leave(){
    stopAudio();releaseRecording();
    if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null;}
  }
  function go(next){
    leave();tab=next;
    if(next==='Read')readingId=null;
    if(next==='Words')quiz=null;
    render();window.scrollTo(0,0);
  }
  function open(id){
    if(!doc(id))return;
    leave();readingId=id;tab='Read';render();window.scrollTo(0,0);
  }
  function recommended(){
    const s=data(), reviewing=new Set(due());
    const score=d=>d.lines.flatMap(l=>words(l[0])).filter(w=>reviewing.has(w)).length*4+(d.topic===s.topic?3:0)+(s.read[d.id]?.done?0:2);
    return stories.filter(d=>!d.chapter&&d.level===s.level).sort((a,b)=>Number(Boolean(b.sections))-Number(Boolean(a.sections))||score(b)-score(a));
  }

  function today(){
    const s=data(), current=s.activity[dateKey()]||{}, next=recommended()[0], alternate=Number(dateKey().slice(-2))%2?'Speak':'Write';
    const tasks=[
      ['Words','Review saved words',`${due().length} cards due`,'tab','Words'],
      ['Grammar','Try one grammar pattern',`${s.level} study level`,'tab','Grammar'],
      ['Read',next.title,`${next.level} · ${next.kind}`,'open',next.id],
      ['Listen','Listen to today’s reading','Use Japanese device audio','listen',next.id],
      ['Speak','Say a reply aloud','Compare with a model answer','tab','Speak'],
      ['Write','Write a short response','Save it in your journal','tab','Write']
    ];
    const plan=s.minutes===10?tasks.filter(t=>['Words','Read',alternate].includes(t[0])):s.minutes===15?tasks.filter(t=>t[0]!== (alternate==='Speak'?'Write':'Speak')):tasks;
    const month=dateKey().slice(0,7);
    const activeDays=Object.keys(s.activity).filter(day=>day.startsWith(month)&&dayCount(day)>0).length;
    return heading('YOUR STUDY PLAN','One Japanese session at a time.',`${s.level} · ${plan.filter(t=>current[t[0]]?.length).length}/${plan.length} activities done`,button('placement',s.placement?'Retake placement':'Find my starting level'))+
      (s.placement?`<p class="info">Placement check · ${s.placement.total}/9 correct. ${levels.map((l,i)=>`${l} ${s.placement.scores[i]}/3`).join(' · ')}.</p>`:'')+
      `<form data-studio-form="plan" class="studio-controls"><label>Level ${select('level',levels,s.level)}</label><label>Minutes a day ${select('minutes',[10,15,25],s.minutes)}</label><label>Interest ${select('topic',['All','Travel','Food','Everyday'],s.topic)}</label><button class="secondary">Save plan</button></form>
      <div class="studio-panel">${plan.map(([skill,title,detail,action,id])=>`<div class="studio-row"><div><p class="eyebrow">${skill}${current[skill]?.length?' · DONE':''}</p><h3>${esc(title)}</h3><p class="muted">${esc(detail)}</p></div>${button(action,current[skill]?.length?'Revisit':'Start',id)}</div>`).join('')}</div>
      ${panel(`<h3>This month</h3><p class="muted">${activeDays} study days logged · Aim for five ${s.minutes}-minute sessions a week.</p>
      <ol class="studio-month"><li><strong>Week 1</strong> Read at ${s.level} and save words you want to use.</li><li><strong>Week 2</strong> Listen to the readings and review your due cards.</li><li><strong>Week 3</strong> Reuse familiar words in a role-play and a journal entry.</li><li><strong>Week 4</strong> Revisit tricky patterns and retake placement when ready.</li></ol>`)}`;
  }
  function placementPage(){
    const q=placement[placementAnswers.length];
    return panel(`<p class="eyebrow">PLACEMENT · ${placementAnswers.length+1}/${placement.length}</p><h2>${q[0]} · ${q[1]}</h2><p class="studio-question">${esc(q[2])}</p>${options('placement-answer',q[3])}<p class="muted">This short reading, vocabulary and grammar check suggests a starting level.</p>${button('cancel-placement','Back to plan','','linkbtn')}`);
  }
  function readingTile(d,titleTag){
    const local=d.id.startsWith('local-'), status=data().read[d.id];
    return `<article class="studio-tile">
      <span class="studio-icon">${icon(d.art)}</span>
      <div class="studio-tags">${chip(d.level)}${chip(d.kind)}${d.sections?chip('Extended reading'):local?'':chip('Quick practice')}${status?.done?chip('Read ✓'):''}</div>
      <${titleTag}>${esc(d.title)}</${titleTag}>
      ${d.jp?`<p lang="ja" class="muted">${esc(d.jp)}</p>`:''}
      <p class="muted">${esc(d.topic)} · ${readingLength(d)}${d.sections?` · ${d.sections.length}${d.branches?' shared':''} parts`:''}${d.branches?' · Choose your path':''}</p>
      ${button('open',status?.section>0?'Continue reading':'Open reading',d.id)}
      ${local?button('remove-import','Remove import',d.id,'linkbtn'):''}
    </article>`;
  }
  function library(){
    const all=[...stories.filter(d=>!d.chapter),...data().imports];
    const filtered=filter==='Recommended'?recommended():all.filter(d=>filter==='All'||(filter==='Imports'?d.id.startsWith('local-'):d.level===filter));
    const tiles=filtered.filter(d=>format==='All'||d.kind===format||(format==='Story'&&d.branches));
    const grid=(entries,titleTag='h3')=>`<div class="studio-grid">${entries.map(d=>readingTile(d,titleTag)).join('')}</div>`;
    const groups=Object.entries(readingLevels).map(([id,label])=>{
      const entries=tiles.filter(d=>d.level===id);
      return entries.length?`<section class="studio-library-level" aria-labelledby="studio-library-${id}">
        <h3 id="studio-library-${id}">${id} · ${label}</h3>
        ${chip(`${entries.length} ${entries.length===1?'story':'stories'}`)}
        ${grid(entries,'h4')}
      </section>`:'';
    }).join('');
    return heading('READ & LISTEN','Japanese story library','Explore A1 to B2 stories with audio, vocabulary and quizzes.',button('tab','Import text or media','Import')+button('tab','Build a short story','Builder'))+
      `<div class="studio-controls"><label>Level ${select('filter',['All',...Object.keys(readingLevels),'Recommended','Imports'],filter)}</label><label>Format ${select('format',['All','Story','Dialogue','Article','Podcast','Book','Import','Custom story'],format)}</label></div>`+
      (tiles.length?(format==='Story'?groups:grid(tiles)):'<p class="info">No readings match this filter.</p>');
  }
  function cueLabel(d,cue){
    const time=`${Math.floor(cue/60)}:${String(Math.floor(cue%60)).padStart(2,'0')}`;
    return d.media?button('seek',`Play from ${time}`,cue,'linkbtn'):`<small class="studio-help">${time}</small>`;
  }
  function readingSection(d){
    const total=d.sections?.length||1;
    const index=Math.min(data().read[d.id]?.section||0,total-1);
    return {
      index,total,
      title:d.sections?.[index]?.title,
      start:d.sections?.[index]?.start||0,
      end:d.sections?.[index+1]?.start??d.lines.length
    };
  }
  function readingLength(d){
    const n=d.lines.reduce((sum,[line])=>sum+words(line).filter(w=>jpText.test(w)).length,0);
    if(d.branches&&d.sections){
      const routes=d.branches.map(([,id])=>n+doc(id).lines.reduce((sum,[line])=>sum+words(line).filter(w=>jpText.test(w)).length,0));
      return `${Math.min(...routes)}–${Math.max(...routes)} words per route`;
    }
    return `${n} Japanese ${n===1?'word':'words'}`;
  }
  function sectionNavigation(d,section){
    if(section.total===1)return '';
    return `<div class="studio-section-nav">
      ${section.index>0?button('reading-section','Previous part',section.index-1):''}
      <label>Part <select id="studio-reading-section">${d.sections.map((part,index)=>`<option value="${index}" ${index===section.index?'selected':''}>${index+1}. ${esc(part.title)}</option>`).join('')}</select></label>
      ${section.index<section.total-1?button('reading-section','Next part',section.index+1,'primary'):''}
    </div>`;
  }
  function readingLine(d,i){
    const [line,en,cue]=d.lines[i], tokens=words(line);
    return `<div class="studio-line" data-studio-line="${i}">
      <div class="studio-line-main">
        ${button('play-line',icon('sound'),i,'studio-line-audio','aria-label="Play Japanese line"')}
        <div lang="ja" class="studio-ja">${tokens.map((jp,j)=>jpText.test(jp)?button('word',esc(jp),jp,`studio-word ${data().words[jp]?.saved?'studio-saved':''}`,`data-token="${j}" data-line-index="${i}"`):`<span data-token="${j}">${esc(jp)}</span>`).join('')}</div>
      </div>
      <p class="studio-romaji" ${readerRomaji?'':'hidden'}>${tokens.map(jp=>esc(definition(jp).reading||jp)).join(' ')}</p>
      ${en?`<p class="studio-english" ${readerEnglish?'':'hidden'}>${esc(en)}</p>`:''}
      ${cue!=null?cueLabel(d,cue):''}
    </div>`;
  }
  function readingQuiz(d,result){
    const questions=d.questions||(d.question?[d.question]:[]);
    if(!questions.length)return '';
    return panel(`<p class="eyebrow">CHECK YOUR UNDERSTANDING</p>
      ${questions.map(([prompt,choices,correct],i)=>{
        const selected=d.questions?result.answers?.[i]:result.answer;
        return `<div class="studio-reading-question">
          <h3>${questions.length>1?`${i+1}. `:''}${esc(prompt)}</h3>
          <div class="studio-options">${choices.map((choice,index)=>button(
            'read-answer',answerLabel(choice),`${i}:${index}`,
            `secondary ${selected===index?(index===correct?'studio-right':'studio-wrong'):''}`,
            `aria-pressed="${selected===index}"`
          )).join('')}</div>
          ${selected!=null?`<p class="info">${selected===correct?'Correct.':`Answer: ${esc(choices[correct].replace(/\.$/,''))}.`}</p>`:''}
        </div>`;
      }).join('')}`);
  }
  function reader(d){
    const result=data().read[d.id]||{};
    const section=readingSection(d);
    const complete=section.index===section.total-1;
    const nav=sectionNavigation(d,section);
    return heading(`${esc(d.kind)} · ${d.level}`,d.title,[d.jp,readingLength(d)].filter(Boolean).join(' · '),button('tab','Back to library','Read'))+
      `<div class="studio-panel studio-reader ${d.sections?'studio-extended-reader':''}">
      ${nav}
      ${section.title?`<div class="studio-section-heading"><p class="eyebrow">PART ${section.index+1} OF ${section.total}</p><h3 tabindex="-1">${esc(section.title)}</h3><progress value="${section.index+1}" max="${section.total}" aria-label="Story position"></progress></div>`:''}
      <div class="studio-controls">
        ${button('play-all',`${icon('sound')} ${section.total>1?'Listen to this part':'Listen to all'}`,d.id,'primary')}
        ${button('stop','Stop')}
        <label>Speed ${select('speed',['Slow','Normal','Full'],readerSpeed)}</label>
        <label><input id="studio-english" type="checkbox" ${readerEnglish?'checked':''}> English</label>
        <label><input id="studio-romaji" type="checkbox" ${readerRomaji?'checked':''}> Romaji</label>
      </div>
      ${d.media?'<div id="studio-media-wrap"><p class="muted">Opening saved media…</p></div>':''}
      ${Array.from({length:section.end-section.start},(_,i)=>readingLine(d,section.start+i)).join('')}
      <div id="studio-gloss" class="studio-gloss" hidden></div>
      <p class="studio-help">Tap a word for its meaning and pronunciation. Word highlighting depends on your Japanese voice.</p>
      ${section.total>1&&!complete?`<div class="studio-controls">${button('reading-section','Next part',section.index+1,'primary')}</div>`:''}
      </div>
      ${complete?readingQuiz(d,result):''}
      ${complete?`<div class="studio-controls">${button('mark-read',result.done?'Read ✓':'Mark as read',d.id,'primary')}${button('practise','Speak about this','Speak')}${button('practise','Write about this','Write')}${d.pattern?button('pattern','Related grammar',d.pattern):''}</div>`:''}
      ${complete&&d.branches?panel(`<h3>What happens next?</h3><div class="studio-controls">${d.branches.map(([title,id])=>button('open',esc(title),id)).join('')}</div>`):''}
      ${complete&&d.chapter?`<div class="studio-controls">${button('open','Back to the branching story','branch')}</div>`:''}`;
  }

  function importPage(){
    return panel(`<h2>Bring your own Japanese.</h2><p class="muted">Paste a reading or import TXT, SRT, or VTT captions. Attach audio or video to play it alongside the transcript.</p><form data-studio-form="import" class="studio-form"><label>Title <input name="title" required maxlength="80"></label><label>Level ${select('level',levels,data().level)}</label><label>Japanese text or captions <textarea name="text" rows="6" maxlength="14000"></textarea></label><label>Transcript file <input name="transcript" type="file" accept=".txt,.srt,.vtt,text/plain,text/vtt"></label><label>Optional media · up to 60 MB <input name="media" type="file" accept="audio/*,video/*"></label><p class="studio-help">Files stay on this device. SRT and VTT times follow the attached player. The transcript is included in progress backups.</p><div class="studio-controls"><button class="primary">Save to library</button>${button('tab','Cancel','Read')}</div></form>`);
  }
  function builderPage(){
    return panel(`<h2>Build a travel story.</h2><p class="muted">Choose a city, drink and difficulty. Tabi builds a reading from Japanese sentence patterns.</p><form data-studio-form="builder" class="studio-form"><label>City ${select('city',['京都','大阪','神戸','東京'])}</label><label>Drink ${select('drink',['コーヒー','お茶','水'])}</label><label>Level ${select('level',levels,data().level)}</label><div class="studio-controls"><button class="primary">Build story</button>${button('tab','Cancel','Read')}</div></form>`);
  }
  function vocabulary(){
    if(quiz)return reviewPage();
    const s=data(), saved=Object.keys(s.words).filter(jp=>s.words[jp].saved);
    const rows=wordTab==='Common words'?[...lexicon.keys()]:wordTab==='Encountered'?Object.keys(s.words):saved;
    return heading('VOCABULARY','Keep the words you meet.',`${saved.length} saved · ${due().length} due`,button('review','Review due cards','','primary')+button('seed','Add 20 common words'))+
      `<div class="studio-controls">${['Saved','Encountered','Common words'].map(v=>button('word-tab',v,v,`secondary ${wordTab===v?'studio-right':''}`)).join('')}<label>Search <input id="studio-word-search" placeholder="Japanese, romaji or English"></label></div>
      <div class="studio-panel">${rows.map(jp=>{
        const d=definition(jp),w=s.words[jp];
        return `<div class="studio-row studio-vocab" data-search="${esc(`${jp} ${d.reading} ${d.gloss}`)}"><div><h3 lang="ja">${esc(jp)}</h3><p>${esc(d.reading)} · ${esc(d.gloss||'No meaning saved')}</p><p class="muted">${tier(w)} · ${w?.seen||0} seen · ${w?.lookups||0} lookups</p></div>${button('audio',icon('sound'),jp,'secondary','aria-label="Listen to word"')}${button(w?.saved?'remove-card':'save-word',w?.saved?'Remove card':'Save card',jp)}</div>`;
      }).join('')||'<p class="studio-pad muted">Save a word from a reading, or add the starter deck.</p>'}</div>`;
  }
  function reviewPage(){
    const jp=quiz.queue[quiz.index];
    if(!jp)return panel(`<h2>Review complete.</h2><p>${quiz.queue.length} ${quiz.queue.length===1?'word':'words'} practised.</p>${button('tab','Back to words','Words')}`);
    const w=word(jp),d=definition(jp);
    return panel(`<p class="eyebrow">REVIEW · ${quiz.index+1}/${quiz.queue.length}</p><h2 lang="ja">${esc(jp)}</h2>${w.example?`<p lang="ja">${esc(w.example)}</p>`:''}<div class="studio-controls">${button('audio',`${icon('sound')} Listen`,jp)}${quiz.revealed?'':button('reveal','Reveal answer','','primary')}</div>
      ${quiz.revealed?`<p><strong>${esc(d.reading)}</strong> · ${esc(d.gloss)}</p>${w.translation?`<p class="muted">${esc(w.translation)}</p>`:''}<div class="studio-controls">${button('rate','Again','again')}${button('rate','Good','good','primary')}</div>`:''}${button('tab','End review','Words','linkbtn')}`);
  }
  function grammarPage(){
    return heading('GRAMMAR','See the pattern. Try it.')+`<div class="studio-grid">${grammar.map(g=>{
      const [id,l,title,explanation,jp,en,question,answers,correct]=g, stats=data().grammar[id];
      const selected=patternAnswer?.id===id?patternAnswer.index:null;
      return `<article class="studio-tile" id="pattern-${id}"><div class="studio-tags">${chip(l)}${stats?chip(`${stats.correct}/${stats.tries} correct`):''}</div><h3>${esc(title)}</h3><p>${esc(explanation)}</p><p lang="ja"><strong>${esc(jp)}</strong></p><p class="muted">${esc(en)}</p><p lang="ja">${esc(question)}</p><div class="studio-options">${answers.map((a,i)=>button('grammar-answer',answerLabel(a),`${id}:${i}`,`secondary ${selected===i?(i===correct?'studio-right':'studio-wrong'):''}`)).join('')}</div>${selected!=null?`<p class="info">${selected===correct?'Correct.':`Use ${esc(answers[correct])}.`}</p>`:''}</article>`;
    }).join('')}</div>`;
  }
  function writePage(){
    const d=practiceDoc();
    return heading('WRITING','Put a thought into Japanese.')+panel(`<p class="eyebrow">${esc(d.title)}</p><h3>${esc(d.prompt)}</h3><p class="muted">Answer the prompt or write a journal entry about your day.</p><form class="studio-form" data-studio-form="journal"><label>Your Japanese <textarea name="text" id="studio-draft" rows="5" required maxlength="2000" placeholder="今日は…">${esc(draft)}</textarea></label><div class="studio-controls"><button class="primary">Save journal entry</button>${button('check-writing','Compare with model')}</div></form>${writingFeedback?`<div class="info">${writingFeedback.map(esc).join('<br>')}<p lang="ja">${esc(d.model)}</p><p>${esc(d.reading)}</p></div>`:''}`)+panel(`<h3>Journal</h3>${data().journal.map(e=>`<details class="studio-journal"><summary>${esc(e.day)} · ${esc(e.title)}</summary><p lang="ja">${esc(e.text).replaceAll('\n','<br>')}</p></details>`).join('')||'<p class="muted">Your entries will appear here.</p>'}`);
  }
  function speakPage(){
    const d=practiceDoc();
    return heading('SPEAKING','Say it out loud.','Practise a response based on your reading.',button('roleplay','Open guided role-plays'))+
      panel(`<p class="eyebrow">${esc(d.title)}</p><h3>${esc(d.prompt)}</h3><p class="muted">Say your reply, record up to 30 seconds, and compare with the model.</p><div class="studio-controls">${button('record',`${icon('mic')} Record reply`)}${button('model',showModel?'Hide model':'Show model')}${button('spoken','Mark speaking done','','primary')}</div><div id="studio-recording"></div><div id="studio-model" ${showModel?'':'hidden'} class="info"><p lang="ja">${esc(d.model)}</p><p>${esc(d.reading)}</p>${button('audio','Listen to model',d.model,'linkbtn')}</div>`);
  }
  function stats(){
    const s=data(), inputLevel=Math.min(100,Math.floor(Math.sqrt(s.input/50))+1);
    const totals=Object.fromEntries(skills.map(x=>[x,Object.values(s.activity).reduce((n,d)=>n+(d[x]?.length||0),0)]));
    const familiarity=['New','Familiar','Known','Mastered'].map(t=>chip(`${t} · ${Object.values(s.words).filter(w=>tier(w)===t).length}`)).join('');
    return heading('PROGRESS','See what you’ve practised.',`${s.level} study level`)+`<div class="studio-grid"><article class="studio-tile"><strong class="studio-number">${s.input.toLocaleString()}</strong><p>Japanese word encounters</p><p class="muted">Input level ${inputLevel}/100${inputLevel<100?` · ${(50*inputLevel**2-s.input).toLocaleString()} to next level`:''}</p></article><article class="studio-tile"><strong class="studio-number">${Object.keys(s.words).length}</strong><p>Vocabulary tracked</p></article><article class="studio-tile"><strong class="studio-number">${Object.values(s.grammar).filter(g=>g.correct>0).length}/${grammar.length}</strong><p>Grammar patterns practised correctly</p></article></div>`+
      panel(`<h3>Vocabulary familiarity</h3><div class="studio-controls">${familiarity}</div><h3>Practice across six skills</h3><div class="studio-controls">${skills.map(x=>chip(`${x} · ${totals[x]}`)).join('')}</div>`)+
      panel(`<h3>Last 12 weeks</h3><div class="studio-heatmap" aria-label="Practice activity by day">${Array.from({length:84},(_,i)=>{const d=daysAgo(83-i),n=dayCount(d);return `<span data-activity="${Math.min(n,4)}" title="${d} · ${n} activities" aria-label="${d} · ${n} activities"></span>`;}).join('')}</div>`);
  }
  function html(){
    const pages={Today:()=>placementAnswers?placementPage():today(),Read:()=>doc(readingId)?reader(doc(readingId)):library(),Words:vocabulary,Grammar:grammarPage,Speak:speakPage,Write:writePage,Stats:stats,Import:importPage,Builder:builderPage};
    return `<section id="studio"><div class="studio-banner"><p class="eyebrow">TABI IMMERSION STUDIO</p><h1>Make Japanese part of your day.</h1><p>Read at your level, keep useful words, and practise saying what you mean.</p></div><nav class="studio-tabs" aria-label="Immersion Studio">${tabs.map(t=>button('tab',t,t,'',tab===t?'aria-current="page"':'')).join('')}</nav><div class="studio-body">${pages[tab]()}</div></section>`;
  }

  function showGloss(jp,index){
    const d=doc(readingId), l=d?.lines[index], box=$('#studio-gloss');
    if(!l||!box||!jpText.test(jp))return;
    if(jp.length>80)return;
    const w=word(jp), def=definition(jp);
    w.lookups++;w.example=lineText(l[0]);w.translation=l[1]||'';save();
    box.hidden=false;
    box.innerHTML=`<div class="studio-top"><div><h3 lang="ja">${esc(jp)}</h3><p>${esc(def.reading)}</p></div>${button('close-gloss','Close')}</div><p>${esc(def.gloss||'Add a meaning for this word.')}</p><p lang="ja" class="muted">${esc(w.example)}</p>${def.gloss?`<div class="studio-controls">${button('audio',`${icon('sound')} Listen`,jp)}${button('save-word',w.saved?'Saved ✓':'Save to flashcards',jp,'primary')}</div>`:`<form class="studio-form" data-studio-form="gloss"><input type="hidden" name="jp" value="${esc(jp)}"><label>Romaji <input name="reading" maxlength="100"></label><label>Meaning <input name="gloss" maxlength="220" required></label><button class="primary">Save flashcard</button></form>`}`;
    box.querySelector('[data-studio-action="close-gloss"]')?.focus({preventScroll:true});
  }
  function saveWord(jp){
    if(!jpText.test(jp)||jp.length>80)return;
    const w=word(jp),d=definition(jp);
    if(!d.gloss){toast('Open the word in your reading to add a meaning.');return;}
    Object.assign(w,d);
    if(!w.saved){w.saved=true;w.due=Date.now();}
    save();
    if(tab==='Read'){
      document.querySelectorAll('.studio-word').forEach(b=>{if(b.dataset.value===jp)b.classList.add('studio-saved');});
      const button=$('#studio-gloss [data-studio-action="save-word"]');if(button)button.textContent='Saved ✓';
      toast('Word saved to flashcards.');
    }else render();
  }
  function playReading(d,first,all=true){
    const voice=japaneseVoice();
    if(!d||!voice){toast('Enable a Japanese device voice to play the reading.');return;}
    stopAudio();const run=audioRun, section=readingSection(d);
    function play(i){
      if(run!==audioRun||readingId!==d.id)return;
      if(i===section.end){highlight(-1);markPartListened(d,section);toast('Listening complete.');return;}
      const parts=words(d.lines[i][0]), utterance=new SpeechSynthesisUtterance(parts.join(''));
      utterance.lang='ja-JP';utterance.voice=voice;
      utterance.rate={Slow:.65,Normal:.85,Full:1}[readerSpeed];
      highlight(i);
      utterance.onboundary=e=>{
        if(run!==audioRun)return;
        let end=0;
        const j=parts.findIndex(w=>{end+=w.length;return e.charIndex<end;});
        highlight(i,j);
      };
      utterance.onend=()=>{if(run===audioRun){if(all)play(i+1);else highlight(-1);}};
      utterance.onerror=e=>{if(run===audioRun&&!['canceled','interrupted'].includes(e.error)){highlight(-1);toast('Japanese audio could not play.');}};
      window.speechSynthesis.speak(utterance);
    }
    play(first??section.start);
  }
  function parseTranscript(input){
    const text=input.replace(/\r/g,'').trim(), out=[];
    const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ja',{granularity:'word'}):null;
    const segment=value=>{
      const pieces=segmenter?[...segmenter.segment(value)].map(item=>item.segment):[...value];
      const result=[];
      for(let i=0;i<pieces.length;){
        if(!pieces[i].trim()){i++;continue;}
        let term='', match='', end=i+1;
        for(let j=i;j<pieces.length&&j<i+8&&pieces[j].trim();j++){
          term+=pieces[j];
          if(lexicon.has(term)){match=term;end=j+1;}
        }
        result.push(match||pieces[i]);i=end;
      }
      return result.join(' ');
    };
    if(text.includes('-->'))for(const block of text.split(/\n\s*\n/)){
      const lines=block.split('\n'), i=lines.findIndex(l=>l.includes('-->'));
      if(i<0)continue;
      const fields=lines[i].split('-->')[0].trim().replace(',','.').split(':').map(Number);
      const time=fields.every(Number.isFinite)?fields.reduce((a,n)=>a*60+n,0):null;
      const content=lines.slice(i+1).join(' ').replace(/<[^>]*>/g,'').trim();
      if(content)out.push([segment(content.slice(0,350)),'',time]);
    }
    if(!out.length)for(const l of text.match(/[^。！？\n]+[。！？]?/g)||[])if(l.trim())out.push([segment(l.trim().slice(0,350)),'',null]);
    return out.slice(0,180);
  }
  function media(mode,id,blob){
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(Error('Local media storage is unavailable.'));return;}
      const open=indexedDB.open('tabi.studio.media',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('files');
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result, tx=db.transaction('files',mode==='get'?'readonly':'readwrite'), store=tx.objectStore('files');
        const req=mode==='get'?store.get(id):mode==='delete'?store.delete(id):store.put(blob,id);
        tx.oncomplete=()=>{db.close();resolve(req.result);};
        tx.onabort=()=>{db.close();reject(tx.error||Error('Media storage failed.'));};
      };
    });
  }
  async function mountMedia(d){
    const wrap=$('#studio-media-wrap');
    try {
      const blob=await media('get',d.id);
      if(!wrap?.isConnected)return;
      if(!blob){wrap.textContent='The transcript is available. The media file is stored separately on the original device.';return;}
      if(mediaUrl)URL.revokeObjectURL(mediaUrl);
      mediaUrl=URL.createObjectURL(blob);
      const player=document.createElement(d.media);player.id='studio-media';player.controls=true;player.preload='metadata';player.src=mediaUrl;
      if(d.media==='video')player.playsInline=true;
      player.ontimeupdate=()=>{
        let i=-1;d.lines.forEach((line,index)=>{if(line[2]!=null&&line[2]<=player.currentTime)i=index;});highlight(i);
      };
      player.onended=()=>{highlight(-1);markInput(d,'Listen');};
      wrap.replaceChildren(player);
    }catch{if(wrap?.isConnected)wrap.textContent='The media could not be opened. The transcript is available.';}
  }
  async function importReading(form,fields){
    if(data().imports.length>=14){toast('The local library can hold 14 imports and custom stories.');return;}
    const submit=form.querySelector('button:not([type])');if(submit)submit.disabled=true;
    try{
      const transcript=fields.get('transcript'), file=fields.get('media');
      if(transcript?.size>140000)throw Error('Choose a transcript smaller than 140 KB.');
      const text=(transcript?.size?await transcript.text():str(fields.get('text'),14000)).slice(0,14000);
      const lines=parseTranscript(text);
      if(!jpText.test(text)||!lines.length)throw Error('Add a Japanese transcript or reading.');
      if(file?.size>60*1024*1024)throw Error('Choose a media file smaller than 60 MB.');
      const mediaKind=file?.size?file.type.split('/')[0]:'';
      if(file?.size&&!['audio','video'].includes(mediaKind))throw Error('Choose a supported audio or video file.');
      const id=uid('local'), title=str(fields.get('title'),80).trim()||'Imported reading';
      if(mediaKind)await media('put',id,file);
      data().imports.unshift({id,title,level:level(fields.get('level')),kind:'Import',topic:'Personal',art:'book',lines,media:mediaKind});
      save();filter='Imports';format='All';open(id);
    }catch(e){toast(e?.message||'Could not save the import.');}
    finally{if(submit)submit.disabled=false;}
  }
  async function removeImport(id){
    const d=data().imports.find(entry=>entry.id===id);
    if(!d||!confirm('Remove this reading and its attached media from this device?'))return;
    try{
      if(d.media)await media('delete',id);
      data().imports=data().imports.filter(entry=>entry.id!==id);
      delete data().read[id];
      save();render();
    }catch{toast('Could not remove the saved media. Try again.');}
  }
  function buildStory(fields){
    if(data().imports.length>=14){toast('The local library can hold 14 imports and custom stories.');return;}
    const city=fields.get('city'), drink=fields.get('drink'), l=level(fields.get('level'));
    if(!['京都','大阪','神戸','東京'].includes(city)||!['コーヒー','お茶','水'].includes(drink))return;
    const place=definition(city).gloss, beverage=definition(drink).gloss;
    const lines=[[`朝 、 ${city} に 行きました 。`,`In the morning, I went to ${place}.`],
      [`カフェ で ${drink} を 飲みました 。`,`At a café, I drank ${beverage}.`],['また 来ます 。','I will come again.']];
    if(l!=='A1')lines.push(['店 が 開く 前に 、 川 の 近く で 写真 を 撮りました 。','Before shops opened, I took photos near the river.']);
    if(l==='B1')lines.push([`${drink} を 飲み ながら 、 今日 の 予定 を 変更しました 。`,`While drinking ${beverage}, I changed today's plans.`]);
    const id=uid('local');data().imports.unshift({id,title:`A day in ${place}`,level:l,kind:'Custom story',topic:'Personal',art:'sun',lines,media:''});save();filter='Imports';format='All';open(id);
  }
  async function recordReply(){
    if(microphone){if(microphone.recorder.state==='recording')microphone.recorder.stop();return;}
    const box=$('#studio-recording'), b=$('[data-studio-action="record"]');
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Recording is unavailable in this browser.');return;}
    b.disabled=true;let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!box.isConnected){stream.getTracks().forEach(t=>t.stop());return;}
      const recorder=new MediaRecorder(stream), chunks=[], entry={stream,recorder,timer:null};
      microphone=entry;
      recorder.ondataavailable=e=>chunks.push(e.data);
      recorder.onstop=()=>{
        clearTimeout(entry.timer);stream.getTracks().forEach(t=>t.stop());
        if(microphone!==entry)return;
        microphone=null;if(!box.isConnected)return;
        if(clipUrl)URL.revokeObjectURL(clipUrl);
        clipUrl=URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType}));
        const player=document.createElement('audio');player.src=clipUrl;player.controls=true;
        box.replaceChildren(player);b.textContent='Record again';
      };
      recorder.start();b.textContent='Stop recording';
      entry.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},30000);
    }catch{stream?.getTracks().forEach(t=>t.stop());microphone=null;toast('Microphone access was unavailable.');}
    finally{b.disabled=false;}
  }

  function action(b){
    const {studioAction:a,value:v}=b.dataset;
    switch(a){
      case 'tab':go(v);break;
      case 'placement':placementAnswers=[];render();break;
      case 'cancel-placement':placementAnswers=null;render();break;
      case 'placement-answer':{
        placementAnswers.push(+v);
        if(placementAnswers.length===placement.length){
          const scores=levels.map(l=>placement.reduce((n,q,i)=>n+(q[1]===l&&q[4]===placementAnswers[i]?1:0),0));
          data().level=scores[0]>=2&&scores[1]>=2?(scores[2]>=2?'B1':'A2'):'A1';
          data().placement={scores,total:scores.reduce((a,b)=>a+b,0)};placementAnswers=null;save();
        }render();break;
      }
      case 'open':open(v);break;
      case 'reading-section':changeSection(+v);break;
      case 'remove-import':removeImport(v);break;
      case 'listen':open(v);playReading(doc(v));break;
      case 'play-all':playReading(doc(v));break;
      case 'play-line':playReading(doc(readingId),+v,false);break;
      case 'seek':{const player=$('#studio-media');if(player){stopAudio();player.currentTime=+v;player.play().catch(()=>toast('The attached media could not play.'));}else toast('This media file is unavailable on this device.');break;}
      case 'stop':stopAudio();break;
      case 'audio':stopAudio();speak(v);break;
      case 'word':showGloss(v,+b.dataset.lineIndex);break;
      case 'close-gloss':$('#studio-gloss').hidden=true;break;
      case 'save-word':saveWord(v);break;
      case 'remove-card':word(v).saved=false;save();render();break;
      case 'mark-read':markInput(doc(v),'Read');b.textContent='Read ✓';toast('Reading progress saved.');break;
      case 'read-answer':{
        const d=doc(readingId), [question,answer]=v.split(':').map(Number);
        const q=d?.questions?.[question]||(question===0?d?.question:null);
        if(!q||answerIndex(answer)==null)return;
        const p=progress(readingId);
        if(d.questions)p.answers[question]=answer;
        else p.answer=answer;
        save();stopAudio();render();
        $(`[data-studio-action="read-answer"][data-value="${question}:${answer}"]`)?.focus({preventScroll:true});
        break;
      }
      case 'practise':practiceId=readingId;showModel=false;writingFeedback=null;go(v);break;
      case 'pattern':go('Grammar');$(`#pattern-${v}`)?.scrollIntoView({block:'start'});break;
      case 'word-tab':wordTab=v;render();break;
      case 'seed':{
        const common=['私','今日','明日','今','どこ','駅','電車','切符','水','お茶','店','ホテル','予約','友達','行きます','食べます','飲みます','すみません','ありがとう','ください'];
        common.forEach(jp=>{const w=word(jp);if(!w.saved){Object.assign(w,definition(jp),{saved:true,due:Date.now()});}});
        wordTab='Saved';save();render();toast('Starter words added.');break;
      }
      case 'review':{const queue=due().slice(0,15);if(!queue.length){toast('No words are due yet. Save words from a reading.');break;}quiz={queue,index:0,revealed:false};render();break;}
      case 'reveal':quiz.revealed=true;render();break;
      case 'rate':{
        const w=word(quiz.queue[quiz.index]), days=[1,3,7,14,30,60];
        w.reps=v==='again'?0:Math.min(w.reps+1,6);w.due=Date.now()+(w.reps?days[w.reps-1]:10/1440)*86400000;
        activity('Words','flashcards');save();quiz.index++;quiz.revealed=false;render();break;
      }
      case 'grammar-answer':{
        const [id,i]=v.split(':'), g=grammar.find(x=>x[0]===id);if(!g)return;
        const index=+i,s=data().grammar[id]??(data().grammar[id]={tries:0,correct:0});s.tries++;if(index===g[8])s.correct++;
        patternAnswer={id,index};activity('Grammar',id);save();render();$(`#pattern-${id}`)?.scrollIntoView({block:'nearest'});break;
      }
      case 'roleplay':leave();page='conversations';render();window.scrollTo(0,0);break;
      case 'record':recordReply();break;
      case 'model':showModel=!showModel;$('#studio-model').hidden=!showModel;b.textContent=showModel?'Hide model':'Show model';break;
      case 'spoken':activity('Speak',practiceDoc().id);save();b.textContent='Speaking done ✓';break;
      case 'check-writing':{
        if(!jpText.test(draft)){toast('Write a little Japanese first.');break;}
        writingFeedback=[];
        if(draft.includes('こんにちわ'))writingFeedback.push('The standard spelling is こんにちは. The final は sounds like wa.');
        if(draft.includes('こんばんわ'))writingFeedback.push('The standard spelling is こんばんは.');
        if(/ですです|ますます[。！？]/.test(draft))writingFeedback.push('Check repeated polite endings such as ですです.');
        writingFeedback.push('Compare the example’s particles, verb ending and word order with your reply.');render();break;
      }
    }
  }
  function bind(){
    const root=$('#studio');if(!root)return;
    root.onclick=e=>{const b=e.target.closest('[data-studio-action]');if(b)action(b);};
    root.onchange=e=>{
      if(e.target.id==='studio-filter'){
        filter=e.target.value;
        if(filter==='Imports'&&format==='Story')format='All';
        render();
      }
      if(e.target.id==='studio-format'){format=e.target.value;render();}
      if(e.target.id==='studio-reading-section')changeSection(+e.target.value);
      if(e.target.id==='studio-speed')readerSpeed=e.target.value;
      if(e.target.id==='studio-english')readerEnglish=e.target.checked;
      if(e.target.id==='studio-romaji')readerRomaji=e.target.checked;
      if(['studio-english','studio-romaji'].includes(e.target.id)){
        root.querySelectorAll('.'+e.target.id).forEach(el=>el.hidden=!e.target.checked);
      }
    };
    root.oninput=e=>{
      if(e.target.id==='studio-draft')draft=e.target.value;
      if(e.target.id==='studio-word-search'){
        const q=normalize(e.target.value);
        root.querySelectorAll('.studio-vocab').forEach(row=>row.hidden=!normalize(row.dataset.search).includes(q));
      }
    };
    root.onsubmit=e=>{
      const form=e.target, mode=form.dataset.studioForm;if(!mode)return;
      e.preventDefault();const fields=new FormData(form);
      if(mode==='import')importReading(form,fields);
      if(mode==='builder')buildStory(fields);
      if(mode==='plan'){
        data().level=level(fields.get('level'));data().minutes=Number(fields.get('minutes'));data().topic=fields.get('topic');save();render();toast('Study plan saved.');
      }
      if(mode==='gloss'){
        const jp=str(fields.get('jp'),80), meaning=str(fields.get('gloss'),220).trim();
        if(jpText.test(jp)&&meaning){const w=word(jp);w.reading=str(fields.get('reading'),100).trim();w.gloss=meaning;saveWord(jp);$('#studio-gloss').hidden=true;}
      }
      if(mode==='journal'){
        const text=str(fields.get('text'),2000).trim();if(!jpText.test(text)){toast('Write a little Japanese first.');return;}
        const id=uid('journal');data().journal.unshift({id,day:dateKey(),title:practiceDoc().title,text});data().journal=data().journal.slice(0,40);
        activity('Write',id);draft='';writingFeedback=null;save();render();toast('Journal entry saved.');
      }
    };
    const d=tab==='Read'?doc(readingId):null;
    if(d?.media)mountMedia(d);
  }
  window.TabiStudio={fresh,restore,html,bind,leave};
})();
