// My Career: the simulation engine (no DOM). A created player grows from a club academy into a pro,
// plays full seasons against the real teams of each season (real rosters and team strengths), signs
// contracts, wins awards and is compared with the real records since 2010-11.
// Seasons after the last season in the data are simulated from the most recent rosters (labelled as such).
import { H, PLAYED_SEASONS, db, isPlayable, playersById, seededRng, teamName } from "../wl.js";
import { rosterTools } from "../games/draft_sim.js";
import * as WLD from "../wl.js";
const { realTeamStrength } = rosterTools(WLD); // My Career is always in the Winner League
import { elPlayerName, elReady, elRoster, elSeasonFor, elTeams, inElSeason } from "./europe.js";
import { isNbaTeam, nbaField, nbaPlayer, nbaReady, nbaRoster, nbaSeasonFor, nbaTeams } from "./nba.js";
import { profile, profileFromSeason, simulateGame } from "../shared/gameSim.js";
import { applyBody, bodyEffects, ensureDev, findMentor, gameTrainingPoints, moveEffects, newSeasonLog, planInjury, seasonDevelopment, staffCost, trackGame, trainLimit } from "./develop.js";
export { BODY_PLANS, ELITE_CAMPS, MOVES, MOVE_COST, PLAN_AREAS, PLAN_MAX, PLAN_PRESETS, STAFF, TRAITS, bodyCap, bodyEffects, ceilingOf, eliteAllowed, eliteCamp, ensureDev, idealWeight,
  learnMove, lifestyle, moveStatus, planInjury, planOf, planWear, scoutRange, staffCost, stepPlan, trainLimit, workLabel } from "./develop.js";

// ---------------------------------------------------------------- player model
export const ATTRS = {
  sht: "Mid-range", thr: "Three-point", fin: "Finishing", pas: "Passing",
  def: "Defense", reb: "Rebounding", ath: "Athleticism", iq: "Basketball IQ",
};
export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const ARCHETYPES = {
  scorer: { name: "Scorer", boost: { sht: 7, thr: 6, fin: 6 }, desc: "Lives to put the ball in the basket." },
  defender: { name: "Lockdown defender", boost: { def: 12, ath: 4, iq: 3 }, desc: "Takes the other team's best player." },
  rebounder: { name: "Glass cleaner", boost: { reb: 12, fin: 5, def: 2 }, desc: "Owns the paint and the boards." },
  playmaker: { name: "Playmaker", boost: { pas: 12, iq: 6, sht: 2 }, desc: "Makes everyone around him better." },
  athlete: { name: "Athlete", boost: { ath: 12, fin: 6, def: 2 }, desc: "Faster and higher than everyone." },
  unicorn: { name: "Unicorn", boost: { sht: 3, thr: 3, fin: 3, pas: 3, def: 3, reb: 3, ath: 2, iq: 2 }, desc: "A bit of everything." },
};
export const DIFFICULTY = {
  star: { name: "Rising star", base: 44, points: 18, potential: 1.12, desc: "Top academy prospect: more talent, faster growth." },
  hard: { name: "The hard road", base: 38, points: 10, potential: 0.95, desc: "Nobody believes in you. Prove them wrong." },
};
const WEIGHTS = {
  PG: { pas: .22, sht: .12, thr: .16, fin: .1, def: .12, reb: .04, ath: .12, iq: .12 },
  SG: { sht: .18, thr: .2, fin: .14, pas: .1, def: .12, reb: .04, ath: .12, iq: .1 },
  SF: { sht: .14, thr: .14, fin: .14, pas: .08, def: .14, reb: .1, ath: .14, iq: .12 },
  PF: { sht: .1, thr: .08, fin: .18, pas: .06, def: .16, reb: .18, ath: .12, iq: .12 },
  C: { sht: .04, thr: .03, fin: .22, pas: .05, def: .2, reb: .24, ath: .12, iq: .1 },
};
export const BADGES = {
  sniper: { name: "Sniper", attr: "thr", need: 75, desc: "+3-point accuracy and more threes." },
  bucket: { name: "Bucket getter", attr: "fin", need: 75, desc: "Scores more at the rim." },
  midrange: { name: "Mid-range maestro", attr: "sht", need: 75, desc: "Pull-ups fall more often." },
  general: { name: "Floor general", attr: "pas", need: 75, desc: "More assists, teammates score more." },
  lockdown: { name: "Lockdown", attr: "def", need: 75, desc: "More steals, opponents score less." },
  glass: { name: "Glass cleaner", attr: "reb", need: 75, desc: "More rebounds." },
  highflyer: { name: "High flyer", attr: "ath", need: 75, desc: "Dunks and blocks." },
  clutch: { name: "Clutch", attr: "iq", need: 72, desc: "Big games bring out your best." },
  ironman: { name: "Iron man", attr: "ath", need: 60, desc: "Fewer injuries, faster recovery." },
};
export const BADGE_TIERS = ["Bronze", "Silver", "Gold"];
export const badgeCost = (tier) => [8, 14, 22][tier];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;

/** Attributes after height adjustments (height in cm). */
export function effective(C) {
  const a = { ...C.attrs }, h = C.height;
  a.reb = clamp(a.reb + (h - 196) / 1.6, 20, 99);
  a.def = clamp(a.def + (h - 196) / 6, 20, 99);
  if (h > 200) a.ath = clamp(a.ath - (h - 200) / 4, 20, 99);
  if (h > 205) a.thr = clamp(a.thr - (h - 205) / 3, 20, 99);
  if (h < 190) a.pas = clamp(a.pas + (190 - h) / 4, 20, 99);
  if (h < 188) a.fin = clamp(a.fin - (188 - h) / 4, 20, 99);
  if (C.weight != null) { const b = bodyEffects(C); for (const k of Object.keys(b)) a[k] = clamp(a[k] + b[k], 20, 99); } // the kilos you carry
  return a;
}
export function overall(C, pos = C.pos) {
  const a = effective(C), w = WEIGHTS[pos];
  return Math.round(Object.keys(w).reduce((s, k) => s + a[k] * w[k], 0));
}
export const bestOverall = (C) => Math.max(overall(C, C.pos), overall(C, C.pos2) - 2);
const badgeLv = (C, id) => (C.badges[id] ?? -1) + 1; // 0 none, 1..3

