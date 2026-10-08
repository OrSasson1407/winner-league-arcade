// Player facts and puzzle criteria for Connections and the Grid. Everything comes from the league data:
// clubs and team-seasons (regular season), height, most-worn jersey number, nationality, birth year,
// position and single-season stats (15+ games). No DOM here.
import { LEAGUE, careerSummary, namedPlayers, teamName } from "../data.js";

// The EuroLeague data has real clubs and seasons, but not real numbers or (mostly) personal details: there,
// and next to a EuroLeague club in the mixed data, only club and career-length criteria are used.
const IN_LEAGUE = LEAGUE === "wl" ? " in the league" : "";

let _facts = null;
/** Facts for every player who appeared in at least one regular-season game. */
export function facts() {
  if (_facts) return _facts;
  _facts = new Map();
  for (const p of namedPlayers) {
    const s = careerSummary(p.player_id);
    if (!s.played.length) continue;
    const real = s.played.filter((r) => !r.mock); // EuroLeague rows: real club and season, placeholder numbers
    const full = real.filter((r) => (r.stats.games ?? 0) >= 15);
    const bio = !p._mockBio;
    const max = (k) => full.reduce((m, r) => Math.max(m, r.stats[k] ?? 0), 0);
    _facts.set(p.player_id, {
      pid: p.player_id, name: p.name,
      clubs: new Set(s.played.map((r) => r.team_id)),
      teamSeasons: new Set(s.played.filter((r) => r.mock || (r.stats.games ?? 0) >= 5).map((r) => `${r.team_id}|${r.season}`)),
      nats: new Set(!bio ? [] : p.nationalities?.length ? p.nationalities : p.nationality ? [p.nationality] : []),
      height: bio ? p.height_cm ?? null : null, jersey: bio ? p.jersey ?? null : null,
      born: bio && p.birth_date ? Number(p.birth_date.slice(0, 4)) : null,
      pos: bio ? p.primary_position || null : null,
      seasons: s.seasonsPlayed, games: s.totalGames, known: s.totalGames || s.seasonsPlayed * 30, // how well-known (EuroLeague: by seasons)
      ppg: max("ppg"), rpg: max("rpg"), apg: max("apg"),
    });
  }
  return _facts;
}

const CLUB_LIST = () => [...new Set([...facts().values()].flatMap((f) => [...f.clubs]))];

// ---------------------------------------------------------------- Grid criteria
// Each: { id, label, short, test(fact) }
// needs: what the criterion relies on beyond clubs and seasons ("bio": personal details, "stats": numbers)
const ATTRS = [
  { id: "il", label: "Israeli", needs: "bio", test: (f) => f.nats.has("Israel") },
  { id: "us", label: "American", needs: "bio", test: (f) => f.nats.has("United States") },
  { id: "pg", label: "Point guard", short: "PG", needs: "bio", test: (f) => f.pos === "PG" },
  { id: "c", label: "Center", short: "C", needs: "bio", test: (f) => f.pos === "C" },
  { id: "ppg15", label: "15+ PPG in a season", needs: "stats", test: (f) => f.ppg >= 15 },
  { id: "rpg8", label: "8+ RPG in a season", needs: "stats", test: (f) => f.rpg >= 8 },
  { id: "apg5", label: "5+ APG in a season", needs: "stats", test: (f) => f.apg >= 5 },
  { id: "s8", label: `8+ seasons${IN_LEAGUE}`, test: (f) => f.seasons >= 8 },
  { id: "cl4", label: "Played for 4+ clubs", test: (f) => f.clubs.size >= 4 },
  { id: "h205", label: "2.05 m or taller", needs: "bio", test: (f) => (f.height ?? 0) >= 205 },
  { id: "h188", label: "1.88 m or shorter", needs: "bio", test: (f) => f.height != null && f.height <= 188 },
  { id: "gp200", label: "200+ games", needs: "stats", test: (f) => f.games >= 200 },
];
const elClub = (c) => LEAGUE === "el" || String(c).startsWith("el:");
export function clubCriterion(tid) {
  return { id: "club:" + tid, label: teamName(tid), club: tid, test: (f) => f.clubs.has(tid) };
}
export function criterionById(id) {
  if (id.startsWith("club:")) return clubCriterion(id.slice(5));
  return ATTRS.find((a) => a.id === id) || null;
}
export const answersFor = (a, b) => [...facts().values()].filter((f) => a.test(f) && b.test(f));
/** Rarity 0–100 of a right Grid answer: how little-known the player is among all right answers (by games played). */
export function rarity(pid, list) {
  if (list.length <= 1) return 100;
  const sorted = list.slice().sort((a, b) => b.known - a.known);
  return Math.round((100 * sorted.findIndex((f) => f.pid === pid)) / (sorted.length - 1));
}

