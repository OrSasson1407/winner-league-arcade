// Fact of the day: real facts generated from the data (season leaders, careers, loyalty, journeymen).
import { H, PLAYED_SEASONS, careerSummary, isPlayable, namedPlayers, playersById, seededRng, teamName } from "../data.js";
import { fmt1, localDate } from "../ui.js";
import { LEAGUE } from "../data.js";
import { LEAGUES } from "../leagueChoice.js";
const IN_LG = LEAGUES[LEAGUE].inLg;

let facts = null;

function build() {
  const out = [];
  const name = (pid) => playersById.get(pid).name;
  // season leaders (regular season, 10+ games)
  // whole sentences (not pieces), so the Hebrew dictionary can word each one as a sentence
  const LEAD = [
    ["ppg", "In {0}, {1} led the league in scoring with {2} points per game for {3}."], ["rpg", "In {0}, {1} led the league in rebounding with {2} rebounds per game for {3}."],
    ["apg", "In {0}, {1} led the league in assists with {2} assists per game for {3}."], ["valuation_per_game", "In {0}, {1} had the league's best efficiency with {2} VAL per game for {3}."],
  ];
  const fill = (t, ...v) => t.replace(/\{(\d)\}/g, (_, i) => v[i]);
  for (const s of PLAYED_SEASONS) {
    const all = H.getPlayersBySeason(s).filter((r) => isPlayable(r, 10));
    // each league has its own leaders (in the mixed data too); outside the Winner League the sentence names the league
    for (const lg of new Set(all.map((r) => r.league || "wl"))) {
      const recs = all.filter((r) => (r.league || "wl") === lg);
      const LG = { wl: "Winner League", nba: "NBA", el: "EuroLeague" }[lg];
      for (const [k, base] of LEAD) {
        const sentence = LEAGUE === "wl" ? base : base.replace("the league's", `the ${LG}'s`).replace("the league", `the ${LG}`);
        const top = recs.filter((r) => r.stats[k] !== null && r.stats[k] !== undefined).sort((a, b) => b.stats[k] - a.stats[k])[0];
        if (top) out.push({ pid: top.player_id, season: s, text: fill(sentence, s, name(top.player_id), fmt1(top.stats[k]), teamName(top.team_id)) });
      }
    }
    const recs = all;
    const big = recs.filter((r) => r.stats.ppg >= 10 && r.stats.rpg >= 10).sort((a, b) => b.stats.ppg - a.stats.ppg)[0];
    if (big) out.push({ pid: big.player_id, season: s, text: `${name(big.player_id)} averaged a double-double in ${s}: ${fmt1(big.stats.ppg)} points and ${fmt1(big.stats.rpg)} rebounds a game for ${teamName(big.team_id)}.` });
  }
  // careers
  for (const p of namedPlayers) {
    const cs = careerSummary(p.player_id);
    if (cs.seasonsPlayed >= 11) out.push({ pid: p.player_id, text: `${p.name} has played ${cs.seasonsPlayed} regular seasons${IN_LG} since ${PLAYED_SEASONS[0]}, across ${cs.teams.length} club${cs.teams.length === 1 ? "" : "s"}.` });
    if (cs.teams.length >= 6) out.push({ pid: p.player_id, text: `Journeyman alert: ${p.name} has played for ${cs.teams.length} different clubs${IN_LG}: ${cs.teams.map(teamName).join(", ")}.` });
    const perClub = new Map();
    for (const r of cs.played) perClub.set(r.team_id, (perClub.get(r.team_id) || new Set()).add(r.season));
    for (const [tid, set] of perClub) if (set.size >= 8) out.push({ pid: p.player_id, text: `${p.name} spent ${set.size} seasons with ${teamName(tid)}, one of the most loyal careers since ${PLAYED_SEASONS[0]}.` });
    if (cs.totalGames >= 300) out.push({ pid: p.player_id, text: `${p.name} has played ${cs.totalGames} regular-season games${IN_LG} since ${PLAYED_SEASONS[0]}.` });
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

