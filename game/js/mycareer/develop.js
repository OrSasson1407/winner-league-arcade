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
  if (line.dnp) { d.dnp++; return; }
  d.gp++; d.min += line.min; d.gs += gs;
  d.tpa += line.tpa || 0; d.fga2 += (line.fga || 0) - (line.tpa || 0); d.fta += line.fta || 0;
  d.ast += line.ast || 0; d.reb += line.reb || 0; d.stops += (line.stl || 0) + (line.blk || 0);
  C.mileage = (C.mileage || 0) + line.min * (C.staff?.nutrition ? 0.8 : 1);
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
        * (breakout?.includes(k) ? 1.8 : 1) * (slump ? 0.4 : 1) * room;
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
