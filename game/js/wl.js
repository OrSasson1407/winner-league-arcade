// The Winner League data on its own, whatever league the arcade is set to: My Career (and anything tied to the
// Israeli league, like the national-team links) reads from here. Same API as data.js.
import { gameDatabase as db } from "../data/game_db.js";
import { makeDataApi } from "./dataApi.js";

export { POSITIONS, seededRng, pick, shuffle, birthYear, seasonYear, psKey } from "./dataApi.js";
export { db };
export const { H, CURRENT, PLAYED_SEASONS, playersById, teamName, isPlayable, careerSummary, namedPlayers, psByKey } = makeDataApi(db);