// ---------------------------------------------------------------- creation
export function createPlayer({ name, pos, pos2, height, arch, diff, alloc = {}, nat = "Israel", academy, debut, av = null }) {
  const D = DIFFICULTY[diff] || DIFFICULTY.star;
  const attrs = Object.fromEntries(Object.keys(ATTRS).map((k) => [k, D.base + (ARCHETYPES[arch]?.boost[k] || 0) + Math.min(10, alloc[k] || 0)]));
  const academyStart = PLAYED_SEASONS.indexOf(debut) - 2;
  return {
    v: 2, chem: {}, trustBy: {}, injuries: [], name: String(name || "Rookie").slice(0, 22), pos, pos2: pos2 || pos, height: clamp(Number(height) || 196, 170, 225), arch, diff, nat, av,
    age: 16, attrs, badges: {}, tp: 6, money: 0, pop: 5, trust: 50, agent: "rookie", staff: { skills: false, strength: false, nutrition: false }, work: 55, mileage: 0,
    phase: "academy", academy: { club: academy, year: 1, loan: null, log: [] },
    debut, seasonNo: 0, label: null, club: null, contract: null, loan: null,
    yearsAt: {}, history: [], trophies: [], awards: [], milestones: {}, injury: null, retired: false,
    log: [], cur: null, totals: { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
    startedAt: new Date().toISOString(), seedBase: Math.floor(Math.random() * 1e9),
  };
}
/** A new player with their hidden talent (ceilings, development trait) rolled. */
export function newPlayer(opts) { return ensureDev(createPlayer(opts)); }

// ---------------------------------------------------------------- development
export const trainCost = (v) => (v < 60 ? 1 : v < 72 ? 2 : v < 82 ? 3 : v < 90 ? 4 : 6);
/** After 30, training can't push an attribute past what the body allows. */
export const ageCap = (age) => 99 - Math.max(0, age - 30) * 3;
/** +1 in an attribute for training points, up to your talent ceiling (see develop.js). */
export function train(C, k) {
  const cost = trainCost(C.attrs[k]);
  if (C.tp < cost || C.attrs[k] >= trainLimit(ensureDev(C), k)) return false;
  C.tp -= cost; C.attrs[k] = Math.min(99, Math.round((C.attrs[k] + 1) * 10) / 10);
  return true;
}
export function buyBadge(C, id) {
  const b = BADGES[id], tier = C.badges[id] ?? -1;
  if (!b || tier >= 2 || C.attrs[b.attr] < b.need + (tier + 1) * 6) return false;
  const cost = badgeCost(tier + 1);
  if (C.tp < cost) return false;
  C.tp -= cost; C.badges[id] = tier + 1;
  return true;
}
export const SUMMER_CAMPS = {
  shooting: { name: "Shooting camp", attrs: ["thr", "sht"], cost: 0 },
  strength: { name: "Strength & finishing", attrs: ["fin", "reb"], cost: 0 },
  speed: { name: "Speed & agility", attrs: ["ath", "def"], cost: 0 },
  film: { name: "Film room & playmaking", attrs: ["iq", "pas"], cost: 0 },
};
export function summerCamp(C, id, rnd = Math.random) {
  const camp = SUMMER_CAMPS[id];
  const gains = {};
  ensureDev(C);
  for (const k of camp.attrs) {
    const g = 1 + Math.round(rnd() * 2) + (C.staff?.skills ? 1 : 0);
    const to = Math.max(C.attrs[k], Math.min(C.attrs[k] + g, trainLimit(C, k))); // camps can't beat your ceiling either
    gains[k] = Math.round((to - C.attrs[k]) * 10) / 10; C.attrs[k] = to;
  }
  return gains;
}

// ---------------------------------------------------------------- seasons and teams
export const LAST_REAL = PLAYED_SEASONS[PLAYED_SEASONS.length - 1];
export function seasonLabel(debut, n) {
  const y = Number(debut.slice(0, 4)) + n;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
/** The data season used for a career season (real when available, else the latest real one). */
export const dataSeason = (label) => (PLAYED_SEASONS.includes(label) ? label : LAST_REAL);

const rosterCache = new Map();
export function rosterOf(season, tid) {
  const k = season + tid;
  if (!rosterCache.has(k)) {
    const best = new Map();
    for (const ps of H.getPlayersByTeam(tid, season)) {
      if (!isPlayable(ps, 5)) continue;
      const cur = best.get(ps.player_id);
      if (!cur || ps.stats.games > cur.stats.games) best.set(ps.player_id, ps);
    }
    rosterCache.set(k, [...best.values()].sort((a, b) => (b.stats.mpg ?? 0) - (a.stats.mpg ?? 0)));
  }
  return rosterCache.get(k);
}
export function teamsOf(label) {
  const ds = dataSeason(label);
  const drift = ds === label ? 0 : 1; // simulated seasons: small random drift per club
  const rnd = seededRng("mc-drift-" + label);
  return H.getTeamsBySeason(ds).map((t) => ({ id: t.team_id, name: teamName(t.team_id), strength: r1(realTeamStrength(ds, t.team_id) + (drift ? (rnd() - 0.5) * 4 : 0)) }));
}

// ---------------------------------------------------------------- Europe (separate EuroLeague data)
const wlCache = new Map();
/** Winner League strength of a club in a data season, or null if it didn't play in the league that season. */
export function wlStrength(season, tid) {
  const k = season + "|" + tid;
  if (!wlCache.has(k)) wlCache.set(k, PLAYED_SEASONS.includes(season) && db.season_teams.some((x) => x.season === season && x.team_id === tid) ? r1(realTeamStrength(season, tid)) : null);
  return wlCache.get(k);
}
/** A club that isn't in the Winner League that season but plays in the EuroLeague: a season abroad. */
export const isAbroad = (label, tid) => !db.season_teams.some((x) => x.season === dataSeason(label) && x.team_id === tid) && inElSeason(label, tid);
/** An NBA team: a season in the NBA (needs the NBA data loaded). */
export const isNba = (label, tid) => nbaReady() && isNbaTeam(tid);
/** Where a club plays that career season: "wl" (Winner League), "el" (EuroLeague abroad) or "nba". */
export const leagueOf = (label, tid) => (isNba(label, tid) ? "nba" : isAbroad(label, tid) ? "el" : "wl");
/** EuroLeague clubs for a career season, strengths on the Winner League scale ([] without the data). */
export const euroTeams = (label) => (elReady() ? elTeams(label, wlStrength) : []);
/** Roster used for minutes and box scores: the EuroLeague roster for a club abroad or a EuroLeague game. */
function rosterFor(label, tid, { europe = false } = {}) {
  if (isNba(label, tid)) { const r = nbaRoster(label, tid); if (r.length) return r; }
  if (elReady() && (europe || isAbroad(label, tid))) {
    const r = elRoster(label, tid, wlStrength);
    if (r.length) return r;
  }
  return nearestRoster(dataSeason(label), tid);
}
/** A club's roster for a career season, from its league's data (the game preview reads it). */
export const careerRoster = (label, tid) => rosterFor(label, tid);
/** A club out of the league that season (relegated while you're under contract): its closest real roster. */
function nearestRoster(season, tid) {
  const own = rosterOf(season, tid);
  if (own.length >= 5) return own;
  const i = PLAYED_SEASONS.indexOf(season);
  const near = PLAYED_SEASONS.map((s, j) => [s, Math.abs(j - i)]).sort((a, b) => a[1] - b[1]);
  for (const [s] of near) { const r = rosterOf(s, tid); if (r.length >= 5) return r; }
  return own;
}
/** Strength of a club that isn't in the league that season: from its closest real season. */
function nearestStrength(season, tid) {
  const i = PLAYED_SEASONS.indexOf(season);
  const near = PLAYED_SEASONS.map((s, j) => [s, Math.abs(j - i)]).sort((a, b) => a[1] - b[1]);
  for (const [s] of near) { const v = wlStrength(s, tid); if (v != null) return v; }
  return 80;
}
/** A player's name from either competition's data. */
export const playerName = (pid) => playersById.get(pid)?.name ?? nbaPlayer(pid)?.name ?? elPlayerName(pid);
/** A player who is only in the NBA data (no Winner League profile, no EuroLeague page). */
export const isNbaPlayer = (pid) => !playersById.has(pid) && !!nbaPlayer(pid);

// Position groups and how many starters / rotation players each group gets.
const FAM = { PG: "G", SG: "G", SF: "W", PF: "B", C: "B" };
export const FAM_NAMES = { G: "Guards", W: "Wings", B: "Bigs" };
const SLOTS = { G: [2, 2], W: [1, 2], B: [2, 1] };
/** Game rule (simplified from the league's foreign-player limits): at most 5 foreign players get real minutes. */
export const FOREIGN_LIMIT = 5;
export const isIsraeliPlayer = (pid) => { const p = playersById.get(pid) || nbaPlayer(pid); return p?.nationality === "Israel" || (p?.nationalities || []).includes("Israel"); };
const posOf = (ps) => ps.position || (playersById.get(ps.player_id) || nbaPlayer(ps.player_id))?.primary_position || "SF";

/** Your score for minutes: overall, coach trust, team chemistry, and the Israeli-player advantage. */
function minutesScore(C, tid, abroad = false) {
  return bestOverall(C) + (C.trust - 50) / 4 + ((C.chem?.[tid] || 0) - 30) / 25 + (C.nat === "Israel" && !abroad ? 2 : 0);
}
/** Where you'd stand on a team: competitors at your position group, and the foreign-player slots. */
export function depthChart(C, label, tid) {
  const abroad = isAbroad(label, tid) || isNba(label, tid); // outside the Winner League: no foreign-player limit
  const roster = rosterFor(label, tid).slice(0, 11);
  const score = minutesScore(C, tid, abroad);
  const foreign = C.nat !== "Israel" && !abroad; // the game's foreign-player limit is a Winner League rule
  const foreigners = roster.filter((ps) => !isIsraeliPlayer(ps.player_id)).map((ps) => ps.rating_mock).sort((a, b) => b - a);
  const slotOk = !foreign || foreigners.length < FOREIGN_LIMIT || score > foreigners[FOREIGN_LIMIT - 1];
  const groups = [...new Set([FAM[C.pos], FAM[C.pos2]])].map((fam, i) => {
    const rivals = roster.filter((ps) => FAM[posOf(ps)] === fam).sort((a, b) => b.rating_mock - a.rating_mock);
    const myScore = score - (i > 0 ? 2 : 0); // playing your second position costs a little
    const rank = rivals.filter((ps) => ps.rating_mock > myScore).length;
    const [st, rot] = SLOTS[fam];
    // a depth spot is not enough on its own: coaches don't give real minutes below a basic level
    const role = rank < st && myScore >= 74 ? "starter" : rank < st + rot && myScore >= 68 ? "rotation" : "bench";
    return { fam, rank, rivals, myScore, role };
  });
  const order = ["starter", "rotation", "bench"];
  const best = groups.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.rank - b.rank)[0];
  return { ...best, foreign, abroad, foreigners: foreigners.length, slotOk, role: slotOk ? best.role : "bench" };
}
/** Role on a team (starter / rotation / bench). */
export function roleOn(C, label, tid) { return depthChart(C, label, tid).role; }
export const ROLE_NAMES = { starter: "Starter", rotation: "Rotation player", bench: "Bench" };

// ---------------------------------------------------------------- one game
const MIN_BY_ROLE = { starter: [27, 35], rotation: [14, 24], bench: [3, 12] };
/** Your stat line in one game. */
function poisson(lambda, rnd) { let k = 0, p = Math.exp(-lambda), sum = p; const u = rnd(); while (u > sum && k < 8) { k++; p *= lambda / k; sum += p; } return k; }
export function statLine(C, role, rnd, { big = false } = {}) {
  const a = effective(C);
  const [lo, hi] = MIN_BY_ROLE[role];
  let min = Math.round(lo + rnd() * (hi - lo));
  if (role === "bench" && rnd() < 0.25 + Math.max(0, (35 - C.trust) / 100)) min = 0; // DNP
  if (!min) return { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, dnp: true };
  // fouls: bigs and aggressive defenders foul more, smart players less. 5 fouls and you're out.
  const pf = poisson((min / 36) * (2.9 + (a.def >= 75 ? 0.4 : 0) + (FAM[C.pos] === "B" ? 0.5 : 0) - (a.iq - 60) * 0.02), rnd);
  const fouledOut = pf >= 5;
  if (fouledOut) min = Math.max(6, Math.round(min * (0.6 + rnd() * 0.25)));
  else if (pf === 4 && rnd() < 0.5) min = Math.round(min * 0.85); // foul trouble: the coach sits you
  const f = min / 36;
  const chem = (C.chem?.[C.cur?.team] || 0) / 100;
  let form = Math.max(0.35, 1 + (rnd() + rnd() + rnd() - 1.5) * 0.45) * (big && badgeLv(C, "clutch") ? 1 + 0.05 * badgeLv(C, "clutch") : 1) * (1 + chem * 0.06);
  if (C.fatigue > 0) { form *= 0.92; C.fatigue--; } // tired legs from an extra session or a night out
  const offense = (a.sht + a.thr + a.fin) / 3 + (C.arch === "scorer" ? 4 : 0);
  const pts36 = Math.max(3, 5 + (offense - 45) * 0.39 + badgeLv(C, "bucket") * 0.8 + badgeLv(C, "midrange") * 0.6 + badgeLv(C, "sniper") * 0.6);
  const pts = Math.round(pts36 * f * form);
  const share3 = clamp(0.12 + (a.thr - 50) / 120, 0.02, 0.55);
  const tpPct = clamp(0.22 + (a.thr - 40) * 0.0032 + badgeLv(C, "sniper") * 0.015, 0.15, 0.48);
  const fgPct2 = clamp(0.4 + ((a.fin * 0.6 + a.sht * 0.4) - 50) * 0.0035, 0.32, 0.68);
  const ftPct = clamp(0.55 + a.sht * 0.0035, 0.45, 0.92);
  // build makes from points: threes, twos and free throws
  const ftm = Math.round(pts * 0.17 * (0.7 + rnd() * 0.6));
  const tpm = Math.round(((pts - ftm) * share3) / 3);
  const twos = Math.max(0, Math.round((pts - ftm - tpm * 3) / 2));
  const realPts = twos * 2 + tpm * 3 + ftm;
  const tpa = tpm ? Math.max(tpm, Math.round(tpm / tpPct)) : Math.round(rnd() * 2 * share3 * f * 4);
  const fga = twos ? Math.max(twos, Math.round(twos / fgPct2)) + tpa : tpa;
  const fta = ftm ? Math.max(ftm, Math.round(ftm / ftPct)) : 0;
  const reb = Math.max(0, Math.round((2.5 + (a.reb - 35) * 0.17 + badgeLv(C, "glass") * 0.7) * f * (0.6 + rnd() * 0.8)));
  const ast = Math.max(0, Math.round((0.8 + (a.pas - 40) * 0.12 + badgeLv(C, "general") * 0.5) * f * (0.6 + rnd() * 0.8)));
  const stl = Math.max(0, Math.round((0.4 + (a.def + a.ath - 80) * 0.012 + badgeLv(C, "lockdown") * 0.3) * f * (0.3 + rnd() * 1.4)));
  const blk = Math.max(0, Math.round((0.15 + (a.def - 50) * 0.018 + (C.height - 196) * 0.05 + badgeLv(C, "highflyer") * 0.25) * f * (0.2 + rnd() * 1.6)));
  return { min, pts: realPts, reb, ast, stl, blk, fgm: twos + tpm, fga, tpm, tpa, ftm, fta, pf: Math.min(5, pf), fouledOut };
}
export const gameScore = (l) => l.pts + 0.7 * l.reb + 0.7 * l.ast + l.stl + l.blk - 0.4 * (l.fga - l.fgm) - 0.3 * (l.fta - l.ftm);
export const valOf = (l) => l.pts + l.reb + l.ast + l.stl + l.blk - (l.fga - l.fgm) - (l.fta - l.ftm);

function playScore(home, away, rnd, neutral = false) {
  const edge = neutral ? 0 : 1.5;
  const p = 1 / (1 + Math.exp(-((home.s + edge) - away.s) / 4));
  const homeWins = rnd() < p;
  const win = Math.round(76 + rnd() * 18 + ((homeWins ? home.s : away.s) - 82) * 0.35);
  const margin = 1 + Math.round(rnd() * rnd() * 24);
  return homeWins ? [win, win - margin] : [win - margin, win];
}

/** Your player for the game engine: per-36 numbers from your attributes and badges (the same formulas as the season lines). */
export function meSnapshot(C, role, big, rnd) {
  const a = effective(C), mv = moveEffects(C);
  const offense = (a.sht + a.thr + a.fin) / 3 + (C.arch === "scorer" ? 4 : 0);
  const chem = (C.chem?.[C.cur?.team] || 0) / 100;
  const [lo, hi] = MIN_BY_ROLE[role];
  return {
    pos: C.pos, mpg: 36, rating: Math.round(bestOverall(C) + chem * 3),
    ppg: Math.max(3, 5 + (offense - 45) * 0.39 + badgeLv(C, "bucket") * 0.8 + badgeLv(C, "midrange") * 0.6 + badgeLv(C, "sniper") * 0.6),
    rpg: Math.max(0.5, 2.5 + (a.reb - 35) * 0.17 + badgeLv(C, "glass") * 0.7 + mv.rpg), apg: Math.max(0.3, 0.8 + (a.pas - 40) * 0.12 + badgeLv(C, "general") * 0.5) * mv.apg,
    spg: Math.max(0.1, 0.4 + (a.def + a.ath - 80) * 0.012 + badgeLv(C, "lockdown") * 0.3 + mv.spg), bpg: Math.max(0.05, 0.15 + (a.def - 50) * 0.018 + (C.height - 196) * 0.05 + badgeLv(C, "highflyer") * 0.25 + mv.bpg),
    s3: clamp((0.12 + (a.thr - 50) / 120) * mv.s3, 0.02, 0.58), p3: clamp(0.22 + (a.thr - 40) * 0.0032 + badgeLv(C, "sniper") * 0.015 + mv.p3, 0.15, 0.5),
    p2: clamp(0.4 + ((a.fin * 0.6 + a.sht * 0.4) - 50) * 0.0035 + mv.p2, 0.32, 0.7), ft: clamp(0.55 + a.sht * 0.0035, 0.45, 0.92) * 100,
    clutch: big || badgeLv(C, "clutch") || mv.clutch ? badgeLv(C, "clutch") + (big ? 0.5 : 0) + mv.clutch : 0, moves: mv.names, foulRisk: 1 + (a.def >= 75 ? 0.15 : 0) + (FAM[C.pos] === "B" ? 0.2 : 0) - (a.iq - 60) * 0.008,
    energy: C.fatigue > 0 ? 0.85 : 1, target: Math.round(lo + rnd() * (hi - lo)),
  };
}
const ME = "me";
/** The two teams of one of your games, for the game engine. g: { opp, home, eu, me (snapshot or null), st: [your team, opponent] strengths }. */
function matchTeams(C, S, g) {
  const europe = !!g.eu || S.league === "el";
  const players = (tid) => rosterFor(S.label, tid, { europe }).slice(0, 9)
    .map((ps) => profileFromSeason(ps, playerName(ps.player_id)));
  let mates = players(S.team);
  const mine = { name: teamName(S.team), id: S.team, strength: g.st[0], players: mates };
  if (g.me) {
    mates = mates.slice(0, 8); // you take a rotation spot
    const meP = profile({ id: ME, name: C.name, me: true, ...g.me });
    const rest = mates.reduce((s, p) => s + p.mpg, 0) || 1;
    mine.players = [meP, ...mates];
    mine.minutes = { [ME]: g.me.target, ...Object.fromEntries(mates.map((p) => [p.id, (p.mpg * (200 - g.me.target)) / rest])) };
  }
  const theirs = { name: teamName(g.opp), id: g.opp, strength: g.st[1], players: players(g.opp) };
  return g.home ? [mine, theirs] : [theirs, mine];
}
/** The full game (events, box score, momentum) of one of your games: re-played from its seed. */
export function simFor(C, S, g, events = true) {
  const [h, a] = matchTeams(C, S, g);
  return simulateGame(h, a, { rnd: seededRng("mc-g-" + g.seed), neutral: !!g.neutral, events, quarter: S.league === "nba" ? 720 : 600 });
}
/** Play one of your games through the game engine: your line comes from the game itself. */
export function playGame(C, S, oppId, home, rnd, { neutral = false, big = false, label = "", teams = S.teams, eu = false, rest = false, gleague = false } = {}) {
  const role = C.cur.role;
  const meT = teams.find((t) => t.id === C.cur.team), opp = teams.find((t) => t.id === oppId);
  // a bench player sometimes doesn't get off the bench
  const dnp = !C.injury && role === "bench" && rnd() < 0.25 + Math.max(0, (35 - C.trust) / 100);
  const g = { opp: oppId, home, neutral, label, seed: Math.floor(rnd() * 1e9), sim: 1, st: [meT.strength, opp.strength - badgeLv(C, "lockdown") * 0.2],
    me: C.injury || dnp || rest || gleague ? null : meSnapshot(C, role, big, rnd), ...(eu ? { eu: true } : {}) };
  if (g.me && C.fatigue > 0) C.fatigue--;
  const r = simFor(C, S, g, false);
  const mySide = home ? 0 : 1;
  const my = r.score[mySide], their = r.score[1 - mySide];
  const b = r.box[mySide].find((l) => l.id === ME);
  const line = !g.me ? { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, tov: 0, dnp: true, ...(C.injury ? { injured: true } : gleague ? { gleague: true } : rest ? { rested: true } : {}) }
    : b.min === 0 ? { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, tov: 0, dnp: true }
    : { min: b.min, pts: b.pts, reb: b.reb, ast: b.ast, stl: b.stl, blk: b.blk, fgm: b.fgm, fga: b.fga, tpm: b.tpm, tpa: b.tpa, ftm: b.ftm, fta: b.fta, pf: Math.min(5, b.pf), tov: b.tov, pm: b.pm, fouledOut: b.pf >= 5 };
  return { ...g, my, their, won: my > their, line, q: [r.quarters[mySide], r.quarters[1 - mySide]], ot: r.ot };
}

/** Full box score for a game (deterministic from its seed). */
export function boxScore(C, S, g) {
  if (g.sim) { // played through the game engine: its own box score
    const r = simFor(C, S, g, false);
    const mySide = g.home ? 0 : 1;
    const map = (l) => ({ ...l, pid: l.id === ME ? null : l.id, el: l.id !== ME && !playersById.has(l.id) && !isNbaPlayer(l.id), nba: l.id !== ME && isNbaPlayer(l.id), me: l.id === ME });
    const keep = (l) => l.min > 0;
    return { team: r.box[mySide].filter(keep).map(map).sort((a, b) => b.min - a.min), opp: r.box[1 - mySide].filter(keep).map(map).sort((a, b) => b.min - a.min), sim: true };
  }
  const rnd = seededRng("mc-box-" + g.seed);
  const europe = !!g.eu || S.league === "el";
  const lines = (tid, points, minutes, skipOne) => {
    let roster = rosterFor(S.label, tid, { europe }).slice(0, 9);
    if (skipOne) roster = roster.slice(0, 8);
    const w = roster.map((ps) => Math.max(4, ps.stats.mpg ?? 10) * (0.85 + rnd() * 0.3));
    const sw = w.reduce((a, b) => a + b, 0);
    const mins = w.map((x) => Math.round((x / sw) * minutes));
    const pw = roster.map((ps, i) => Math.max(0.5, ps.stats.ppg ?? 2) * (0.5 + rnd()) * (mins[i] / Math.max(1, ps.stats.mpg || mins[i])));
    const spw = pw.reduce((a, b) => a + b, 0) || 1;
    const pts = pw.map((x) => Math.round((x / spw) * points));
    pts[0] += points - pts.reduce((a, b) => a + b, 0);
    return roster.map((ps, i) => ({ pid: ps.player_id, name: playerName(ps.player_id), el: !playersById.has(ps.player_id), pos: ps.position || "", min: mins[i],
      pts: Math.max(0, pts[i]), reb: Math.round((ps.stats.rpg ?? 1) * (mins[i] / Math.max(1, ps.stats.mpg || 1)) * (0.6 + rnd() * 0.8)),
      ast: Math.round((ps.stats.apg ?? 0.5) * (mins[i] / Math.max(1, ps.stats.mpg || 1)) * (0.6 + rnd() * 0.8)) }));
  };
  const meLine = { pid: null, name: C.name, pos: C.pos, me: true, ...g.line };
  const team = [meLine, ...lines(C.cur.team, g.my - g.line.pts, 200 - g.line.min, true)].sort((a, b) => b.min - a.min);
  const opp = lines(g.opp, g.their, 200, false).sort((a, b) => b.min - a.min);
  return { team, opp };
}

// ---------------------------------------------------------------- season flow
function roundRobin(ids, rnd) {
  const t = ids.slice();
  if (t.length % 2) t.push(null);
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) games.push(r % 2 ? [b, a] : [a, b]); }
    rounds.push(games);
    t.splice(1, 0, t.pop());
  }
  return [...rounds, ...rounds.map((g) => g.map(([a, b]) => [b, a]))];
}

