// My Career: the national team. After a season, a player good enough for his country's team (by its FIBA world
// rank) is called up for the summer. The summer follows FIBA's real calendar: a continental championship in the
// years it was (or is scheduled to be) held, otherwise a summer window of qualifiers and friendlies. Teammates are real where the
// data has them. Team strengths come from the 2026 world ranking (the only ranking in the data), so results are
// a simulation, and the screens say so. Captaincy and personal national-team records build up over the years.
import { PLAYED_SEASONS, db, isPlayable, playersById } from "../wl.js";
import { NT_TEAMS, ntForNationality, ntTeam } from "../national.js";
import { bestOverall, dataSeason, isIsraeliPlayer, statLine } from "./engine.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The overall you need for a call-up: higher for the stronger national teams. */
export const callupLine = (rank) => (rank <= 5 ? 92 : rank <= 10 ? 90 : rank <= 20 ? 86 : rank <= 35 ? 80 : rank <= 50 ? 77 : 74);
const strengthOf = (rank) => 95 - (rank - 1) * 0.25;

// ---------------------------------------------------------------- FIBA's calendar (senior men)
// Continental championships by FIBA zone: the years they were held, and the next one scheduled.
const CHAMPIONSHIPS = {
  europe: { name: "EuroBasket", years: [2011, 2013, 2015, 2017, 2022, 2025, 2029], rounds: ["Round of 16", "Quarter-final", "Semi-final", "Final"] },
  americas: { name: "FIBA AmeriCup", years: [2011, 2013, 2015, 2017, 2022, 2025, 2029], rounds: ["Quarter-final", "Semi-final", "Final"] },
  africa: { name: "FIBA AfroBasket", years: [2011, 2013, 2015, 2017, 2021, 2025, 2029], rounds: ["Round of 16", "Quarter-final", "Semi-final", "Final"] },
  asia: { name: "FIBA Asia Cup", years: [2011, 2013, 2015, 2017, 2022, 2025, 2029], rounds: ["Quarter-final", "Semi-final", "Final"] },
};
/**
 * What a national team plays in a given summer: its continental championship in the years it was held (or is
 * scheduled), otherwise a summer window. Which qualifiers fell in which window changed over the years (FIBA's
 * qualifying system changed in 2017), so those summers get a general name rather than a guessed one.
 */
export function summerEvent(zone, year) {
  const ch = CHAMPIONSHIPS[zone];
  if (ch?.years.includes(year)) return { kind: "championship", name: `${ch.name} ${year}`, rounds: ch.rounds };
  return { kind: "qualifiers", name: `Summer ${year}: qualifiers and friendlies` };
}

