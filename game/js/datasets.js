// Builds the database for a league choice. Each league file has the same structure as game_db.js.
//   nba: data/nba_db.js (real per-game stats, Basketball-Reference)
//   el:  data/euroleague_db.js (real names, clubs and seasons; stats, ratings and most personal details are
//        placeholders, so every row is flagged `mock` and only club/season games use it)
//   all: Winner League + NBA + EuroLeague in one database:
//        - one person per real person: an NBA (or EuroLeague) player who is also in the Winner League data
//          (same name and same birth date) keeps his Winner League id; different people who happen to share
//          an id get "nba_" / "el_" ids
//        - EuroLeague teams become "el:<club>", so a club's EuroLeague season never merges with its league season
//        - one rating scale: Winner League ratings are put on the NBA scale (players who played both leagues
//          in neighbouring seasons rate about 23 points higher in the Winner League data), then everything
//          is mapped onto the Winner League's spread, which the games' thresholds are tuned to
// Every row carries `league` ("wl" | "nba" | "el"), so screens can say where a season was played.

const WL_TO_NBA_SCALE = 23;
// Every game's thresholds (easy pools, draft grades, team strengths) are tuned to the Winner League's rating
// spread. NBA ratings (generated separately, on their own spread) are mapped onto it by percentile: the NBA's
// median player gets the Winner League's median rating, and so on.
const sortedRatings = (db) => db.player_seasons.filter((r) => (r.stats?.games ?? 0) >= 10).map((r) => r.rating_mock).sort((a, b) => a - b);
function percentileMap(from, to) {
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
  const knots = Array.from({ length: 21 }, (_, i) => [q(from, i / 20), q(to, i / 20)]);
  return (v) => {
    if (v <= knots[0][0]) return Math.max(35, Math.round(knots[0][1] - (knots[0][0] - v)));
    for (let i = 1; i < knots.length; i++) {
      const [a, A] = knots[i - 1], [b, B] = knots[i];
      if (v <= b) return Math.round(b === a ? B : A + ((v - a) / (b - a)) * (B - A));
    }
    return Math.min(99, Math.round(knots[knots.length - 1][1]));
  };
}
const key = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

const tagRows = (db, league, extra = {}) => ({ ...db, player_seasons: db.player_seasons.map((r) => ({ ...r, league, ...extra })) });

async function nbaRaw() { return (await import("../data/nba_db.js")).nbaDatabase; }
/** The NBA on its own: ratings on the Winner League's spread (see percentileMap). */
function nbaScaled(N, WL) {
  const f = percentileMap(sortedRatings(N), sortedRatings(WL));
  return { ...N, player_seasons: N.player_seasons.map((r) => ({ ...r, league: "nba", rating_mock: f(r.rating_mock) })) };
}
async function euroleague(WL) {
  const E = (await import("../data/euroleague_db.js")).euroleagueDatabase;
  const wlIds = new Set(WL.players.map((p) => p.player_id));
  // personal details are real only for the players who are also in the Winner League data
  return { ...tagRows(E, "el", { mock: true }), players: E.players.map((p) => (wlIds.has(p.player_id) ? p : { ...p, _mockBio: true })) };
}