/** Start a pro season with your current club. */
export function startSeason(C) {
  ensureDev(C);
  applyBody(C);
  const label = seasonLabel(C.debut, C.seasonNo);
  const rnd = seededRng(`mc-${C.seedBase}-${label}`);
  const team = C.loan?.team || C.contract.team;
  const lg = leagueOf(label, team);
  const abroad = lg !== "wl"; // the EuroLeague or the NBA: no State Cup, no EuroLeague campaign on the side
  const teams = lg === "nba" ? nbaTeams(label) : abroad ? euroTeams(label) : teamsOf(label);
  if (!teams.some((t) => t.id === team)) { // club not in the league that season: it plays anyway with its last roster strength
    teams.push({ id: team, name: teamName(team), strength: nearestStrength(dataSeason(label), team) });
  }
  // abroad the season is the EuroLeague: double round-robin (single when the field was bigger than 18);
  // the NBA's 30 teams: one game against each
  const rr = roundRobin(teams.map((t) => t.id), rnd);
  const schedule = abroad && teams.length > 18 ? rr.slice(0, rr.length / 2) : rr;
  const cupTeams = abroad ? [] : teams.slice().sort(() => rnd() - 0.5).slice(0, 8);
  if (!abroad && !cupTeams.some((t) => t.id === team)) cupTeams[7] = teams.find((t) => t.id === team);
  C.label = label;
  // coach trust is per club; a new club (or a new coach) means starting over
  C.trustBy ??= {};
  C.chem ??= {};
  C.trust = C.trustBy[team] ?? 50;
  if (C.chem[team] == null) C.chem[team] = C.nat === "Israel" ? 15 : 8;
  const prev = C.history[C.history.length - 1];
  const coachChange = C.trustBy[team] != null && rnd() < (prev && prev.team === team && prev.standing > 8 ? 0.4 : 0.15);
  if (coachChange) { C.trust = clamp(Math.round(50 + (C.trust - 50) * 0.35 + (rnd() - 0.5) * 10), 20, 80); C.log.unshift({ t: "coach", text: `New head coach at ${teamName(team)} this summer. Coach trust starts over (${C.trust}).` }); }
  // you change the team: its strength for the season includes you, by how much you'll play
  const me = teams.find((t) => t.id === team);
  const role0 = roleOn(C, label, team);
  // you push someone down the depth chart: the team gains what you add over that player
  const dc0 = depthChart(C, label, team);
  const pushed = dc0.rivals[Math.min(dc0.rank, dc0.rivals.length - 1)]?.rating_mock ?? me.strength;
  const boost = r1(clamp((bestOverall(C) - pushed) * { starter: 0.3, rotation: 0.15, bench: 0 }[role0], -0.5, 4));
  const base = me.strength;
  me.strength = r1(me.strength + boost);
  C.cur = {
    label, simulated: (lg === "nba" ? nbaSeasonFor(label) : abroad ? elSeasonFor(label) : dataSeason(label)) !== label, team, role: role0, teams, schedule, round: 0, base, boost, coachChanges: coachChange ? 1 : 0,
    standings: Object.fromEntries(teams.map((t) => [t.id, { w: 0, l: 0, pf: 0, pa: 0 }])),
    games: [], phase: "regular", cup: abroad ? { teams: [], round: 0, alive: false, results: [], none: true } : { teams: cupTeams.map((t) => t.id), round: 0, alive: true, results: [] },
    allStar: null, playoffs: null, events: [], startOverall: bestOverall(C), league: lg,
    el: abroad ? null : euroCampaign(label, team, me.strength, rnd),
    dev: { ...newSeasonLog(), mentor: findMentor(C, rosterFor(label, team), bestOverall(C)) },
  };
  return C.cur;
}

