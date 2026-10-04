// Online ranking rules shared by the server and the browser: ELO per game and the rank ladder.
export const START_ELO = 1000;
export const RATED_GAMES = ["hl", "guess", "career", "draft", "conn", "grid"];

export const RANKS = [
  { id: "bronze", name: "Bronze", min: 0, color: "#c47b44" },
  { id: "silver", name: "Silver", min: 1100, color: "#c3cad5" },
  { id: "gold", name: "Gold", min: 1250, color: "#f5c542" },
  { id: "platinum", name: "Platinum", min: 1400, color: "#5fd4c4" },
  { id: "diamond", name: "Diamond", min: 1550, color: "#7ab8ff" },
  { id: "champion", name: "Champion", min: 1700, color: "#ff7ad9" },
];
export const rankOf = (elo = START_ELO) => RANKS.filter((r) => elo >= r.min).pop();
export const rankIndex = (elo) => RANKS.indexOf(rankOf(elo));

/** New ratings after a game. score: 1 win, 0.5 draw, 0 loss (for player a). */
export function eloUpdate(a, b, score, gamesA = 0, gamesB = 0) {
  const ea = 1 / (1 + 10 ** ((b - a) / 400));
  const k = (g) => (g < 10 ? 40 : 24); // settle faster while new
  const da = Math.round(k(gamesA) * (score - ea));
  const db = Math.round(k(gamesB) * ((1 - score) - (1 - ea)));
  return [Math.max(100, a + da), Math.max(100, b + db)];
}

/** Matchmaking: how far apart two ratings may be after waiting `sec` seconds. */
export const matchRange = (sec) => (sec >= 20 ? Infinity : 100 + 25 * sec);

/** Player code (friends): 6 characters derived from the session id, stable across server restarts. */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function friendCode(sid) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < sid.length; i++) {
    const c = sid.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  let n = h1 * 4294967296 + h2, out = "";
  for (let i = 0; i < 6; i++) { out += CODE_CHARS[n % CODE_CHARS.length]; n = Math.floor(n / CODE_CHARS.length); }
  return out;
}
export const cleanCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Quick chat lines (sent by index, so nothing free-form goes between players). */
export const CHAT = ["Good luck!", "Good game!", "Nice one!", "Wow!", "Unlucky!", "One more?", "Too easy 😎", "Thanks!"];
