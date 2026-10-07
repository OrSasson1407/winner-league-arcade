// Storage tests against a real Postgres (PGlite, in-process): migrations, records, leagues, feedback.
//   npm test
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
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
const files = readdirSync(new URL("../migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
assert.deepEqual(applied.sort(), files);
await openStore({ client: pg }); // reopening applies nothing new
assert.equal((await pg.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, files.length);

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

// match history and period tables
const at = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();
const P = (code, name) => ({ code, name, icon: "ball", color: "#fff", frame: "none" });
const match = (sid0, sid1, winner, daysAgo, mode = "ranked", game = "hl") => ({ at: at(daysAgo), game, mode, rated: mode === "ranked", sid0, sid1, winner, reason: "done",
  players: [{ ...P("AAAAAA", sid0), delta: 8, score: "9-7" }, { ...P("BBBBBB", sid1), delta: -8, score: "7-9" }], scores: [9, 7] });
await store.addMatch(match("x", "y", 0, 0));          // x wins today
await store.addMatch(match("x", "y", null, 0));       // a draw today
await store.addMatch(match("y", "z", 0, 0, "ranked", "guess"));
await store.addMatch(match("x", "y", 1, 40));         // y won 40 days ago: outside this week and month
await store.addMatch(match("x", null, 0, 0, "bot"));  // bot games are history, not tables
const hx = await store.listMatches("x", 60);
assert.equal(hx.length, 4);
assert.equal(hx[0].mode, "bot"); // newest first
assert.deepEqual(hx[1].players.map((p) => p.score), ["9-7", "7-9"]);
const week = await store.periodTable("all", Date.now() - 2 * 864e5);
const row = (sid) => week.find((r) => r.sid === sid);
assert.deepEqual([row("x").pts, row("x").w, row("x").d, row("x").l], [4, 1, 1, 0]);
assert.deepEqual([row("y").pts, row("y").g], [4, 3]); // a draw (1) and a win over z (3), from 3 games
assert.equal(week[0].sid, "x"); // same points: more wins first… both have 1; fewer games wins the tie
assert.equal(row("z").pts, 0);
const hlOnly = await store.periodTable("hl", Date.now() - 2 * 864e5);
assert.equal(hlOnly.find((r) => r.sid === "y").g, 2);
const ever = await store.periodTable("all", 0);
assert.equal(ever.find((r) => r.sid === "y").w, 2);

// replays: kept with the match, given only to its players; history says which matches have one
await store.addMatch({ ...match("p", "q", 0, 0), replay: { rounds: [{ cat: "ppg", va: 10, vb: 12 }] } });
const pq = (await store.listMatches("p", 5))[0];
assert.equal(pq.has_replay, true);
assert.equal(pq.replay, undefined); // the list stays light
assert.equal((await store.getMatch(pq.id, "p")).replay.rounds[0].vb, 12);
assert.equal(await store.getMatch(pq.id, "someone-else"), null);
// league style
await store.saveLeague({ id: "LSTYLE", name: "Styled", owner: "AAAAAA", members: ["AAAAAA"], created: 1, style: { color: "#e4002b", icon: "crown" } });
assert.deepEqual((await store.loadLeagues()).find((x) => x.id === "LSTYLE").style, { color: "#e4002b", icon: "crown" });

// "Delete my data": the record goes, other players' history keeps the match without the person
await store.deleteRecord("sid-aaaaaaaa");
assert.equal((await store.loadRecords()).some((r) => r.sid === "sid-aaaaaaaa"), false);
await store.anonymizeMatches("x");
const yHist = await store.listMatches("y", 60);
const fromX = yHist.find((m) => m.mode === "ranked" && m.game === "hl" && m.winner === 0);
assert.equal(fromX.sid0, null);
assert.equal(fromX.players[0].name, "Deleted player");
assert.equal(fromX.players[0].code, undefined);
assert.equal(fromX.players[0].delta, 8); // the numbers of the match stay
assert.equal(fromX.players[1].name, "y"); // the other player is untouched
assert.equal((await store.listMatches("x", 60)).length, 0);

console.log("db tests passed");
process.exit(0);
