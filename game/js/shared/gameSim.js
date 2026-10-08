// Basketball game engine: a game is played possession by possession, so the score, the box score and
// the play-by-play all come from the same events. Pure and deterministic (pass a seeded rnd), shared by
// the browser and the online server.
//
// Players come from real per-game numbers (minutes, points, rebounds, assists, steals, blocks, FG%, 3P%,
// FT%). The data has no shot attempts, turnovers or fouls, so three-point volume, free-throw rate,
// turnovers and fouls are estimated from position and the numbers above (marked as estimates in the UI).

export const QUARTER = 600, OT = 300;
// team strength (the game's rating of a team-season) nudges shooting at both ends, so results line up
// with the strengths every competition in the arcade uses
const STRENGTH_K = 0.006;
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FAM = { PG: "G", SG: "G", SF: "W", PF: "B", C: "B" };

export const TACTICS = {
  pace: { slow: { label: "Slow", sec: 16.5 }, normal: { label: "Normal", sec: 14.2 }, fast: { label: "Fast", sec: 12.4 } },
  defense: { man: { label: "Man-to-man" }, zone: { label: "Zone" }, press: { label: "Full-court press" } },
  focus: { balanced: { label: "Balanced" }, star: { label: "Feed the star" }, paint: { label: "Attack the paint" }, threes: { label: "Shoot threes" } },
};
export const DEFAULT_TACTICS = { pace: "normal", defense: "man", focus: "balanced" };

/**
 * A player for the engine from a real player-season (or anything with the same fields).
 * ps: { player_id, position, rating_mock, stats: { mpg, ppg, rpg, apg, spg, bpg, fg_pct, fg3_pct, ft_pct } }
 */
export function profileFromSeason(ps, name) {
  const s = ps.stats || {};
  const pos = ps.position || "SF";
  return profile({ id: ps.player_id, name, pos, rating: ps.rating_mock ?? 75, mpg: s.mpg ?? 12, ppg: s.ppg ?? 3, rpg: s.rpg ?? 2, apg: s.apg ?? 1,
    spg: s.spg ?? 0.5, bpg: s.bpg ?? 0.2, fg: s.fg_pct, fg3: s.fg3_pct, ft: s.ft_pct });
}
/** Turn per-game numbers into the engine's per-minute weights and shooting odds. */
export function profile(p) {
  const fam = FAM[p.pos] || "W";
  const mpg = Math.max(4, p.mpg || 12);
  const has3 = p.p3 != null || (p.fg3 != null && p.fg3 > 5);
  const s3base = { G: 0.4, W: 0.36, B: 0.1 }[fam];
  const p3 = p.p3 ?? clamp(((has3 ? p.fg3 : 25) / 100) * 0.7 + 0.34 * 0.3, 0.2, 0.44); // small samples pulled toward the league average
  const s3 = p.s3 ?? (!has3 ? 0.03 : clamp(s3base * (p3 >= 0.35 ? 1.15 : p3 < 0.27 ? 0.55 : 1), 0.02, 0.6));
  const fgAll = clamp((p.fg ?? 44) / 100, 0.3, 0.68);
  const p2 = p.p2 ?? clamp((fgAll - s3 * p3) / (1 - s3), 0.38, 0.66);
  return {
    id: p.id, name: p.name, pos: p.pos, fam, rating: p.rating ?? 75, mpg, me: !!p.me, clutch: p.clutch || 0, foulRisk: p.foulRisk ?? 1, energy0: p.energy ?? 1, moves: p.moves || null,
    use: Math.max(0.04, (p.ppg || 1) / mpg), reb: Math.max(0.02, (p.rpg || 0.5) / mpg), ast: Math.max(0.01, (p.apg || 0.2) / mpg),
    stl: Math.max(0.004, (p.spg || 0.1) / mpg), blk: Math.max(0.002, (p.bpg || 0.05) / mpg),
    s3, p3, p2, ft: clamp((p.ft ?? 70) / 100, 0.45, 0.93), ftRate: { G: 0.24, W: 0.27, B: 0.34 }[fam], rim: { G: 0.38, W: 0.5, B: 0.72 }[fam],
  };
}

