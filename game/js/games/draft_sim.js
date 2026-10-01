// Season simulator for drafted teams: they join the real league of a chosen season, play a
// double round-robin, then playoffs (top 8: best-of-3 quarter-finals and semi-finals, one-game
// final). Results are random (it's a game); real teams' strength and rosters come from their
// real players that season. Box scores are generated per game from each player's real
// per-game profile, deterministically from the game's seed (same game = same box score).
import { H, isPlayable, playersById, seededRng } from "../data.js";

const HOME_EDGE = 1.5;
const SCALE = 4; // rating points per "e" of win odds

function realRoster(season, teamId) {
  const best = new Map();
  for (const ps of H.getPlayersByTeam(teamId, season)) {
    if (!isPlayable(ps, 8)) continue;
    const cur = best.get(ps.player_id);
    if (!cur || ps.stats.games > cur.stats.games) best.set(ps.player_id, ps);
  }
  return [...best.values()].sort((a, b) => (b.stats.mpg ?? 0) - (a.stats.mpg ?? 0));
}

/** Strength of a real team-season: 80% starting five (top 5 by minutes) + 20% next three. */
export function realTeamStrength(season, teamId, roster = realRoster(season, teamId)) {
  if (!roster.length) return 70;
  const avg = (xs) => xs.reduce((s, x) => s + x.rating_mock, 0) / xs.length;
  const five = roster.slice(0, 5), bench = roster.slice(5, 8);
  return bench.length ? 0.8 * avg(five) + 0.2 * avg(bench) : avg(five);
}

let gameSeq = 0;
export function playGame(home, away, rnd, neutral = false) {
  const edge = neutral ? 0 : HOME_EDGE;
  const p = 1 / (1 + Math.exp(-((home.strength + edge) - away.strength) / SCALE));
  const homeWins = rnd() < p;
  const winner = homeWins ? home : away;
  const winScore = Math.round(76 + rnd() * 18 + (winner.strength - 82) * 0.35);
  const margin = 1 + Math.round(rnd() * rnd() * 24);
  const [hs, as] = homeWins ? [winScore, winScore - margin] : [winScore - margin, winScore];
  return { id: ++gameSeq, seed: Math.floor(rnd() * 1e9), home, away, hs, as, neutral, winner: homeWins ? home : away };
}

function series(hi, lo, bestOf, rnd, label) {
  const need = Math.ceil(bestOf / 2);
  const games = [];
  let wh = 0, wl = 0;
  for (let g = 0; wh < need && wl < need; g++) {
    const hiHome = g % 2 === 0; // higher seed hosts games 1 and 3
    const game = bestOf === 1 ? playGame(hi, lo, rnd, true) : hiHome ? playGame(hi, lo, rnd) : playGame(lo, hi, rnd);
    game.label = `${label}${bestOf > 1 ? `, game ${g + 1}` : ""}`;
    games.push(game);
    if (game.winner === hi) wh++; else wl++;
  }
  return { hi, lo, wins: [wh, wl], games, winner: wh > wl ? hi : lo, label };
}

/**
 * drafted: [{ name, strength, roster: [player-season...] }]
 * Returns standings, every game of the drafted teams, the playoff bracket and the champion.
 */