/** If your Winner League club also plays in the EuroLeague that season: its regular season (one game against each club). */
function euroCampaign(label, team, myStrength, rnd) {
  const teams = euroTeams(label);
  if (!teams.some((t) => t.id === team)) return null;
  for (const t of teams) if (t.id === team) t.strength = myStrength;
  const rr = roundRobin(teams.map((t) => t.id), rnd);
  return { season: elSeasonFor(label), teams, schedule: rr.slice(0, rr.length / 2), round: 0, standings: Object.fromEntries(teams.map((t) => [t.id, { w: 0, l: 0, pf: 0, pa: 0 }])), f4: null, champion: null };
}
/** A EuroLeague game (or the Final Four) is due before the next league round. */
export function euroDue(S) {
  const el = S?.el;
  if (!el || el.f4) return false;
  const due = S.round >= S.schedule.length ? el.schedule.length : Math.floor((S.round * el.schedule.length) / S.schedule.length);
  return el.round < due || (S.round >= S.schedule.length && el.round >= el.schedule.length);
}
/** The next EuroLeague fixture for the season screen: { opp, home, label, eu } or { bye, label, eu } (null: none due). */
export function nextEuro(S) {
  if (!euroDue(S)) return null;
  const el = S.el;
  if (el.round < el.schedule.length) {
    const g = el.schedule[el.round].find(([h, a]) => h === S.team || a === S.team);
    return g ? { opp: g[0] === S.team ? g[1] : g[0], home: g[0] === S.team, label: `EuroLeague round ${el.round + 1} of ${el.schedule.length}`, eu: true }
      : { bye: true, label: `EuroLeague round ${el.round + 1}: no game`, eu: true };
  }
  const top = el.ff?.teams || euroTable(el).slice(0, 4).map((t) => t.id);
  if (!top.includes(S.team)) return { bye: true, label: "EuroLeague Final Four (without you)", eu: true };
  if (!el.ff) { const i = top.indexOf(S.team); return { opp: top[3 - i], home: false, neutral: true, label: "EuroLeague Final Four semi-final", eu: true }; }
  if (el.ff.final.includes(S.team)) return { opp: el.ff.final.find((x) => x !== S.team), home: false, neutral: true, label: "EuroLeague Final Four final", eu: true };
  return { bye: true, label: "EuroLeague Final Four final (without you)", eu: true };
}
export const euroTable = (el) => Object.entries(el.standings).map(([id, r]) => ({ id, name: teamName(id), ...r, diff: r.pf - r.pa })).sort((a, b) => b.w - a.w || b.diff - a.diff);
function playEuroRound(C, rnd, out, rest = false) {
  const S = C.cur, el = S.el;
  for (const [h, a] of el.schedule[el.round]) {
    if (h === S.team || a === S.team) {
      const g = playGame(C, S, h === S.team ? a : h, h === S.team, rnd, { teams: el.teams, eu: true, big: true, rest: rest && canRest(C), label: `EuroLeague round ${el.round + 1} of ${el.schedule.length}` });
      S.games.push({ ...g, round: S.round });
      out.games.push(g);
      record(el, h, a, g.home ? g.my : g.their, g.home ? g.their : g.my);
      afterGame(C, g);
    } else {
      const A = el.teams.find((t) => t.id === h), B = el.teams.find((t) => t.id === a);
      const [hs, as] = playScore({ s: A.strength }, { s: B.strength }, rnd);
      record(el, h, a, hs, as);
    }
  }
  el.round++;
}
/**
 * EuroLeague Final Four: the top four, one-game semi-finals and final on neutral ground, played in two steps
 * (the semi-finals, then the final) when you're in it, so you play each game; in one go when you're not.
 */
function euroFinalFour(C, rnd, out) {
  const S = C.cur, el = S.el;
  const top = el.ff?.teams || euroTable(el).slice(0, 4).map((t) => t.id);
  const one = (a, b, stage) => {
    if (a === S.team || b === S.team) {
      const g = playGame(C, S, a === S.team ? b : a, true, rnd, { teams: el.teams, eu: true, neutral: true, big: true, label: `EuroLeague Final Four ${stage}` });
      S.games.push({ ...g, round: S.round, f4: true });
      out.games.push(g);
      afterGame(C, g);
      return g.won ? S.team : g.opp;
    }
    const A = el.teams.find((t) => t.id === a), B = el.teams.find((t) => t.id === b);
    const [x, y] = playScore({ s: A.strength }, { s: B.strength }, rnd, true);
    return x > y ? a : b;
  };
  if (!el.ff) { // the semi-finals
    const f1 = one(top[0], top[3], "semi-final"), f2 = one(top[1], top[2], "semi-final");
    el.ff = { teams: top, final: [f1, f2] };
    if ([f1, f2].includes(S.team)) return; // you're in the final: it's the next game
  }
  const [f1, f2] = el.ff.final;
  const champ = one(f1, f2, "final");
  el.f4 = { teams: top, final: [f1, f2], champion: champ };
  el.champion = champ;
  if (champ === S.team) C.trophies.push({ type: "euroleague", season: S.label, team: S.team });
  out.euro = { f4: el.f4, inIt: top.includes(S.team), won: champ === S.team, rank: euroTable(el).findIndex((t) => t.id === S.team) + 1 };
}

