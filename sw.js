const CACHE='skipper-shell-v6';
const APP_SHELL=['/','./index.html','./styles.css','./firebase-config.js','./manifest.webmanifest','./src/app.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(u.origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{if(event.request.method==='GET'&&r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));}return r;}).catch(()=>cached)));
});
