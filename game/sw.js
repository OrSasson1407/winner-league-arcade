// Service worker: lets the installed app open and play offline (single-player games).
// Network first, so every update shows up right away when online; the cache is the fallback.
// Online 1v1 (/ws) always needs a connection and is never cached.
const CACHE = "wla-v22";
const CORE = ["./", "index.html", "css/style.css", "css/broadcast.css", "js/app.js", "data/game_db.js", "../src/database_helpers.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "wla-meta").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/ws") || url.pathname.startsWith("/api/") || url.pathname === "/health") return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), timeout(6000)]);
      if (res.ok && !url.pathname.includes("/__wla/")) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
      return Response.error();
    }
  })());
});

// ---------------------------------------------------------------- daily reminder (opt-in, see js/lib/notify.js)
async function remindIfDue() {
  let st = null;
  try { const r = await (await caches.open("wla-meta")).match("./__wla/remind.json"); st = r && (await r.json()); } catch {}
  if (!st?.on) return;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (now.getHours() < (st.hour ?? 18)) return;
  if (st.date === today && st.done >= st.total) return; // all done today
  const meta = await caches.open("wla-meta");
  const last = await meta.match("./__wla/last-remind");
  if (last && (await last.text()) === today) return;
  await meta.put("./__wla/last-remind", new Response(today));
  const streak = st.date === today || st.streak ? st.streak : 0;
  await self.registration.showNotification("Your daily challenges are waiting", {
    body: streak ? `Keep your ${streak}-day streak going!` : "New puzzles today. Start a streak!",
    icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "wla-daily", data: { url: "./#/daily" } });
}
self.addEventListener("periodicsync", (e) => { if (e.tag === "wla-daily") e.waitUntil(remindIfDue()); });
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#/", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); return w.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  })());
});
