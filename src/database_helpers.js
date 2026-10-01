// Helper functions for the Israeli BSL 2010-11 .. 2026-27 database.
//
//   import { israelBSLDatabase } from "../exports/israel_bsl_2010_2027.js";
//   import { createDatabaseHelpers } from "./database_helpers.js";
//   const db = createDatabaseHelpers(israelBSLDatabase);
//   db.getPlayersByTeam("maccabi_tel_aviv", "2014-15");
//
// Every function can also be imported directly and called with the database as the
// first argument (e.g. getPlayerById(israelBSLDatabase, "jeremy_pargo")).
// player_id identifies a REAL PERSON (same id in every season), so a Set of used
// player_ids is all a game needs to stop the same person being picked twice.

const indexCache = new WeakMap();

function indexes(db) {
  let idx = indexCache.get(db);
  if (idx) return idx;
  const playersById = new Map(db.players.map((p) => [p.player_id, p]));
  const teamsById = new Map(db.teams.map((t) => [t.team_id, t]));
  const bySeason = new Map();
  const byPlayer = new Map();
  const byTeamSeason = new Map();
  for (const ps of db.player_seasons) {
    if (!bySeason.has(ps.season)) bySeason.set(ps.season, []);
    bySeason.get(ps.season).push(ps);
    if (!byPlayer.has(ps.player_id)) byPlayer.set(ps.player_id, []);
    byPlayer.get(ps.player_id).push(ps);
    const k = `${ps.team_id}|${ps.season}`;
    if (!byTeamSeason.has(k)) byTeamSeason.set(k, []);
    byTeamSeason.get(k).push(ps);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.season.localeCompare(b.season) || a.team_id.localeCompare(b.team_id));
  const seasonTeams = new Map();
  for (const st of db.season_teams) {
    if (!seasonTeams.has(st.season)) seasonTeams.set(st.season, []);
    seasonTeams.get(st.season).push(st);
  }
  idx = { playersById, teamsById, bySeason, byPlayer, byTeamSeason, seasonTeams };
  indexCache.set(db, idx);
  return idx;
}

/** The person record (name, birth date, height, nationality, ...) or null. */
export function getPlayerById(db, playerId) {
  return indexes(db).playersById.get(playerId) ?? null;
}

/** Every player-season-team record of a season (a traded player appears once per team). */
export function getPlayersBySeason(db, season) {
  return indexes(db).bySeason.get(season) ?? [];
}

/** Roster records of one team in one season. */
export function getPlayersByTeam(db, teamId, season) {
  return indexes(db).byTeamSeason.get(`${teamId}|${season}`) ?? [];
}

/**
 * The player's record(s) in a season. Returns an array because a player who changed
 * teams mid-season has one record per team. Empty array if they did not play that season.
 */
export function getPlayerSeason(db, playerId, season) {
  return (indexes(db).byPlayer.get(playerId) ?? []).filter((ps) => ps.season === season);
}

/** All records of a player across their career, ordered by season. */
export function getPlayerCareer(db, playerId) {
  return indexes(db).byPlayer.get(playerId) ?? [];
}

/** Teams of a season: [{ season, team_id, team_name, ... }]. */
export function getTeamsBySeason(db, season) {
  return indexes(db).seasonTeams.get(season) ?? [];
}

/** The club record (canonical name + historical season names). */
export function getTeamById(db, teamId) {
  return indexes(db).teamsById.get(teamId) ?? null;
}

/** True when this real person has already been picked (works across seasons/teams). */
export function hasPlayerAlreadyBeenUsed(playerId, usedPlayerIds) {
  if (!usedPlayerIds) return false;
  if (usedPlayerIds instanceof Set) return usedPlayerIds.has(playerId);
  return Array.from(usedPlayerIds).includes(playerId);
}

/**
 * Player-season records of a season whose PERSON has not been used yet.
 * Options: { usedPlayerIds, teamId, onlyAppeared (default true), dedupePerson (default true) }.
 * With dedupePerson, a traded player is returned once (the record with the most games).
 */
export function getAvailablePlayers(db, season, options = {}) {
  const { usedPlayerIds = new Set(), teamId = null, onlyAppeared = true, dedupePerson = true } = options;
  let list = teamId ? getPlayersByTeam(db, teamId, season) : getPlayersBySeason(db, season);
  if (onlyAppeared && season !== db.metadata?.current_season) list = list.filter((ps) => ps.appeared_in_regular_season);
  list = list.filter((ps) => !hasPlayerAlreadyBeenUsed(ps.player_id, usedPlayerIds));
  if (!dedupePerson) return list;
  const best = new Map();
  for (const ps of list) {
    const cur = best.get(ps.player_id);
    const g = ps.stats?.games ?? 0;
    if (!cur || g > (cur.stats?.games ?? 0)) best.set(ps.player_id, ps);
  }
  return Array.from(best.values());
}

/** Convenience wrapper binding every helper to one database object. */
export function createDatabaseHelpers(db) {
  return {
    db,
    getPlayerById: (id) => getPlayerById(db, id),
    getPlayersBySeason: (season) => getPlayersBySeason(db, season),
    getPlayersByTeam: (teamId, season) => getPlayersByTeam(db, teamId, season),
    getPlayerSeason: (id, season) => getPlayerSeason(db, id, season),
    getPlayerCareer: (id) => getPlayerCareer(db, id),
    getTeamsBySeason: (season) => getTeamsBySeason(db, season),
    getTeamById: (teamId) => getTeamById(db, teamId),
    getAvailablePlayers: (season, options) => getAvailablePlayers(db, season, options),
    hasPlayerAlreadyBeenUsed,
  };
}
