// One kit per league for online play: the league's data and the game rules over it. Every room plays on its
// players' league (they're matched only within one league). Kits load on first use and stay in memory.
import { gameDatabase as WL } from "../game/data/game_db.js";
import { loadLeagueDb } from "../game/js/datasets.js";
import { makeDataApi } from "../game/js/dataApi.js";
import { GAME_LEAGUES, LEAGUES } from "../game/js/leagueChoice.js";
import { makeCareerLogic } from "../game/js/shared/careerLogic.js";
import { makeGuessLogic } from "../game/js/shared/guessLogic.js";
import { makeDraftLogic } from "../game/js/shared/draftLogic.js";
import { makeLeagueFacts } from "../game/js/shared/leagueFacts.js";
import { rosterTools } from "../game/js/games/draft_sim.js";

export const LEAGUE_KEYS = Object.keys(LEAGUES);
export const cleanLeague = (l) => (LEAGUES[l] ? l : "wl");

// online game key -> the game's route in the arcade (which leagues it runs on: leagueChoice.js)
const ROUTE = { hl: "higher-lower", guess: "guess", career: "career", draft: "draft", conn: "connections", grid: "grid", coach: "matchup" };
export const gameInLeague = (game, league) => !!ROUTE[game] && (GAME_LEAGUES[ROUTE[game]] || []).includes(league);

const kits = new Map(); // league -> Promise<kit>
/** The league's kit (loads it the first time). */
export function loadKit(league) {
  league = cleanLeague(league);
  if (!kits.has(league)) kits.set(league, (async () => {
    const db = league === "wl" ? WL : await loadLeagueDb(league, WL);
    const D = { ...makeDataApi(db), LEAGUE: league };
    return { league, D, career: makeCareerLogic(D), guess: makeGuessLogic(D), draft: makeDraftLogic(D), facts: makeLeagueFacts(D), sim: rosterTools(D) };
  })());
  return kits.get(league);
}
const loaded = new Map();
/** A kit that has finished loading (null until then). */
export const getKit = (league) => loaded.get(cleanLeague(league)) || null;
export async function kitFor(league) {
  const k = await loadKit(league);
  loaded.set(k.league, k);
  return k;
}