/**
 * Play a game.
 *   home, away: { name, players: [profile...], minutes?: { [id]: target minutes }, tactics?: {pace, defense, focus} }
 *   opts: { rnd, neutral, events (record the play-by-play), starters?: number of starters (default 5),
 *           quarter?: seconds per quarter (600, FIBA's 10 minutes; 720 for an NBA game) }
 * Returns { score: [h, a], quarters: [[...], [...]], ot, box: [lines, lines], team: [stats, stats], events, mvp, lead }
 */
export function simulateGame(home, away, { rnd = Math.random, neutral = false, events: record = false, quarter = QUARTER } = {}) {
  const T = [home, away].map((t, side) => setupTeam(t, side, quarter));
  const ev = record ? [] : null;
  const score = [0, 0], qs = [[], []];
  let t = 0, period = 0, poss = rnd() < 0.5 ? 0 : 1;
  const run = { side: -1, pts: 0 }, lead = [[0, 0]];
  const timeouts = [5, 5];
  const say = (e) => { if (ev) ev.push({ t: r1(t), period, score: [score[0], score[1]], ...e }); };

  const periods = () => 4;
  while (true) {
    const len = period < 4 ? quarter : OT;
    const start = t, end = t + len;
    T.forEach((x) => { x.fouls = 0; });
    const q0 = [score[0], score[1]];
    if (period > 0) T.forEach((x) => substitute(x, t, period, score, true, quarter));
    say({ type: "period", text: period < 4 ? `Start of Q${period + 1}` : `Overtime ${period - 3}` });
    while (t < end) {
      const off = T[poss], def = T[1 - poss];
      const clockLeft = end - t;
      const close = Math.abs(score[0] - score[1]) <= 5;
      const clutch = period >= 3 && clockLeft <= 120 && close;
      let dur = (TACTICS.pace[off.tac.pace]?.sec ?? 14.2) - (def.tac.defense === "press" ? 1 : 0) + (rnd() - 0.5) * 9;
      dur = clamp(dur, 5, 24);
      if (clockLeft < dur) dur = clockLeft;
      tickTime(T, dur);
      t += dur;
      const res = possession(off, def, poss, { rnd, clutch, homeEdge: neutral ? 0 : poss === 0 ? 0.012 : 0, run: run.side === poss ? run.pts : 0, say, t, score });
      if (res.pts) {
        score[poss] += res.pts;
        if (run.side === poss) run.pts += res.pts; else { run.side = poss; run.pts = res.pts; }
        lead.push([r1(t), score[0] - score[1]]);
        for (const x of T) for (const p of x.on) p.box.pm += x.side === poss ? res.pts : -res.pts;
        // the other team stops a run with a timeout
        if (run.pts >= 8 && timeouts[1 - poss] > 0 && t < end - 20) {
          timeouts[1 - poss]--;
          say({ type: "timeout", side: 1 - poss, text: `Timeout ${T[1 - poss].name} (${run.pts}-0 run)` });
          run.pts = 0;
          T.forEach((x) => substitute(x, t, period, score, true, quarter));
        }
      }
      if (!res.keep) poss = 1 - poss;
      if (res.dead) T.forEach((x) => substitute(x, t, period, score, false, quarter));
    }
    qs[0].push(score[0] - q0[0]); qs[1].push(score[1] - q0[1]);
    period++;
    say({ type: "period-end", text: `End of ${period <= 4 ? `Q${period}` : `overtime ${period - 4}`}: ${score[0]}-${score[1]}` });
    if (period >= periods() && score[0] !== score[1]) break;
    if (period >= 10) { score[rnd() < 0.5 ? 0 : 1]++; break; } // a safety stop for endless overtimes
  }
  const box = T.map((x) => x.players.map((p) => ({ ...p.box, min: Math.round(p.box.sec / 60), id: p.id, name: p.name, pos: p.pos, me: p.me, starter: p.starter })));
  const team = box.map((lines) => teamStats(lines));
  const win = score[0] > score[1] ? 0 : 1;
  const gs = (l) => l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.oreb + 0.3 * l.dreb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
  const mvpLine = box[win].slice().sort((a, b) => gs(b) - gs(a))[0];
  lead.push([r1(t), score[0] - score[1]]);
  return { score, quarters: qs, ot: Math.max(0, period - 4), length: t, quarter, box, team, events: ev, lead, mvp: mvpLine ? { side: win, id: mvpLine.id, name: mvpLine.name, line: mvpLine } : null };
}

