// Buckets 🏀: the arcade's coin. Earned only by playing (never bought), spent in the shop on looks,
// extra modes and single-player helpers. Nothing bought gives an edge over other players online.
// Kept in the browser like the rest of the progress (wallet: { coins, total, owned, equipped, tokens, claimed }).
import { localDate, store } from "../ui.js";

const KEY = "wallet";
const blank = () => ({ coins: 0, total: 0, owned: {}, equipped: {}, tokens: {}, claimed: {} });
export const wallet = () => ({ ...blank(), ...store.get(KEY, {}) });
function save(w) {
  store.set(KEY, w);
  document.dispatchEvent(new CustomEvent("wallet-changed", { detail: w }));
}

export const coins = () => wallet().coins;
export const owns = (id) => !!wallet().owned[id];
export const equipped = (slot) => wallet().equipped[slot] ?? null;
export const tokens = (id) => wallet().tokens[id] || 0;

/** Add buckets for something the player did (shows a small "+12" next to the counter). */
export function earn(amount, reason = "") {
  amount = Math.round(amount);
  if (!(amount > 0)) return;
  const w = wallet();
  w.coins += amount; w.total += amount;
  save(w);
  document.dispatchEvent(new CustomEvent("coins-earned", { detail: { amount, reason } }));
}

/** Buy an item (or a pack of single-use helpers). Returns false when there aren't enough buckets. */
export function buy(item, price) {
  const w = wallet();
  if (w.coins < price) return false;
  w.coins -= price;
  if (item.kind === "token") w.tokens[item.token] = (w.tokens[item.token] || 0) + item.count;
  else w.owned[item.id] = new Date().toISOString();
  save(w);
  return true;
}
/** Use one single-use helper (an extra hint, an extra re-spin). Returns false when none are left. */
export function useToken(id) {
  const w = wallet();
  if (!w.tokens[id]) return false;
  w.tokens[id]--;
  save(w);
  return true;
}
export function equip(slot, id) {
  const w = wallet();
  if (id) w.equipped[slot] = id; else delete w.equipped[slot];
  save(w);
}
/** One-off bonuses (a streak milestone) are paid once. */
function claimOnce(key, amount, reason) {
  const w = wallet();
  if (w.claimed[key]) return;
  w.claimed[key] = new Date().toISOString();
  save(w);
  earn(amount, reason);
}

// ------------------------------------------------------------------ what playing pays
export const COINS_FOR_TIER = { bronze: 25, silver: 50, gold: 100, legend: 250 };
export const coinsForLevel = (level) => 50 + 10 * level;
const DAILY_GAMES = 4;

/** Buckets for a game event (every game reports through achievements.emit). */
export function coinsFor(event, e) {
  switch (event) {
    case "draft:finish": return 10 + Math.max(0, Math.round((e.total - 80) * 1.5)) + (e.total >= 90 ? 10 : 0);
    case "draft:season": return e.champion ? 30 : e.madePlayoffs ? 10 : 3;
    case "guess:end": return e.won ? 15 + Math.max(0, 8 - e.tries) * 2 - (e.hints || 0) : 3;
    case "hl:over": return Math.min(40, 3 + Math.round((e.score || 0) / 2));
    case "career:finish": return Math.round(e.score || 0);
    case "conn:end": return e.won ? Math.max(5, 15 - 3 * (e.mistakes || 0)) : 3;
    case "grid:end": return 2 * (e.filled || 0) + (e.filled === 9 ? 10 : 0);
    case "mc:game": return e.dnp ? 0 : (e.won ? 2 : 1) + (e.pts >= 30 ? 3 : 0);
    case "mc:season": return 15;
    case "mc:award": return 10;
    case "mc:trophy": return e.type === "title" ? 40 : e.type === "cup" ? 20 : 15;
    case "mc:retire": return 50 + (e.hof ? 100 : 0);
    case "matchup:play": return 2;
    case "daily:done": return 10 + (e.today >= DAILY_GAMES ? 20 : 0); // the 4th of the day pays the "full house" bonus too
    case "online:finish": {
      if (e.mode === "bot") return e.result === "win" ? 8 : e.result === "draw" ? 5 : 2;
      const streak = e.rated && e.result === "win" ? Math.min(10, 2 * Math.max(0, (e.streak || 0) - 1)) : 0;
      return (e.result === "win" ? 20 : e.result === "draw" ? 10 : 5) + streak; // losing still pays a little
    }
    default: return 0;
  }
}

/** Called for every game event: pays the event, and the daily-streak milestones (7, 30, 100 days) once each. */
export function onEvent(event, e) {
  earn(coinsFor(event, e), event);
  if (event === "daily:done" && [7, 30, 100].includes(e.streak)) claimOnce(`streak${e.streak}:${localDate()}`, { 7: 50, 30: 200, 100: 500 }[e.streak], "streak");
}