const CUP_AT = (n) => [Math.floor(n * 0.3), Math.floor(n * 0.55), Math.floor(n * 0.8)];

/** Can you sit out your next league game? (starters and rotation players, healthy, regular season) */
/** A two-way contract in the NBA: every other game with the team's G League affiliate (not simulated here). */
export const onAssignment = (C, S) => S.league === "nba" && !!C.contract?.twoWay && S.round % 2 === 1;
export const canRest = (C) => !!C.cur && C.cur.phase === "regular" && !C.injury && C.cur.role !== "bench";
/** Advance one round of the regular season. Returns what happened (your game, cup game, all-star…). rest: you sit this one out. */
export function playRound(C, { rest = false } = {}) {
  const S = C.cur;
  const rounds = S.schedule;
  const out = { games: [] };
  // a EuroLeague game (or the Final Four) due before this league round: it's the next game
  if (euroDue(S)) {
    const rnd = seededRng(`mc-${C.seedBase}-${S.label}-eu${S.el.round}-${S.el.ff ? "f" : "s"}`);
    if (S.el.round < S.el.schedule.length) playEuroRound(C, rnd, out, rest);
    else euroFinalFour(C, rnd, out);
    if (S.round >= rounds.length && !euroDue(S)) { S.phase = "playoffs"; S.playoffs = seedPlayoffs(S); }
    return out;
  }
  const rnd = seededRng(`mc-${C.seedBase}-${S.label}-r${S.round}`);
  for (const [h, a] of rounds[S.round]) {
    if (h === S.team || a === S.team) {
      const g = playGame(C, S, h === S.team ? a : h, h === S.team, rnd, { label: `Round ${S.round + 1}`, rest: rest && canRest(C), gleague: onAssignment(C, S) });
      S.games.push({ ...g, round: S.round });
      out.games.push(g);
      record(S, h, a, g.home ? g.my : g.their, g.home ? g.their : g.my);
      afterGame(C, g);
    } else {
      const A = S.teams.find((t) => t.id === h), B = S.teams.find((t) => t.id === a);
      const [hs, as] = playScore({ s: A.strength }, { s: B.strength }, rnd);
      record(S, h, a, hs, as);
    }
  }
  S.round++;
  S.prevRanks = S.ranks || null;
  S.ranks = table(S).map((t) => t.id);
  // EuroLeague games are spread over the league season (their own fixtures, see euroDue); the Final Four comes
  // when the league's regular season ends, and the league playoffs start after it
  out.coach = maybeFireCoach(C, rnd);
  // State Cup rounds
  const cupRounds = CUP_AT(rounds.length);
  const ci = cupRounds.indexOf(S.round);
  if (ci >= 0 && S.cup.round === ci && !S.cup.none) out.cup = playCupRound(C, rnd);
  // All-Star break at the halfway point (a Winner League event)
  if (S.round === Math.floor(rounds.length / 2) && !S.allStar && S.league !== "el") out.allStar = allStar(C, rnd);
  if (S.round >= rounds.length && !euroDue(S)) { S.phase = "playoffs"; S.playoffs = seedPlayoffs(S); }
  return out;
}
/** Losing teams fire coaches. A new coach re-evaluates everyone: trust moves toward neutral, plus your recent form. */
function maybeFireCoach(C, rnd) {
  const S = C.cur, r = S.standings[S.team];
  const played = r.w + r.l;
  if (![7, 13, 19].includes(S.round) || played < 6) return null;
  const pct = r.w / played;
  if (pct >= 0.4 || rnd() > 0.45) return null;
  const recent = S.games.slice(-5).filter((g) => !g.line.dnp);
  const form = recent.length ? recent.reduce((a, g) => a + gameScore(g.line), 0) / recent.length : 0;
  const expected = { starter: 14, rotation: 8, bench: 3 }[S.role];
  const before = C.trust;
  C.trust = clamp(Math.round(48 + (form - expected) * 1.5 + (rnd() - 0.5) * 12), 15, 85);
  S.coachChanges = (S.coachChanges || 0) + 1;
  S.role = roleOn(C, S.label, S.team);
  const text = `${teamName(S.team)} fired the head coach after a ${r.w}-${r.l} start. The new coach's trust in you: ${C.trust} (was ${Math.round(before)}). Role: ${ROLE_NAMES[S.role]}.`;
  C.log.unshift({ t: "coach", text });
  return { text, trust: C.trust, before };
}
function record(S, h, a, hs, as) {
  const H_ = S.standings[h], A = S.standings[a];
  H_.pf += hs; H_.pa += as; A.pf += as; A.pa += hs;
  if (hs > as) { H_.w++; A.l++; } else { A.w++; H_.l++; }
}
export function table(S) {
  return Object.entries(S.standings).map(([id, r]) => ({ id, name: teamName(id), ...r, diff: r.pf - r.pa }))
    .sort((a, b) => b.w - a.w || b.diff - a.diff);
}

// after each of your games: training points, coach trust, injuries, milestones, totals
function afterGame(C, g) {
  const l = g.line;
  if (C.injury) {
    C.injury.games--;
    if (C.injury.games <= 0) {
      if (C.injury.rushed) C.reinjury = { name: C.injury.name, games: 10 }; // fragile for a while
      C.log.unshift({ t: "injury", text: `Back from the ${C.injury.name.toLowerCase()}.` });
      C.injury = null;
    }
    trackGame(C, l, { injured: true });
    return;
  }
  if (l.rested) { // load management: fresher legs, but the coach and the fans notice
    const n = (C.cur.rests = (C.cur.rests || 0) + 1);
    C.trust = clamp(C.trust - 1.5 * n, 0, 100); C.pop = clamp(C.pop - 0.3, 0, 100); C.fresh = 3;
    trackGame(C, l); return;
  }
  if (l.gleague) { trackGame(C, l); return; } // a two-way assignment: no NBA minutes, no lost trust
  if (l.dnp) { C.trust = clamp(C.trust - 0.5, 0, 100); trackGame(C, l); return; }
  C.chem[C.cur.team] = clamp((C.chem[C.cur.team] || 0) + (l.min / 36) * 1.1, 0, 100);
  const gs = gameScore(l);
  const expected = { starter: 14, rotation: 8, bench: 3 }[C.cur.role];
  C.tp += gameTrainingPoints(C, gs, expected);
  trackGame(C, l, { gs });
  C.trust = clamp(C.trust + clamp((gs - expected) / 4, -3, 3) + (g.won ? 0.5 : -0.3), 0, 100);
  C.pop = clamp(C.pop + (gs > expected * 1.5 ? 0.8 : 0.1), 0, 100);
  const tot = g.eu || C.cur.league === "el" ? (C.elTotals ||= { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, gp: 0 }) : C.totals;
  for (const k of ["pts", "reb", "ast", "stl", "blk"]) tot[k] += l[k];
  tot.gp++;
  const m = C.milestones;
  const dd = ["pts", "reb", "ast", "stl", "blk"].filter((k) => l[k] >= 10).length;
  if (!m.debut) m.debut = C.cur.label;
  if (l.pts >= 20 && !m.pts20) m.pts20 = C.cur.label;
  if (l.pts >= 30 && !m.pts30) m.pts30 = C.cur.label;
  if (l.pts >= 40 && !m.pts40) m.pts40 = C.cur.label;
  if (dd >= 2 && !m.dd) m.dd = C.cur.label;
  if (dd >= 3 && !m.td) m.td = C.cur.label;
  if (C.totals.pts >= 1000 && !m.k1) m.k1 = C.cur.label;
  // injuries: more likely with heavy minutes, age, a recent rushed comeback; less with Iron man
  const heavy = (C.weight ?? 0) - Math.round(23.3 * (C.height / 100) ** 2) > 6 && C.age >= 30;
  let risk = (0.017 + (C.injuryRisk || 0) + Math.max(0, C.age - 30) * 0.003 - badgeLv(C, "ironman") * 0.006 + (l.min > 34 ? 0.01 : 0)) * (C.staff?.nutrition ? 0.8 : 1) * planInjury(C) * (heavy ? 1.1 : 1);
  if (C.fresh > 0) { risk *= 0.6; C.fresh--; } // rested legs
  if (C.reinjury) { risk *= 3; if (--C.reinjury.games <= 0) C.reinjury = null; }
  C.injuryRisk = 0;
  if (Math.random() < risk) injure(C, C.reinjury && Math.random() < 0.5 ? C.reinjury.name : null);
  // the coach re-thinks your role every few games
  if (C.cur.games.length % 5 === 0) {
    const before = C.cur.role;
    C.cur.role = roleOn(C, C.cur.label, C.cur.team);
    if (before !== C.cur.role) C.log.unshift({ t: "role", text: `New role: ${ROLE_NAMES[C.cur.role]}.` });
  }
}

