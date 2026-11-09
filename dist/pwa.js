/* Install, offline readiness, and release updates. No account or server storage. */
(() => {
  'use strict';
  let registration = null, promptEvent = null, retrying = false, reloadOnControl = false;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const status = {phase: 'preparing', online: navigator.onLine, installed: standalone(), update: false, files: 0, checked: false};
  const publish = () => window.dispatchEvent(new CustomEvent('tabi:pwa-state'));
  const patch = values => {Object.assign(status, values); publish();};
  const notify = message => window.dispatchEvent(new CustomEvent('tabi:pwa-notice', {detail: message}));
  function message(worker, type) {
    return new Promise((resolve,reject) => {
      if (!worker) return reject(new Error('No active offline worker'));
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {channel.port1.close();reject(new Error('Offline check timed out'));}, 10000);
      channel.port1.onmessage = event => {clearTimeout(timeout);channel.port1.close();resolve(event.data);};
      worker.postMessage({type},[channel.port2]);
    });
  }
  async function check(verify = false) {
    if (!registration?.active) return false;
    try {
      const reply = await message(registration.active, verify?'VERIFY_OFFLINE':'OFFLINE_STATUS');
      patch({phase: reply.ready ? 'ready' : 'error', files: reply.files || 0, checked: verify && reply.ready, update: !!registration.waiting});
      if (verify) notify(reply.ready ? 'All offline files are available on this device. Try airplane mode after installation.' : 'Some offline files are missing. Reconnect and retry the download.');
      return reply.ready;
    } catch {patch({phase:'error'});if(verify)notify('Could not check offline storage. Reconnect and retry the download.');return false;}
  }
  function observe(reg) {
    if (reg.waiting) patch({update:true});
    reg.addEventListener('updatefound', () => {
      const installing=reg.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state==='installed' && reg.waiting) patch({update:true});
        if (installing.state==='redundant' && !reg.active) patch({phase:'error'});
      });
    });
  }
  async function start() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {patch({phase:'unsupported'});return;}
    patch({phase:'preparing'});
    try {
      registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
      observe(registration);
      if (registration.active) await check();
      const ready=await navigator.serviceWorker.ready;
      registration=ready;
      await check();
    } catch {patch({phase:'error'});}
  }
  async function retry() {
    if (retrying) return;
    if (!navigator.onLine) {notify('Reconnect to finish downloading Tabi for offline use.');return;}
    retrying=true;patch({phase:'preparing',checked:false});
    try {
      if (!registration) {await start();return;}
      if (!registration.active) {
        await start();
        return;
      }
      const reply=await message(registration.active,'REPAIR_OFFLINE');
      if (reply.ready) {await check(true);return;}
      await registration.update();
      if (registration.waiting) {
        patch({phase:'error',update:true});
        notify('A complete update is ready. Use Update app to finish saving offline.');
        return;
      }
      patch({phase:'error'});
      notify(reply.mismatch ? 'A newer release is downloading. Apply it when Update app appears.' : 'Offline download is incomplete. Check your connection, then retry.');
    } catch {patch({phase:'error'});notify('Offline setup could not finish. Reconnect, then reload Tabi.');}
    finally {retrying=false;}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;publish();});
  window.addEventListener('appinstalled',()=>{promptEvent=null;patch({installed:true});});
  window.addEventListener('online',()=>{patch({online:true});check();registration?.update().catch(()=>{});});
  window.addEventListener('offline',()=>{patch({online:false});check();});
  window.addEventListener('pageshow',()=>{status.installed=standalone();if(registration)check();publish();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&registration){patch({installed:standalone()});check();}});
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloadOnControl) location.reload();else if(registration)check();
  });
  window.TabiPWA={
    snapshot:()=>({...status,canPrompt:!!promptEvent}),
    check:()=>check(true),retry,
    install:async()=>{if(!promptEvent)return false;const event=promptEvent;promptEvent=null;await event.prompt();const choice=await event.userChoice;publish();return choice.outcome==='accepted';},
    update:()=>{if(!registration?.waiting){patch({update:false});return;}reloadOnControl=true;registration.waiting.postMessage({type:'SKIP_WAITING'});},
    requestStorage:async()=>{
      try {const granted=await navigator.storage?.persist?.();notify(granted?'Your browser granted persistent storage for Tabi.':'Your browser manages storage automatically. Keep a progress backup before your trip.');}
      catch {notify('Keep a progress backup before your trip. Browser storage is managed by your device.');}
    }
  };
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
