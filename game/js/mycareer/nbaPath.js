// The road to the NBA beyond plain offers: the NBA Draft, buying out a European contract when an NBA team
// calls, and the player's option year. Game rules, simplified from the real ones (no DOM here).
//   Draft: from 19 to 22, a player who hasn't played in the NBA can declare once. Where he goes depends on
//     his overall, his potential (what the scouts see), his age and his name. The order is the real NBA
//     teams of that season, weakest first; picks 1-30 are the first round (a rookie contract with a team
//     option on its last year), 31-60 the second (a two-way contract). Past 60: undrafted.
//   Buyout: when an NBA team calls during a European contract, the contract is bought out. An NBA-out
//     clause makes it free; otherwise it costs half of what's left on the deal, and the NBA team pays up
//     to $850,000 of that (a game approximation of the league's rule on buyout help).
import { TWO_WAY_PAY, bestOverall, ceilingOf, depthChart, isNba, makeOffers, overall, seasonLabel, sign } from "./engine.js";
import { isNbaTeam, nbaReady, nbaTeams } from "./nba.js";
import { seededRng } from "../wl.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Overall at your potential: every skill at its ceiling. */
export function potentialOverall(C) {
  const attrs = Object.fromEntries(Object.keys(C.attrs).map((k) => [k, Math.max(C.attrs[k], ceilingOf(C, k))]));
  return Math.max(bestOverall(C), overall({ ...C, attrs }));
}
const playedNba = (C) => C.history.some((h) => h.league === "nba") || (C.contract && isNbaTeam(C.contract.team));

/** Can declare for this summer's NBA Draft. */
export function draftEligible(C) {
  if (!nbaReady() || C.draft || playedNba(C) || C.age < 19 || C.age > 22) return false;
  return bestOverall(C) >= 78 || potentialOverall(C) >= 90;
}

// draft score -> expected pick: about 1 at 97, 30 at 89, 60 at 82
const scoreOf = (C) => bestOverall(C) * 0.55 + potentialOverall(C) * 0.45 - (C.age - 19) * 1.2 + (C.pop || 0) / 25;
const pickOf = (score) => Math.round(clamp(1 + (97 - score) * 4, 1, 99));
/** What the scouts project (a range: they aren't sure). */
export function draftProjection(C) {
  const mid = pickOf(scoreOf(C));
  return { lo: Math.max(1, mid - 8), hi: mid + 8, mid, undrafted: mid > 60 };
}

/** Rookie scale salary for a first-round pick (a game estimate, falling with the pick). */
const rookiePay = (pick) => Math.round(Math.max(2000000, 10500000 * 0.93 ** (pick - 1)) / 1000) * 1000;

/** Draft night. Returns { pick, round, team, name, order } or { undrafted: true, order }. Declaring is final. */
export function runDraft(C) {
  const label = seasonLabel(C.debut, C.seasonNo);
  const rnd = seededRng(`mc-draft-${C.seedBase}-${label}`);
  // the weakest teams of the season just played pick first
  const order = nbaTeams(C.seasonNo > 0 ? seasonLabel(C.debut, C.seasonNo - 1) : label).sort((a, b) => a.strength - b.strength);
  const pick = Math.max(1, Math.round(pickOf(scoreOf(C)) + (rnd() - 0.5) * 14));
  C.draft = { season: label, pick: pick <= 60 ? pick : null };
  if (pick > 60 || !order.length) {
    C.log.unshift({ t: "nba", text: `${C.name} went undrafted in the ${label.slice(0, 4)} NBA Draft.` });
    return { undrafted: true, order };
  }
  const team = order[(pick - 1) % order.length];
  const round = pick <= 30 ? 1 : 2;
  C.draft.team = team.id;
  C.log.unshift({ t: "nba", text: `Drafted! ${C.name} goes ${pick}${pick % 10 === 1 && pick !== 11 ? "st" : pick % 10 === 2 && pick !== 12 ? "nd" : pick % 10 === 3 && pick !== 13 ? "rd" : "th"} overall to the ${team.name} in the ${label.slice(0, 4)} NBA Draft.` });
  return { pick, round, team: team.id, name: team.name, order };
}
/** The drafted player's contract: a rookie deal in the first round, a two-way deal in the second. */
export function draftContract(C, d) {
  const label = seasonLabel(C.debut, C.seasonNo);
  const role = d.round === 1 ? depthChart(C, label, d.team).role : "bench";
  return d.round === 1
    ? { team: d.team, name: d.name, salary: rookiePay(d.pick), years: 3, option: "team", role, rookie: d.pick, nba: true, abroad: true }
    : { team: d.team, name: d.name, salary: TWO_WAY_PAY, years: 2, role, twoWay: true, rookie: d.pick, nba: true, abroad: true };
}

/** NBA teams calling while you're under contract in Europe (kept for the summer so they don't change on a redraw). */
export function nbaCalls(C) {
  const label = seasonLabel(C.debut, C.seasonNo);
  if (!nbaReady() || !C.contract || C.contract.left <= 0 || isNba(label, C.contract.team)) return [];
  if (C.calls?.season === label) return C.calls.list;
  const list = makeOffers(C).filter((o) => o.nba && !o.own);
  C.calls = { season: label, list };
  return list;
}
/** What a buyout costs you: { total, nbaPays, you }. */
export function buyoutCost(C) {
  if (C.contract?.nbaOut) return { total: 0, nbaPays: 0, you: 0, clause: true };
  const total = Math.round((C.contract.salary * C.contract.left * 0.5) / 1000) * 1000;
  const nbaPays = Math.min(total, 850000);
  return { total, nbaPays, you: total - nbaPays, clause: false };
}
/** Leave for the NBA: pay your part of the buyout and sign. Returns false if you can't afford it. */
export function buyOut(C, offer) {
  const cost = buyoutCost(C);
  if (cost.you > C.money) return false;
  const from = C.contract.team;
  C.money -= cost.you;
  sign(C, offer);
  C.calls = null;
  C.log.unshift({ t: "contract", text: cost.clause ? `${C.name} used the NBA-out clause to leave ${from} for the ${offer.name}.` : `${C.name} bought out the contract (${cost.total.toLocaleString("en-US")} dollars, the ${offer.name} paid ${cost.nbaPays.toLocaleString("en-US")}) and joins the NBA.` });
  return true;
}

/** Player option year: opt out (free agency now) or stay. */
export function useOption(C, optOut) {
  C.optionPending = false;
  if (C.contract) C.contract.option = null;
  if (optOut && C.contract) { C.contract.left = 0; C.log.unshift({ t: "contract", text: `${C.name} opted out of the last year: free agency.` }); }
}
