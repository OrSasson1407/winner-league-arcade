// My Career: the national team. After a season, a player good enough for his country's team (by its FIBA world
// rank) is called up for the summer: real teammates where the data has them, four games against teams of the
// same FIBA zone, then the results. Team strengths come from the 2026 world ranking (the only ranking in the
// data), so games before 2025 are a simulation on today's ranking: the screen says so.
import { PLAYED_SEASONS, db, isPlayable, playersById } from "../data.js";
import { NT_TEAMS, ntForNationality, ntTeam } from "../national.js";
import { bestOverall, dataSeason, isIsraeliPlayer, statLine } from "./engine.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The overall you need for a call-up: higher for the stronger national teams. */
export const callupLine = (rank) => (rank <= 5 ? 92 : rank <= 10 ? 90 : rank <= 20 ? 86 : rank <= 35 ? 80 : rank <= 50 ? 77 : 74);
const strengthOf = (rank) => 95 - (rank - 1) * 0.25;

/** Is there a call-up this summer? null, or { team, year, role, line }. */
export function nationalCallup(C) {
  const t = ntForNationality(C.nat);
  const last = C.history[C.history.length - 1];
  if (!t || !last?.pro || C.retired || C.injury?.severe || C.age < 19 || C.age > 36) return null;
  const year = Number(last.season.slice(0, 4)) + 1; // the summer after the season
  if ((C.national?.summers || []).some((s) => s.year === year)) return null;
  const ov = bestOverall(C), line = callupLine(t.rank);
  if (ov < line) return null;
  return { team: t.id, year, role: ov >= line + 6 ? "starter" : ov >= line + 2 ? "rotation" : "bench", line };
}

/** Who you'd play with: the real 2025 roster from 2025 on; for Israel before that, the best Israelis in the league that season. */
export function teammates(C, call, N) {
  if (call.year >= 2025 && N) return { source: "roster", names: N.roster(call.team).slice(0, 12).map((r) => N.name(r.p.player_id)) };
  if (call.team === "national_israel") {
    const season = dataSeason(C.history[C.history.length - 1].season);
    const best = new Map();
    for (const ps of db.player_seasons) if (ps.season === season && isPlayable(ps, 10) && isIsraeliPlayer(ps.player_id) && !best.has(ps.player_id)) best.set(ps.player_id, ps);
    const names = [...best.values()].sort((a, b) => b.rating_mock - a.rating_mock).slice(0, 11).map((ps) => playersById.get(ps.player_id).name);
    return { source: PLAYED_SEASONS.includes(season) ? "league" : "league-latest", season, names };
  }
  return { source: "none", names: [] };
}

/** Play the summer: four games against national teams of the same FIBA zone, close in the ranking. */
export function playNationalSummer(C, call, rnd = Math.random) {
  const me = ntTeam(call.team);
  const near = NT_TEAMS.filter((t) => t.id !== me.id && t.zone === me.zone).sort((a, b) => Math.abs(a.rank - me.rank) - Math.abs(b.rank - me.rank)).slice(0, 7);
  const opps = near.sort(() => rnd() - 0.5).slice(0, 4).sort((a, b) => a.rank - b.rank);
  const boost = clamp((bestOverall(C) - call.line) * 0.12, 0, 2.5) * { starter: 1, rotation: 0.5, bench: 0.2 }[call.role];
  const games = opps.map((o) => {
    const ms = strengthOf(me.rank) + boost, os = strengthOf(o.rank);
    const won = rnd() < 1 / (1 + Math.exp(-(ms - os) / 4));
    const hi = Math.round(72 + rnd() * 18), margin = 1 + Math.round(rnd() * rnd() * 20);
    const line = statLine(C, call.role, rnd, { big: true });
    return { opp: o.id, my: won ? hi : hi - margin, their: won ? hi - margin : hi, won, line };
  });
  const played = games.filter((g) => !g.line.dnp);
  const sum = (k) => played.reduce((s, g) => s + g.line[k], 0);
  const summer = { year: call.year, team: call.team, role: call.role, games, w: games.filter((g) => g.won).length, l: games.filter((g) => !g.won).length };
  const N = (C.national ||= { team: call.team, caps: 0, pts: 0, reb: 0, ast: 0, summers: [] });
  N.caps += played.length; N.pts += sum("pts"); N.reb += sum("reb"); N.ast += sum("ast");
  N.summers.push(summer);
  C.pop = clamp((C.pop || 0) + 2 + summer.w, 0, 100);
  C.mileage = (C.mileage || 0) + sum("min");
  C.ntBonus = true; // next summer's development: a summer with the country's best
  C.log.unshift({ t: "national", text: `${me.name} national team, summer ${call.year}: ${summer.w}-${summer.l}, ${played.length} games, ${sum("pts")} points.` });
  return summer;
}
/** Say no: a quiet summer for your body, but the fans and the federation remember. */
export function declineCallup(C, call) {
  (C.national ||= { team: call.team, caps: 0, pts: 0, reb: 0, ast: 0, summers: [] }).summers.push({ year: call.year, team: call.team, declined: true });
  C.pop = clamp((C.pop || 0) - 2, 0, 100);
  C.log.unshift({ t: "national", text: `Turned down the ${ntTeam(call.team).name} call-up for summer ${call.year}.` });
}
