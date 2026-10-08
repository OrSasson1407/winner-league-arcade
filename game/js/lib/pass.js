// The season pass: a free monthly track. Every XP point earned in any game this month moves you along 30 tiers;
// each tier has a reward to claim: Buckets, single-use helpers, shop items (frames, cards, courts, stickers,
// avatar pieces) and, at the top, the month's own badge. Rewards are the same for everyone in a month and
// change every month. No money: Buckets and items only. A new month starts a new pass.
import { localDate, store } from "../ui.js";
import { seededRng } from "../data.js";
import { earn, grant, grantTokens, owns } from "./wallet.js";
import { dateLocale } from "../i18n/index.js";

export const TIERS = 30;
export const PER_TIER = 120; // XP per tier: about two or three days of play per five tiers
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const KEY = (m = monthKey()) => `pass:${m}`;
export const passState = (m = monthKey()) => ({ xp: 0, claimed: [], ...store.get(KEY(m), {}) });
export const tierOf = (xp) => Math.min(TIERS, Math.floor(xp / PER_TIER));

/** XP earned anywhere also moves the pass (called by progress.addXP). */
export function passGain(xp) {
  if (!(xp > 0)) return;
  const s = passState();
  const before = tierOf(s.xp);
  s.xp += Math.round(xp);
  store.set(KEY(), s);
  if (tierOf(s.xp) > before) document.dispatchEvent(new CustomEvent("pass-tier", { detail: { tier: tierOf(s.xp) } }));
}

/** The month's rewards, tier 1 to 30 (the same for everyone that month). */
export function rewards(m = monthKey(), items = []) {
  const rnd = seededRng("pass-" + m);
  const cosmetic = items.filter((i) => ["frame", "card", "court", "sticker", "avatar"].includes(i.cat) || i.id.startsWith("av:"));
  const pickItem = () => cosmetic.length ? cosmetic.splice(Math.floor(rnd() * cosmetic.length), 1)[0] : null;
  const out = [];
  for (let t = 1; t <= TIERS; t++) {
    if (t === TIERS) out.push({ tier: t, kind: "badge", id: `badge:pass-${m}`, coins: 300, label: `${monthName(m)} badge + 300 Buckets` });
    else if (t % 5 === 0) { const it = pickItem(); out.push(it ? { tier: t, kind: "item", id: it.id, item: it, label: it.name } : { tier: t, kind: "coins", amount: 120, label: "120 Buckets" }); }
    else if (t % 5 === 3) out.push({ tier: t, kind: "token", token: t % 2 ? "hint" : "respin", count: 2, label: t % 2 ? "2 free hints" : "2 extra re-spins" });
    else { const a = 20 + t * 3; out.push({ tier: t, kind: "coins", amount: a, label: `${a} Buckets` }); }
  }
  return out;
}
export const monthName = (m = monthKey()) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
export const daysLeft = () => { const d = new Date(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1); return Math.max(1, Math.ceil((end - d) / 864e5)); };

/** Claim a reached tier's reward. An item you already own pays half its price in Buckets instead. */
export function claim(tier, items = []) {
  const s = passState();
  if (tier > tierOf(s.xp) || s.claimed.includes(tier)) return null;
  const r = rewards(monthKey(), items).find((x) => x.tier === tier);
  if (!r) return null;
  if (r.kind === "coins") earn(r.amount, "pass");
  else if (r.kind === "token") grantTokens(r.token, r.count);
  else if (r.kind === "item") { if (owns(r.id)) earn(Math.round((r.item.price || 200) / 2), "pass"); else grant(r.id); }
  else if (r.kind === "badge") { grant(r.id); earn(r.coins, "pass"); }
  s.claimed.push(tier);
  store.set(KEY(), s);
  return r;
}
/** The rewards you've reached and not claimed yet. */
export const claimable = (items = []) => { const s = passState(), t = tierOf(s.xp); return rewards(monthKey(), items).filter((r) => r.tier <= t && !s.claimed.includes(r.tier)); };
/** Months whose badge you earned (from the wallet). */
export const badges = (owned) => Object.keys(owned || {}).filter((k) => k.startsWith("badge:pass-")).map((k) => k.slice(11)).sort().reverse();
export const today = localDate;