// Injury table: games out (before age and treatment), who gets it more, lasting effects.
export const INJURIES = [
  { name: "Ankle sprain", w: 30, games: [1, 4], desc: "Rolled it landing on a foot." },
  { name: "Hamstring strain", w: 16, games: [3, 7], desc: "Felt it pull on a sprint." },
  { name: "Groin strain", w: 8, games: [2, 6], desc: "Tight after a hard cut." },
  { name: "Back spasms", w: 8, games: [1, 4], big: true, desc: "Couldn't get up from the bench." },
  { name: "Concussion", w: 5, games: [1, 3], noRush: true, desc: "Took an elbow. League protocol decides the return." },
  { name: "Broken finger", w: 6, games: [4, 8], desc: "Jammed it on a rebound." },
  { name: "Knee sprain (MCL)", w: 8, games: [6, 12], big: true, desc: "Knee buckled in traffic." },
  { name: "Plantar fasciitis", w: 5, games: [4, 10], desc: "Heel pain that won't go away." },
  { name: "Torn ACL", w: 2.2, games: [45, 60], severe: true, ath: -5, desc: "Season-ending. Surgery and a long rehab." },
  { name: "Torn Achilles", w: 1.3, games: [50, 70], severe: true, ath: -7, old: true, desc: "The one every player fears. Surgery, a long road back." },
];
function injure(C, forced = null) {
  const big = FAM[C.pos] === "B" || C.height >= 205;
  const pool = INJURIES.map((x) => ({ x, w: x.w * (x.big && big ? 1.5 : 1) * (x.old ? 1 + Math.max(0, C.age - 28) * 0.3 : 1) }));
  let pick = forced && INJURIES.find((x) => x.name === forced);
  if (!pick) { let u = Math.random() * pool.reduce((a, p) => a + p.w, 0); for (const p of pool) { u -= p.w; if (u <= 0) { pick = p.x; break; } } pick ??= INJURIES[0]; }
  const [lo, hi] = pick.games;
  const games = Math.max(1, Math.round((lo + Math.random() * (hi - lo)) * (1 + Math.max(0, C.age - 28) * 0.04) * (forced ? 1.5 : 1)));
  if (pick.ath) { C.attrs.ath = Math.max(20, C.attrs.ath + pick.ath); C.attrs.def = Math.max(20, C.attrs.def + Math.round(pick.ath / 2)); }
  C.injury = { name: pick.name, desc: pick.desc, games, total: games, severe: !!pick.severe, noRush: !!(pick.noRush || pick.severe), pending: true, ath: pick.ath || 0, again: !!forced };
  (C.injuries ||= []).push({ name: pick.name, season: C.cur?.label, games, age: C.age });
}
/** Injury decision: rest fully, or rush back sooner (not possible for concussions or season-ending injuries). */
export function treatInjury(C, rush) {
  if (!C.injury) return;
  C.injury.pending = false;
  if (rush && !C.injury.noRush) { C.injury.games = Math.max(1, Math.round(C.injury.games * 0.45)); C.injury.rushed = true; if (C.cur) (C.cur.dev ||= newSeasonLog()).rushed++; }
  if (badgeLv(C, "ironman")) C.injury.games = Math.max(1, C.injury.games - badgeLv(C, "ironman"));
}

function playCupRound(C, rnd) {
  const S = C.cur, cup = S.cup;
  const names = ["Quarter-final", "Semi-final", "Final"];
  const pairs = [];
  for (let i = 0; i < cup.teams.length; i += 2) pairs.push([cup.teams[i], cup.teams[i + 1]]);
  const next = [];
  let mine = null;
  for (const [a, b] of pairs) {
    if (a === S.team || b === S.team) {
      const g = playGame(C, S, a === S.team ? b : a, true, rnd, { neutral: true, big: true, label: `State Cup ${names[cup.round]}` });
      mine = g; S.games.push({ ...g, round: S.round, cup: true });
      afterGame(C, g);
      next.push(g.won ? S.team : g.opp);
    } else {
      const A = S.teams.find((t) => t.id === a), B = S.teams.find((t) => t.id === b);
      const [x, y] = playScore({ s: A.strength }, { s: B.strength }, rnd, true);
      next.push(x > y ? a : b);
    }
  }
  cup.results.push({ round: names[cup.round], mine });
  cup.teams = next; cup.round++;
  if (!next.includes(S.team)) cup.alive = false;
  if (cup.round === 3) { cup.winner = next[0]; if (next[0] === S.team) C.trophies.push({ type: "cup", season: S.label, team: S.team }); }
  return { round: names[cup.round - 1], game: mine, alive: cup.alive, winner: cup.winner };
}

// ---------------------------------------------------------------- season averages, all-star, awards
export function averages(games) {
  const played = games.filter((g) => !g.line.dnp);
  const n = played.length || 1;
  const sum = (k) => played.reduce((a, g) => a + g.line[k], 0);
  const pct = (m, a) => (sum(a) ? r1((100 * sum(m)) / sum(a)) : null);
  return { gp: played.length, min: r1(sum("min") / n), ppg: r1(sum("pts") / n), rpg: r1(sum("reb") / n), apg: r1(sum("ast") / n),
    spg: r1(sum("stl") / n), bpg: r1(sum("blk") / n), fg: pct("fgm", "fga"), tp: pct("tpm", "tpa"), ft: pct("ftm", "fta"),
    val: r1(played.reduce((a, g) => a + valOf(g.line), 0) / n) };
}
/** Real players of the (data) season with 10+ games: the competition for awards. */
function field(label, league = "wl") {
  if (league === "nba") return nbaField(label);
  return db.player_seasons.filter((r) => r.season === dataSeason(label) && isPlayable(r, 10));
}
// how good a season line is: valuation in the Winner League; the NBA data has none, so points + rebounds + assists there
const fieldScore = (league) => (league === "nba" ? (r) => (r.stats.ppg ?? 0) + (r.stats.rpg ?? 0) + (r.stats.apg ?? 0) : (r) => r.stats.valuation_per_game ?? 0);
const myScore = (league, avg) => (league === "nba" ? avg.ppg + avg.rpg + avg.apg : avg.val);
function allStar(C, rnd) {
  const S = C.cur, avg = averages(S.games.filter((g) => !g.cup && !g.eu));
  const others = field(S.label, S.league).map(fieldScore(S.league)).sort((a, b) => b - a);
  const rank = others.filter((v) => v > myScore(S.league, avg)).length;
  const picked = avg.gp >= 5 && rank < (S.league === "nba" ? 24 : 20);
  let line = null;
  if (picked) {
    line = statLine(C, "starter", rnd, { big: true });
    line.min = Math.max(18, Math.round(line.min * 0.8));
    C.trophies.push({ type: S.league === "nba" ? "nbaallstar" : "allstar", season: S.label, team: S.team });
    C.pop = clamp(C.pop + 6, 0, 100);
  }
  S.allStar = { picked, rank: rank + 1, line };
  return S.allStar;
}

// ---------------------------------------------------------------- playoffs
// Series formats: wins needed per round. The Winner League here: best of three. The EuroLeague: best-of-five
// playoffs, then a one-game Final Four. The NBA: 16 teams, best of seven in every round.
const PO_FORMAT = { wl: { teams: 8, need: [2, 2, 2] }, el: { teams: 8, need: [3, 1, 1] }, nba: { teams: 16, need: [4, 4, 4, 4] } };
// bracket order: 1-8, 4-5, 2-7, 3-6 (and 1-16, 8-9, 5-12, 4-13, 2-15, 7-10, 3-14, 6-11 for sixteen)
const PAIRS = { 8: [[0, 7], [3, 4], [1, 6], [2, 5]], 16: [[0, 15], [7, 8], [4, 11], [3, 12], [1, 14], [6, 9], [2, 13], [5, 10]] };
function seedPlayoffs(S) {
  const F = PO_FORMAT[S.league] || PO_FORMAT.wl;
  const top = table(S).slice(0, F.teams).map((t) => t.id);
  const inIt = top.includes(S.team);
  return { round: 0, need: F.need, series: PAIRS[F.teams].map(([a, b]) => ({ a: top[a], b: top[b], w: [0, 0], games: [] })), champion: null, out: !inIt, outAt: inIt ? null : -1, history: [], seeds: top };
}
/** Wins needed in the current round (older saves: best of three, the Final Four one game). */
export const poNeed = (S, round = S.playoffs.round) => S.playoffs.need?.[round] ?? (S.league === "el" && round > 0 ? 1 : 2);
/** The higher seed's home games: 2-2-1-1-1 in a best of seven, 2-2-1 in a best of five, games 1 and 3 in a best of three. */
const HIGH_HOME = { 4: [0, 1, 4, 6], 3: [0, 1, 4], 2: [0, 2], 1: [0] };
const PO_NAMES = ["Quarter-finals", "Semi-finals", "Final"];
const NBA_PO = ["NBA playoffs, first round", "NBA second round", "NBA semi-finals", "NBA Finals"];
/** Play the next playoff game day (every series in the round plays one game). */
export function playPlayoffDay(C) {
  const S = C.cur, P = S.playoffs;
  const rnd = seededRng(`mc-${C.seedBase}-${S.label}-po${P.round}-${P.series.reduce((a, s) => a + s.games.length, 0)}`);
  const ff = S.league === "el" && P.round > 0; // EuroLeague Final Four: one game, neutral court
  const need = poNeed(S);
  const out = [];
  for (const s of P.series) {
    if (s.w[0] >= need || s.w[1] >= need) continue;
    const homeA = (HIGH_HOME[need] || HIGH_HOME[2]).includes(s.games.length);
    if (s.a === S.team || s.b === S.team) {
      const meA = s.a === S.team;
      const g = playGame(C, S, meA ? s.b : s.a, meA ? homeA : !homeA, rnd, { gleague: S.league === "nba" && !!C.contract?.twoWay, big: true, neutral: ff, label: ff ? `Final Four ${P.round === 1 ? "semi-final" : "final"}` : `${S.league === "el" ? "EuroLeague playoffs" : S.league === "nba" ? NBA_PO[P.round] : PO_NAMES[P.round]}, game ${s.games.length + 1}` });
      S.games.push({ ...g, round: S.round, playoff: true });
      afterGame(C, g);
      s.games.push(g);
      s.w[(g.won ? meA : !meA) ? 0 : 1]++;
      out.push(g);
    } else {
      const A = S.teams.find((t) => t.id === s.a), B = S.teams.find((t) => t.id === s.b);
      const [x, y] = homeA ? playScore({ s: A.strength }, { s: B.strength }, rnd) : playScore({ s: B.strength }, { s: A.strength }, rnd).reverse();
      s.games.push({ sim: true });
      s.w[x > y ? 0 : 1]++;
    }
  }
  if (P.series.every((s) => s.w[0] >= need || s.w[1] >= need)) {
    (P.history ||= []).push(P.series.map((s) => ({ a: s.a, b: s.b, w: s.w.slice() })));
    const winners = P.series.map((s) => (s.w[0] >= need ? s.a : s.b));
    if (!winners.includes(S.team) && !P.out) { P.out = true; P.outAt = P.round; }
    if (P.series.length === 1) {
      P.champion = winners[0];
      if (winners[0] === S.team) C.trophies.push({ type: S.league === "el" ? "euroleague" : S.league === "nba" ? "nba" : "title", season: S.label, team: S.team });
      S.phase = "done";
    } else {
      P.round++;
      P.series = [];
      for (let i = 0; i < winners.length; i += 2) P.series.push({ a: winners[i], b: winners[i + 1], w: [0, 0], games: [] });
    }
  }
  return out;
}
/** Skip to the end of the playoffs (used when you're already out). */
export function simPlayoffs(C) { let guard = 0; while (C.cur.phase === "playoffs" && guard++ < 60) playPlayoffDay(C); }

