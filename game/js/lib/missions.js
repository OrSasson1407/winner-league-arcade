// Weekly missions: four goals a week (the same four for everyone, picked from the pool by the week),
// tracked from game events (achievements.emit). Each pays Buckets and XP when done; all four pay a bonus.
import { seededRng } from "../data.js";
import { localDate, store, toast } from "../ui.js";
import { earn } from "./wallet.js";

const POOL = [
  { id: "online-wins", n: 3, text: "Win {n} online matches against people", on: "online:finish", test: (e) => e.result === "win" && e.mode !== "bot", reward: 90 },
  { id: "bot-win", n: 1, text: "Beat a bot online", on: "online:finish", test: (e) => e.result === "win" && e.mode === "bot", reward: 40 },
  { id: "drafts", n: 3, text: "Finish {n} All-Time Drafts", on: "draft:finish", test: () => true, reward: 50 },
  { id: "draft-90", n: 1, text: "Finish a draft with a team score of 90 or more", on: "draft:finish", test: (e) => e.total >= 90, reward: 80 },
  { id: "guess-wins", n: 3, text: "Win {n} games of Guess the Player", on: "guess:end", test: (e) => e.won, reward: 60 },
  { id: "guess-fast", n: 1, text: "Solve Guess the Player in 4 tries or fewer", on: "guess:end", test: (e) => e.won && e.tries <= 4, reward: 70 },
  { id: "hl-10", n: 1, text: "Reach 10 in a game of Higher or Lower", on: "hl:over", test: (e) => (e.score || 0) >= 10, reward: 60 },
  { id: "career-20", n: 1, text: "Score 20 or more in Career Path", on: "career:finish", test: (e) => (e.score || 0) >= 20, reward: 60 },
  { id: "conn-wins", n: 2, text: "Solve {n} Connections puzzles", on: "conn:end", test: (e) => e.won, reward: 60 },
  { id: "grid-full", n: 1, text: "Fill a whole Grid", on: "grid:end", test: (e) => e.filled === 9, reward: 70 },
  { id: "daily-days", n: 3, text: "Finish daily challenges on {n} different days", on: "daily:done", test: () => true, unique: () => localDate(), reward: 70 },
  { id: "daily-full", n: 1, text: "Get a daily Full House (every daily game in a day)", on: "daily:done", test: (e) => e.today >= (e.of || 4), reward: 80 }, // the EuroLeague choice has three
  { id: "mc-games", n: 10, text: "Play {n} My Career games", on: "mc:game", test: (e) => !e.dnp, reward: 60 },
  { id: "mc-30", n: 1, text: "Score 30 points in a My Career game", on: "mc:game", test: (e) => e.pts >= 30, reward: 80 },
  { id: "matchups", n: 2, text: "Play {n} Single games", on: "matchup:play", test: () => true, reward: 40 },
];
const BONUS = 150; // all four done
const XP_EACH = 40;

/** This week's id: the Monday it starts on (local time). */
export function weekKey(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}
/** Days until the missions change (Monday). */
export const daysLeft = () => 7 - ((new Date().getDay() + 6) % 7);

function thisWeek() {
  const week = weekKey();
  let st = store.get("missions", null);
  if (st?.week !== week) {
    const rnd = seededRng("missions-" + week), pool = POOL.slice(), list = [];
    while (list.length < 4) list.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    st = { week, list: list.map((m) => ({ id: m.id, have: 0, seen: [], done: false })), bonus: false };
    store.set("missions", st);
  }
  return st;
}
export const missionText = (def) => def.text.replace("{n}", def.n);

/** This week's missions with their definitions (for the page). */
export function missions() {
  const st = thisWeek();
  return { ...st, list: st.list.map((m) => ({ ...m, def: POOL.find((p) => p.id === m.id) })).filter((m) => m.def) };
}

/** Count a game event toward this week's missions. */
export function trackMission(event, e) {
  const st = thisWeek();
  let changed = false;
  for (const m of st.list) {
    const def = POOL.find((p) => p.id === m.id);
    if (!def || m.done || def.on !== event) continue;
    let ok = false;
    try { ok = def.test(e); } catch { /* a malformed event never counts */ }
    if (!ok) continue;
    if (def.unique) { const k = def.unique(e); if (m.seen.includes(k)) continue; m.seen.push(k); }
    m.have = Math.min(def.n, m.have + 1);
    changed = true;
    if (m.have >= def.n) {
      m.done = true;
      earn(def.reward, "mission");
      import("./progress.js").then(({ addXP }) => addXP(XP_EACH, "mission"));
      setTimeout(() => toast(`Mission complete: ${missionText(def)} · +${def.reward} 🏀`), 400);
    }
  }
  if (changed && !st.bonus && st.list.every((m) => m.done)) {
    st.bonus = true;
    earn(BONUS, "missions");
    setTimeout(() => toast(`All four missions done! Bonus +${BONUS} 🏀`), 2400);
  }
  if (changed) { store.set("missions", st); document.dispatchEvent(new CustomEvent("missions-changed")); }
}
export { BONUS as MISSION_BONUS };
