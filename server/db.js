// Storage for the server's own data: online records, friend leagues, match history and feedback.
//   DATABASE_URL set (e.g. a Neon / Supabase Postgres URL) -> Postgres; the tables are created and
//   upgraded by the files in server/migrations, in name order, each once.
//   Not set (local play)                                    -> JSON files in server/data, as before.
// The game keeps working copies in memory (records.js, leagues.js); this module loads them at start
// and writes changes back. Every method is async and never throws into the game: a failed write is
// logged and retried with the next save.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, "data");
const MIGRATIONS = path.join(HERE, "migrations");

/**
 * Open the store. options.client: a ready Postgres client with query(text, params) -> { rows }
 * (used by tests with an in-process Postgres); otherwise DATABASE_URL decides.
 */
export async function openStore({ client = null, url = process.env.DATABASE_URL } = {}) {
  if (client) return postgresStore(client, null);
  if (url) {
    const { default: pg } = await import("pg");
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX) || 4, idleTimeoutMillis: 30000, ssl: local ? false : { rejectUnauthorized: false } });
    pool.on("error", (e) => console.error("[db] idle client error:", e.message));
    return postgresStore(pool, pool);
  }
  return fileStore();
}

// ---------------------------------------------------------------- Postgres
async function postgresStore(db, pool) {
  await migrate(db, pool);
  const q = (text, params) => db.query(text, params);
  return {
    kind: "postgres",
    async loadRecords() { return (await q("SELECT data FROM records")).rows.map((r) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data)); },
    async saveRecords(list) {
      if (!list.length) return;
      await q(`INSERT INTO records (sid, data, updated_at)
        SELECT s, d::jsonb, now() FROM unnest($1::text[], $2::text[]) AS t(s, d)
        ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [list.map((r) => r.sid), list.map((r) => JSON.stringify(r))]);
    },
    async loadLeagues() { return (await q("SELECT id, name, owner, members, created, style FROM leagues")).rows.map((r) => ({ ...r, created: Number(r.created), style: parse(r.style) || null })); },
    async saveLeague(L) {
      await q(`INSERT INTO leagues (id, name, owner, members, created, style, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, owner = EXCLUDED.owner, members = EXCLUDED.members, style = EXCLUDED.style, updated_at = now()`,
      [L.id, L.name, L.owner, L.members, L.created, L.style ? JSON.stringify(L.style) : null]);
    },
    async deleteLeague(id) { await q("DELETE FROM leagues WHERE id = $1", [id]); },
    async addFeedback(row) { await q("INSERT INTO feedback (at, kind, message, tech) VALUES ($1, $2, $3, $4)", [row.at, row.kind, row.message, row.tech]); },
    async listFeedback(limit = 300) {
      return (await q("SELECT at, kind, message, tech FROM feedback ORDER BY id DESC LIMIT $1", [limit])).rows
        .map((r) => ({ ...r, at: new Date(r.at).toISOString() })).reverse();
    },
    async deleteRecord(sid) { await q("DELETE FROM records WHERE sid = $1", [sid]); },
    /** A deleted player stays in other players' history only as "Deleted player", with nothing that identifies them. */
    async anonymizeMatches(sid) {
      for (const seat of [0, 1]) {
        await q(`UPDATE matches SET sid${seat} = NULL,
          players = jsonb_set(players, '{${seat}}', (players->${seat}) - 'code' - 'av' - 'style' || '{"name": "Deleted player", "icon": "user", "color": "#64748b", "frame": "none"}'::jsonb)
          WHERE sid${seat} = $1`, [sid]);
      }
    },
    async addMatch(m) {
      await q(`INSERT INTO matches (at, game, mode, rated, sid0, sid1, winner, reason, players, scores, replay)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)`,
      [m.at, m.game, m.mode, m.rated, m.sid0, m.sid1, m.winner, m.reason, JSON.stringify(m.players), JSON.stringify(m.scores ?? null), m.replay ? JSON.stringify(m.replay) : null]);
    },
    async listMatches(sid, limit = 60) {
      const rows = (await q(`SELECT id, at, game, mode, rated, sid0, sid1, winner, reason, players, scores, replay IS NOT NULL AS has_replay FROM matches
        WHERE sid0 = $1 OR sid1 = $1 ORDER BY at DESC LIMIT $2`, [sid, limit])).rows;
      return rows.map((r) => ({ ...r, id: String(r.id), at: new Date(r.at).toISOString(), players: parse(r.players), scores: parse(r.scores) }));
    },
    /** One match with its replay (only for one of its two players). */
    async getMatch(id, sid) {
      if (!/^\d{1,18}$/.test(String(id))) return null;
      const r = (await q("SELECT id, at, game, mode, sid0, sid1, winner, reason, players, scores, replay FROM matches WHERE id = $1 AND (sid0 = $2 OR sid1 = $2)", [String(id), sid])).rows[0];
      return r ? { ...r, id: String(r.id), at: new Date(r.at).toISOString(), players: parse(r.players), scores: parse(r.scores), replay: parse(r.replay) } : null;
    },
    async periodTable(game, since) {
      const rows = (await q(`WITH seat AS (
          SELECT sid0 AS sid, CASE WHEN winner IS NULL THEN 'd' WHEN winner = 0 THEN 'w' ELSE 'l' END AS r FROM matches
            WHERE mode = 'ranked' AND at >= $1 AND ($2 = 'all' OR game = $2)
          UNION ALL
          SELECT sid1, CASE WHEN winner IS NULL THEN 'd' WHEN winner = 1 THEN 'w' ELSE 'l' END FROM matches
            WHERE mode = 'ranked' AND at >= $1 AND ($2 = 'all' OR game = $2))
        SELECT sid, count(*) FILTER (WHERE r = 'w')::int AS w, count(*) FILTER (WHERE r = 'd')::int AS d,
               count(*) FILTER (WHERE r = 'l')::int AS l, count(*)::int AS g
        FROM seat WHERE sid IS NOT NULL GROUP BY sid`, [new Date(since).toISOString(), game])).rows;
      return rankTable(rows);
    },
    async close() { await pool?.end(); },
  };
}
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

/** Points table for a period: win 3, draw 1; ties go to more wins, then fewer games. */
export function rankTable(rows) {
  return rows.map((r) => ({ ...r, pts: r.w * 3 + r.d })).sort((a, b) => b.pts - a.pts || b.w - a.w || a.g - b.g);
}

/** Apply the migration files that haven't run yet, each in its own transaction. */
async function migrate(db, pool) {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
    const c = pool ? await pool.connect() : db; // a transaction needs one connection
    try {
      await c.query("BEGIN");
      await (c.exec ? c.exec(sql) : c.query(sql)); // PGlite runs several statements with exec()
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await c.query("COMMIT");
      console.log(`[db] migration ${f} applied`);
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw new Error(`migration ${f} failed: ${e.message}`);
    } finally { if (pool) c.release(); }
  }
}

// ---------------------------------------------------------------- JSON files (no database)
function fileStore() {
  const file = (n) => path.join(DATA, n);
  const read = (n, fallback) => { try { return JSON.parse(fs.readFileSync(file(n), "utf8")); } catch { return fallback; } };
  const write = (n, value) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(file(n), JSON.stringify(value)); };
  let records = null, leagues = null; // the files hold everything, so writes rewrite the file
  let matches = null; // match history: appended to a file, kept in memory (the newest 20,000)
  const loadMatches = () => {
    if (matches) return matches;
    try { matches = fs.readFileSync(file("matches.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(-20000); } catch { matches = []; }
    return matches;
  };
  return {
    kind: "files",
    async loadRecords() { records = new Map(read("records.json", []).filter((r) => r?.sid).map((r) => [r.sid, r])); return [...records.values()]; },
    async saveRecords(list) { records ??= new Map(); for (const r of list) records.set(r.sid, r); write("records.json", [...records.values()]); },
    async loadLeagues() { leagues = new Map(read("leagues.json", []).map((L) => [L.id, L])); return [...leagues.values()]; },
    async saveLeague(L) { leagues ??= new Map(); leagues.set(L.id, L); write("leagues.json", [...leagues.values()]); },
    async deleteLeague(id) { leagues ??= new Map(); leagues.delete(id); write("leagues.json", [...leagues.values()]); },
    async addFeedback(row) { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(file("feedback.jsonl"), JSON.stringify(row) + "\n"); },
    async listFeedback(limit = 300) {
      try { return fs.readFileSync(file("feedback.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(-limit); } catch { return []; }
    },
    async deleteRecord(sid) { records ??= new Map(); records.delete(sid); write("records.json", [...records.values()]); },
    async anonymizeMatches(sid) {
      const gone = { name: "Deleted player", icon: "user", color: "#64748b", frame: "none" };
      let changed = false;
      for (const m of loadMatches()) [0, 1].forEach((seat) => {
        if (m[`sid${seat}`] !== sid) return;
        m[`sid${seat}`] = null;
        const { code, av, style, ...rest } = m.players[seat] || {};
        m.players[seat] = { ...rest, ...gone };
        changed = true;
      });
      if (changed) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(file("matches.jsonl"), matches.map((m) => JSON.stringify(m)).join("\n") + "\n"); }
    },
    async addMatch(m) {
      loadMatches().push(m = { id: String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0"), ...m });
      if (matches.length > 20000) matches.splice(0, matches.length - 20000);
      fs.mkdirSync(DATA, { recursive: true });
      fs.appendFileSync(file("matches.jsonl"), JSON.stringify(m) + "\n");
    },
    async listMatches(sid, limit = 60) {
      return loadMatches().filter((m) => m.sid0 === sid || m.sid1 === sid).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
        .map(({ replay, ...m }) => ({ ...m, has_replay: !!replay }));
    },
    async getMatch(id, sid) { return loadMatches().find((m) => m.id === String(id) && (m.sid0 === sid || m.sid1 === sid)) || null; },
    async periodTable(game, since) {
      const t = new Map();
      for (const m of loadMatches()) {
        if (m.mode !== "ranked" || Date.parse(m.at) < since || (game !== "all" && m.game !== game)) continue;
        [m.sid0, m.sid1].forEach((sid, seat) => {
          if (!sid) return;
          const r = t.get(sid) || { sid, w: 0, d: 0, l: 0, g: 0 };
          r[m.winner === null ? "d" : m.winner === seat ? "w" : "l"]++; r.g++;
          t.set(sid, r);
        });
      }
      return rankTable([...t.values()]);
    },
    async close() {},
  };
}
