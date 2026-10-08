// Career Path rules shared by the browser game and the online server (no DOM here).
import * as DATA from "../data.js";
import { pick, seasonYear } from "../dataApi.js";


/** The rules over one league's data (the browser uses the chosen league; the online server one per room). */
export function makeCareerLogic(D) {
  const { careerSummary, namedPlayers } = D;
  // Players whose path is interesting: at least 3 stints with regular-season games and 2+ clubs.
  function eligible() {
    return namedPlayers.filter((p) => {
      const s = careerSummary(p.player_id);
      const playedTeams = new Set(s.played.map((r) => r.team_id));
      const long = s.totalGames >= 40 || (s.played.every((r) => r.mock) && s.played.length >= 4); // EuroLeague: no real games counts
      return s.played.length >= 3 && playedTeams.size >= 2 && long;
    });
  }

  // Decoys: players who shared a club with the target in overlapping years (plausible wrong answers).
  function decoys(target, pool, n = 3, rnd = Math.random) {
    const t = careerSummary(target.player_id);
    const tFrom = seasonYear(t.firstSeason), tTo = seasonYear(t.lastSeason);
    const scored = [];
    for (const p of pool) {
      if (p.player_id === target.player_id) continue;
      const s = careerSummary(p.player_id);
      const shared = s.teams.filter((x) => t.teams.includes(x)).length;
      const overlap = seasonYear(s.firstSeason) <= tTo + 2 && seasonYear(s.lastSeason) >= tFrom - 2;
      if (shared && overlap) scored.push({ p, score: shared + (p.primary_position === target.primary_position ? 1 : 0) + rnd() });
    }
    scored.sort((a, b) => b.score - a.score);
    const out = scored.slice(0, n).map((x) => x.p);
    while (out.length < n) {
      const r = pick(pool, rnd);
      if (r.player_id !== target.player_id && !out.includes(r)) out.push(r);
    }
    return out;
  }
  return { eligible, decoys };
}
export const { eligible, decoys } = makeCareerLogic(DATA);