function mixed(WL, N, E) {
  // one scale: Winner League ratings onto the NBA's (about 23 lower), then the whole thing onto the Winner League
  // spread, so the NBA's best are the top of the scale and a Winner League star sits around an NBA rotation player
  const toWlSpread = percentileMap(sortedRatings(N), sortedRatings(WL));
  const people = new Map(); // id -> person
  const add = (p) => people.set(p.player_id, { ...p });
  for (const p of WL.players) add(p);
  // NBA people: linked to the Winner League by name + birth date, else their own id (renamed if it clashes)
  const wlByKey = new Map();
  for (const p of WL.players.filter((x) => x.name)) { const k = key(p.name); if (!wlByKey.has(k)) wlByKey.set(k, []); wlByKey.get(k).push(p); }
  const nbaId = new Map();
  for (const p of N.players) {
    const same = (wlByKey.get(key(p.name)) || []).filter((w) => !w.birth_date || !p.birth_date || w.birth_date === p.birth_date);
    let id = same.length === 1 ? same[0].player_id : people.has(p.player_id) ? `nba_${p.player_id}` : p.player_id;
    nbaId.set(p.player_id, id);
    if (!people.has(id)) add({ ...p, player_id: id });
  }
  // EuroLeague people: the ones in the Winner League data already share its ids; others are linked to an NBA
  // player when the name is unique on both sides (EuroLeague birth dates aren't real), else kept apart
  const nbaByKey = new Map();
  for (const p of N.players) { const k = key(p.name); nbaByKey.set(k, nbaByKey.has(k) ? null : p); }
  const elKeyCount = new Map();
  for (const p of E.players) { const k = key(p.name); elKeyCount.set(k, (elKeyCount.get(k) || 0) + 1); }
  const wlIds = new Set(WL.players.map((p) => p.player_id));
  const elId = new Map();
  for (const p of E.players) {
    let id;
    if (wlIds.has(p.player_id)) id = p.player_id;
    else {
      const n = nbaByKey.get(key(p.name));
      id = n && elKeyCount.get(key(p.name)) === 1 ? nbaId.get(n.player_id) : people.has(p.player_id) ? `el_${p.player_id}` : p.player_id;
    }
    elId.set(p.player_id, id);
    if (!people.has(id)) add({ ...p, player_id: id, _mockBio: true });
  }
  const rows = [
    ...WL.player_seasons.map((r) => ({ ...r, league: "wl", rating_mock: toWlSpread(r.rating_mock - WL_TO_NBA_SCALE) })),
    ...N.player_seasons.map((r) => ({ ...r, league: "nba", player_id: nbaId.get(r.player_id), rating_mock: toWlSpread(r.rating_mock) })),
    ...E.player_seasons.map((r) => ({ ...r, league: "el", mock: true, player_id: elId.get(r.player_id), team_id: `el:${r.team_id}` })),
  ];
  // each person's seasons and teams, from all the leagues
  const seasonsOf = new Map(), teamsOf = new Map();
  for (const r of rows) {
    if (!seasonsOf.has(r.player_id)) { seasonsOf.set(r.player_id, new Set()); teamsOf.set(r.player_id, new Set()); }
    seasonsOf.get(r.player_id).add(r.season); teamsOf.get(r.player_id).add(r.team_id);
  }
  const players = [...people.values()].map((p) => ({ ...p, seasons: [...(seasonsOf.get(p.player_id) || [])].sort(), teams: [...(teamsOf.get(p.player_id) || [])] }));
  const elTeams = E.teams.map((t) => ({ ...t, team_id: `el:${t.team_id}` }));
  // the seasons the games play in: the Winner League / NBA years (the EuroLeague's earlier years stay in careers)
  const season_list = [...new Set([...WL.metadata.season_list, ...N.metadata.season_list])].sort();
  // the season tables are for the games built on real numbers (draft, season sims, single game), so the
  // EuroLeague's placeholder teams stay out of them; its clubs still appear in careers, the Grid and Connections
  const season_teams = [...WL.season_teams, ...N.season_teams];
  const seasons = season_list.map((s) => ({ season: s, status: "COMPLETE", teams: season_teams.filter((x) => x.season === s).map((x) => x.team_id) }));
  return { metadata: { ...WL.metadata, season_list, current_season: WL.metadata.current_season, mixed: true }, players, teams: [...WL.teams, ...N.teams, ...elTeams], seasons, season_teams, player_seasons: rows };
}

/** The database for a league choice (the Winner League one is passed in: it's always loaded). */
export async function loadLeagueDb(league, WL) {
  if (league === "nba") return nbaScaled(await nbaRaw(), WL);
  if (league === "el") return euroleague(WL);
  if (league === "all") { const [N, E] = await Promise.all([nbaRaw(), euroleague(WL)]); return mixed(WL, N, E); }
  return tagRows(WL, "wl");
}
