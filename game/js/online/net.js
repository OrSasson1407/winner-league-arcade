// Connection to the arcade server's online service (/ws). One shared socket for the whole app:
// it reconnects by itself (a dropped phone connection gets ~20 s to come back into a match) and
// identifies the player with a random session id kept in this browser.
import { store } from "../ui.js";
import { getMe, myName } from "../lib/me.js";
import { levelInfo } from "../lib/progress.js";

const listeners = new Set();
let ws = null, status = "idle", retry = 0, retryTimer = null, wanted = false, outbox = [];
export let lastStats = null;

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
  return { t: "profile", name: myName("Guest"), icon: me.icon, color: me.color, frame: me.frame, level: levelInfo().level };
}

export function connect() {
  wanted = true;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(retryTimer);
  setStatus(retry ? "reconnecting" : "connecting");
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?sid=${encodeURIComponent(sid())}`;
  let opened = false;
  try { ws = new WebSocket(url); } catch { return fail(); }
  ws.onopen = () => {
    opened = true; retry = 0;
    ws.send(JSON.stringify(profileMsg()));
    setStatus("online");
    const q = outbox; outbox = [];
    q.forEach((m) => ws.send(JSON.stringify(m)));
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "stats" || m.t === "welcome") lastStats = m;
    fire(m);
  };
  ws.onclose = (e) => {
    ws = null;
    if (e.code === 4000) { setStatus("replaced"); wanted = false; return; } // opened in another tab
    if (!opened && retry >= 2) { setStatus("unavailable"); } // no server behind this page (e.g. the Python server)
    fail();
  };
  ws.onerror = () => {};
}

function fail() {
  if (!wanted) return;
  retry++;
  if (status !== "unavailable") setStatus("reconnecting");
  retryTimer = setTimeout(connect, Math.min(8000, 600 * 2 ** Math.min(retry, 4)));
}

export function send(m) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
  else { outbox.push(m); connect(); }
}

// keep the server's copy of the profile fresh when the player edits it
document.addEventListener("me-changed", () => { if (ws?.readyState === 1) ws.send(JSON.stringify(profileMsg())); });
// mobile browsers freeze background tabs; reconnect as soon as the tab is visible again
document.addEventListener("visibilitychange", () => { if (!document.hidden && wanted && !ws) { retry = 0; connect(); } });
setInterval(() => { if (ws?.readyState === 1) ws.send('{"t":"ping"}'); }, 20000);
