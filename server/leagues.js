// Friend leagues: a private group with a join code and a weekly table of online results.
// Leagues live in memory and are saved to the store (Postgres with DATABASE_URL, else server/data,
// see db.js). Every member's browser also keeps a copy and sends it back on connect, so even a store
// that loses its data loses nothing for long. The weekly numbers come from each player's record.
import crypto from "node:crypto";

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MAX_MEMBERS = 30;
const leagues = new Map(); // id -> { id, name, owner, members: Set<code>, created }
const dirty = new Set(); // ids changed (or deleted) since the last save
let store = null;

const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 32);
export const cleanLeagueId = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

function newId() {
  for (;;) {
    const id = "L" + Array.from(crypto.randomBytes(5), (b) => CHARS[b % CHARS.length]).join("");
    if (!leagues.has(id)) return id;
  }
}
const view = (L) => ({ id: L.id, name: L.name, owner: L.owner, members: [...L.members], created: L.created, style: L.style || null });
/** The looks a league can wear (the shop's "League colours"). */
export const LEAGUE_COLORS = ["#e4002b", "#ffc629", "#0a3e8c", "#00843d", "#6d28d9", "#0ea5e9", "#ff7a1a", "#e11d48", "#111111"];
export const LEAGUE_ICONS = ["trophy", "crown", "flame", "star", "shield", "rocket", "medal", "ball"];
/** The owner sets the league's colour and icon. */
export function styleLeague(id, code, style) {
  const L = leagues.get(cleanLeagueId(id));
  if (!L || L.owner !== code) return null;
  L.style = { color: LEAGUE_COLORS.includes(style?.color) ? style.color : null, icon: LEAGUE_ICONS.includes(style?.icon) ? style.icon : null };
  if (!L.style.color && !L.style.icon) L.style = null;
  dirty.add(L.id);
  return view(L);
}

export function createLeague(name, ownerCode) {
  const L = { id: newId(), name: cleanName(name) || "Friends league", owner: ownerCode, members: new Set([ownerCode]), created: Date.now() };
  leagues.set(L.id, L); dirty.add(L.id);
  return view(L);
}
export function joinLeague(id, code) {
  const L = leagues.get(cleanLeagueId(id));
  if (!L) return { error: "That league code doesn't exist (or the server restarted and no member has reconnected yet)." };
  if (!L.members.has(code) && L.members.size >= MAX_MEMBERS) return { error: `Leagues are limited to ${MAX_MEMBERS} players.` };
  L.members.add(code); dirty.add(L.id);
  return view(L);
}
export function leaveLeague(id, code) {
  const L = leagues.get(cleanLeagueId(id));
  if (!L) return;
  L.members.delete(code); dirty.add(L.id);
  if (!L.members.size) leagues.delete(L.id);
}
/** A member's browser copy re-creates a league the server forgot, and adds members it knew about. */
export function syncLeague(copy, code) {
  const id = cleanLeagueId(copy?.id);
  if (!/^L[A-Z0-9]{5,6}$/.test(id)) return null;
  let L = leagues.get(id);
  if (!L) { L = { id, name: cleanName(copy.name) || "Friends league", owner: String(copy.owner || code).slice(0, 8), members: new Set(), created: Number(copy.created) || Date.now() }; leagues.set(id, L); }
  const members = Array.isArray(copy.members) ? copy.members.slice(0, MAX_MEMBERS).map((c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)).filter((c) => c.length === 6) : [];
  for (const m of members) if (L.members.size < MAX_MEMBERS) L.members.add(m);
  L.members.add(code);
  dirty.add(id);
  return view(L);
}
/** A player who deleted their data leaves every league. */
export function leaveAllLeagues(code) {
  for (const L of leagues.values()) if (L.members.has(code)) leaveLeague(L.id, code);
}
export const getLeague = (id) => { const L = leagues.get(cleanLeagueId(id)); return L ? view(L) : null; };

// ---------------------------------------------------------------- persistence
/** Load every saved league (call once, before the server takes connections). */
export async function initLeagues(s) {
  store = s;
  for (const L of await store.loadLeagues()) leagues.set(L.id, { ...L, members: new Set(L.members) });
  return leagues.size;
}
let saving = null;
export async function saveLeagues() {
  if (!store || !dirty.size || saving) return saving;
  const ids = [...dirty];
  dirty.clear();
  saving = (async () => {
    for (const id of ids) {
      const L = leagues.get(id);
      try { await (L ? store.saveLeague(view(L)) : store.deleteLeague(id)); }
      catch (e) { console.error("[db] saving league failed:", e.message); dirty.add(id); }
    }
  })().finally(() => { saving = null; });
  return saving;
}
setInterval(saveLeagues, 10000).unref();