/** End-of-season awards, compared with the real players of that season. */
export function seasonAwards(C) {
  const S = C.cur;
  const reg = S.games.filter((g) => !g.cup && !g.playoff && !g.eu);
  const avg = averages(reg);
  const standing0 = table(S).findIndex((t) => t.id === S.team) + 1;
  if (S.league === "el") return { avg, awards: [], standing: standing0 }; // EuroLeague stats in the data are placeholders
  if (S.league === "nba") return nbaAwards(C, S, reg, avg, standing0);
  const real = field(S.label);
  const rankBy = (mine, get) => real.filter((r) => (get(r) ?? 0) > mine).length + 1;
  const standing = table(S).findIndex((t) => t.id === S.team) + 1;
  const prev = C.history[C.history.length - 1];
  const out = [];
  const enough = avg.gp >= reg.length * 0.6;
  if (enough) {
    const valRank = rankBy(avg.val, (r) => r.stats.valuation_per_game);
    if (valRank === 1 && standing <= 4) out.push("MVP");
    if (valRank <= 5) out.push("All-League First Team");
    if (rankBy(avg.ppg, (r) => r.stats.ppg) === 1) out.push("Scoring leader");
    if (rankBy(avg.rpg, (r) => r.stats.rpg) === 1) out.push("Rebounding leader");
    if (rankBy(avg.apg, (r) => r.stats.apg) === 1) out.push("Assists leader");
    if (rankBy(avg.spg + avg.bpg, (r) => (r.stats.spg ?? 0) + (r.stats.bpg ?? 0)) <= 2 && C.attrs.def >= 70) out.push("Defensive Player of the Year");
    if (C.history.filter((h) => h.pro).length === 0 && C.age <= 23 && valRank <= 25) out.push("Rookie of the Year");
    if (prev?.pro && avg.val - prev.avg.val >= 4) out.push("Most Improved Player");
  }
  for (const a of out) C.awards.push({ name: a, season: S.label });
  return { avg, awards: out, standing };
}

/** NBA awards against the NBA's real players that season (per-game points, rebounds and assists). */
function nbaAwards(C, S, reg, avg, standing) {
  const real = field(S.label, "nba");
  const rankBy = (mine, get) => real.filter((r) => (get(r) ?? 0) > mine).length + 1;
  const out = [];
  if (avg.gp >= reg.length * 0.6) {
    const rank = rankBy(myScore("nba", avg), fieldScore("nba"));
    if (rank === 1 && standing <= 4) out.push("NBA MVP");
    if (rank <= 15) out.push("All-NBA Team");
    if (rankBy(avg.ppg, (r) => r.stats.ppg) === 1) out.push("NBA scoring leader");
    if (rankBy(avg.rpg, (r) => r.stats.rpg) === 1) out.push("NBA rebounding leader");
    if (rankBy(avg.apg, (r) => r.stats.apg) === 1) out.push("NBA assists leader");
    if (!C.history.some((h) => h.league === "nba") && rank <= 40) out.push("NBA All-Rookie Team");
  }
  for (const a of out) C.awards.push({ name: a, season: S.label });
  return { avg, awards: out, standing };
}

// ---------------------------------------------------------------- contracts & agents
/** Two-way contract salary: a game estimate (about half an NBA minimum deal). */
export const TWO_WAY_PAY = 580000;
export const AGENTS = {
  rookie: { name: "Rookie agent", fee: 0.03, money: 0, accept: 0, extra: 0, desc: "Cheap, no extras." },
  shark: { name: "The Shark", fee: 0.1, money: 0.12, accept: -0.06, extra: 0, desc: "Squeezes more money; teams are warier." },
  connector: { name: "The Connector", fee: 0.06, money: 0.03, accept: 0, extra: 1, desc: "One extra offer, sometimes from a bigger club." },
  loyal: { name: "Family friend", fee: 0.05, money: 0, accept: 0.08, extra: 0, desc: "Teams trust him: deals close more easily; loyalty pays." },
};
/**
 * Market value in US dollars per season (Winner League salaries are usually quoted in dollars).
 * Rough game estimates: young bench players ~$25-60k, rotation ~$60-150k, starters ~$150-350k,
 * stars more, and the richest clubs pay the most.
 */
export const value = (C) => Math.round((25000 * 1.075 ** (bestOverall(C) - 55) + C.pop * 800) * (C.nat === "Israel" ? 1.1 : 1) / 1000) * 1000;
/** Simplified effective income tax on a season's salary (an estimate, not tax advice). */
export const taxRate = (gross) => (gross < 60000 ? 0.22 : gross < 150000 ? 0.3 : gross < 350000 ? 0.38 : 0.44);
export const netPay = (gross, agent) => Math.round(gross * (1 - taxRate(gross) - (AGENTS[agent]?.fee || 0)));

/** Contract offers for the coming season. */
export function makeOffers(C, { homeGrown = null } = {}) {
  const label = seasonLabel(C.debut, C.seasonNo);
  const teams = teamsOf(label).sort((a, b) => b.strength - a.strength);
  const ov = bestOverall(C), ag = AGENTS[C.agent];
  const n = 2 + (ov >= 78 ? 1 : 0) + ag.extra;
  // better players hear from stronger clubs
  const startAt = clamp(Math.round(((90 - ov) / 30) * (teams.length - 1)), 0, teams.length - 1);
  const pool = teams.slice(Math.max(0, startAt - 3), startAt + 4);
  const picks = [];
  // foreign players only hear from clubs with a foreign slot they'd win
  const eligible = (t) => C.nat === "Israel" || depthChart(C, label, t.id).slotOk;
  if (homeGrown) picks.push(teams.find((t) => t.id === homeGrown) || { id: homeGrown, name: teamName(homeGrown), strength: 82 });
  if (C.contract && !homeGrown && teams.some((t) => t.id === C.contract.team)) picks.push(teams.find((t) => t.id === C.contract.team));
  else if (C.contract && isNba(label, C.contract.team) && depthChart(C, label, C.contract.team).role !== "bench") { // your NBA team wants you back
    const t = nbaTeams(label).find((x) => x.id === C.contract.team);
    if (t) picks.push(t);
  }
  for (const t of pool.sort(() => Math.random() - 0.5)) if (picks.length < n && !picks.some((p) => p.id === t.id) && eligible(t)) picks.push(t);
  if (picks.length < 2) for (const t of teams.slice().reverse()) if (picks.length < 2 && !picks.some((p) => p.id === t.id) && eligible(t)) picks.push(t);
  if (!picks.length) picks.push(teams[teams.length - 1]); // someone always takes a chance on you
  const budget = (t) => { if (t.abroad) return t.pay; if (isNba(label, t.id)) return 7; const i = teams.findIndex((x) => x.id === t.id); return i < 3 ? 1.5 : i < teams.length / 2 ? 1.1 : 0.8; };
  // Europe calls: from overall 76, EuroLeague clubs abroad where you'd actually play
  const euro = euroTeams(label).filter((t) => !t.wl && isAbroad(label, t.id)).sort((a, b) => b.strength - a.strength);
  const wantEuro = ov >= 80 ? 2 : ov >= 76 && Math.random() < 0.5 + (C.agent === "connector" ? 0.25 : 0) ? 1 : 0;
  if (euro.length && wantEuro) {
    const fit = euro.map((t, i) => ({ ...t, abroad: true, pay: 1.7 + (1 - i / euro.length) * 1.1, role: depthChart(C, label, t.id).role }))
      .filter((t) => t.role !== "bench").sort(() => Math.random() - 0.5).slice(0, wantEuro);
    picks.push(...fit);
  }
  // the NBA calls: from overall 90 (88 after a Summer League invite), teams where you'd actually play; a
  // training-camp deal from a weak team when you're close. NBA salaries are several times the Winner League's
  if (nbaReady()) {
    const ready = ov >= 90 || (ov >= 88 && C.nbaWatch);
    // close but not there yet after a Summer League invite: a two-way contract from a weaker team
    if (!ready && C.nbaWatch && ov >= 85) {
      const t = nbaTeams(label).sort((a, b) => a.strength - b.strength)[Math.floor(Math.random() * 8)];
      if (t) picks.push({ ...t, abroad: true, nba: true, twoWay: true, pay: 0 });
    }
    if (ready) {
      const nba = nbaTeams(label).map((t) => ({ ...t, dc: depthChart(C, label, t.id) }));
      let fit = nba.filter((t) => t.dc.role !== "bench").sort(() => Math.random() - 0.5).slice(0, ov >= 94 ? 2 : 1);
      if (!fit.length) fit = nba.sort((a, b) => a.strength - b.strength).slice(0, 1);
      picks.push(...fit.map((t) => ({ ...t, abroad: true, nba: true, pay: { starter: 12, rotation: 7, bench: 4 }[t.dc.role] })));
    }
  }
  return picks.map((t) => {
    const loyal = (C.yearsAt[t.id] || 0) >= 3;
    const v = t.twoWay ? TWO_WAY_PAY : value(C) * budget(t) * (0.85 + Math.random() * 0.25) * (1 + ag.money) * (homeGrown === t.id ? 0.8 : 1) * (loyal ? 0.95 : 1);
    const dc = depthChart(C, label, t.id);
    const years = t.twoWay ? 2 : 1 + Math.floor(Math.random() * 3);
    // an option on the last year of a longer deal: the player's (he can leave a year early) or the club's
    const r = Math.random();
    const option = years >= 2 && !t.twoWay ? (r < 0.25 ? "player" : r < 0.45 ? "team" : null) : null;
    return { team: t.id, name: t.name, salary: Math.round(v / 1000) * 1000, years, option, twoWay: !!t.twoWay, role: t.twoWay ? "bench" : dc.role,
      homeGrown: homeGrown === t.id, loyal, own: C.contract?.team === t.id, foreigners: dc.foreigners, fam: dc.fam, rank: dc.rank, abroad: !!t.abroad, nba: !!t.nba || isNba(label, t.id) };
  });
}
/** Ask for more (salary +x, a better role). Returns accepted offer or null (offer withdrawn). */
export function negotiate(C, offer, { more = 0, years = offer.years, role = offer.role, nbaOut = false }) {
  const ag = AGENTS[C.agent];
  // an NBA-out clause: the club lets you leave for the NBA at no cost, and pays a little less for it
  if (nbaOut) {
    if (Math.random() > clamp(0.8 + ag.accept, 0.4, 0.95)) return null;
    return { ...offer, salary: Math.round((offer.salary * 0.95) / 1000) * 1000, nbaOut: true };
  }
  const roleUp = ["bench", "rotation", "starter"].indexOf(role) - ["bench", "rotation", "starter"].indexOf(offer.role);
  const p = clamp(0.95 - more * 1.7 - Math.max(0, roleUp) * 0.3 + ag.accept + (offer.loyal ? 0.1 + (C.agent === "loyal" ? 0.08 : 0) : 0) - Math.abs(years - offer.years) * 0.05, 0.05, 0.98);
  if (Math.random() > p) return null;
  return { ...offer, salary: Math.round((offer.salary * (1 + more)) / 1000) * 1000, years, role, promised: roleUp > 0 ? role : null };
}
export function sign(C, offer) {
  C.contract = { team: offer.team, salary: offer.salary, years: offer.years, left: offer.years, role: offer.role, promised: offer.promised || null,
    option: offer.option || null, nbaOut: !!offer.nbaOut, twoWay: !!offer.twoWay, rookie: offer.rookie || null };
  C.optionPending = false;
  C.club = offer.team;
  C.trustBy ??= {};
  if (offer.promised) C.trustBy[offer.team] = Math.max(C.trustBy[offer.team] ?? 50, offer.promised === "starter" ? 62 : 52);
  if (offer.loyal) C.pop = clamp(C.pop + 3, 0, 100);
}