// ---------------------------------------------------------------- the call-up
/** Is there a call-up this summer? null, or { team, year, role, line, event, captain }. */
export function nationalCallup(C) {
  const t = ntForNationality(C.nat);
  const last = C.history[C.history.length - 1];
  if (!t || !last?.pro || C.retired || C.injury?.severe || C.age < 19 || C.age > 36) return null;
  const year = Number(last.season.slice(0, 4)) + 1; // the summer after the season
  if ((C.national?.summers || []).some((s) => s.year === year)) return null;
  const ov = bestOverall(C), line = callupLine(t.rank);
  if (ov < line) return null;
  const role = ov >= line + 6 ? "starter" : ov >= line + 2 ? "rotation" : "bench";
  // the captain's armband: a starter with 3+ summers and 20+ games for his country
  const N = C.national, captain = !!N?.captain || (role === "starter" && (N?.summers || []).filter((s) => !s.declined).length >= 3 && (N?.caps || 0) >= 20);
  return { team: t.id, year, role, line, event: summerEvent(t.zone, year), captain, newCaptain: captain && !N?.captain };
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

// ---------------------------------------------------------------- the summer
/** Play the summer: a summer window (four games), or a championship (group stage, then knockout rounds). */
export function playNationalSummer(C, call, rnd = Math.random) {
  const me = ntTeam(call.team), ev = call.event || summerEvent(me.zone, call.year);
  const zone = NT_TEAMS.filter((t) => t.id !== me.id && t.zone === me.zone);
  const near = zone.slice().sort((a, b) => Math.abs(a.rank - me.rank) - Math.abs(b.rank - me.rank));
  const boost = clamp((bestOverall(C) - call.line) * 0.12, 0, 2.5) * { starter: 1, rotation: 0.5, bench: 0.2 }[call.role] + (call.captain ? 0.3 : 0);
  const game = (o, stage) => {
    const ms = strengthOf(me.rank) + boost, os = strengthOf(o.rank);
    const won = rnd() < 1 / (1 + Math.exp(-(ms - os) / 4));
    const hi = Math.round(72 + rnd() * 18), margin = 1 + Math.round(rnd() * rnd() * 20);
    const line = statLine(C, call.role, rnd, { big: true });
    return { opp: o.id, stage, my: won ? hi : hi - margin, their: won ? hi - margin : hi, won, line };
  };
  const games = [];
  let finish = null;
  if (ev.kind === "qualifiers") {
    for (const o of near.slice(0, 7).sort(() => rnd() - 0.5).slice(0, 4)) games.push(game(o, "Summer window"));
  } else {
    // group of five opponents from the zone; three wins go through
    const group = near.slice(0, 9).sort(() => rnd() - 0.5).slice(0, 5);
    for (const o of group) games.push(game(o, "Group stage"));
    const wins = games.filter((g) => g.won).length;
    if (wins < 3) finish = "Out in the group stage";
    else {
      // knockout rounds against teams the group didn't have, stronger each round
      const pool = zone.filter((t) => !group.includes(t)).sort((a, b) => a.rank - b.rank); // strongest first
      for (const [i, round] of ev.rounds.entries()) {
        // early rounds against the weaker teams left, the final against one of the best of the zone
        const at = Math.round((pool.length - 1) * (1 - (i + 1) / ev.rounds.length) + rnd() * 2);
        const o = pool[clamp(at, 0, pool.length - 1)] || near[i];
        pool.splice(pool.indexOf(o), 1);
        const g = game(o, round);
        games.push(g);
        if (!g.won) {
          if (round === "Final") finish = "Silver medal";
          else if (round === "Semi-final") { // the bronze-medal game
            const ob = pool[Math.floor(rnd() * Math.min(4, pool.length))] || near[0];
            const b = game(ob, "Bronze-medal game"); games.push(b);
            finish = b.won ? "Bronze medal" : "Fourth place";
          } else finish = `Out in the ${round.toLowerCase()}`;
          break;
        }
        if (round === "Final") finish = "Gold medal";
      }
    }
  }
  const played = games.filter((g) => !g.line.dnp);
  const sum = (k) => played.reduce((s, g) => s + g.line[k], 0);
  const summer = { year: call.year, team: call.team, role: call.role, event: ev.name, kind: ev.kind, finish, captain: !!call.captain, games,
    w: games.filter((g) => g.won).length, l: games.filter((g) => !g.won).length };
  const N = (C.national ||= { team: call.team, caps: 0, pts: 0, reb: 0, ast: 0, summers: [] });
  N.caps += played.length; N.pts += sum("pts"); N.reb += sum("reb"); N.ast += sum("ast");
  // personal national-team records
  const best = played.reduce((b, g) => (!b || g.line.pts > b.pts ? { pts: g.line.pts, opp: g.opp, year: call.year, event: ev.name } : b), N.best || null);
  if (best && (!N.best || best.pts > N.best.pts)) N.best = best;
  if (/medal/.test(finish || "")) (N.medals ||= []).push({ year: call.year, event: ev.name, medal: finish.split(" ")[0] });
  if (call.newCaptain) { N.captain = call.year; C.pop = clamp((C.pop || 0) + 4, 0, 100); }
  const before = N.caps - played.length;
  N.milestones = [...new Set([...(N.milestones || []), ...[25, 50, 75, 100].filter((m) => before < m && N.caps >= m)])];
  N.summers.push(summer);
  C.pop = clamp((C.pop || 0) + 2 + summer.w + (/Gold/.test(finish || "") ? 6 : /medal/.test(finish || "") ? 3 : 0), 0, 100);
  C.mileage = (C.mileage || 0) + sum("min");
  C.ntBonus = true; // next summer's development: a summer with the country's best
  C.log.unshift({ t: "national", text: finish ? `${me.name}, ${ev.name}: ${finish}. ${summer.w}-${summer.l}, ${played.length} games, ${sum("pts")} points.` : `${me.name}, ${ev.name}: ${summer.w}-${summer.l}, ${played.length} games, ${sum("pts")} points.` });
  return summer;
}
/** Say no: a quiet summer for your body, but the fans and the federation remember. */
export function declineCallup(C, call) {
  (C.national ||= { team: call.team, caps: 0, pts: 0, reb: 0, ast: 0, summers: [] }).summers.push({ year: call.year, team: call.team, declined: true, event: call.event?.name });
  C.pop = clamp((C.pop || 0) - 2, 0, 100);
  C.log.unshift({ t: "national", text: `Turned down the ${ntTeam(call.team).name} call-up for summer ${call.year}.` });
}
