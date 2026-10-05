// The real path used in production: the pg driver over a network connection (migrations in a pooled
// transaction), then the whole server started with DATABASE_URL. Postgres here is PGlite behind a socket.
//   npm test
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { openStore } from "../db.js";

const db = new PGlite();
const sock = new PGLiteSocketServer({ db, port: 55432, host: "127.0.0.1" });
await sock.start();
const URL_ = "postgres://postgres:postgres@127.0.0.1:55432/postgres";

const quiet = console.log; console.log = () => {};
process.env.DATABASE_POOL_MAX = "1"; // the test Postgres takes one connection at a time
const store = await openStore({ url: URL_ });
console.log = quiet;
assert.equal(store.kind, "postgres");
await store.saveRecords([{ sid: "s1", v: 1, n: 3, elo: { hl: 1012 } }, { sid: "s2", v: 1, n: 1, elo: { hl: 990 } }]);
await store.saveRecords([{ sid: "s1", v: 1, n: 4, elo: { hl: 1020 } }]);
const recs = await store.loadRecords();
assert.equal(recs.length, 2);
assert.equal(recs.find((r) => r.sid === "s1").elo.hl, 1020);
await store.saveLeague({ id: "LABCDE", name: "Test", owner: "AAAAAA", members: ["AAAAAA", "BBBBBB"], created: Date.now() });
assert.deepEqual((await store.loadLeagues())[0].members, ["AAAAAA", "BBBBBB"]);
await store.addFeedback({ at: new Date().toISOString(), kind: "bug", message: "hello", tech: "" });
assert.equal((await store.listFeedback()).length, 1);
await store.close();

// the whole server on this database: it loads the saved rows and reports its storage
const srv = spawn(process.execPath, ["server/index.js", "5199"], { env: { ...process.env, DATABASE_URL: URL_, DATABASE_POOL_MAX: "1", WLA_SECRET: "test-secret" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
const t0 = Date.now();
while (!/localhost:5199/.test(log) && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 200));
if (!/localhost:5199/.test(log)) { srv.kill(); console.error("server log:\n" + log); process.exit(1); }
const status = await (await fetch("http://127.0.0.1:5199/api/status")).json();
srv.kill();
assert.equal(status.storage, "postgres", log);
assert.equal(status.secret, "env");
assert.match(log, /postgres: 2 records, 1 leagues/);

await sock.stop();
console.log("pg tests passed");
process.exit(0);