// ---------------------------------------------------------------- off-season
/** Close the season: history, money, contract year, aging. Returns the summary. */
export function endSeason(C) {
  const S = C.cur;
  const aw = seasonAwards(C);
  const club = S.team;
  const cupWon = S.cup.winner === club, title = S.playoffs?.champion === club;
  const income = C.contract ? netPay(C.contract.salary, C.agent) : 0;
  C.money += income - staffCost(ensureDev(C));
  (C.trustBy ??= {})[club] = Math.round(C.trust);
  // the summer heals: about four months of recovery
  if (C.injury) { C.injury.games -= 15; if (C.injury.games <= 0) C.injury = null; else C.injury.pending = false; }
  C.yearsAt[club] = (C.yearsAt[club] || 0) + 1;
  const summary = {
    pro: true, season: S.label, simulated: S.simulated, team: club, loan: !!C.loan, age: C.age, role: S.role, overall: bestOverall(C),
    avg: aw.avg, standing: aw.standing, awards: aw.awards, title, cupWon, allStar: !!S.allStar?.picked,
    playoffs: !S.playoffs ? null : title ? "Champions" : S.playoffs.outAt === -1 ? "Missed the playoffs" : S.playoffs.outAt != null ? (S.playoffs.outAt === 2 ? "Lost in the Final" : `Out in the ${PO_NAMES[S.playoffs.outAt]}`) : null,
    po: averages(S.games.filter((g) => g.playoff)), income, attrs: { ...C.attrs }, league: S.league || "wl",
    euro: S.el ? { rank: euroTable(S.el).findIndex((t) => t.id === club) + 1, of: S.el.teams.length, f4: !!S.el.f4?.teams.includes(club), champion: S.el.champion === club, avg: averages(S.games.filter((g) => g.eu)) } : null,
  };
  if (S.league === "nba") { // four rounds now (three in older saves)
    const last = (S.playoffs?.need?.length ?? 3) - 1, o = S.playoffs?.outAt;
    summary.playoffs = !S.playoffs ? null : title ? "NBA champions" : o === -1 ? "Missed the playoffs" : o === last ? "Lost in the NBA Finals" : o === last - 1 ? "Lost in the NBA semi-finals" : o === 0 ? "Out in the first round" : "Out in the second round";
  }
  // NBA scouts: a strong season in Europe brings a Summer League invite, and NBA offers come sooner
  if (S.league !== "nba" && !C.nbaWatch && nbaReady() && bestOverall(C) >= 86 && C.age <= 28) {
    C.nbaWatch = S.label;
    C.pop = clamp(C.pop + 4, 0, 100);
    summary.summerLeague = true;
    C.log.unshift({ t: "nba", text: `NBA Summer League invite: scouts saw ${C.name}'s ${S.label} season. NBA offers can now come from overall 88.` });
  }
  if (S.league === "el") summary.playoffs = !S.playoffs ? null : title ? "EuroLeague champions" : S.playoffs.outAt === -1 ? "Missed the playoffs" : S.playoffs.outAt === 0 ? "Out in the playoffs" : S.playoffs.outAt === 1 ? "Lost in the Final Four semi-final" : "Lost the EuroLeague final";
  C.history.push(summary);
  const dev = seasonDevelopment(C, S, { potential: (DIFFICULTY[C.diff] || DIFFICULTY.star).potential });
  summary.dev = { ch: dev.ch, breakout: dev.breakout, slump: dev.slump };
  if (C.contract) C.contract.left--;
  if (C.contract?.left === 1 && C.contract.option === "team") { // the club decides on its option year
    const keep = depthChart(C, seasonLabel(C.debut, C.seasonNo + 1), C.contract.team).role !== "bench" && value(C) * 1.2 >= C.contract.salary * (isNba(seasonLabel(C.debut, C.seasonNo + 1), C.contract.team) ? 0.25 : 1);
    summary.option = { type: "team", kept: keep };
    if (!keep) C.contract.left = 0;
    C.log.unshift({ t: "contract", text: keep ? `${teamName(C.contract.team)} picked up the team option: one more season.` : `${teamName(C.contract.team)} declined the team option. ${C.name} is a free agent.` });
    C.contract.option = null;
  } else if (C.contract?.left === 1 && C.contract.option === "player") C.optionPending = true; // you decide in the summer
  if (C.loan) C.loan = null;
  C.seasonNo++;
  C.cur = null;
  C.phase = "offseason";
  return { summary, growth: dev.ch, dev };
}

// ---------------------------------------------------------------- academy (ages 16–17)
/** One academy season: youth games summary, development; loan = another club's youth team (more minutes). */
export function academySeason(C, { loanTo = null, focus = "balanced" } = {}) {
  const rnd = Math.random;
  const club = loanTo || C.academy.club;
  const minutesBoost = loanTo ? 1.25 : 1;
  const games = 22;
  const ov = bestOverall(C);
  // youth league: you play big minutes against players your age
  const per = { ppg: r1(Math.max(4, (ov - 30) * 0.45 * minutesBoost * (0.85 + rnd() * 0.3))), rpg: r1(Math.max(1, (effective(C).reb - 30) * 0.12 * minutesBoost)), apg: r1(Math.max(0.5, (C.attrs.pas - 30) * 0.08 * minutesBoost)) };
  const dev = seasonDevelopment(ensureDev(C), null, { academy: true, loan: !!loanTo, potential: (DIFFICULTY[C.diff] || DIFFICULTY.star).potential });
  const ch = dev.ch;
  if (focus !== "balanced" && SUMMER_CAMPS[focus]) for (const k of SUMMER_CAMPS[focus].attrs) {
    const to = Math.max(C.attrs[k], Math.min(C.attrs[k] + 2, trainLimit(C, k)));
    ch[k] = r1((ch[k] || 0) + to - C.attrs[k]); C.attrs[k] = to;
  }
  C.tp += 6;
  const entry = { year: C.academy.year, age: C.age - 1, club, loan: !!loanTo, games, ...per, overall: bestOverall(C) };
  C.academy.log.push(entry);
  C.academy.year++;
  if (C.academy.year > 2) C.phase = "turnpro";
  return { entry, growth: ch, dev };
}

// ---------------------------------------------------------------- legacy
/** Career totals vs. the real all-time leaders (records since 2010-11). */
export function hallOfFameScore(C) {
  const t = C.trophies, a = C.awards;
  return Math.round(t.filter((x) => x.type === "title").length * 8 + t.filter((x) => x.type === "euroleague").length * 12 + t.filter((x) => x.type === "cup").length * 3 + t.filter((x) => x.type === "allstar").length * 2
    + a.filter((x) => x.name === "MVP").length * 10 + a.filter((x) => x.name === "All-League First Team").length * 3
    + a.filter((x) => !["MVP", "All-League First Team"].includes(x.name)).length * 2 + C.totals.pts / 400 + C.history.filter((h) => h.pro).length);
}
export const HOF_LINE = 40;
/** Clubs whose fans would retire your jersey: 6+ seasons there with strong numbers. */
export function legendClubs(C) {
  const by = {};
  for (const h of C.history.filter((x) => x.pro && !x.loan)) (by[h.team] ||= []).push(h);
  return Object.entries(by).filter(([, list]) => list.length >= 6 && list.reduce((s, h) => s + h.avg.val, 0) / list.length >= 12).map(([tid]) => tid);
}
export function retire(C) {
  C.retired = true; C.phase = "retired";
  C.hof = hallOfFameScore(C) >= HOF_LINE;
  C.legendOf = legendClubs(C);
  return { hof: C.hof, legends: C.legendOf, score: hallOfFameScore(C) };
}
