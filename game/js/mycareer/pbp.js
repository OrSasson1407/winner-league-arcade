// Play-by-play for one of your games, rebuilt deterministically from what the engine already decided:
// the quarter scores, your stat line and the game's seed. Used by the live view and the momentum chart.
// Court units: 10 per metre on a 28 x 15 m floor (0..280 x 0..150). Your team attacks the right basket.
import { seededRng } from "../data.js";

export const COURT = { w: 280, h: 150, hoopR: [264.25, 75], hoopL: [15.75, 75] };
export const QUARTER = 600; // seconds

function shotSpot(kind, rnd, right) {
  const [hx, hy] = COURT.hoopR;
  let x, y;
  if (kind === "ft") { x = hx - 58; y = hy; }
  else {
    const a = (rnd() - 0.5) * Math.PI * 0.95;
    const r = kind === "3" ? 69 + rnd() * 6 : 4 + 52 * rnd() * rnd();
    x = hx - r * Math.cos(a); y = hy + r * Math.sin(a);
    y = Math.max(8, Math.min(142, y));
    x = Math.min(x, 276);
  }
  return right ? [x, y] : [COURT.w - x, y];
}

/** Events sorted by time: { t, side (0 you/your team, 1 opponent), kind "2"|"3"|"ft", made, pts, me, x, y, score:[a,b] }. */
export function playByPlay(g) {
  const rnd = seededRng("mc-pbp-" + g.seed);
  const L = g.line || {};
  const out = [];
  // your shots, reconciled with your points (the engine can trim a line to keep the box score believable)
  const mine = [];
  if (L.min > 0) {
    let twos = Math.max(0, (L.fgm || 0) - (L.tpm || 0)), threes = L.tpm || 0, fts = L.ftm || 0;
    while (twos * 2 + threes * 3 + fts > L.pts) { if (twos) twos--; else if (fts) fts--; else threes--; }
    for (let i = 0; i < threes; i++) mine.push({ kind: "3", made: true, pts: 3 });
    for (let i = 0; i < twos; i++) mine.push({ kind: "2", made: true, pts: 2 });
    for (let i = 0; i < fts; i++) mine.push({ kind: "ft", made: true, pts: 1 });
    for (let i = 0; i < Math.max(0, (L.tpa || 0) - (L.tpm || 0)); i++) mine.push({ kind: "3", made: false, pts: 0 });
    for (let i = 0; i < Math.max(0, (L.fga || 0) - (L.fgm || 0) - Math.max(0, (L.tpa || 0) - (L.tpm || 0))); i++) mine.push({ kind: "2", made: false, pts: 0 });
    for (let i = 0; i < Math.max(0, (L.fta || 0) - (L.ftm || 0)); i++) mine.push({ kind: "ft", made: false, pts: 0 });
  }
  const used = [0, 0, 0, 0];
  const perQ = [[], [], [], []];
  for (const s of mine.sort((a, b) => b.pts - a.pts)) {
    let q;
    if (s.pts) {
      const room = [0, 1, 2, 3].map((i) => Math.max(0, g.q[0][i] - used[i] - s.pts + 1));
      const tot = room.reduce((a, b) => a + b, 0);
      if (!tot) continue;
      let u = rnd() * tot; q = 0; while (u >= room[q]) { u -= room[q]; q++; }
      used[q] += s.pts;
    } else q = Math.floor(rnd() * 4);
    perQ[q].push({ ...s, side: 0, me: true });
  }
  for (let i = 0; i < 4; i++) {
    for (const side of [0, 1]) {
      let rem = g.q[side][i] - (side === 0 ? used[i] : 0);
      let fg = 0;
      while (rem > 0) {
        const r = rnd();
        if (rem >= 3 && r < 0.3) { perQ[i].push({ side, kind: "3", made: true, pts: 3 }); rem -= 3; fg++; }
        else if (rem >= 2 && r < 0.86) { perQ[i].push({ side, kind: "2", made: true, pts: 2 }); rem -= 2; fg++; }
        else { perQ[i].push({ side, kind: "ft", made: true, pts: 1 }); rem -= 1; }
      }
      const misses = Math.round(fg * (0.95 + rnd() * 0.3)) - (side === 0 ? perQ[i].filter((e) => e.me && !e.made && e.kind !== "ft").length : 0);
      for (let k = 0; k < misses; k++) perQ[i].push({ side, kind: rnd() < 0.36 ? "3" : "2", made: false, pts: 0 });
    }
    const evs = perQ[i];
    const times = evs.map(() => i * QUARTER + 4 + rnd() * (QUARTER - 8)).sort((a, b) => a - b);
    for (let k = evs.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [evs[k], evs[j]] = [evs[j], evs[k]]; }
    evs.forEach((e, k) => { e.t = Math.round(times[k] * 10) / 10; });
    out.push(...evs);
  }
  out.sort((a, b) => a.t - b.t);
  const score = [0, 0];
  for (const e of out) {
    [e.x, e.y] = shotSpot(e.kind, rnd, e.side === 0);
    score[e.side] += e.pts;
    e.score = [...score];
  }
  return out;
}

/** Lead over time (your side minus theirs): [[t, lead], ...] from 0 to the final buzzer. */
export function leadSeries(events) {
  const pts = [[0, 0]];
  for (const e of events) if (e.pts) pts.push([e.t, e.score[0] - e.score[1]]);
  const last = pts[pts.length - 1];
  pts.push([4 * QUARTER, last[1]]);
  return pts;
}

/** Headline numbers for the momentum chart. */
export function momentumFacts(events) {
  let bigUs = 0, bigThem = 0, changes = 0, ties = 0, lastSign = 0;
  for (const e of events) {
    if (!e.pts) continue;
    const d = e.score[0] - e.score[1];
    bigUs = Math.max(bigUs, d); bigThem = Math.max(bigThem, -d);
    const s = Math.sign(d);
    if (s === 0 && lastSign !== 0) ties++;
    if (s !== 0 && lastSign !== 0 && s !== lastSign) changes++;
    if (s !== 0) lastSign = s;
  }
  return { bigUs, bigThem, changes, ties };
}

export const clockOf = (t) => {
  const q = Math.min(3, Math.floor(t / QUARTER));
  const left = Math.max(0, (q + 1) * QUARTER - t);
  return { q: q + 1, text: `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` };
};
