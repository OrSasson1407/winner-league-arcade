// Player facts and puzzle criteria for Connections and the Grid. Everything comes from the league data:
// clubs and team-seasons (regular season), height, most-worn jersey number, nationality, birth year,
// position and single-season stats (15+ games). No DOM here.
import * as DATA from "../data.js";

/** Facts and puzzles over one league's data (the browser uses the chosen league; the online server one per room). */
export function makeLeagueFacts(D) {
  const { LEAGUE, careerSummary, namedPlayers, teamName } = D;
  // The EuroLeague data has real clubs and seasons, but not real numbers or (mostly) personal details: there,
  // and next to a EuroLeague club in the mixed data, only club and career-length criteria are used.
  const IN_LEAGUE = LEAGUE === "wl" ? " in the league" : "";

  let _facts = null;
  /** Facts for every player who appeared in at least one regular-season game. */
  function facts() {
    if (_facts) return _facts;
    _facts = new Map();
    for (const p of namedPlayers) {
      const s = careerSummary(p.player_id);
      if (!s.played.length) continue;
      const real = s.played.filter((r) => !r.mock); // EuroLeague rows: real club and season, placeholder numbers
      const full = real.filter((r) => (r.stats.games ?? 0) >= 15);
      const bio = !p._mockBio;
      const max = (k) => full.reduce((m, r) => Math.max(m, r.stats[k] ?? 0), 0);
    // three-point shooting in a season, only for real scorers (8+ points a game): small samples don't count
    const tp = full.filter((r) => (r.stats.ppg ?? 0) >= 8).reduce((m, r) => Math.max(m, r.stats.fg3_pct ?? 0), 0);
      _facts.set(p.player_id, {
        pid: p.player_id, name: p.name,
        clubs: new Set(s.played.map((r) => r.team_id)),
        teamSeasons: new Set(s.played.filter((r) => r.mock || (r.stats.games ?? 0) >= 5).map((r) => `${r.team_id}|${r.season}`)),
        nats: new Set(!bio ? [] : p.nationalities?.length ? p.nationalities : p.nationality ? [p.nationality] : []),
        height: bio ? p.height_cm ?? null : null, jersey: bio ? p.jersey ?? null : null,
        born: bio && p.birth_date ? Number(p.birth_date.slice(0, 4)) : null,
        pos: bio ? p.primary_position || null : null,
        seasons: s.seasonsPlayed, games: s.totalGames, known: s.totalGames || s.seasonsPlayed * 30, // how well-known (EuroLeague: by seasons)
        ppg: max("ppg"), rpg: max("rpg"), apg: max("apg"), tp,
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
  function clubCriterion(tid) {
    return { id: "club:" + tid, label: teamName(tid), club: tid, test: (f) => f.clubs.has(tid) };
  }
  function criterionById(id) {
    if (id.startsWith("club:")) return clubCriterion(id.slice(5));
    return ATTRS.find((a) => a.id === id) || null;
  }
  const answersFor = (a, b) => [...facts().values()].filter((f) => a.test(f) && b.test(f));
  /** Rarity 0–100 of a right Grid answer: how little-known the player is among all right answers (by games played). */
  function rarity(pid, list) {
    if (list.length <= 1) return 100;
    const sorted = list.slice().sort((a, b) => b.known - a.known);
    return Math.round((100 * sorted.findIndex((f) => f.pid === pid)) / (sorted.length - 1));
  }

  /** A 3×3 grid: columns are clubs, rows mix clubs and attributes; every cell has 3+ right answers. */
  function makeGrid(rnd) {
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
  const KIND_ORDER = LEAGUE === "el" ? ["club", "teamseason", "career", "twoclubs", "seasons"] : ["club", "nat", "pos", "teamseason", "stat", "career", "height", "twoclubs"];
  const CLUBISH = ["club", "teamseason", "twoclubs"]; // groups built on clubs (at most two of them in a board)
  // what each difficulty uses: easy boards stick to clear groups and well-known players
  const LEVELS = {
    easy: { kinds: ["club", "nat", "pos", "stat", "career", "height", "seasons"], minGames: LEAGUE === "el" ? 150 : 120, traps: 0 },
    normal: { kinds: KIND_ORDER, minGames: 30, traps: 0 },
    expert: { kinds: KIND_ORDER, minGames: 10, traps: 3 },
  };
  function allCategories() {
    const F = [...facts().values()];
    const cats = [];
    const add = (kind, label, members) => { if (members.length >= 4) cats.push({ kind, label, members: new Set(members.map((f) => f.pid)) }); };
    const clubs = CLUB_LIST();
    for (const c of clubs) add("club", `Played for ${teamName(c)}`, F.filter((f) => f.clubs.has(c)));
    // played for both of two clubs (the pairs with enough players)
    const byClub = new Map(clubs.map((c) => [c, F.filter((f) => f.clubs.has(c))]));
    const big = clubs.filter((c) => byClub.get(c).length >= 8);
    for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
      const both = byClub.get(big[i]).filter((f) => f.clubs.has(big[j]));
      if (both.length >= 4) add("twoclubs", `Played for both ${teamName(big[i])} and ${teamName(big[j])}`, both);
    }
    // career milestones
    if (LEAGUE !== "el") add("career", "300+ games", F.filter((f) => f.games >= 300));
    add("career", "Played for 5+ clubs", F.filter((f) => f.clubs.size >= 5));
    add("career", LEAGUE === "wl" ? "One-club player: 5+ seasons in the league, all with one club" : "One-club player: 5+ seasons, all with one club", F.filter((f) => f.clubs.size === 1 && f.seasons >= 5));
    if (LEAGUE !== "el") add("stat", "40%+ from three in a season (8+ PPG)", F.filter((f) => f.tp >= 40));
    for (const n of new Set(F.flatMap((f) => [...f.nats]))) if (n !== "Israel" && n !== "United States") add("nat", `From ${n}`, F.filter((f) => f.nats.has(n)));
    const ts = new Map();
    for (const f of F) for (const k of f.teamSeasons) (ts.get(k) || ts.set(k, []).get(k)).push(f);
    for (const [k, list] of ts) { const [tid, season] = k.split("|"); add("teamseason", `${teamName(tid)} teammates, ${season}`, list); }
    add("stat", "20+ PPG in a season", F.filter((f) => f.ppg >= 20));
    add("stat", "10+ RPG in a season", F.filter((f) => f.rpg >= 10));
    add("stat", "7+ APG in a season", F.filter((f) => f.apg >= 7));
    if (LEAGUE === "el") add("seasons", "10+ seasons", F.filter((f) => f.seasons >= 10)); // the EuroLeague has few kinds of group: kept there
    add("pos", "Point guards", F.filter((f) => f.pos === "PG"));
    add("pos", "Centers", F.filter((f) => f.pos === "C"));
    add("height", "2.10 m or taller", F.filter((f) => (f.height ?? 0) >= 210));
    add("height", "1.83 m or shorter", F.filter((f) => f.height != null && f.height <= 183));
    return cats;
  }
  let _cats = null;

  /**
   * Four groups of four players. Every player belongs to exactly one of the four groups (so there's
   * one solution), but players often look like they could fit another group.
   */
  /**
   * Four groups of four. level: "easy" (clear groups, well-known players), "normal", "expert" (lesser-known
   * players, every kind of group, and players who look like they fit two groups).
   */
  function makeConnections(rnd, { minGames, level = "normal" } = {}) {
    _cats ??= allCategories();
    const L = LEVELS[level] || LEVELS.normal;
    const minG = minGames ?? L.minGames;
    const known = (pid) => facts().get(pid).known >= minG;
    const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
    const kindsOk = KIND_ORDER.filter((k) => L.kinds.includes(k) && _cats.some((c) => c.kind === k));
    // at most two club-based groups, unless there aren't enough other kinds (the EuroLeague has few)
    const maxClubish = Math.max(2, 4 - kindsOk.filter((k) => !CLUBISH.includes(k)).length);
    for (let tries = 0; tries < 900; tries++) {
      // pick the group types first, then a group of each type
      const kinds = [];
      let guard = 0;
      while (kinds.length < 4 && guard++ < 50) {
        const k = pickOne(kindsOk);
        const clubish = kinds.filter((x) => CLUBISH.includes(x)).length;
        if (kinds.includes(k) && !CLUBISH.includes(k)) continue;
        if (CLUBISH.includes(k) && clubish >= maxClubish) continue;
        kinds.push(k);
      }
      if (kinds.length < 4) continue;
      const chosen = [];
      for (const k of kinds) {
        const pool = _cats.filter((c) => c.kind === k && !chosen.includes(c));
        if (pool.length) chosen.push(pickOne(pool));
      }
      if (chosen.length < 4) continue;
      // expert: the board must have traps: players (on the board or not) who belong to two of these groups
      if (L.traps) {
        let shared = 0;
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (const pid of chosen[i].members) if (chosen[j].members.has(pid) && known(pid)) shared++;
        if (shared < L.traps) continue;
      }
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
  return { facts, clubCriterion, criterionById, answersFor, rarity, makeGrid, makeConnections };
}
export const { facts, clubCriterion, criterionById, answersFor, rarity, makeGrid, makeConnections } = makeLeagueFacts(DATA);
