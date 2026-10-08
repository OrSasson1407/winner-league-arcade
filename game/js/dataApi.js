// The data API every screen uses (players, seasons, careers, team names...), built over one database object.
// data.js builds it over the chosen league (see leagueChoice.js); wl.js over the Winner League only (My Career).
import { createDatabaseHelpers } from "../../src/database_helpers.js";
import { euroleagueIndex } from "../data/euroleague_index.js";

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

// ---------- randomness (games only; the data itself is never random)
export function seededRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const birthYear = (p) => (p?.birth_date && !p._mockBio ? Number(p.birth_date.slice(0, 4)) : null);
export const seasonYear = (s) => Number(s.slice(0, 4));

/** Stable key for a player-season record (used to save/resume games). */
export const psKey = (ps) => `${ps.player_id}|${ps.season}|${ps.team_id}`;
/** In the mixed data, EuroLeague teams are "el:<club>" so they never merge with the same club's Winner League season. */
export const baseTeam = (id) => String(id).replace(/^el:/, "");

export function makeDataApi(db) {
  const H = createDatabaseHelpers(db);
  const CURRENT = db.metadata.current_season;
  // Seasons with real regular-season stats (the current one has not started yet).
  const PLAYED_SEASONS = db.metadata.season_list.filter((s) => s !== CURRENT);
  const teamsById = new Map(db.teams.map((t) => [t.team_id, t]));
  const playersById = new Map(db.players.map((p) => [p.player_id, p]));
  // EuroLeague clubs (separate data) get their names from the small EuroLeague index
  const teamName = (id) => {
    const name = teamsById.get(id)?.canonical_name ?? euroleagueIndex.teams[baseTeam(id)] ?? id;
    return String(id).startsWith("el:") ? `${name} (EuroLeague)` : name; // mixed data: the club's EuroLeague side
  };

  /** A player-season a game can use: real name, regular-season games played, real numbers (not the EuroLeague placeholders). */
  function isPlayable(ps, minGames = 5) {
    return !!(!ps.mock && ps.appeared_in_regular_season && ps.stats && ps.stats.games >= minGames && playersById.get(ps.player_id)?.name);
  }

  /** Career summary per person (built lazily, cached). */
  const summaryCache = new Map();
  function careerSummary(playerId) {
    if (summaryCache.has(playerId)) return summaryCache.get(playerId);
    const player = playersById.get(playerId);
    const records = H.getPlayerCareer(playerId);
    const played = records.filter((r) => r.appeared_in_regular_season && r.stats);
    const real = played.filter((r) => !r.mock); // numbers count only where they're real
    const stints = [];
    for (const r of records) {
      const last = stints[stints.length - 1];
      if (last && last.team_id === r.team_id && last.seasons[last.seasons.length - 1] !== r.season) last.seasons.push(r.season);
      else if (!last || last.team_id !== r.team_id) stints.push({ team_id: r.team_id, seasons: [r.season] });
    }
    const lastRec = records[records.length - 1];
    const s = {
      player, records, played, stints,
      teams: [...new Set(records.map((r) => r.team_id))],
      firstSeason: records[0]?.season ?? null,
      lastSeason: lastRec?.season ?? null,
      lastTeam: lastRec?.team_id ?? null,
      seasonsPlayed: new Set(played.map((r) => r.season)).size,
      totalGames: real.reduce((a, r) => a + (r.stats.games || 0), 0),
      bestRating: real.reduce((a, r) => Math.max(a, r.rating_mock), 0),
    };
    summaryCache.set(playerId, s);
    return s;
  }

  // Players with a name, sorted (search, autocomplete, pickers).
  const namedPlayers = db.players.filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name));
  let psIndex = null;
  const psByKey = (k) => (psIndex ??= new Map(db.player_seasons.map((ps) => [psKey(ps), ps]))).get(k) ?? null;

  return { db, H, CURRENT, PLAYED_SEASONS, playersById, teamName, isPlayable, careerSummary, namedPlayers, psByKey };
}
