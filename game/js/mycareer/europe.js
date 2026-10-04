// My Career in Europe: EuroLeague opponents, rosters and clubs, from the separate EuroLeague data.
// Needs the full EuroLeague data loaded (loadEuroleague) before use; without it, careers stay domestic.
// EuroLeague ratings are placeholder (mock) data on their own scale, so they are mapped onto the
// Winner League scale through the clubs that appear in both (Maccabi Tel Aviv most seasons).
import { EL_LAST, EL_SEASONS, elLoaded, elTeamName } from "../euroleague.js";
import { realTeamStrength } from "../games/draft_sim.js";

const r1 = (v) => Math.round(v * 10) / 10;
export const elReady = () => !!elLoaded();

/** The EuroLeague data season for a career season (later seasons use the last one in the data). */
export function elSeasonFor(label) {
  if (EL_SEASONS.includes(label)) return label;
  return label > EL_LAST ? EL_LAST : null;
}

const playable = (r) => r.stats && (r.stats.games ?? 0) >= 5;
/** Raw strength of a EuroLeague club-season on the EuroLeague data's own rating scale. */
function rawStrength(E, season, tid) {
  const roster = E.roster(season, tid).filter(playable);
  if (!roster.length) return null;
  const avg = (xs) => xs.reduce((s, x) => s + x.rating_mock, 0) / xs.length;
  const five = roster.slice(0, 5), bench = roster.slice(5, 8);
  return bench.length ? 0.8 * avg(five) + 0.2 * avg(bench) : avg(five);
}

const offsets = new Map();
/** Points to add to EuroLeague ratings to put them on the Winner League scale for a season. */
export function elOffset(season, wlStrength) {
  if (offsets.has(season)) return offsets.get(season);
  const E = elLoaded();
  const pairs = [];
  for (const s of EL_SEASONS) {
    for (const tid of E.teamsOf(s)) {
      const wl = wlStrength(s, tid);
      const el = rawStrength(E, s, tid);
      if (wl != null && el != null) pairs.push({ s, d: wl - el });
    }
  }
  const same = pairs.filter((p) => p.s === season);
  const use = same.length ? same : pairs;
  const off = use.length ? use.reduce((a, p) => a + p.d, 0) / use.length : 10;
  offsets.set(season, off);
  return off;
}

/**
 * Clubs of the EuroLeague season for a career season, with strengths on the Winner League scale.
 * wlStrength(season, tid): the Winner League strength of a club that season, or null.
 */
export function elTeams(label, wlStrength) {
  const E = elLoaded();
  const season = elSeasonFor(label);
  if (!E || !season) return [];
  const off = elOffset(season, wlStrength);
  return E.teamsOf(season).map((tid) => {
    const wl = wlStrength(season, tid);
    const raw = rawStrength(E, season, tid);
    return { id: tid, name: elTeamName(tid), strength: r1(wl ?? (raw == null ? 80 : raw + off)), wl: wl != null };
  });
}

/** A EuroLeague club's roster for a career season, ratings mapped to the Winner League scale. */
export function elRoster(label, tid, wlStrength) {
  const E = elLoaded();
  const season = elSeasonFor(label);
  if (!E || !season) return [];
  const off = elOffset(season, wlStrength);
  return E.roster(season, tid).filter(playable).map((r) => ({ ...r, rating_mock: Math.round(r.rating_mock + off), el: true }));
}

export const elPlayerName = (pid) => elLoaded()?.name(pid) ?? pid;
export const inElSeason = (label, tid) => !!elLoaded() && !!elSeasonFor(label) && elLoaded().teamsOf(elSeasonFor(label)).includes(tid);
export { realTeamStrength };