/** A 3×3 grid: columns are clubs, rows mix clubs and attributes; every cell has 3+ right answers. */
export function makeGrid(rnd) {
  const clubs = CLUB_LIST();
  const bigClubs = clubs.filter((c) => [...facts().values()].filter((f) => f.clubs.has(c)).length >= 60);
  for (let tries = 0; tries < 400; tries++) {
    const pickN = (arr, n) => { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
    const cols = pickN(bigClubs, 3).map(clubCriterion);
    const nClubRows = rnd() < 0.5 ? 1 : 0;
    const freeClubs = () => bigClubs.filter((c) => !cols.some((k) => k.club === c) && !rowClubs.some((k) => k.club === c));
    const rowClubs = [];
    rowClubs.push(...pickN(freeClubs(), nClubRows).map(clubCriterion));
    // a EuroLeague club only meets club and career-length criteria (its players' details and numbers aren't real)
    const onlyCareer = [...cols, ...rowClubs].some((c) => elClub(c.club));
    const attrs = ATTRS.filter((a) => !(a.id === "il" && rowClubs.length) && !(onlyCareer && a.needs));
    if (attrs.length < 3 - rowClubs.length) rowClubs.push(...pickN(freeClubs(), 3 - rowClubs.length - attrs.length).map(clubCriterion)); // clubs fill the rest
    if (rowClubs.some((c) => elClub(c.club)) && !onlyCareer) continue; // a EuroLeague club came in late: start over
    const rows = [...rowClubs, ...pickN(attrs, 3 - rowClubs.length)];
    if (rows.length < 3) continue;
    // Israeli and American together would be a contradiction for most players; avoid both in rows
    if (rows.some((r) => r.id === "il") && rows.some((r) => r.id === "us")) continue;
    const counts = rows.map((r) => cols.map((c) => answersFor(r, c).length));
    if (counts.flat().every((n) => n >= 3)) return { rows: rows.map((r) => r.id), cols: cols.map((c) => c.id) };
  }
  return null;
}

// ---------------------------------------------------------------- Connections categories
// kind sets the difficulty colour order (easiest first)
const KIND_ORDER = LEAGUE === "el" ? ["club", "teamseason", "seasons"] : ["club", "nat", "teamseason", "stat", "height", "born", "jersey"];
function allCategories() {
  const F = [...facts().values()];
  const cats = [];
  const add = (kind, label, members) => { if (members.length >= 4) cats.push({ kind, label, members: new Set(members.map((f) => f.pid)) }); };
  for (const c of CLUB_LIST()) add("club", `Played for ${teamName(c)}`, F.filter((f) => f.clubs.has(c)));
  for (const n of new Set(F.flatMap((f) => [...f.nats]))) if (n !== "Israel" && n !== "United States") add("nat", `From ${n}`, F.filter((f) => f.nats.has(n)));
  const ts = new Map();
  for (const f of F) for (const k of f.teamSeasons) (ts.get(k) || ts.set(k, []).get(k)).push(f);
  for (const [k, list] of ts) { const [tid, season] = k.split("|"); add("teamseason", `${teamName(tid)} teammates, ${season}`, list); }
  add("stat", "20+ PPG in a season", F.filter((f) => f.ppg >= 20));
  add("stat", "10+ RPG in a season", F.filter((f) => f.rpg >= 10));
  add("stat", "7+ APG in a season", F.filter((f) => f.apg >= 7));
  add(LEAGUE === "el" ? "seasons" : "stat", `10+ seasons${IN_LEAGUE}`, F.filter((f) => f.seasons >= 10));
  add("height", "2.10 m or taller", F.filter((f) => (f.height ?? 0) >= 210));
  add("height", "1.83 m or shorter", F.filter((f) => f.height != null && f.height <= 183));
  for (const y of new Set(F.map((f) => f.born).filter(Boolean))) add("born", `Born in ${y}`, F.filter((f) => f.born === y));
  for (const j of new Set(F.map((f) => f.jersey).filter((x) => x != null))) add("jersey", `Most often wore #${j}`, F.filter((f) => f.jersey === j));
  return cats;
}
let _cats = null;

/**
 * Four groups of four players. Every player belongs to exactly one of the four groups (so there's
 * one solution), but players often look like they could fit another group.
 */
export function makeConnections(rnd, { minGames = 30 } = {}) {
  _cats ??= allCategories();
  const known = (pid) => facts().get(pid).known >= minGames;
  const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
  // at most two club-based groups, unless there aren't enough other kinds (the EuroLeague has one)
  const maxClubish = Math.max(2, 4 - (KIND_ORDER.length - 2));
  for (let tries = 0; tries < 600; tries++) {
    // pick the group types first, then a group of each type
    const kinds = [];
    while (kinds.length < 4) {
      const k = pickOne(KIND_ORDER);
      const clubish = kinds.filter((x) => x === "club" || x === "teamseason").length;
      if (kinds.includes(k) && k !== "club" && k !== "teamseason") continue;
      if ((k === "club" || k === "teamseason") && clubish >= maxClubish) continue;
      kinds.push(k);
    }
    const chosen = [];
    for (const k of kinds) {
      const pool = _cats.filter((c) => c.kind === k && !chosen.includes(c));
      if (pool.length) chosen.push(pickOne(pool));
    }
    if (chosen.length < 4) continue;
    const groups = [];
    const used = new Set();
    let ok = true;
    for (const c of chosen) {
      const others = chosen.filter((x) => x !== c);
      const cands = [...c.members].filter((pid) => known(pid) && !used.has(pid) && !others.some((o) => o.members.has(pid)));
      if (cands.length < 4) { ok = false; break; }
      const picked = [];
      while (picked.length < 4) { const p = pickOne(cands); if (!picked.includes(p)) picked.push(p); }
      picked.forEach((p) => used.add(p));
      groups.push({ label: c.label, kind: c.kind, players: picked });
    }
    if (!ok) continue;
    groups.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return groups.map((g, i) => ({ ...g, level: i })); // level 0 easiest … 3 hardest
  }
  return null;
}
