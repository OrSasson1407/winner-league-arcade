// Shared data layer for the chosen league (see leagueChoice.js): loads its database once and builds game-friendly
// indexes. Every game and browsing page reads from here. My Career reads from wl.js (always the Winner League).
import { gameDatabase as WL } from "../data/game_db.js";
import { activeLeague } from "./leagueChoice.js";
import { loadLeagueDb } from "./datasets.js";
import { makeDataApi } from "./dataApi.js";

export { POSITIONS, seededRng, pick, shuffle, birthYear, seasonYear, psKey, baseTeam } from "./dataApi.js";

/** The league this page plays on: "wl" | "nba" | "el" | "all". */
export const LEAGUE = activeLeague();
const db = LEAGUE === "wl" ? WL : await loadLeagueDb(LEAGUE, WL);
export { db };
export const { H, CURRENT, PLAYED_SEASONS, playersById, teamName, isPlayable, careerSummary, namedPlayers, psByKey } = makeDataApi(db);