// ---------------------------------------------------------------- teams, minutes, fatigue
function setupTeam(t, side, quarter = QUARTER) {
  const players = t.players.map((p) => ({ ...p, energy: p.energy0 ?? 1, box: blankLine(), onSince: 0, starter: false }));
  // minutes plan: real minutes per game (or the given plan), scaled so the team shares 200 minutes (240 in an NBA game)
  const gameMin = (4 * quarter) / 60;
  const plan = players.map((p) => t.minutes?.[p.id] ?? p.mpg);
  const sum = plan.reduce((a, b) => a + b, 0) || 1;
  players.forEach((p, i) => { p.target = Math.min(gameMin, (plan[i] * 5 * gameMin) / sum); });
  const order = players.slice().sort((a, b) => b.target - a.target);
  const on = pickFive(order, null);
  on.forEach((p) => { p.starter = true; });
  return { side, name: t.name, players, on, tac: { ...DEFAULT_TACTICS, ...(t.tactics || {}) }, fouls: 0, q: t.strength != null ? (t.strength - 85) * STRENGTH_K : 0 };
}
/** Five players from a ranked list, keeping at least one guard and one big when there are any. */
function pickFive(ranked, keep) {
  const out = keep ? keep.slice() : [];
  for (const p of ranked) if (out.length < 5 && !out.includes(p) && !p.out) out.push(p);
  const fams = (fam) => out.filter((p) => p.fam === fam).length;
  for (const need of ["G", "B"]) {
    if (fams(need) === 0) {
      const cand = ranked.find((p) => p.fam === need && !out.includes(p) && !p.out);
      const drop = out.slice().reverse().find((p) => p.fam !== need && fams(p.fam) > 1 && !(keep || []).includes(p));
      if (cand && drop) out[out.indexOf(drop)] = cand;
    }
  }
  return out;
}
function tickTime(T, dur) {
  for (const x of T) for (const p of x.players) {
    if (x.on.includes(p)) { p.box.sec += dur; p.energy = Math.max(0.3, p.energy - dur * 0.00042); }
    else p.energy = Math.min(1, p.energy + dur * 0.0011);
  }
}
/** Substitutions at dead balls: tired players and foul trouble sit, players behind on their minutes come in. */
function substitute(x, t, period, score, force, quarter = QUARTER) {
  const elapsed = Math.max(1, t);
  const owed = (p) => (p.target * 60 * elapsed) / (4 * quarter) - p.box.sec; // seconds behind the plan
  const foulLimit = [2, 3, 4, 5, 5][Math.min(period, 4)];
  const lateClose = period >= 3 && Math.abs(score[0] - score[1]) <= 8 && t % quarter > (period >= 4 ? 0 : quarter - 240);
  const want = (p) => !p.out && (p.box.pf < foulLimit || lateClose) && p.energy > 0.42;
  let changed = false;
  for (const p of x.on.slice()) {
    if (p.box.pf >= 5) p.out = true;
    const tired = p.energy < (lateClose ? 0.34 : 0.5);
    const sitFouls = p.box.pf >= foulLimit && !lateClose;
    const overPlan = owed(p) < (force ? -150 : -240) && !lateClose; // well past the minutes plan
    if (p.out || tired || sitFouls || overPlan) {
      const bench = x.players.filter((b) => !x.on.includes(b) && want(b) && (owed(b) > -120 || lateClose || p.out))
        .sort((a, b) => (lateClose ? b.target - a.target : owed(b) - owed(a)) || (b.fam === p.fam) - (a.fam === p.fam));
      const sub = bench.find((b) => b.fam === p.fam) || bench[0];
      if (sub || p.out) {
        x.on.splice(x.on.indexOf(p), 1);
        if (sub) x.on.push(sub);
        changed = true;
      }
    }
  }
  if (x.on.length < 5) { const fill = x.players.filter((p) => !x.on.includes(p) && !p.out).sort((a, b) => b.energy - a.energy); while (x.on.length < 5 && fill.length) x.on.push(fill.shift()); }
  return changed;
}
const blankLine = () => ({ sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, paint: 0, fb: 0 });

