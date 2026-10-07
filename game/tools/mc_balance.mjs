// My Career balance check: simulates many whole careers with a simple autopilot and prints how players
// develop (peak overall, when they peak, how fast they decline). Run: node game/tools/mc_balance.mjs [careers] [style]
// style: "good" (starter minutes, works hard, hires staff), "lazy" (parties, no staff), or "mixed" (default).
import * as E from "../js/mycareer/engine.js";
import { PLAYED_SEASONS, db } from "../js/data.js";

const N = Number(process.argv[2]) || 60;
const STYLE = process.argv[3] || "mixed";
const POS = ["PG", "SG", "SF", "PF", "C"], HEIGHT = { PG: 186, SG: 193, SF: 200, PF: 205, C: 211 };
const ARCH = Object.keys(E.ARCHETYPES);
const W = { PG: ["pas", "thr", "iq", "def"], SG: ["thr", "sht", "fin", "def"], SF: ["fin", "def", "thr", "ath"], PF: ["reb", "fin", "def", "iq"], C: ["reb", "def", "fin", "ath"] };

function autoTrain(C) {
  for (let guard = 0; guard < 200; guard++) {
    const order = [...W[C.pos], ...Object.keys(E.ATTRS)];
    const k = order.find((a) => C.tp >= E.trainCost(C.attrs[a]) && E.train(C, a));
    if (!k) return;
  }
}
const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function career(i) {
  const pos = POS[i % 5], style = STYLE === "mixed" ? (i % 2 ? "good" : "lazy") : STYLE;
  const C = (E.newPlayer || E.createPlayer)({ name: "Sim " + i, pos, pos2: pos, height: HEIGHT[pos] + ((i * 7) % 9) - 4, arch: ARCH[i % ARCH.length], diff: i % 3 ? "star" : "hard",
    nat: i % 4 ? "Israel" : "United States", academy: db.teams[i % db.teams.length].team_id, debut: PLAYED_SEASONS[2 + (i % 5)] });
  const run = { style, ovr: [], ages: [] };
  E.academySeason(C, { focus: "balanced" }); autoTrain(C);
  E.academySeason(C, { focus: "balanced" }); autoTrain(C);
  let first = true;
  while (!C.retired && C.age < 37) {
    if (first || !C.contract || C.contract.left <= 0) {
      const offers = E.makeOffers(C, { homeGrown: first ? C.academy.club : null });
      const rank = { starter: 0, rotation: 1, bench: 2 };
      const o = offers.sort((a, b) => (style === "good" ? rank[a.role] - rank[b.role] : 0) || b.salary - a.salary)[0];
      E.sign(C, o); C.phase = "offseason"; first = false;
    }
    if (E.SUMMER_CAMPS) E.summerCamp(C, Object.keys(E.SUMMER_CAMPS)[i % 4]);
    if (style === "good" && C.staff) for (const id of ["nutrition", "strength", "skills"]) if (!C.staff[id] && C.money >= E.STAFF[id].cost) C.staff[id] = true;
    if (style === "good" && E.PLAN_PRESETS) {
      C.plan = { ...E.PLAN_PRESETS[{ PG: "guard", SG: "shooter", SF: "balanced", PF: "big", C: "big" }[pos]].plan };
      const camp = { PG: "playmaking", SG: "shooting", SF: "performance", PF: "bigs", C: "bigs" }[pos];
      if (C.money >= E.ELITE_CAMPS[camp].cost * 2) E.eliteCamp(C, camp);
      for (const id of Object.keys(E.MOVES)) E.learnMove(C, id);
    }
    E.startSeason(C); C.phase = "season";
    let g = 0;
    while (C.cur.phase === "regular" && g++ < 80) {
      E.playRound(C);
      if (C.injury?.pending) E.treatInjury(C, style === "lazy");
      if (style === "lazy" && Math.random() < 0.08 && E.lifestyle) E.lifestyle(C, "party");
      if (style === "good" && Math.random() < 0.08 && E.lifestyle) E.lifestyle(C, "gym");
    }
    E.simPlayoffs(C);
    E.endSeason(C);
    autoTrain(C);
    run.ovr.push(E.bestOverall(C)); run.ages.push(C.age);
  }
  const peak = Math.max(...run.ovr);
  return { style: `${style} · ${C.diff}`, peak, peakAge: run.ages[run.ovr.indexOf(peak)], at24: run.ovr[run.ages.indexOf(24)], at30: run.ovr[run.ages.indexOf(30)], at34: run.ovr[run.ages.indexOf(34)] };
}

const t0 = Date.now();
const res = Array.from({ length: N }, (_, i) => career(i));
for (const style of [...new Set(res.map((r) => r.style))]) {
  const rs = res.filter((r) => r.style === style);
  const col = (k) => rs.map((r) => r[k]).filter((v) => v != null);
  const line = (k) => `${k.padEnd(8)} p10 ${pct(col(k), 0.1)} · median ${pct(col(k), 0.5)} · p90 ${pct(col(k), 0.9)}`;
  console.log(`\n${style} (${rs.length} careers)`);
  for (const k of ["peak", "peakAge", "at24", "at30", "at34"]) console.log("  " + line(k));
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
