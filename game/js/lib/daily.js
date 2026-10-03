// Daily challenges: one puzzle per game per day, the same for everyone. Draft, Higher or Lower and
// Career Path use a challenge code derived from the date; Guess the Player uses its own Daily mode.
// Your first result each day counts; a day counts toward the streak when you finish at least one.
import { localDate, store, toast } from "../ui.js";
import { parseCode } from "./challenge.js";
import { emit } from "./achievements.js";

export const DAILY_GAMES = {
  draft: { letter: "D", name: "All-Time Draft", ic: "trophy", route: "draft", rules: "Same spins for everyone today." },
  guess: { letter: "G", name: "Guess the Player", ic: "search", route: "guess", rules: "Today's mystery player (Daily mode)." },
  hl: { letter: "H", name: "Higher or Lower", ic: "chart", route: "higher-lower", rules: "Same pairs in the same order for everyone." },
  career: { letter: "C", name: "Career Path", ic: "arrowRight", route: "career", rules: "Today's 10 careers." },
  connections: { letter: "N", name: "Connections", ic: "link", route: "connections", rules: "Today's 16 players, four groups.", own: true },
  grid: { letter: "R", name: "The Grid", ic: "games", route: "grid", rules: "Today's 3×3 board.", own: true },
};
export const DAILY_COUNT = Object.keys(DAILY_GAMES).length;
const BY_LETTER = Object.fromEntries(Object.entries(DAILY_GAMES).map(([k, g]) => [g.letter, k]));

function seed6(text) {
  let h1 = 2166136261, h2 = 52711;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return ((h1 % 46656) * 46656 + (h2 % 46656)).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}
export const dailyCode = (gameKey, date = localDate()) => `WLA-${DAILY_GAMES[gameKey].letter}${seed6(`daily-${date}-${gameKey}`)}`;
export function dailyLink(gameKey) {
  // games with their own Daily mode link to it; the others use a date-based challenge code
  return gameKey === "guess" || DAILY_GAMES[gameKey].own ? `#/${DAILY_GAMES[gameKey].route}?mode=daily` : `#/${DAILY_GAMES[gameKey].route}?challenge=${dailyCode(gameKey)}`;
}
/** If this challenge code is today's daily, which game it is. */
export function dailyGameOf(code) {
  const c = parseCode(code);
  const key = c && BY_LETTER[c.letter];
  return key && key !== "guess" && dailyCode(key) === c.code ? key : null;
}

const log = () => store.get("daily:log", {});
export const todayStatus = (date = localDate()) => log()[date] || {};

function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
export { addDays };

/** Current streak: consecutive days with at least one daily done, ending today (or yesterday if today is still open). */
export function dailyStreak() {
  const L = log();
  let day = localDate();
  if (!Object.keys(L[day] || {}).length) day = addDays(day, -1);
  let n = 0;
  while (Object.keys(L[day] || {}).length) { n++; day = addDays(day, -1); }
  return n;
}
export function dailyStats() {
  const L = log();
  const days = Object.values(L);
  return { total: days.reduce((a, d) => a + Object.keys(d).length, 0), fullDays: days.filter((d) => Object.keys(d).length >= DAILY_COUNT).length, best: store.get("daily:best", 0) };
}

/** Record today's result for a game (first result of the day counts). */
export function markDaily(gameKey, result) {
  const date = localDate();
  const L = log();
  const day = L[date] || {};
  if (day[gameKey]) return;
  day[gameKey] = String(result).slice(0, 40);
  L[date] = day;
  store.set("daily:log", L);
  const streak = dailyStreak();
  if (streak > store.get("daily:best", 0)) store.set("daily:best", streak);
  const s = dailyStats();
  emit("daily:done", { game: gameKey, streak, today: Object.keys(day).length, total: s.total, fullDays: s.fullDays });
  toast(Object.keys(day).length >= DAILY_COUNT ? `All ${DAILY_COUNT} daily challenges done today! 🔥` : `Daily challenge done · ${streak}-day streak 🔥`);
}
