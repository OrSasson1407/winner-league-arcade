// Storage for the server's own data: online records, friend leagues and feedback.
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
    async loadLeagues() { return (await q("SELECT id, name, owner, members, created FROM leagues")).rows.map((r) => ({ ...r, created: Number(r.created) })); },
    async saveLeague(L) {
      await q(`INSERT INTO leagues (id, name, owner, members, created, updated_at) VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, owner = EXCLUDED.owner, members = EXCLUDED.members, updated_at = now()`,
      [L.id, L.name, L.owner, L.members, L.created]);
    },
    async deleteLeague(id) { await q("DELETE FROM leagues WHERE id = $1", [id]); },
    async addFeedback(row) { await q("INSERT INTO feedback (at, kind, message, tech) VALUES ($1, $2, $3, $4)", [row.at, row.kind, row.message, row.tech]); },
    async listFeedback(limit = 300) {
      return (await q("SELECT at, kind, message, tech FROM feedback ORDER BY id DESC LIMIT $1", [limit])).rows
        .map((r) => ({ ...r, at: new Date(r.at).toISOString() })).reverse();
    },
    async close() { await pool?.end(); },
  };
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
    async close() {},
  };
}
