// Season simulator for drafted teams: they join the real league of a chosen season, play a
// double round-robin, then playoffs (top 8: best-of-3 quarter-finals and semi-finals, one-game
// final). Results are random (it's a game); real teams' strength and rosters come from their
// real players that season. Box scores are generated per game from each player's real
// per-game profile, deterministically from the game's seed (same game = same box score).
import { H, isPlayable, playersById, seededRng } from "../data.js";
import { DEFAULT_TACTICS, profileFromSeason, simulateGame } from "../shared/gameSim.js";


/** Real rosters, team strength and games over one dataset ({ H, isPlayable, playersById }): the chosen league's, wl.js for My Career, or a room's league on the server. */
export function rosterTools(D) {
  function realRoster(season, teamId) {
    const best = new Map();
    for (const ps of D.H.getPlayersByTeam(teamId, season)) {
      if (!D.isPlayable(ps, 8)) continue;
      const cur = best.get(ps.player_id);
      if (!cur || ps.stats.games > cur.stats.games) best.set(ps.player_id, ps);
    }
    return [...best.values()].sort((a, b) => (b.stats.mpg ?? 0) - (a.stats.mpg ?? 0));
  }
  /** Strength of a real team-season: 80% starting five (top 5 by minutes) + 20% next three. */
  function realTeamStrength(season, teamId, roster = realRoster(season, teamId)) {
    if (!roster.length) return 70;
    const avg = (xs) => xs.reduce((s, x) => s + x.rating_mock, 0) / xs.length;
    const five = roster.slice(0, 5), bench = roster.slice(5, 8);
    return bench.length ? 0.8 * avg(five) + 0.2 * avg(bench) : avg(five);
  }
  /** A team for the game engine: its players (real per-game numbers), strength, game plan and minutes plan. */
  function simTeam(t) {
    if (t._sim) return t._sim;
    const players = (t.roster || []).filter(Boolean).slice(0, 10).map((ps) => profileFromSeason(ps, D.playersById.get(ps.player_id)?.name ?? ps.player_id));
    // the same person drafted twice (different seasons) needs distinct ids in the box score
    const seen = new Map();
    players.forEach((p) => { const n = seen.get(p.id) || 0; seen.set(p.id, n + 1); if (n) p.id = `${p.id}#${n}`; });
    return (t._sim = { name: t.name, id: t.id, strength: t.strength, players, tactics: { ...DEFAULT_TACTICS, ...(t.tactics || {}) }, minutes: t.minutes || null });
  }
  /** A real team-season as a side for the engine: the server and the browser build it the same way, so a seed replays the same game. */
  function teamSeasonSide(season, teamId, name, tactics) {
    return { name, id: teamId, strength: realTeamStrength(season, teamId), roster: realRoster(season, teamId).slice(0, 9), drafted: false, tactics: tactics || undefined };
  }
  /** Run (or re-run) a game through the engine. The same seed and teams always give the same game. */
  function runGame(home, away, seed, neutral, events = false) {
    return simulateGame(simTeam(home), simTeam(away), { rnd: seededRng("g-" + seed), neutral, events, quarter: nbaGame(home, away) ? 720 : 600 });
  }
  function playGame(home, away, rnd, neutral = false) {
    const seed = Math.floor(rnd() * 1e9);
    const r = runGame(home, away, seed, neutral);
    const [hs, as] = r.score;
    return { id: ++gameSeq, seed, home, away, hs, as, neutral, winner: hs > as ? home : away, ot: r.ot, quarters: r.quarters };
  }
  return { realRoster, realTeamStrength, simTeam, teamSeasonSide, runGame, playGame };
}
let gameSeq = 0;
/** Two all-NBA rosters play NBA length (four 12-minute quarters); anything else plays FIBA's four 10s. */
const nbaGame = (...teams) => teams.every((t) => { const r = (t.roster || []).filter(Boolean); return r.length && r.every((ps) => ps.league === "nba"); });
export const { realRoster, realTeamStrength, simTeam, teamSeasonSide, runGame, playGame } = rosterTools({ H, isPlayable, playersById });
/** The full game (events, box score, momentum) for the game screen. */
export const simOf = (game) => runGame(game.home, game.away, game.seed, game.neutral, true);

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
/** Box score for a simulated game, from the game engine (deterministic: the same game every time). */
export function boxScore(game) {
  const r = runGame(game.home, game.away, game.seed, game.neutral);
  const lines = (side) => r.box[side].filter((l) => l.min > 0).map((l) => ({ ...l, player_id: l.id.split("#")[0] })).sort((a, b) => b.min - a.min);
  return { home: lines(0), away: lines(1) };
}