// ---------------------------------------------------------------- one possession
function weighted(list, w, rnd) {
  const ws = list.map(w);
  let x = rnd() * (ws.reduce((a, b) => a + b, 0) || 1);
  for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x <= 0) return list[i]; }
  return list[list.length - 1];
}
const eff = (p) => 0.9 + 0.1 * p.energy; // tired legs miss more
const defScore = (def) => def.on.reduce((s, p) => s + p.rating, 0) / def.on.length;
/** The player guarding the shooter: the same position if there is one on the floor, else the same group, else anyone. */
function defenderOf(shooter, def) {
  return def.on.find((q) => q.pos === shooter.pos) || def.on.find((q) => q.fam === shooter.fam) || def.on[0];
}
/**
 * One-on-one: how much the matchup moves the shooter's odds (centered on a league-average defender, at most ±5%).
 * A better-rated, quicker-handed (steals) defender, a shot-blocker near the rim, fresh legs, and size mismatches.
 */
function matchup(shooter, d, { three, rim }) {
  let m = (shooter.rating - d.rating) * 0.0012 // the better player wins the matchup a bit more often
    - (d.stl * 36 - 1.36) * 0.012 // active hands
    - (three ? 0 : (d.blk * 36 - 0.5) * (rim ? 0.03 : 0.012)) // rim protection
    + (1 - d.energy) * 0.04; // a tired defender
  if (three && d.fam === "B" && shooter.fam === "G") m += 0.02; // a big switched onto a guard at the arc
  if (rim && d.fam === "G" && shooter.fam === "B") m += 0.03; // a guard against a big in the paint
  return clamp(m, -0.05, 0.05);
}

