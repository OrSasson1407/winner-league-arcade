// Friend leagues: a private group with a join code and a weekly table of online results.
// No database: leagues live in memory (saved to server/data/leagues.json when the disk keeps it),
// and every member's browser keeps a copy and sends it back on connect, so a restart loses nothing
// for long. The weekly numbers come from each player's signed record (see records.js).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const FILE = path.join(DIR, "leagues.json");
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MAX_MEMBERS = 30;
const leagues = new Map(); // id -> { id, name, owner, members: Set<code>, created }
let dirty = false;

const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 32);
export const cleanLeagueId = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

function newId() {
  for (;;) {
    const id = "L" + Array.from(crypto.randomBytes(5), (b) => CHARS[b % CHARS.length]).join("");
    if (!leagues.has(id)) return id;
  }
}
const view = (L) => ({ id: L.id, name: L.name, owner: L.owner, members: [...L.members], created: L.created });

export function createLeague(name, ownerCode) {
  const L = { id: newId(), name: cleanName(name) || "Friends league", owner: ownerCode, members: new Set([ownerCode]), created: Date.now() };
  leagues.set(L.id, L); dirty = true;
  return view(L);
}
export function joinLeague(id, code) {
  const L = leagues.get(cleanLeagueId(id));
  if (!L) return { error: "That league code doesn't exist (or the server restarted and no member has reconnected yet)." };
  if (!L.members.has(code) && L.members.size >= MAX_MEMBERS) return { error: `Leagues are limited to ${MAX_MEMBERS} players.` };
  L.members.add(code); dirty = true;
  return view(L);
}
export function leaveLeague(id, code) {
  const L = leagues.get(cleanLeagueId(id));
  if (!L) return;
  L.members.delete(code); dirty = true;
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
  dirty = true;
  return view(L);
}
export const getLeague = (id) => { const L = leagues.get(cleanLeagueId(id)); return L ? view(L) : null; };

// ---------------------------------------------------------------- persistence (best effort)
try {
  for (const L of JSON.parse(fs.readFileSync(FILE, "utf8"))) leagues.set(L.id, { ...L, members: new Set(L.members) });
} catch {}
export function saveLeagues() {
  if (!dirty) return;
  dirty = false;
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify([...leagues.values()].map(view))); } catch {}
}
setInterval(saveLeagues, 30000).unref();
process.on("exit", saveLeagues); // records.js exits on SIGINT/SIGTERM; this still runs
