/* French Quest service worker: works offline, shows the daily reminder */
const VERSION = 'fq-202610162051';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const isPage = r.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(r.url).pathname);
  if (isPage) { // network first so updates arrive; offline → cached copy
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return res; }).catch(() => caches.match('./index.html')));
  } else {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); return res; })));
  }
});
function readSummary() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open('frenchquest', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onerror = () => res(null);
      rq.onsuccess = () => { try { const g = rq.result.transaction('kv', 'readonly').objectStore('kv').get('summary'); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); } catch (e) { res(null); } };
    } catch (e) { res(null); }
  });
}
const pad = n => String(n).padStart(2, '0');
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
async function compose() {
  const s = await readSummary(); const t = todayStr();
  let body = 'Time for French! 5 minutes keeps your streak alive. 🔥', title = 'French Quest 🦤';
  if (s && s.players && s.players.length) {
    const ps = s.players.filter(p => p.started || p.streak);
    const pool = ps.length ? ps : s.players;
    const waiting = pool.filter(p => !(s.day === t && p.done));
    if (!waiting.length) { title = 'Bravo ! 🎉'; body = 'Everyone did their French today. À demain !'; }
    else {
      const big = waiting.filter(p => p.streak >= 2).sort((a, b) => b.streak - a.streak)[0];
      if (big) { title = `${big.name}’s ${big.streak}-day streak 🔥 is waiting!`; body = waiting.length > 1 ? `${list(waiting.map(p => p.name))} still have French to do today.` : 'One short lesson keeps it going. Allez !'; }
      else { title = 'C’est l’heure du français ! 🇫🇷'; body = `${list(waiting.map(p => p.name))}: one short lesson today and start a streak 🔥`; }
    }
  }
  return { title, body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'fq-daily', renotify: true, data: { url: './' } };
}
self.addEventListener('push', e => { e.waitUntil(compose().then(n => self.registration.showNotification(n.title, n))); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'test') e.waitUntil(compose().then(n => self.registration.showNotification(n.title, n))); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) if ('focus' in c) return c.focus(); return self.clients.openWindow('./'); }));
});
