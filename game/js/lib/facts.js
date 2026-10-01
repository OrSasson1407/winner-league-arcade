// Fact of the day: real facts generated from the data (season leaders, careers, loyalty, journeymen).
import { H, PLAYED_SEASONS, careerSummary, isPlayable, namedPlayers, playersById, seededRng, teamName } from "../data.js";
import { fmt1, localDate } from "../ui.js";

let facts = null;

function build() {
  const out = [];
  const name = (pid) => playersById.get(pid).name;
  // season leaders (regular season, 10+ games)
  const LEAD = [
    ["ppg", "led the league in scoring with", "points per game"], ["rpg", "led the league in rebounding with", "rebounds per game"],
    ["apg", "led the league in assists with", "assists per game"], ["valuation_per_game", "had the league's best efficiency with", "VAL per game"],
  ];
  for (const s of PLAYED_SEASONS) {
    const recs = H.getPlayersBySeason(s).filter((r) => isPlayable(r, 10));
    for (const [k, verb, unit] of LEAD) {
      const top = recs.filter((r) => r.stats[k] !== null && r.stats[k] !== undefined).sort((a, b) => b.stats[k] - a.stats[k])[0];
      if (top) out.push({ pid: top.player_id, season: s, text: `In ${s}, ${name(top.player_id)} ${verb} ${fmt1(top.stats[k])} ${unit} for ${teamName(top.team_id)}.` });
    }
    const big = recs.filter((r) => r.stats.ppg >= 10 && r.stats.rpg >= 10).sort((a, b) => b.stats.ppg - a.stats.ppg)[0];
    if (big) out.push({ pid: big.player_id, season: s, text: `${name(big.player_id)} averaged a double-double in ${s}: ${fmt1(big.stats.ppg)} points and ${fmt1(big.stats.rpg)} rebounds a game for ${teamName(big.team_id)}.` });
  }
  // careers
  for (const p of namedPlayers) {
    const cs = careerSummary(p.player_id);
    if (cs.seasonsPlayed >= 11) out.push({ pid: p.player_id, text: `${p.name} has played ${cs.seasonsPlayed} regular seasons in the league since 2010-11, across ${cs.teams.length} club${cs.teams.length === 1 ? "" : "s"}.` });
    if (cs.teams.length >= 6) out.push({ pid: p.player_id, text: `Journeyman alert: ${p.name} has played for ${cs.teams.length} different clubs in the league: ${cs.teams.map(teamName).join(", ")}.` });
    const perClub = new Map();
    for (const r of cs.played) perClub.set(r.team_id, (perClub.get(r.team_id) || new Set()).add(r.season));
    for (const [tid, set] of perClub) if (set.size >= 8) out.push({ pid: p.player_id, text: `${p.name} spent ${set.size} seasons with ${teamName(tid)}, one of the most loyal careers since 2010-11.` });
    if (cs.totalGames >= 300) out.push({ pid: p.player_id, text: `${p.name} has played ${cs.totalGames} regular-season games in the league since 2010-11.` });
  }
  return out;
}

export function allFacts() { return (facts ??= build()); }

/** Today's fact (same for everyone on a given day); offset > 0 gives "another fact". */
export function factOfTheDay(offset = 0) {
  const list = allFacts();
  const i = Math.floor(seededRng("fact-" + localDate())() * list.length);
  return list[(i + offset * 7919) % list.length];
}

