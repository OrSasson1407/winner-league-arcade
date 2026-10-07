// My Career: player development. Each summer every attribute moves by age, then by what the season was
// like: minutes, what you actually did on the court, the level around you, a veteran mentor from the
// real roster, the coach's trust, your own staff, work ethic, health and the miles on your legs. Each
// player also has a hidden talent ceiling per attribute (capped by the body), revealed slowly by scouts.
// The yearly report says how much each factor gave or took, so the system can be understood and planned for.
import { playersById, seededRng } from "../data.js";

// ---------------------------------------------------------------- constants
export const STAFF = {
  skills: { name: "Skills coach", cost: 12000, attrs: ["sht", "thr", "fin", "pas"], desc: "Shooting, finishing and passing grow faster; sometimes an extra training point after a game." },
  strength: { name: "Strength coach", cost: 10000, attrs: ["ath", "reb", "def"], desc: "Athleticism, rebounding and defense grow faster and fade slower with age." },
  nutrition: { name: "Nutritionist", cost: 8000, attrs: [], desc: "Fewer injuries, slower decline, and the miles on your legs count less." },
};
export const TRAITS = {
  steady: { name: "Steady developer", desc: "Grows at the usual pace." },
  early: { name: "Early bloomer", desc: "Grows fast as a teenager, but the peak comes and goes earlier." },
  late: { name: "Late bloomer", desc: "Slow at first, keeps improving into the late twenties." },
};
/** Work-ethic reputation (the number itself stays hidden). */
export const workLabel = (w) => (w >= 75 ? "Gym rat" : w >= 50 ? "Professional" : w >= 35 ? "Inconsistent" : "Coasting");
const KEYS = ["sht", "thr", "fin", "pas", "def", "reb", "ath", "iq"];
const BOOST = { scorer: ["sht", "thr", "fin"], defender: ["def", "ath", "iq"], rebounder: ["reb", "fin", "def"], playmaker: ["pas", "iq", "sht"], athlete: ["ath", "fin", "def"], unicorn: [] };
const FAMILY = { PG: "G", SG: "G", SF: "W", PF: "B", C: "B" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the body
/** What a body of this height can reach in an attribute, however hard you work. */
export function bodyCap(C, k) {
  const h = C.height;
  if (k === "ath") return clamp(99 - Math.max(0, h - 200) * 1.3, 60, 99);
  if (k === "reb") return clamp(99 - Math.max(0, 192 - h) * 1.4, 60, 99);
  if (k === "thr") return clamp(99 - Math.max(0, h - 208) * 1.4, 60, 99);
  if (k === "fin") return clamp(99 - Math.max(0, 186 - h) * 1.2, 65, 99);
  if (k === "pas") return clamp(99 - Math.max(0, h - 210) * 1.2, 65, 99);
  if (k === "def") return clamp(99 - Math.max(0, 182 - h) * 1.2, 70, 99);
  return 99;
}

// ---------------------------------------------------------------- talent (hidden) and scouting
/** Older saves and new players: make sure every development field exists. */
export function ensureDev(C) {
  ensureExtras(C);
  if (C.ceil && C.trait) return C;
  const rnd = seededRng(`mc-talent-${C.seedBase}`);
  const star = C.diff !== "hard";
  const base = star ? 86 : 81, spread = star ? 16 : 22; // the hard road: lower on average, wider (some gems)
  const boosted = BOOST[C.arch] || [];
  C.ceil = Object.fromEntries(KEYS.map((k) => {
    const c = base + (boosted.includes(k) ? 6 : 0) + (k === "iq" ? 3 : 0) + (rnd() - 0.5) * spread;
    return [k, Math.round(clamp(Math.max(c, (C.attrs[k] || 40) + 6), 60, 99))];
  }));
  const t = rnd();
  C.trait = t < 0.2 ? "early" : t < 0.4 ? "late" : "steady";
  C.work ??= 55;
  C.mileage ??= Math.round((C.history || []).filter((h) => h.pro).reduce((s, h) => s + (h.avg?.min || 0) * (h.avg?.gp || 0), 0));
  C.scouted ??= 0;
  C.staff ??= { skills: !!C.coach, strength: false, nutrition: false };
  delete C.coach;
  return C;
}
/** Fields added after the first development update (kept separate so every save gets them). */
function ensureExtras(C) {
  C.moves ??= [];
  C.weight ??= Math.round(23.3 * (C.height / 100) ** 2);
  if (!C.reps) { // career reps for older saves: estimated from the totals
    const t = C.totals || {};
    C.reps = { tpa: Math.round((t.pts || 0) * 0.15), fga2: Math.round((t.pts || 0) * 0.4), fta: Math.round((t.pts || 0) * 0.2), ast: t.ast || 0, reb: t.reb || 0, stops: (t.stl || 0) + (t.blk || 0) };
  }
  return C;
}
/** The real limit of an attribute: talent, capped by the body. */
export const ceilingOf = (C, k) => Math.min(C.ceil?.[k] ?? 99, bodyCap(C, k));
/** How far training can go: the limit, plus a little for a real worker; after 30 the body takes some back. */
export const trainLimit = (C, k) => Math.min(99, ceilingOf(C, k) + ((C.work ?? 55) >= 75 ? 3 : 0), 99 - Math.max(0, C.age - 30) * 3);
/** What the scouts think your ceiling is: a range that narrows every season (exact after about seven). */
export function scoutRange(C, k) {
  const c = ceilingOf(C, k), w = Math.max(0, Math.round(10 - 1.5 * (C.scouted || 0)));
  if (!w) return [c, c];
  const off = (KEYS.indexOf(k) * 37 + (C.seedBase % 97)) % 100 / 100; // where the truth sits inside the range
  const lo = clamp(Math.round(c - 2 * w * off), 40, 99);
  return [lo, clamp(lo + 2 * w, lo, 99)];
}

// ---------------------------------------------------------------- during the season
/** Your season's development log (created at the start of each season). */
export const newSeasonLog = () => ({ min: 0, gp: 0, dnp: 0, missed: 0, tpa: 0, fga2: 0, fta: 0, ast: 0, reb: 0, stops: 0, rushed: 0, gs: 0, mentor: null });
/** After each of your games: what you did feeds what you'll grow. */
export function trackGame(C, line, { injured = false, gs = 0 } = {}) {
  const d = (C.cur.dev ||= newSeasonLog());
  if (injured) { d.missed++; return; }
  if (line.rested) { d.rested = (d.rested || 0) + 1; return; }
  if (line.dnp) { d.dnp++; return; }
  d.gp++; d.min += line.min; d.gs += gs;
  d.tpa += line.tpa || 0; d.fga2 += (line.fga || 0) - (line.tpa || 0); d.fta += line.fta || 0;
  d.ast += line.ast || 0; d.reb += line.reb || 0; d.stops += (line.stl || 0) + (line.blk || 0);
  C.mileage = (C.mileage || 0) + line.min * (C.staff?.nutrition ? 0.8 : 1) * planWear(C);
  const R = (C.reps ||= { tpa: 0, fga2: 0, fta: 0, ast: 0, reb: 0, stops: 0 });
  R.tpa += line.tpa || 0; R.fga2 += (line.fga || 0) - (line.tpa || 0); R.fta += line.fta || 0;
  R.ast += line.ast || 0; R.reb += line.reb || 0; R.stops += (line.stl || 0) + (line.blk || 0);
}
/** Choices off the court (from events): your work ethic moves. */
export function lifestyle(C, kind) {
  const d = { party: -6, gym: 3, film: 3, honest: 2, excuse: -2, home: 2, camp: 1, argue: -2 }[kind] || 0;
  C.work = clamp((C.work ?? 55) + d, 0, 100);
  return d;
}
/** A real veteran at your position on your roster (30+, rated 88+ and clearly better than you): he teaches you his best skill. */
export function findMentor(C, roster, myOverall) {
  if (C.age > 27) return null;
  const fam = FAMILY[C.pos];
  const pos = (ps) => ps.position || playersById.get(ps.player_id)?.primary_position || "SF";
  const vets = roster.filter((ps) => FAMILY[pos(ps)] === fam && (ps.age || 0) >= 30 && ps.rating_mock >= Math.max(88, myOverall + 3)).sort((a, b) => b.rating_mock - a.rating_mock);
  const v = vets[0];
  if (!v) return null;
  const s = v.stats || {};
  const skills = [["thr", (s.fg3_pct || 0) >= 37 ? (s.ppg || 0) / 11 : 0], ["sht", (s.ppg || 0) / 14], ["pas", (s.apg || 0) / 4.5], ["reb", (s.rpg || 0) / 7], ["def", ((s.spg || 0) + (s.bpg || 0)) / 1.6]];
  const attr = skills.sort((a, b) => b[1] - a[1])[0][0];
  return { pid: v.player_id, name: playersById.get(v.player_id)?.name || v.player_id, age: v.age, attr };
}

// ---------------------------------------------------------------- the summer
function ageCurve(C) {
  const late = C.trait === "late", early = C.trait === "early";
  // the miles: a long, heavy career makes the decline come a year sooner
  const wearShift = C.age >= 27 && (C.mileage || 0) > 14000 ? 1 : 0;
  const a = C.age + (early && C.age >= 21 ? 1.5 : late && C.age >= 21 ? -1.5 : 0) + wearShift;
  let g = a <= 18 ? 2.6 : a <= 21 ? 2.1 : a <= 24 ? 1.4 : a <= 27 ? 0.6 : a <= 29 ? 0 : a <= 31 ? -1.3 : a <= 34 ? -2.2 : -3.2;
  if (C.age < 21) g *= early ? 1.2 : late ? 0.8 : 1;
  return g;
}

/**
 * The yearly development (once each summer, and after each academy year). S is the season just played
 * (null in the academy). Returns { ch: {attr: change}, factors: [...], breakout, slump, ranges }.
 */
export function seasonDevelopment(C, S, { academy = false, loan = false, potential = 1, rnd = Math.random } = {}) {
  ensureDev(C);
  const d = S?.dev || newSeasonLog();
  const g = ageCurve(C);
  const factors = [];
  const add = (id, label, value, text) => factors.push({ id, label, value: r2(value), text });

  // 1 minutes and role
  const avail = d.gp + d.dnp;
  const mpg = avail ? d.min / avail : 0;
  // young players also grow in practice; from 22 on, it's games that make you
  const minutes = academy ? 1 : avail ? (C.age <= 21 ? 0.8 : 0.55) + (C.age <= 21 ? 0.35 : 0.6) * clamp(mpg / 30, 0, 1) : 1;
  if (!academy && avail) add("minutes", "Minutes", minutes, S?.role === "starter" ? `${r1(mpg)} minutes a game as a starter.` : S?.role === "rotation" ? `${r1(mpg)} minutes a game in the rotation.` : `${r1(mpg)} minutes a game off the bench.`);
  // 2 what you did on the court, per 36 minutes
  const per36 = (x) => (d.min >= 60 ? (x / d.min) * 36 : null);
  const reps = { thr: per36(d.tpa) / 4.5, sht: per36(d.fga2) / 7, fin: (per36(d.fga2) + per36(d.fta) * 0.5) / 9, pas: per36(d.ast) / 4, reb: per36(d.reb) / 7.5, def: per36(d.stops) / 2.2, ath: mpg / 28, iq: mpg / 28 };
  const usage = Object.fromEntries(KEYS.map((k) => [k, d.min >= 60 && Number.isFinite(reps[k]) ? clamp(0.8 + 0.3 * reps[k], 0.8, 1.3) : 1]));
  if (d.min >= 60) {
    const top = KEYS.filter((k) => !["ath", "iq"].includes(k)).sort((a, b) => usage[b] - usage[a]).slice(0, 2);
    add("usage", "What you did", (usage[top[0]] + usage[top[1]]) / 2, `Most reps in ${top.map((k) => NAMES[k]).join(" and ")}: those grow fastest.`);
  }
  // 3 the level around you
  let level = 1;
  if (!academy && S) {
    const euro = S.games?.filter((x) => x.eu && !x.line.dnp).length || 0;
    level = 0.9 + clamp(((S.base ?? 80) - 76) / 50, 0, 0.2) + (S.league === "el" ? 0.05 : 0) + Math.min(0.06, euro * 0.006);
    const kind = (S.base ?? 80) >= 88 ? "top" : (S.base ?? 80) >= 82 ? "solid" : "weaker";
    add("level", "Level", level, S.league === "el" ? "A season in the EuroLeague: practising against the best." : euro ? `Practising with a ${kind} roster, plus ${euro} EuroLeague games.` : `Practising with a ${kind} roster.`);
  } else if (academy && loan) { level = 1.05; add("level", "Level", level, "A loan to another academy: more of the ball."); }
  // 5 the coach: trust and stability
  const coach = academy ? 1 : 0.94 + clamp(C.trust ?? 50, 0, 100) / 100 * 0.12 - 0.03 * (S?.coachChanges || 0);
  if (!academy) add("coach", "Coach", coach, S?.coachChanges ? `Coach trust ${Math.round(C.trust ?? 50)}, coaching changes: ${S.coachChanges}.` : `Coach trust ${Math.round(C.trust ?? 50)}.`);
  // 7 work ethic
  const work = 0.85 + (C.work ?? 55) / 100 * 0.3;
  add("work", "Work ethic", work, `${workLabel(C.work ?? 55)}: the choices you make off the court.`);
  // 8 health
  const missedShare = d.missed / Math.max(1, avail + d.missed);
  const health = 1 - 0.5 * missedShare;
  if (d.missed) add("health", "Health", health, `Missed ${d.missed} game${d.missed > 1 ? "s" : ""} injured.`);
  // 6 your own staff
  const staff = C.staff || {};
  for (const id of Object.keys(STAFF)) if (staff[id]) add("staff-" + id, STAFF[id].name, id === "nutrition" ? 1 : 1.12, STAFF[id].desc);
  // the weekly training plan
  const P = planOf(C), topArea = Object.keys(PLAN_AREAS).filter((a) => a !== "rest").sort((a, b) => P[b] - P[a])[0];
  if (Object.keys(PLAN_AREAS).some((a) => P[a] !== 20)) add("plan", "Training plan", planMult(C, PLAN_AREAS[topArea].attrs[0]), `${P[topArea]}% of the week on ${PLAN_AREAS[topArea].name.toLowerCase()}, ${P.rest}% rest.`);
  if (d.rested) add("rested", "Rested games", 1, `Sat out ${d.rested} game${d.rested > 1 ? "s" : ""} to save the legs.`);
  // 4 the mentor
  const mentor = d.mentor && !academy ? d.mentor : null;
  // 12 breakout / slump
  const expected = { starter: 14, rotation: 8, bench: 3 }[S?.role] || 8;
  const perf = d.gp >= 8 ? d.gs / d.gp / expected : 1;
  let breakout = null, slump = false;
  if (!academy && d.gp >= 8 && C.age <= 27 && (C.trust ?? 50) >= 65 && perf >= 1.25 && rnd() < 0.35) {
    breakout = KEYS.filter((k) => !["iq"].includes(k)).sort((a, b) => usage[b] - usage[a]).slice(0, 3);
    for (const k of breakout) C.ceil[k] = Math.min(99, C.ceil[k] + 2); // a breakout shows there's more in there
  } else if (!academy && d.gp + d.dnp >= 10 && ((C.trust ?? 50) <= 30 || perf <= 0.6) && rnd() < 0.3) slump = true;
  if (breakout) add("breakout", "Breakout summer", 1.8, `Confidence through the roof: ${breakout.map((k) => NAMES[k]).join(", ")} jump.`);
  if (slump) add("slump", "Lost summer", 0.4, "Low confidence and little joy in the gym: growth stalls.");

  // apply
  const ch = {};
  const decline = 1 + Math.max(0, (C.mileage || 0) - 12000) / 20000;
  if (g < 0 && decline > 1.01) add("mileage", "Miles on the legs", decline, `${Math.round(C.mileage).toLocaleString("en-US")} career minutes: the body ages faster.`);
  for (const k of KEYS) {
    const v = C.attrs[k], cap = ceilingOf(C, k);
    let delta;
    if (g > 0) {
      const room = clamp((cap - v) / 10, 0.1, 1); // growth slows near the ceiling
      delta = g * potential * (0.7 + rnd() * 0.6) * ((BOOST[C.arch] || []).includes(k) ? 1.15 : 1) * minutes * usage[k] * level * coach * work * health
        * (STAFF.skills.attrs.includes(k) && staff.skills ? 1.12 : 1) * (STAFF.strength.attrs.includes(k) && staff.strength ? 1.12 : 1)
        * (breakout?.includes(k) ? 1.8 : 1) * (slump ? 0.4 : 1) * planMult(C, k) * room;
      if (k === "iq") delta += 0.4;
      if (mentor && (k === mentor.attr || k === "iq")) delta += (k === "iq" ? 0.5 : 0.8) * room;
      if (v >= cap) delta = Math.min(delta, 0.1);
    } else {
      delta = g * (0.7 + rnd() * 0.6) * (k === "ath" ? 1.8 : k === "iq" ? 0.3 : 1) * decline
        * (staff.strength && STAFF.strength.attrs.includes(k) ? 0.75 : 1) * (staff.nutrition ? 0.85 : 1) * (1.1 - (C.work ?? 55) / 100 * 0.2);
      if (k === "iq" && g === 0) delta = 0.2;
    }
    C.attrs[k] = clamp(Math.round((v + delta) * 10) / 10, 20, 99);
    ch[k] = r1(C.attrs[k] - v);
  }
  if (mentor) add("mentor", "Mentor", 1, `${mentor.name} (${mentor.age}) took you under his wing: ${NAMES[mentor.attr]} and IQ.`);
  // rushing back from injuries leaves a mark
  if (d.rushed) {
    const loss = 0.6 * d.rushed;
    C.attrs.ath = Math.max(20, r1(C.attrs.ath - loss)); ch.ath = r1(ch.ath - loss);
    add("rushed", "Rushed comebacks", -loss, `Came back early ${d.rushed} time${d.rushed > 1 ? "s" : ""}: athleticism −${loss}.`);
  }
  C.age++;
  ageWeight(C);
  C.scouted = (C.scouted || 0) + 1;
  const report = { age: C.age, ch, factors, breakout, slump, trait: C.scouted >= 2 ? C.trait : null, ranges: Object.fromEntries(KEYS.map((k) => [k, scoutRange(C, k)])), growthPhase: g > 0 ? "growing" : g === 0 ? "peak" : "declining" };
  C.lastDev = report;
  return report;
}
const NAMES = { sht: "Mid-range", thr: "Three-point", fin: "Finishing", pas: "Passing", def: "Defense", reb: "Rebounding", ath: "Athleticism", iq: "Basketball IQ" };

/** Training points after a game: a good game earns one, a great game two; a coasting player sometimes loses it. */
export function gameTrainingPoints(C, gs, expected, rnd = Math.random) {
  let tp = (gs >= expected ? 1 : 0) + (gs >= expected * 1.6 ? 1 : 0);
  if (C.staff?.skills && rnd() < 0.3) tp++;
  if ((C.work ?? 55) < 35 && tp && rnd() < 0.3) tp--;
  return tp;
}
/** Staff wages for a season. */
export const staffCost = (C) => Object.keys(STAFF).reduce((s, id) => s + (C.staff?.[id] ? STAFF[id].cost : 0), 0);

// ---------------------------------------------------------------- the weekly training plan
// The practice week split between four areas and rest. The share an area gets speeds (or slows) the summer
// growth of its attributes; rest lowers the injury risk and the wear on your legs.
export const PLAN_AREAS = {
  shoot: { name: "Shooting", attrs: ["sht", "thr"] },
  finish: { name: "Finishing & strength", attrs: ["fin", "reb"] },
  play: { name: "Playmaking & IQ", attrs: ["pas", "iq"] },
  def: { name: "Defense & athleticism", attrs: ["def", "ath"] },
  rest: { name: "Rest & recovery", attrs: [] },
};
export const PLAN_PRESETS = {
  balanced: { name: "Balanced", plan: { shoot: 20, finish: 20, play: 20, def: 20, rest: 20 } },
  shooter: { name: "Shooter", plan: { shoot: 45, finish: 10, play: 15, def: 15, rest: 15 } },
  guard: { name: "Playmaker", plan: { shoot: 25, finish: 10, play: 40, def: 10, rest: 15 } },
  big: { name: "Big man", plan: { shoot: 5, finish: 40, play: 10, def: 30, rest: 15 } },
  stopper: { name: "Stopper", plan: { shoot: 10, finish: 15, play: 10, def: 50, rest: 15 } },
  recovery: { name: "Recovery", plan: { shoot: 15, finish: 15, play: 15, def: 15, rest: 40 } },
};
export const PLAN_MAX = 60;
export const planOf = (C) => C.plan || PLAN_PRESETS.balanced.plan;
/** Move 5% into (+1) or out of (-1) an area; rest takes up the difference. Returns false if it can't. */
export function stepPlan(C, area, dir) {
  const p = { ...planOf(C) };
  if (area === "rest") return false;
  const v = p[area] + 5 * dir, rest = p.rest - 5 * dir;
  if (v < 0 || v > PLAN_MAX || rest < 0 || rest > PLAN_MAX) return false;
  p[area] = v; p.rest = rest; C.plan = p;
  return true;
}
const areaOf = (k) => Object.keys(PLAN_AREAS).find((a) => PLAN_AREAS[a].attrs.includes(k));
/** Growth multiplier from the plan: 20% of the week is neutral, 45% gives about +15%, 5% about -9%. */
export const planMult = (C, k) => 0.88 + Math.min(planOf(C)[areaOf(k)] || 0, PLAN_MAX) / 100 * 0.6;
export const planInjury = (C) => clamp(1.25 - planOf(C).rest / 100 * 1.5, 0.7, 1.3);
export const planWear = (C) => clamp(1.1 - planOf(C).rest / 100, 0.7, 1.1);

// ---------------------------------------------------------------- elite camps abroad (once a summer, expensive)
// They don't just add points: two weeks with the best trainers stretch your ceiling, and can teach a move.
export const ELITE_CAMPS = {
  shooting: { name: "Shooting lab (USA)", attrs: ["thr", "sht"], cost: 30000, move: "stepback", desc: "Thousands of tracked shots a day." },
  bigs: { name: "Big-man camp (USA)", attrs: ["fin", "reb"], cost: 28000, move: "postup", desc: "Footwork, hooks and positioning in the paint." },
  performance: { name: "Performance institute", attrs: ["ath", "def"], cost: 32000, move: "chasedown", desc: "Speed, power and movement science." },
  playmaking: { name: "Point-guard school (Spain)", attrs: ["pas", "iq"], cost: 26000, move: "nolook", desc: "Reading the pick and roll like a European veteran." },
};
export const eliteAllowed = (C) => C.age <= 33 && C.eliteSeason !== C.seasonNo;
export function eliteCamp(C, id, rnd = Math.random) {
  const camp = ELITE_CAMPS[id];
  if (!camp || !eliteAllowed(C) || (C.money || 0) < camp.cost) return null;
  ensureDev(C);
  C.money -= camp.cost; C.eliteSeason = C.seasonNo;
  const gains = {};
  for (const k of camp.attrs) {
    C.ceil[k] = Math.min(99, C.ceil[k] + 2); // the ceiling stretches a little
    const g = 2 + Math.round(rnd() * 2);
    const to = Math.max(C.attrs[k], Math.min(C.attrs[k] + g, trainLimit(C, k)));
    gains[k] = r1(to - C.attrs[k]); C.attrs[k] = to;
  }
  // the camp's move, if you're close enough to it
  let move = null;
  const m = MOVES[camp.move];
  if (m && !(C.moves || []).includes(camp.move) && Object.entries(m.need).every(([k, v]) => C.attrs[k] >= v - 8) && heightOk(C, m)) {
    (C.moves ||= []).push(camp.move); move = camp.move;
  }
  return { gains, move };
}

// ---------------------------------------------------------------- signature moves
// Unlocked by what you do on the court (career reps) and your attributes, then learned with training points.
// They change your numbers a little and show up in the play-by-play of your games.
export const MOVES = {
  stepback: { name: "Step-back three", kind: "three", need: { thr: 74 }, reps: { tpa: 250 }, desc: "More threes, and they fall more often." },
  eurostep: { name: "Euro step", kind: "rim", need: { fin: 72, ath: 66 }, reps: { fga2: 350 }, desc: "Better finishing at the rim." },
  postup: { name: "Post hook", kind: "rim", need: { fin: 70 }, height: [200, 999], reps: { fga2: 300 }, desc: "Score over smaller defenders; a few more rebounds." },
  floater: { name: "Floater", kind: "mid", need: { sht: 70 }, height: [0, 196], reps: { fga2: 300 }, desc: "A soft shot over the bigs." },
  fadeaway: { name: "Fadeaway", kind: "mid", need: { sht: 78, iq: 70 }, reps: { fga2: 500 }, desc: "Hard to block, deadly late in close games." },
  nolook: { name: "No-look pass", kind: "pass", need: { pas: 76 }, reps: { ast: 200 }, desc: "More assists." },
  chasedown: { name: "Chase-down block", kind: "block", need: { ath: 75, def: 68 }, reps: { stops: 80 }, desc: "More blocks in transition." },
  pickpocket: { name: "Pickpocket", kind: "steal", need: { def: 74, iq: 68 }, reps: { stops: 100 }, desc: "More steals." },
};
export const MOVE_COST = 10;
const REP_NAMES = { tpa: "threes attempted", fga2: "two-point shots", ast: "assists", stops: "steals + blocks" };
const heightOk = (C, m) => !m.height || (C.height >= m.height[0] && C.height <= m.height[1]);
/** Can you learn this move now? missing: what's still needed. */
export function moveStatus(C, id) {
  const m = MOVES[id], reps = C.reps || {};
  if ((C.moves || []).includes(id)) return { learned: true, ok: false, missing: [] };
  const missing = [];
  if (!heightOk(C, m)) missing.push(m.height[0] > 0 ? `Height ${m.height[0]} cm or more` : `Height up to ${m.height[1]} cm`);
  for (const [k, v] of Object.entries(m.need)) if (C.attrs[k] < v) missing.push(`${NAMES[k]}: ${v} (now ${Math.floor(C.attrs[k])})`);
  for (const [k, v] of Object.entries(m.reps)) if ((reps[k] || 0) < v) missing.push(`${v} ${REP_NAMES[k]} (now ${Math.round(reps[k] || 0)})`);
  return { learned: false, ok: !missing.length, missing };
}
export function learnMove(C, id) {
  if (!moveStatus(C, id).ok || C.tp < MOVE_COST) return false;
  C.tp -= MOVE_COST; (C.moves ||= []).push(id);
  return true;
}
/** Your moves for the game engine: small number changes, and names for the play-by-play. */
export function moveEffects(C) {
  const has = (id) => (C.moves || []).includes(id);
  return {
    p3: has("stepback") ? 0.012 : 0, s3: has("stepback") ? 1.12 : 1,
    p2: (has("eurostep") ? 0.012 : 0) + (has("postup") ? 0.012 : 0) + (has("floater") ? 0.01 : 0) + (has("fadeaway") ? 0.008 : 0),
    clutch: has("fadeaway") ? 0.5 : 0, apg: has("nolook") ? 1.08 : 1, bpg: has("chasedown") ? 0.25 : 0, spg: has("pickpocket") ? 0.2 : 0, rpg: has("postup") ? 0.3 : 0,
    names: { three: has("stepback") ? "stepback" : null, rim: has("eurostep") ? "eurostep" : has("postup") ? "postup" : null,
      mid: has("fadeaway") ? "fadeaway" : has("floater") ? "floater" : null, pass: has("nolook"), block: has("chasedown"), steal: has("pickpocket") },
  };
}

// ---------------------------------------------------------------- the body: weight
/** A normal playing weight for your height (kg). */
export const idealWeight = (C) => Math.round(23.3 * (C.height / 100) ** 2);
export const BODY_PLANS = { bulk: { name: "Bulk up", kg: 3 }, keep: { name: "Keep it", kg: 0 }, slim: { name: "Slim down", kg: -3 } };
/** What the extra (or missing) kilos do: stronger in the paint, slower on the floor. */
export function bodyEffects(C) {
  const d = (C.weight ?? idealWeight(C)) - idealWeight(C);
  const big = ["PF", "C"].includes(C.pos);
  return { reb: d * 0.45, fin: d * 0.25, def: big ? d * 0.2 : d * -0.1, ath: -d * 0.55 * (C.staff?.strength && d > 0 ? 0.5 : 1) };
}
/** The summer's body plan takes effect when the season starts; after 28 the kilos creep up unless a nutritionist watches. */
export function applyBody(C) {
  const ideal = idealWeight(C);
  C.weight ??= ideal;
  const kg = BODY_PLANS[C.bodyPlan || "keep"]?.kg || 0;
  C.weight = clamp(C.weight + kg, ideal - 8, ideal + 12);
  C.bodyPlan = "keep";
}
export function ageWeight(C) { if (C.age >= 28 && !C.staff?.nutrition) C.weight = Math.min(idealWeight(C) + 12, (C.weight ?? idealWeight(C)) + 0.6); }
