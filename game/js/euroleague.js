// EuroLeague data, kept apart from the Winner League data. The small index (names, seasons, clubs and the
// EuroLeague years of Winner League players) is always available; the full 4 MB file loads on demand.
// Stats, ratings and the bios of players who never played in the Winner League are MOCK in the source data.
import { euroleagueIndex as IX } from "../data/euroleague_index.js";

export { IX as EL_INDEX };
/** Seasons with games (the current one is rosters only). */
export const EL_SEASONS = IX.season_list.filter((s) => s !== IX.current_season);
export const EL_LAST = EL_SEASONS[EL_SEASONS.length - 1];
export const elTeamName = (id) => IX.teams[id] ?? id;
/** EuroLeague years of a Winner League player: [[season, team_id], ...] (empty if none). */
export const elCareer = (pid) => IX.career[pid] || [];
export const playedEL = (pid) => !!IX.career[pid];
export const isWLClub = (tid) => IX.israeliClubs.includes(tid);
export const MOCK_NOTE = "EuroLeague stats and ratings are placeholder (mock) data for now, not real numbers.";

let full = null, loading = null;
/** Load the full EuroLeague data once. Resolves to the API below. */
export function loadEuroleague() {
  if (full) return Promise.resolve(full);
  return (loading ||= import("../data/euroleague_db.js").then(({ euroleagueDatabase: D }) => {
    const players = new Map(D.players.map((p) => [p.player_id, p]));
    const bySeasonTeam = new Map();
    for (const r of D.player_seasons) {
      const k = r.season + "|" + r.team_id;
      if (!bySeasonTeam.has(k)) bySeasonTeam.set(k, []);
      bySeasonTeam.get(k).push(r);
    }
    for (const list of bySeasonTeam.values()) list.sort((a, b) => (b.stats?.mpg ?? 0) - (a.stats?.mpg ?? 0));
    const byPlayer = new Map();
    for (const r of D.player_seasons) { if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []); byPlayer.get(r.player_id).push(r); }
    for (const list of byPlayer.values()) list.sort((a, b) => a.season.localeCompare(b.season));
    full = {
      db: D, players,
      name: (pid) => players.get(pid)?.name ?? pid,
      /** Roster of a club in a season, most minutes first. */
      roster: (season, tid) => bySeasonTeam.get(season + "|" + tid) || [],
      teamsOf: (season) => D.seasons.find((s) => s.season === season)?.teams || [],
      seasonsOf: (tid) => D.season_teams.filter((x) => x.team_id === tid).map((x) => x.season).sort(),
      careerOf: (pid) => byPlayer.get(pid) || [],
      officialName: (season, tid) => D.season_teams.find((x) => x.season === season && x.team_id === tid)?.team_name || elTeamName(tid),
    };
    return full;
  }));
}
export const elLoaded = () => full;