function possession(off, def, side, ctx) {
  const { rnd, say } = ctx;
  const fast = off.fastbreak; off.fastbreak = false;
  // turnovers: pressure, the defense's hands, and who has the ball
  const stlPower = def.on.reduce((s, p) => s + p.stl, 0);
  let tovP = 0.112 + (def.tac.defense === "press" ? 0.035 : 0) + (stlPower - 0.15) * 0.45 + (off.tac.pace === "fast" ? 0.01 : 0) - (fast ? 0.04 : 0);
  tovP = clamp(tovP, 0.07, 0.22);
  if (rnd() < tovP) {
    const loser = weighted(off.on, (p) => p.use + p.ast * 1.4, rnd);
    loser.box.tov++;
    const stolen = rnd() < 0.55;
    if (stolen) {
      const thief = weighted(def.on, (p) => p.stl, rnd);
      thief.box.stl++;
      def.fastbreak = rnd() < 0.6;
      say({ type: "tov", side, pid: loser.id, by: thief.id, text: thief.moves?.steal && thief.box.stl % 2 ? `${thief.name} picks ${loser.name}'s pocket` : `${thief.name} steals it from ${loser.name}` });
    } else say({ type: "tov", side, pid: loser.id, text: `Turnover by ${loser.name}` });
    return { pts: 0, keep: false, dead: !stolen };
  }
  // non-shooting fouls put a team in the bonus
  if (rnd() < 0.1) {
    const fouler = weighted(def.on, (p) => (p.fam === "B" ? 1.3 : 1) * p.foulRisk, rnd);
    fouler.box.pf++; def.fouls++;
    if (def.fouls > 4) {
      const fouled = weighted(off.on, (p) => p.use, rnd);
      const pts = freeThrows(fouled, 2, rnd);
      say({ type: "ft", side, pid: fouled.id, pts, text: `${fouled.name} ${pts}/2 from the line (bonus)`, ...spot("ft", side, rnd) });
      return { pts, keep: false, dead: true };
    }
    say({ type: "foul", side: 1 - side, pid: fouler.id, text: `Foul on ${fouler.name}` });
  }
  // who shoots
  const best = off.on.reduce((a, b) => (b.use * b.rating > a.use * a.rating ? b : a));
  const shooter = weighted(off.on, (p) => {
    let w = p.use * (0.6 + p.energy * 0.4);
    if (off.tac.focus === "star" && p === best) w *= 1.7;
    if (off.tac.focus === "paint" && p.fam === "B") w *= 1.45;
    if (off.tac.focus === "threes") w *= 0.6 + p.s3 * 2.2;
    if (ctx.clutch && p === best) w *= 2.6;
    return w;
  }, rnd);
  // what kind of shot
  let s3 = shooter.s3 * (def.tac.defense === "zone" ? 1.25 : 1) * (off.tac.focus === "threes" ? 1.35 : off.tac.focus === "paint" ? 0.7 : 1);
  if (fast) s3 *= 0.5;
  const three = rnd() < clamp(s3, 0, 0.75);
  const rim = !three && (fast || rnd() < shooter.rim * (off.tac.focus === "paint" ? 1.2 : 1));
  // fouled on the shot
  const foulP = three ? 0.03 : shooter.ftRate * (rim ? 0.55 : 0.25);
  const dQ = (defScore(def) - 80) * 0.002; // a better defense lowers the odds
  const guard = defenderOf(shooter, def);
  const momentum = Math.min(0.03, ctx.run >= 6 ? 0.012 + (ctx.run - 6) * 0.003 : 0);
  let p = (three ? shooter.p3 : shooter.p2 + (rim ? 0.06 : -0.06)) * eff(shooter) - dQ + ctx.homeEdge + momentum
    + (shooter.rating - 80) * 0.002 + (ctx.clutch ? shooter.clutch * 0.02 : 0) + (fast ? 0.12 : 0)
    + (def.tac.defense === "zone" ? (three ? 0.01 : -0.025) : 0) + off.q - def.q
    + (def.tac.defense === "zone" ? 0.4 : 1) * matchup(shooter, guard, { three, rim }); // a zone guards areas, not players
  p = clamp(p, 0.12, 0.85);
  if (rnd() < foulP) {
    const fouler = weighted(def.on, (q) => (q.fam === "B" ? 1.4 : 1) * q.foulRisk, rnd);
    fouler.box.pf++; def.fouls++;
    const made = rnd() < p * 0.55;
    shooter.box.fga += made ? 1 : 0; if (three && made) shooter.box.tpa++;
    let pts = 0;
    if (made) { pts += three ? 3 : 2; shooter.box.fgm++; if (three) shooter.box.tpm++; shooter.box.pts += pts; if (rim) shooter.box.paint += pts; }
    pts += freeThrows(shooter, made ? 1 : three ? 3 : 2, rnd);
    say({ type: made ? (three ? "3" : "2") : "ft", side, pid: shooter.id, pts, made, andOne: made, fouler: fouler.id,
      text: made ? `${shooter.name} scores and gets fouled! (${pts} pts)` : `${shooter.name} fouled by ${fouler.name}, ${pts} from the line`, ...spot(made ? (three ? "3" : rim ? "rim" : "mid") : "ft", side, rnd) });
    return { pts, keep: false, dead: true };
  }
  // the shot
  shooter.box.fga++; if (three) shooter.box.tpa++;
  const blocker = !three && rnd() < def.on.reduce((s, q) => s + q.blk, 0) * (rim ? 1.6 : 0.6) ? weighted(def.on, (q) => q.blk, rnd) : null;
  const made = !blocker && rnd() < p;
  const where = spot(three ? "3" : rim ? "rim" : "mid", side, rnd);
  if (made) {
    const pts = three ? 3 : 2;
    shooter.box.fgm++; if (three) shooter.box.tpm++;
    shooter.box.pts += pts; if (rim) shooter.box.paint += pts; if (fast) shooter.box.fb += pts;
    const mates = off.on.filter((q) => q !== shooter);
    const assisted = rnd() < (three ? 0.86 : fast ? 0.6 : 0.5);
    const passer = assisted ? weighted(mates, (q) => q.ast, rnd) : null;
    if (passer) passer.box.ast++;
    // a signature move (your created player): named in every other make, without touching the dice
    const mv = shooter.moves && shooter.box.fgm % 2 ? (three ? shooter.moves.three : !fast && rim ? shooter.moves.rim : !three && !rim ? shooter.moves.mid : null) : null;
    const MOVE_TEXT = { stepback: "hits a step-back three", eurostep: "euro-steps in for the layup", postup: "scores with a post hook", floater: "drops in a floater", fadeaway: "hits the fadeaway" };
    const dunk = !three && !fast && rim ? rnd() < 0.3 : false; // rolled as always, so games without moves play out exactly as before
    const how = mv ? MOVE_TEXT[mv] : three ? "hits a three" : fast ? "finishes the fast break" : rim ? (dunk ? "dunks it" : "scores at the rim") : "hits the jumper";
    say({ type: three ? "3" : "2", side, pid: shooter.id, ast: passer?.id, def: guard.id, pts, made: true, fast, move: mv || undefined,
      text: `${shooter.name} ${how}${passer ? (passer.moves?.pass && passer.box.ast % 3 === 0 ? ` (no-look assist ${passer.name})` : ` (assist ${passer.name})`) : ""}`, ...where });
    return { pts, keep: false, dead: true };
  }
  if (blocker) blocker.box.blk++;
  // the rebound
  const oPow = off.on.reduce((s, q) => s + q.reb, 0), dPow = def.on.reduce((s, q) => s + q.reb, 0);
  const oReb = rnd() < clamp(0.26 * (oPow / Math.max(0.01, dPow)) ** 0.7 - (off.tac.pace === "fast" ? 0.02 : 0), 0.12, 0.42);
  const reb = oReb ? weighted(off.on, (q) => q.reb * (q === shooter ? 0.7 : 1), rnd) : weighted(def.on, (q) => q.reb, rnd);
  reb.box.reb++; if (oReb) reb.box.oreb++; else reb.box.dreb++;
  say({ type: "miss", side, pid: shooter.id, def: guard.id, made: false, blk: blocker?.id, reb: reb.id, oreb: oReb,
    text: `${shooter.name} misses${three ? " from deep" : ""}${blocker ? (blocker.moves?.block && blocker.box.blk % 2 ? ` (chase-down block by ${blocker.name})` : ` (blocked by ${blocker.name})`) : ""}, ${oReb ? `offensive rebound ${reb.name}` : `rebound ${reb.name}`}`, ...where });
  if (!oReb && rnd() < 0.18) def.fastbreak = true;
  return { pts: 0, keep: oReb, dead: false };
}
function freeThrows(p, n, rnd) {
  let made = 0;
  for (let i = 0; i < n; i++) { p.box.fta++; if (rnd() < p.ft * (0.94 + 0.06 * p.energy)) { p.box.ftm++; made++; } }
  p.box.pts += made;
  return made;
}
/** A shot location on a 28×15 m court (units of 10 cm): side 0 attacks the right basket. */
function spot(kind, side, rnd) {
  const hx = 264.25, hy = 75;
  let x, y;
  if (kind === "ft") { x = hx - 58; y = hy; }
  else {
    const a = (rnd() - 0.5) * Math.PI * 0.95;
    const r = kind === "3" ? 69 + rnd() * 6 : kind === "rim" ? 3 + rnd() * 12 : 20 + rnd() * 40;
    x = Math.min(276, hx - r * Math.cos(a)); y = clamp(hy + r * Math.sin(a), 8, 142);
  }
  return side === 0 ? { x, y } : { x: 280 - x, y };
}

