// Connection to the arcade server's online service (/ws). One shared socket for the whole app:
// it reconnects by itself (a dropped phone connection gets ~45 s to come back into a match) and
// identifies the player with a random session id kept in this browser.
import { store } from "../ui.js";
import { getMe, myName } from "../lib/me.js";
import { levelInfo } from "../lib/progress.js";
import { activeLeague } from "../leagueChoice.js";

const listeners = new Set();
let ws = null, status = "idle", retry = 0, retryTimer = null, wanted = false, persistent = false, outbox = [];
export let lastStats = null;
export let myCode = null;
let rtt = 120; // round-trip time to the server (ms), measured with pings
let jitter = 0, lastSeen = 0, lostPings = 0, pingOut = 0, qual = "good";
const opened0 = Date.now(); let everOnline = false;
/** Still waiting for the very first connection after a while: the free host is probably waking up. */
export const wakingUp = () => !everOnline && Date.now() - opened0 > 5000;
export const RECONNECT_GRACE_MS = 45000; // how long the server holds your seat in a match (server/index.js)

function sid() {
  let s = store.get("online:sid");
  if (!s) { s = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9-]/g, ""); store.set("online:sid", s); }
  return s;
}

const fire = (m) => listeners.forEach((fn) => { try { fn(m); } catch (e) { console.error(e); } });
function setStatus(s) { status = s; fire({ t: "status", status: s }); }
export const netStatus = () => status;

/** Subscribe to every server message (and { t: "status" } changes). Returns an unsubscribe function. */
export function onNet(fn, signal) {
  listeners.add(fn);
  const off = () => listeners.delete(fn);
  signal?.addEventListener("abort", off);
  return off;
}

export function profileMsg() {
  const me = getMe();
  return { t: "profile", name: myName("Guest"), icon: me.icon, color: me.color, frame: me.frame, style: me.style, av: me.style === "player" ? me.av : undefined, level: levelInfo().level, rec: store.get("online:token") || undefined };
}

/** Ratings and record as last confirmed by the server ({ elo, peak, w, l, d, streak, best, code }). */
export const myRecord = () => store.get("online:rec", null);

/** Time left on a server timer, corrected for the trip from the server (clock sync). */
export const latency = () => rtt;
export const deadlineFrom = (ms) => Date.now() + Math.max(0, ms - rtt / 2);

/**
 * connect(): keep a connection (online page). connect({ quiet: true }) at app start: try to connect for
 * friends' invites and presence, but give up silently if this page has no online server behind it.
 */
export function connect({ quiet = false } = {}) {
  if (!quiet) persistent = true;
  wanted = true;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(retryTimer);
  setStatus(retry ? "reconnecting" : "connecting");
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?sid=${encodeURIComponent(sid())}&league=${activeLeague()}`; // matched only within your league
  let opened = false;
  try { ws = new WebSocket(url); } catch { return fail(); }
  ws.onopen = () => {
    opened = true; retry = 0; lastSeen = Date.now(); lostPings = 0; pingOut = 0; everOnline = true;
    ws.send(JSON.stringify(profileMsg()));
    setStatus("online");
    const q = outbox; outbox = [];
    q.forEach((m) => ws.send(JSON.stringify(m)));
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    lastSeen = Date.now();
    if (m.t === "stats" || m.t === "welcome") lastStats = m;
    if (m.t === "welcome") myCode = m.code;
    if (m.t === "record") { store.set("online:token", m.token); store.set("online:rec", m.rec); myCode = m.rec.code; }
    if (m.t === "pong" && m.c) {
      const r = Date.now() - m.c;
      jitter = 0.7 * jitter + 0.3 * Math.abs(r - rtt);
      rtt = 0.7 * rtt + 0.3 * r;
      pingOut = 0; lostPings = Math.max(0, lostPings - 1);
      rateQuality();
    }
    fire(m);
  };
  ws.onclose = (e) => {
    ws = null;
    if (e.code === 4000) { setStatus("replaced"); wanted = false; return; } // opened in another tab
    if (!navigator.onLine) { setStatus("offline"); return fail(); }
    if (!opened && retry >= 2) { // no server behind this page (e.g. the Python server)
      setStatus("unavailable");
      if (!persistent) { wanted = false; return; }
    }
    fail();
  };
  ws.onerror = () => {};
}

function fail() {
  if (!wanted) return;
  retry++;
  if (status !== "unavailable" && status !== "offline") setStatus("reconnecting");
  retryTimer = setTimeout(connect, Math.min(8000, 600 * 2 ** Math.min(retry, 4)));
}

export function send(m) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
  else { outbox.push(m); connect(); }
}

/** Connection quality from ping time, its swings and lost pings: "good" | "fair" | "poor". */
export const quality = () => qual;
function rateQuality() {
  const q = status !== "online" ? qual : lostPings >= 2 || rtt > 600 || jitter > 250 ? "poor" : lostPings || rtt > 250 || jitter > 100 ? "fair" : "good";
  if (q !== qual) { qual = q; fire({ t: "quality", quality: q }); }
}

// keep the server's copy of the profile fresh when the player edits it
document.addEventListener("me-changed", () => { if (ws?.readyState === 1) ws.send(JSON.stringify(profileMsg())); });

// A connection can die without closing (Wi-Fi to mobile data, a tunnel, a sleeping laptop): the socket
// looks open but nothing arrives. Ping every few seconds; no answer for a while means reconnect now,
// well inside the time the server holds your seat in a match.
function ping() {
  if (ws?.readyState !== 1) return;
  if (pingOut) { lostPings++; rateQuality(); }
  if (Date.now() - lastSeen > (persistent ? 12000 : 30000)) { try { ws.close(); } catch { /* already closing */ } return dropped(); }
  pingOut = Date.now();
  ws.send(JSON.stringify({ t: "ping", c: pingOut }));
}
function dropped() { // treat a silent socket as closed right away (its own close event can take a minute)
  const old = ws;
  ws = null;
  if (old) { old.onclose = old.onmessage = null; try { old.close(); } catch { /* gone */ } }
  retry = Math.max(retry, 1);
  if (wanted) { setStatus("reconnecting"); connect(); }
}
setInterval(() => ping(), 4000);
onNet((m) => { if (m.t === "status" && m.status === "online") setTimeout(ping, 300); });
// back from the background, or the network came back: check / reconnect at once instead of waiting
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !wanted) return;
  if (!ws) { retry = 0; connect(); } else if (Date.now() - lastSeen > 8000) { lastSeen = Math.min(lastSeen, Date.now() - 9000); ping(); }
});
window.addEventListener("online", () => { if (wanted && !ws) { retry = 0; clearTimeout(retryTimer); connect(); } else if (ws) ping(); });
window.addEventListener("offline", () => { if (ws) dropped(); });
