import { activeLeague } from "../leagueChoice.js";
// Saved data. Small things (settings, records) live in localStorage; big saves (a career, a draft in
// progress, long logs) live in IndexedDB, which has far more room than localStorage's ~5 MB. A full
// localStorage also falls back to IndexedDB instead of silently dropping the save.
// Reads stay synchronous: IndexedDB is read into memory once at start-up (storeReady), then written through.
const P = "wla:";
const BIG = new Set(["mc:save", "draft:save", "career:save", "activity:log", "online:history", "challenge:history", "daily:log"]);
const BIG_CHARS = 48 * 1024;
const mem = new Map(); // key -> JSON text, for every key kept in IndexedDB
let idb = null; // null: IndexedDB unavailable (private modes, old browsers): everything stays in localStorage
const chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("wla-store") : null;

const lsGet = (k) => { try { return localStorage.getItem(P + k); } catch { return null; } };
const lsDel = (k) => { try { localStorage.removeItem(P + k); } catch { /* storage off */ } };

function request(mode, fn) {
  return new Promise((res) => {
    try {
      const t = idb.transaction("kv", mode);
      const r = fn(t.objectStore("kv"));
      t.oncomplete = () => res(r?.result ?? true);
      t.onerror = t.onabort = () => res(null);
    } catch { res(null); }
  });
}
const put = (k, s) => request("readwrite", (os) => os.put(s, k));
const del = (k) => request("readwrite", (os) => os.delete(k));

function open() {
  return new Promise((res) => {
    try {
      const r = indexedDB.open("wla", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
}

/** Resolves once the IndexedDB saves are in memory (pages read them synchronously after this). */
export const storeReady = (async () => {
  if (typeof indexedDB === "undefined") return;
  idb = await Promise.race([open(), new Promise((r) => setTimeout(() => r(null), 6000))]);
  if (!idb) return;
  await new Promise((res) => {
    try {
      const c = idb.transaction("kv", "readonly").objectStore("kv").openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { mem.set(cur.key, cur.value); cur.continue(); } else res(); };
      c.onerror = () => res();
    } catch { res(); }
  });
  // big saves still in localStorage (older versions of the arcade): move them over
  for (const k of BIG) {
    const s = lsGet(k);
    if (s === null) continue;
    if (await put(k, s)) { mem.set(k, s); lsDel(k); }
  }
})();

// another tab saved: pick up its copy
chan?.addEventListener("message", async (e) => {
  const k = e.data?.k;
  if (!idb || typeof k !== "string") return;
  const s = await request("readonly", (os) => os.get(k));
  if (typeof s === "string") mem.set(k, s); else mem.delete(k);
});

let fullWarned = false;
function storageFull() {
  if (fullWarned) return;
  fullWarned = true;
  document.dispatchEvent(new CustomEvent("storage-full"));
}
let persistAsked = false;
/** Big saves: ask the browser not to clear this site's data when the device runs low on space. */
function keepSafe() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persisted?.().then((yes) => { if (!yes) navigator.storage.persist?.().catch(() => {}); }).catch(() => {});
}

// Each league keeps its own game progress, records and daily results (Winner League keys stay as they were).
const LEAGUE_NOW = activeLeague();
const SCOPED = /^(career:|draft:|hl:|guess:|conn:|grid:|matchup|daily:|players:|compare:)/;
const scoped = (key) => (LEAGUE_NOW !== "wl" && SCOPED.test(key) ? `${key}@${LEAGUE_NOW}` : key);

export const store = {
  get(key, fallback = null) {
    key = scoped(key);
    const s = mem.has(key) ? mem.get(key) : lsGet(key);
    if (s === null || s === undefined) return fallback;
    try { return JSON.parse(s); } catch { return fallback; }
  },
  /** Returns false if the value couldn't be saved anywhere. */
  set(key, value) {
    key = scoped(key);
    let s;
    try { s = JSON.stringify(value) ?? "null"; } catch { return false; }
    if (idb && (BIG.has(key) || s.length > BIG_CHARS)) return toDb(key, s);
    if (mem.has(key)) { mem.delete(key); del(key); chan?.postMessage({ k: key }); }
    try { localStorage.setItem(P + key, s); return true; } catch {
      if (idb) return toDb(key, s); // localStorage is full: IndexedDB has room
      storageFull();
      return false;
    }
  },
  remove(key) {
    key = scoped(key);
    lsDel(key);
    if (mem.delete(key)) { del(key); chan?.postMessage({ k: key }); }
  },
  /** Every saved key (without the prefix). */
  keys() {
    const out = new Set(mem.keys());
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(P)) out.add(k.slice(P.length)); } } catch { /* storage off */ }
    return [...out];
  },
  /** All saved data as text ({ key: JSON }), and putting it back (for "delete my data" with undo). */
  snapshot() { return Object.fromEntries(this.keys().map((k) => [k, mem.has(k) ? mem.get(k) : lsGet(k)]).filter(([, v]) => v !== null)); },
  restore(snap) { for (const [k, s] of Object.entries(snap)) { try { this.set(k, JSON.parse(s)); } catch { /* skip */ } } },
};

function toDb(key, s) {
  mem.set(key, s);
  lsDel(key);
  put(key, s).then((ok) => { if (ok) chan?.postMessage({ k: key }); else storageFull(); });
  if (BIG.has(key) && s !== "null") keepSafe();
  return true;
}