function teamStats(lines) {
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const pct = (m, a) => (sum(a) ? r1((100 * sum(m)) / sum(a)) : 0);
  return { pts: sum("pts"), fg: `${sum("fgm")}/${sum("fga")}`, fgp: pct("fgm", "fga"), tp: `${sum("tpm")}/${sum("tpa")}`, tpp: pct("tpm", "tpa"), ft: `${sum("ftm")}/${sum("fta")}`, ftp: pct("ftm", "fta"),
    reb: sum("reb"), oreb: sum("oreb"), ast: sum("ast"), stl: sum("stl"), blk: sum("blk"), tov: sum("tov"), pf: sum("pf"), paint: sum("paint"), fb: sum("fb"),
    bench: lines.filter((l) => !l.starter).reduce((s, l) => s + l.pts, 0) };
}

/** Pre-game numbers for a team: season averages of the players who'll play the most. */
export function teamPreview(t) {
  const ps = t.players.slice().sort((a, b) => b.mpg - a.mpg).slice(0, 8);
  const per = (k) => r1(ps.reduce((s, p) => s + p[k] * p.mpg, 0)); // the rotation's per-game numbers added up
  return { rating: r1(ps.slice(0, 5).reduce((s, p) => s + p.rating, 0) / Math.min(5, ps.length || 1)), pts: per("use"), reb: per("reb"), ast: per("ast"),
    three: Math.round((ps.reduce((s, p) => s + p.s3 * p.use * p.mpg, 0) / Math.max(1, ps.reduce((s, p) => s + p.use * p.mpg, 0))) * 100), star: ps.slice().sort((a, b) => b.use * b.rating - a.use * a.rating)[0] };
}
