// Prepares the EuroLeague data file for the arcade, next to (not merged with) game_db.js:
//   node game/tools/prepare_euroleague.mjs <path/to/euroleague_db.js>
// → writes game/data/euroleague_db.js (export euroleagueDatabase), same structure as game_db.js.
//
// What it changes (structure and identity only; it never invents values):
//  1. One identity per person: players who are also in the Israeli league data take their personal
//     details (birth date, nationality, height, position) from it, since those are real there and
//     mock in the EuroLeague source. Their per-season positions follow.
//  2. Ids: a different person who shares an Israeli player's id gets his own id; the same person
//     under a different id is mapped to the Israeli id (checked against the birth date).
//  3. Ages are recomputed from the birth date with the same rule as game_db.js (season start year
//     minus birth year), so they always agree.
//  4. The current season is the upcoming one, rosters only (status PARTIAL), as in game_db.js, so the
//     last completed season counts as played.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node game/tools/prepare_euroleague.mjs <euroleague_db.js>"); process.exit(1); }
const OUT = path.join(HERE, "..", "data", "euroleague_db.js");

const EL = structuredClone((await import(pathToFileURL(path.resolve(SRC)).href)).euroleagueDatabase);
const BSL = (await import(pathToFileURL(path.join(HERE, "..", "data", "game_db.js")).href)).gameDatabase;
const bsl = new Map(BSL.players.map((p) => [p.player_id, p]));
const startYear = (season) => Number(season.slice(0, 4));
const birthYear = (p) => (p?.birth_date ? Number(p.birth_date.slice(0, 4)) : null);
const plausible = (p, seasons) => { const by = birthYear(p); return by == null || seasons.every((s) => startYear(s) - by >= 15 && startYear(s) - by <= 43); };
const log = [];

// ---- 2. ids
function renameId(from, to) {
  const p = EL.players.find((x) => x.player_id === from);
  if (!p || EL.players.some((x) => x.player_id === to)) return false;
  p.player_id = to;
  for (const r of EL.player_seasons) if (r.player_id === from) r.player_id = to;
  return true;
}
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
// a different person under an Israeli player's id (his EuroLeague years don't fit that player's birth date)
for (const p of [...EL.players]) {
  const b = bsl.get(p.player_id);
  if (b && !plausible(b, p.seasons) && renameId(p.player_id, `${p.player_id}_el`)) log.push(`different person: ${p.player_id.replace(/_el$/, "")} → ${p.player_id}`);
}
// the same person under another id (same name, a single Israeli player with that name, years fit)
const bslByName = new Map();
for (const b of BSL.players) if (b.name) { const k = norm(b.name); bslByName.set(k, bslByName.has(k) ? null : b); }
for (const p of [...EL.players]) {
  if (bsl.has(p.player_id)) continue;
  const b = bslByName.get(norm(p.name));
  if (!b || !/^[a-z_]+$/.test(b.player_id) || /_\d{4}$/.test(b.player_id)) { if (b) log.push(`left alone (ambiguous): ${p.player_id} vs ${b.player_id}`); continue; }
  if (plausible(b, p.seasons) && renameId(p.player_id, b.player_id)) log.push(`same person: ${p.name} → ${b.player_id}`);
}

// ---- 1. one identity per person
let unified = 0;
const posOf = new Map();
for (const p of EL.players) {
  const b = bsl.get(p.player_id);
  if (!b) continue;
  for (const k of ["birth_date", "nationality", "height_cm", "primary_position"]) if (b[k] != null) p[k] = b[k];
  if (b.nationalities?.length) p.nationalities = [...b.nationalities];
  if (b.primary_position) posOf.set(p.player_id, b.primary_position);
  unified++;
}
for (const r of EL.player_seasons) if (posOf.has(r.player_id)) { r.position = posOf.get(r.player_id); if (r.secondary_position === r.position) r.secondary_position = null; }

// ---- 3. ages from birth dates
const players = new Map(EL.players.map((p) => [p.player_id, p]));
let agesFixed = 0;
for (const r of EL.player_seasons) {
  const by = birthYear(players.get(r.player_id));
  const age = by == null ? null : startYear(r.season) - by;
  if (age !== r.age) { r.age = age; agesFixed++; }
}

// ---- 4. current season = the upcoming one (rosters only)
const last = EL.metadata.season_list[EL.metadata.season_list.length - 1];
const y = startYear(last) + 1;
const next = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
if (EL.metadata.current_season === last && EL.seasons.find((s) => s.season === last)?.status === "COMPLETE") {
  EL.metadata.season_list.push(next);
  EL.seasons.push({ season: next, status: "PARTIAL", teams: [] }); // no rosters for it in the source yet
  EL.metadata.current_season = next;
  log.push(`current_season ${last} (complete) → ${next} (PARTIAL, no rosters yet)`);
}
EL.metadata.generated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");

// ---- write
const header = `// Generated by game/tools/prepare_euroleague.mjs from ${path.basename(SRC)} (EuroLeague ${EL.metadata.season_list[0]} .. ${last}); same structure as game_db.js.
// MOCK data in the source: birth_date, nationality(ies), ages, positions and all stats, EXCEPT for the ${unified} players who
// are also in game_db.js: their personal details come from there (real). Ratings (rating_mock) and stats are mock for everyone.
`;
fs.writeFileSync(OUT, header + "export const euroleagueDatabase = " + JSON.stringify(EL) + ";\n");
console.log(log.join("\n"));
console.log(`players unified with the Israeli data: ${unified} · ages recomputed: ${agesFixed}`);
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
