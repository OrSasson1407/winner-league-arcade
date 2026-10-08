// Which league the arcade plays on: the Winner League (Israeli Premier League), the NBA, the EuroLeague, or
// all of them mixed. The choice is a display setting (stored with the others); changing it reloads the page,
// so every screen starts on the new data. My Career always stays in the Winner League.
// No imports: data.js reads this before anything else loads (and a worker gets it from its URL).

export const LEAGUES = {
  // phrase: the league inside a sentence; inLg: " in the league" style suffix (empty for the mix)
  wl: { name: "Winner League", short: "Winner League", phrase: "the Israeli Premier League", inLg: " in the league", desc: "The Israeli Premier League, 2010-11 to today." },
  nba: { name: "NBA", short: "NBA", phrase: "the NBA", inLg: " in the NBA", desc: "Every NBA season since 2010-11." },
  el: { name: "EuroLeague", short: "EuroLeague", phrase: "the EuroLeague", inLg: " in the EuroLeague", desc: "Clubs and careers since 2000-01. Games built on stats aren't available: the EuroLeague numbers here aren't real yet." },
  all: { name: "All mixed", short: "Mixed", phrase: "the Winner League, the NBA and the EuroLeague", inLg: "", desc: "Winner League, NBA and EuroLeague together." },
};
export const LEAGUE_IDS = Object.keys(LEAGUES);
/** Challenge and daily codes end with the league's letter ("WLA-D3K9F2A-N" is an NBA code); the Winner League has none. */
export const LEAGUE_LETTER = { wl: "", nba: "N", el: "E", all: "M" };
export const leagueOfLetter = (l) => Object.keys(LEAGUE_LETTER).find((k) => LEAGUE_LETTER[k] === (l || "")) || "wl";
/** Switch league: saved with the display settings, then the page reloads on the new data. */
export function setLeague(league, hash) {
  try { const s = JSON.parse(localStorage.getItem("wla:settings") || "{}"); s.league = league; localStorage.setItem("wla:settings", JSON.stringify(s)); } catch { /* no storage: stays */ }
  if (hash) location.hash = hash;
  location.reload();
}

/** The league chosen in this browser ("wl" when nothing is set, on the server, or in a worker without one). */
export function activeLeague() {
  try {
    if (typeof window === "undefined") { // a worker (its page passes the league in the URL) or the server
      const fromUrl = typeof self !== "undefined" && self.location ? new URLSearchParams(self.location.search).get("league")
        : globalThis.process?.env?.WLA_LEAGUE ?? null; // tools and tests: WLA_LEAGUE=nba node ...
      return LEAGUES[fromUrl] ? fromUrl : "wl";
    }
    const s = JSON.parse(localStorage.getItem("wla:settings") || "{}");
    return LEAGUES[s.league] ? s.league : "wl";
  } catch { return "wl"; }
}

/**
 * Games and what they need from the data. The EuroLeague data has real names, clubs and seasons but not real
 * stats or (for most players) personal details, so only the games built on clubs and seasons run on it.
 */
export const GAME_LEAGUES = {
  draft: ["wl", "nba", "all"], guess: ["wl", "nba", "all"], "higher-lower": ["wl", "nba", "all"], matchup: ["wl", "nba", "all"],
  career: ["wl", "nba", "el", "all"], connections: ["wl", "nba", "el", "all"], grid: ["wl", "nba", "el", "all"],
};
export const gameAvailable = (game, league = activeLeague()) => !GAME_LEAGUES[game] || GAME_LEAGUES[game].includes(league);
