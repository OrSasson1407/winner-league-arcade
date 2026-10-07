// Progression: XP + levels (1–50) with titles, avatar frames, and an activity log (for the monthly recap).
import { store } from "../ui.js";
import { confetti, sound } from "./fx.js";
import { coinsForLevel, earn, owns } from "./wallet.js";

export const MAX_LEVEL = 50;
/** XP needed to go from level n to n+1. */
const step = (n) => 100 + 50 * (n - 1);
/** Total XP needed to reach level n. */
export const xpForLevel = (n) => { let t = 0; for (let i = 1; i < n; i++) t += step(i); return t; };

const TITLES = [
  [1, "Walk-on"], [3, "Bench Warmer"], [6, "Rotation Player"], [10, "Starter"], [15, "Team Captain"], [20, "All-Star"],
  [25, "MVP Candidate"], [30, "League MVP"], [35, "Champion"], [40, "Hall of Famer"], [45, "Living Legend"], [50, "League Legend"],
];
export const titleFor = (level) => TITLES.filter(([l]) => level >= l).pop()[1];

export function levelInfo(xp = store.get("xp", 0)) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = level < MAX_LEVEL ? xpForLevel(level + 1) : base;
  return { xp, level, title: titleFor(level), into: xp - base, need: next - base, pct: level < MAX_LEVEL ? (xp - base) / (next - base) : 1, max: level >= MAX_LEVEL };
}

// ---------------------------------------------------------------- activity log (kept for ~13 months)
export function logActivity(e, data = {}) {
  const log = store.get("activity:log", []);
  log.push({ t: new Date().toISOString(), e, ...data });
  const cutoff = Date.now() - 400 * 864e5;
  store.set("activity:log", log.filter((x) => Date.parse(x.t) >= cutoff).slice(-4000));
}

/** Adds XP, logs it, and celebrates a level-up. */
export function addXP(amount, reason, { log = true } = {}) {
  if (!amount || amount <= 0) return;
  const before = levelInfo();
  const xp = before.xp + Math.round(amount);
  store.set("xp", xp);
  if (log) logActivity("xp", { xp: Math.round(amount), r: reason });
  const after = levelInfo(xp);
  document.dispatchEvent(new CustomEvent("xp-changed", { detail: { amount, before, after } }));
  if (after.level > before.level) { levelUp(after); for (let l = before.level + 1; l <= after.level; l++) earn(coinsForLevel(l), "level"); }
}

/** XP rewards for game events (shared by every game through achievements.emit). */
export function xpFor(event, e) {
  switch (event) {
    case "draft:finish": return Math.max(20, 50 + Math.round((e.total - 70) * 2));
    case "draft:season": return e.champion ? 120 : e.madePlayoffs ? 40 : 15;
    case "draft:live": return e.completed ? 15 : 0;
    case "guess:end": return e.won ? 40 + Math.max(0, 9 - e.tries) * 5 - e.hints * 3 : 10;
    case "hl:answer": return e.ok ? 3 : 0;
    case "hl:over": return 10;
    case "career:finish": return 10 + e.score * 3;
    case "mc:game": return e.dnp ? 0 : 2 + (e.pts >= 20 ? 3 : 0) + (e.won ? 1 : 0);
    case "mc:season": return 40;
    case "mc:award": return 30;
    case "mc:trophy": return e.type === "title" ? 120 : e.type === "cup" ? 60 : 40;
    case "mc:retire": return 100 + (e.hof ? 200 : 0);
    case "conn:end": return e.won ? 45 - 8 * (e.mistakes || 0) : 10;
    case "grid:end": return 5 * (e.filled || 0) + (e.filled === 9 ? 25 : 0) + Math.round((e.score || 0) / 30);
    case "daily:done": return 15 + Math.min(35, 5 * Math.max(0, (e.streak || 1) - 1));
    case "online:finish": {
      if (e.mode === "bot") return e.result === "win" ? 30 : e.result === "draw" ? 20 : 10;
      const streakBonus = e.rated && e.result === "win" ? Math.min(50, 10 * Math.max(0, (e.streak || 0) - 1)) : 0;
      return (e.result === "win" ? 60 : e.result === "draw" ? 35 : 20) + streakBonus;
    }
    default: return 0;
  }
}
export const XP_FOR_TIER = { bronze: 50, silver: 100, gold: 200, legend: 500 };

function levelUp(info) {
  const el = document.createElement("div");
  el.className = "levelup";
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="lu-card"><small>LEVEL UP</small><b class="led">${info.level}</b><span>${info.title}</span></div>`;
  el.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
  confetti(2400);
  sound.play("win");
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3200);
}

// ---------------------------------------------------------------- avatar frames
export const FRAMES = [
  { id: "none", name: "No frame", req: "Always available", ok: () => true },
  { id: "bronze", name: "Bronze", req: "Reach level 5", ok: (l) => l >= 5 },
  { id: "silver", name: "Silver", req: "Reach level 10", ok: (l) => l >= 10 },
  { id: "gold", name: "Gold", req: "Reach level 20", ok: (l) => l >= 20 },
  { id: "flame", name: "On Fire", req: "Unlock 3 gold achievements", ok: (l, u) => u.gold >= 3 },
  { id: "champion", name: "Champion", req: "Win a simulated title (Title Run)", ok: (l, u) => u.ids.has("d_title") },
  { id: "court", name: "Hardwood", req: "Unlock 15 achievements", ok: (l, u) => u.count >= 15 },
  { id: "legend", name: "Legend", req: "Unlock any Legend achievement", ok: (l, u) => u.legend >= 1 },
  { id: "rk-silver", name: "Silver Rank", req: "Reach Silver rank online", ok: (l, u) => u.ids.has("o_silver") },
  { id: "rk-gold", name: "Gold Rank", req: "Reach Gold rank online", ok: (l, u) => u.ids.has("o_gold") },
  { id: "rk-plat", name: "Platinum Rank", req: "Reach Platinum rank online", ok: (l, u) => u.ids.has("o_plat") },
  { id: "rk-champ", name: "Champion Rank", req: "Reach Champion rank online", ok: (l, u) => u.ids.has("o_champ") },
  { id: "rk-streak", name: "Hot Streak", req: "Win 10 ranked matches in a row", ok: (l, u) => u.ids.has("o_streak10") },
  // bought with Buckets in the shop
  ...[["neon", "Neon"], ["royal", "Royal"], ["ice", "Ice"], ["rainbow", "Rainbow"], ["net", "Net"]]
    .map(([id, name]) => ({ id, name, req: "In the shop", shop: true, ok: () => owns(`frame:${id}`) })),
];

export function frameUnlocked(frame, level, unlockedDefs) {
  const u = { count: unlockedDefs.length, gold: unlockedDefs.filter((d) => d.tier === "gold").length,
    legend: unlockedDefs.filter((d) => d.tier === "legend").length, ids: new Set(unlockedDefs.map((d) => d.id)) };
  return frame.ok(level, u);
}
