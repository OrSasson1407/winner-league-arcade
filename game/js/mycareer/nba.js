// My Career in the NBA: real NBA teams, rosters and players from the NBA data (real per-game stats).
// The NBA data loads on demand (loadNba); without it, careers stay in Europe.
// Ratings: NBA ratings are on their own scale. Players who played both leagues rate about 20+ points
// higher in the Winner League data, so NBA ratings are moved onto the Winner League scale (+20), with
// the very top compressed so that 99 stays 99. On that scale an average NBA team is about 95: a career
// player needs an overall around 90 to earn NBA minutes, and a starting spot takes more.
import { makeDataApi } from "../dataApi.js";
import { rosterTools } from "../games/draft_sim.js";

/** An NBA rating on the Winner League scale. */
export const nbaToWl = (r) => (r <= 74 ? r + 20 : Math.min(99, Math.round(94 + (r - 74) * 0.2)));

let NBA = null, loading = null;
/** Load the NBA data (once). */
export function loadNba() {
  return (loading ||= import("../../data/nba_db.js").then(({ nbaDatabase: N }) => {
    const db = { ...N, player_seasons: N.player_seasons.map((r) => ({ ...r, rating_mock: nbaToWl(r.rating_mock), nba: true })) };
    const A = makeDataApi(db);
    const T = rosterTools(A);
    const played = db.metadata.season_list.filter((s) => s !== db.metadata.current_season);
    NBA = { A, T, played, teamIds: new Set(db.teams.map((t) => t.team_id)) };
    return NBA;
  }));
}
export const nbaReady = () => !!NBA;

/** The NBA data season for a career season (later seasons use the last one in the data). */
export function nbaSeasonFor(label) {
  if (!NBA) return null;
  if (NBA.played.includes(label)) return label;
  return label > NBA.played[NBA.played.length - 1] ? NBA.played[NBA.played.length - 1] : label < NBA.played[0] ? NBA.played[0] : null;
}
export const isNbaTeam = (tid) => !!NBA && NBA.teamIds.has(tid);

const r1 = (v) => Math.round(v * 10) / 10;
/** NBA teams of a career season, strengths on the Winner League scale. */
export function nbaTeams(label) {
  const s = nbaSeasonFor(label);
  if (!s) return [];
  return NBA.A.H.getTeamsBySeason(s).map((t) => ({ id: t.team_id, name: NBA.A.teamName(t.team_id), strength: r1(NBA.T.realTeamStrength(s, t.team_id)), nba: true }));
}
/** An NBA team's roster for a career season (ratings on the Winner League scale). */
export function nbaRoster(label, tid) {
  const s = nbaSeasonFor(label);
  return s ? NBA.T.realRoster(s, tid) : [];
}
export const nbaPlayer = (pid) => NBA?.A.playersById.get(pid) ?? null;
/** The NBA's real players of a season (10+ games): the competition for NBA awards. */
export function nbaField(label) {
  const s = nbaSeasonFor(label);
  return s ? NBA.A.db.player_seasons.filter((r) => r.season === s && NBA.A.isPlayable(r, 10)) : [];
}
