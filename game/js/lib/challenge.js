// Challenge codes: one short code = one exact game setup (same mystery player / same pairs /
// same spins / same careers) for everyone who enters it. No server needed: the code is a seed.
//   WLA-D3K9F2A  →  game letter (D draft, G guess, H higher-lower, C career) + 6-char seed
import { seededRng } from "../data.js";

export const CH_GAMES = {
  D: { key: "draft", route: "draft", name: "All-Time Draft", rules: "Solo draft, all seasons, sixth man on. Same spins for everyone." },
  G: { key: "guess", route: "guess", name: "Guess the Player", rules: "Same mystery player for everyone. 8 tries, hints cost one each." },
  H: { key: "hl", route: "higher-lower", name: "Higher or Lower", rules: "Classic, mixed stats. Same pairs in the same order for everyone." },
  C: { key: "career", route: "career", name: "Career Path", rules: "Same 10 careers for everyone. 3 points each, 2 with the hint." },
};
const LETTER = { draft: "D", guess: "G", hl: "H", career: "C" };

export function newCode(gameKey) {
  const seed = Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
  return `WLA-${LETTER[gameKey]}${seed}`;
}

/** Parse user input ("wla-g3k9f2a", " WLA G3K9F2A ") into { code, letter, game }. */
export function parseCode(input) {
  const m = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^(?:WLA)?([DGHC])([0-9A-Z]{6})$/);
  if (!m) return null;
  const code = `WLA-${m[1]}${m[2]}`;
  return { code, letter: m[1], game: CH_GAMES[m[1]] };
}

/** Deterministic random generator for a challenge code. */
export const challengeRng = (code) => seededRng("challenge-" + code);

/** If the route query carries a valid challenge for this game, return it. */
export function challengeFor(query, gameKey) {
  const c = parseCode(query?.challenge);
  return c && c.game.key === gameKey ? c : null;
}

export const challengeLink = (code) => `#/challenge/${code}`;