export function simulateSeason(season, drafted, rnd = Math.random) {
  const real = H.getTeamsBySeason(season).map((t) => {
    const roster = realRoster(season, t.team_id);
    return { id: t.team_id, name: t.team_name, strength: realTeamStrength(season, t.team_id, roster), roster: roster.slice(0, 9), drafted: false };
  });
  const teams = [...real, ...drafted.map((d, i) => ({ id: `drafted_${i}`, name: d.name, strength: d.strength, roster: d.roster, drafted: true }))];
  const rec = new Map(teams.map((t) => [t.id, { team: t, w: 0, l: 0, pf: 0, pa: 0 }]));
  const draftedGames = new Map(teams.filter((t) => t.drafted).map((t) => [t.id, []]));
  for (const a of teams) {
    for (const b of teams) {
      if (a === b) continue; // each ordered pair = one home game for a
      const g = playGame(a, b, rnd);
      g.label = "Regular season";
      const ra = rec.get(a.id), rb = rec.get(b.id);
      ra.pf += g.hs; ra.pa += g.as; rb.pf += g.as; rb.pa += g.hs;
      if (g.hs > g.as) { ra.w++; rb.l++; } else { rb.w++; ra.l++; }
      if (a.drafted) draftedGames.get(a.id).push(g);
      if (b.drafted) draftedGames.get(b.id).push(g);
    }
  }
  const table = [...rec.values()].sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa));
  const seeds = table.slice(0, 8).map((r) => r.team);
  const qf = [[0, 7], [3, 4], [1, 6], [2, 5]].map(([a, b], i) => series(seeds[a], seeds[b], 3, rnd, `Quarter-final ${i + 1}`));
  const seedOf = (t) => seeds.indexOf(t);
  const pairUp = (s1, s2, label) => {
    const [a, b] = seedOf(s1.winner) < seedOf(s2.winner) ? [s1.winner, s2.winner] : [s2.winner, s1.winner];
    return series(a, b, 3, rnd, label);
  };
  const sf = [pairUp(qf[0], qf[1], "Semi-final 1"), pairUp(qf[2], qf[3], "Semi-final 2")];
  const final = pairUp(sf[0], sf[1], "Final");
  final.games = [];
  const fg = playGame(final.hi, final.lo, rnd, true);
  fg.label = "Final";
  final.games.push(fg);
  final.wins = fg.winner === final.hi ? [1, 0] : [0, 1];
  final.winner = fg.winner;
  return { season, table, seeds, draftedGames, playoffs: { qf, sf, final }, champion: final.winner };
}

// ---------------------------------------------------------------- box scores
function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

function teamLines(team, points, rnd) {
  const roster = team.roster.slice(0, 9);
  const st = (ps, k) => ps.stats?.[k] ?? 0;
  const mins = allocate(200, roster.map((ps) => Math.max(4, st(ps, "mpg")) * (0.85 + rnd() * 0.3)));
  const pts = allocate(points, roster.map((ps, i) => Math.max(0.5, st(ps, "ppg")) * (0.5 + rnd()) * (mins[i] / Math.max(1, st(ps, "mpg") || mins[i]))));
  const rebT = Math.round(roster.reduce((s, ps) => s + st(ps, "rpg"), 0) * (0.8 + rnd() * 0.4));
  const astT = Math.round(roster.reduce((s, ps) => s + st(ps, "apg"), 0) * (0.8 + rnd() * 0.4));
  const reb = allocate(rebT, roster.map((ps) => Math.max(0.3, st(ps, "rpg")) * (0.5 + rnd())));
  const ast = allocate(astT, roster.map((ps) => Math.max(0.2, st(ps, "apg")) * (0.5 + rnd())));
  return roster.map((ps, i) => ({
    player_id: ps.player_id, name: playersById.get(ps.player_id)?.name ?? ps.player_id,
    pos: ps.position || "", min: mins[i], pts: pts[i], reb: reb[i], ast: ast[i],
  })).sort((a, b) => b.min - a.min);
}

/** Deterministic box score for a simulated game. */
export function boxScore(game) {
  const rnd = seededRng("box-" + game.seed);
  return { home: teamLines(game.home, game.hs, rnd), away: teamLines(game.away, game.as, rnd) };
}

/**
 * Play-by-play events for the live view, consistent with the box score:
 * each player's points are split into 3s, 2s and free throws, spread over 40 minutes.
 */
export function playByPlay(game, box) {
  const rnd = seededRng("pbp-" + game.seed);
  const events = [];
  for (const side of ["home", "away"]) {
    const lines = box[side];
    const assisters = lines.flatMap((l) => Array(l.ast).fill(l.name));
    for (const l of lines) {
      let p = l.pts;
      while (p > 0) {
        let v = p >= 3 && rnd() < 0.3 ? 3 : p >= 2 ? 2 : 1;
        if (v === 1 && p >= 2 && rnd() < 0.5) v = 2;
        const t = Math.floor(rnd() * 2399) + 1;
        let text = v === 3 ? `${l.name} hits a three` : v === 2 ? `${l.name} scores${rnd() < 0.25 ? " on a layup" : rnd() < 0.3 ? " with a dunk" : ""}` : `${l.name} makes a free throw`;
        if (v > 1 && assisters.length && rnd() < 0.55) {
          const a = assisters.splice(Math.floor(rnd() * assisters.length), 1)[0];
          if (a !== l.name) text += ` (assist ${a})`;
        }
        events.push({ t, side, v, text });
        p -= v;
      }
    }
  }
  return events.sort((a, b) => a.t - b.t);
}
