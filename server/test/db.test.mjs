// Storage tests against a real Postgres (PGlite, in-process): migrations, records, leagues, feedback.
//   npm test
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { openStore } from "../db.js";
import { applyResult, initRecords, recordFor, saveRecords, setProfile } from "../records.js";
import { createLeague, initLeagues, joinLeague, leaveLeague, saveLeagues } from "../leagues.js";

const pg = new PGlite();
const quiet = console.log; console.log = () => {};
const store = await openStore({ client: pg });
console.log = quiet;
assert.equal(store.kind, "postgres");

// migrations run once
const applied = (await pg.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name);
assert.deepEqual(applied, ["001_init.sql"]);
await openStore({ client: pg }); // reopening applies nothing new
assert.equal((await pg.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, 1);

// records: play a rated match, save, read back
assert.equal(await initRecords(store), 0);
const a = recordFor("sid-aaaaaaaa"), b = recordFor("sid-bbbbbbbb");
setProfile(a, { name: "Alpha", icon: "ball", color: "#fff", frame: "none", level: 3 });
const delta = applyResult("hl", [a, b], 0);
assert.ok(delta[0] > 0 && delta[1] < 0);
await saveRecords();
const rows = await store.loadRecords();
assert.equal(rows.length, 2);
const A = rows.find((r) => r.sid === "sid-aaaaaaaa");
assert.equal(A.w.hl, 1); assert.equal(A.profile.name, "Alpha"); assert.equal(A.elo.hl, a.elo.hl);
// a second save of the same record updates its row
applyResult("hl", [a, b], null);
await saveRecords();
assert.equal((await store.loadRecords()).find((r) => r.sid === "sid-aaaaaaaa").d.hl, 1);
assert.equal((await pg.query("SELECT count(*)::int AS n FROM records")).rows[0].n, 2);

// leagues: create, join, leave (empty leagues are deleted)
await initLeagues(store);
const L = createLeague("Sunday crew", "AAAAAA");
joinLeague(L.id, "BBBBBB");
await saveLeagues();
let saved = await store.loadLeagues();
assert.equal(saved.length, 1);
assert.deepEqual(saved[0].members.sort(), ["AAAAAA", "BBBBBB"]);
assert.equal(saved[0].name, "Sunday crew");
leaveLeague(L.id, "AAAAAA"); leaveLeague(L.id, "BBBBBB");
await saveLeagues();
assert.equal((await store.loadLeagues()).length, 0);

// feedback
await store.addFeedback({ at: new Date().toISOString(), kind: "bug", message: "It broke", tech: "x" });
await store.addFeedback({ at: new Date().toISOString(), kind: "idea", message: "More games", tech: "" });
const fb = await store.listFeedback(10);
assert.deepEqual(fb.map((f) => f.message), ["It broke", "More games"]);

// a value with quotes and unicode survives the round trip
setProfile(b, { name: "בוב \"The Bot\" O'Neil", icon: "ball", color: "#000", frame: "none", level: 1 });
await saveRecords();
assert.equal((await store.loadRecords()).find((r) => r.sid === "sid-bbbbbbbb").profile.name, "בוב \"The Bot\" O'Neil");

console.log("db tests passed");
process.exit(0);
