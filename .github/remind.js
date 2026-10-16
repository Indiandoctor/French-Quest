// Sends the daily French Quest reminder to every registered device.
// Devices come from (a) open issues created by the repo owner that contain the device code, and (b) the optional PUSH_SUBSCRIPTIONS secret.
const webpush = require('web-push');
const { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, PUSH_SUBSCRIPTIONS, GH_TOKEN, REPO, OWNER } = process.env;
if (!VAPID_PRIVATE_KEY) { console.log('No VAPID_PRIVATE_KEY secret yet — add it in Settings → Secrets and variables → Actions.'); process.exit(0); }
webpush.setVapidDetails('https://github.com/' + REPO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const gh = (path, opt = {}) => fetch('https://api.github.com' + path, Object.assign({ headers: { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }, opt));
function findSubs(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/\{[^{}]*"endpoint"[^{}]*\{[^{}]*\}[^{}]*\}/g)) { try { const s = JSON.parse(m[0]); if (s.endpoint && s.keys) out.push(s); } catch (e) { } }
  return out;
}
(async () => {
  let subs = findSubs(PUSH_SUBSCRIPTIONS);
  const issues = [];
  try {
    const r = await gh(`/repos/${REPO}/issues?state=open&creator=${OWNER}&per_page=100`);
    for (const is of await r.json()) { const s = findSubs(is.body); s.forEach(x => issues.push({ n: is.number, s: x })); subs = subs.concat(s); }
  } catch (e) { console.log('Could not read issues:', e.message); }
  const seen = new Set(); subs = subs.filter(s => !seen.has(s.endpoint) && seen.add(s.endpoint));
  console.log('Devices:', subs.length);
  for (const s of subs) {
    try { await webpush.sendNotification(s, JSON.stringify({ kind: 'daily', sent: new Date().toISOString() }), { TTL: 6 * 3600, urgency: 'normal' }); console.log('✓ sent to', s.endpoint.slice(0, 45) + '…'); }
    catch (e) {
      console.log('✗', e.statusCode, s.endpoint.slice(0, 45) + '…');
      const is = issues.find(x => x.s.endpoint === s.endpoint);
      if (is && (e.statusCode === 404 || e.statusCode === 410)) { // device unregistered: close its issue so it isn't retried
        await gh(`/repos/${REPO}/issues/${is.n}/comments`, { method: 'POST', body: JSON.stringify({ body: 'This device no longer accepts reminders (the app was uninstalled or notifications were reset), so this registration is closed. Register again from the app if needed.' }) });
        await gh(`/repos/${REPO}/issues/${is.n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
      }
    }
  }
  // keep the scheduled job alive (GitHub pauses schedules after 60 days without repository activity)
  try { const k = await gh(`/repos/${REPO}/actions/workflows/remind.yml/enable`, { method: 'PUT' }); console.log('keep-alive:', k.status); } catch (e) { }
})();
