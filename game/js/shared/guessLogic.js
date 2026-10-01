// Guess the Player clue rules shared by the browser game and the online server (no DOM here).
import { POSITIONS, birthYear, careerSummary, namedPlayers, seasonYear, teamName } from "../data.js";

const fmt1 = (v) => (v === null || v === undefined ? "–" : Number(v).toFixed(1));

// Target pools: players with a real career in the data.
export function pool(level) {
  return namedPlayers.filter((p) => {
    const s = careerSummary(p.player_id);
    if (!p.height_cm || !p.birth_date || !p.primary_position) return false;
    if (level === "easy") return s.seasonsPlayed >= 3 && s.bestRating >= 88 && s.totalGames >= 80;
    return s.seasonsPlayed >= 2 && s.totalGames >= 50;
  });
}

function careerPPG(s) {
  const games = s.played.reduce((a, r) => a + r.stats.games, 0);
  return games ? s.played.reduce((a, r) => a + (r.stats.ppg ?? 0) * r.stats.games, 0) / games : null;
}

export function attrs(p) {
  const s = careerSummary(p.player_id);
  return {
    team: s.lastTeam, teams: s.teams, pos: p.primary_position, height: p.height_cm, born: birthYear(p),
    nat: p.nationality, nats: p.nationalities || [], first: s.firstSeason, seasons: s.seasonsPlayed,
    jersey: p.jersey ?? null, clubs: s.teams.length, ppg: careerPPG(s), peak: s.bestRating || null,
  };
}

function numeric(guess, target, greenWithin, yellowWithin) {
  if (guess === null || guess === undefined || target === null || target === undefined) return { c: "n", arrow: "" };
  const d = target - guess;
  const c = Math.abs(d) <= greenWithin ? "g" : Math.abs(d) <= yellowWithin ? "y" : "n";
  return { c, arrow: c === "g" ? "" : d > 0 ? " ↑" : " ↓" };
}

export function compare(g, t) {
  const posD = Math.abs(POSITIONS.indexOf(g.pos) - POSITIONS.indexOf(t.pos));
  return {
    team: { c: g.team === t.team ? "g" : t.teams.includes(g.team) ? "y" : "n", v: teamName(g.team) },
    pos: { c: posD === 0 ? "g" : posD === 1 ? "y" : "n", v: g.pos },
    height: { ...numeric(g.height, t.height, 1, 4), v: g.height ? `${g.height} cm` : "–" },
    born: { ...numeric(g.born, t.born, 0, 2), v: g.born ?? "–" },
    nat: { c: g.nat === t.nat ? "g" : g.nats.some((n) => t.nats.includes(n)) ? "y" : "n", v: g.nat ?? "–" },
    first: { ...numeric(seasonYear(g.first), seasonYear(t.first), 0, 2), v: g.first },
    seasons: { ...numeric(g.seasons, t.seasons, 0, 1), v: g.seasons },
    jersey: { ...numeric(g.jersey, t.jersey, 0, 2), v: g.jersey ?? "–" },
    clubs: { ...numeric(g.clubs, t.clubs, 0, 1), v: g.clubs },
    ppg: { ...numeric(g.ppg, t.ppg, 0.5, 2), v: g.ppg === null ? "–" : fmt1(g.ppg) },
    peak: { ...numeric(g.peak, t.peak, 1, 3), v: g.peak ?? "–" },
  };
}

export const COLS = [
  ["team", "Last team"], ["pos", "Pos"], ["height", "Height"], ["born", "Born"], ["nat", "Nationality"],
  ["jersey", "Jersey"], ["first", "First season*"], ["seasons", "Seasons"], ["clubs", "Clubs"], ["ppg", "Career PPG"], ["peak", "Peak rating"],
];

