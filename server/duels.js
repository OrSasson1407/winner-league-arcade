// Online 1v1 game engines. The server is authoritative: it picks the questions, times the
// rounds, checks the answers and keeps the score. Every engine gets a `room`:
//   room.send(seat, msg), room.broadcast(msg), room.timer(fn, ms), room.clearTimers(),
//   room.finish({ winner: 0 | 1 | null, scores: [a, b], reason, detail })
// and implements start(), onMessage(seat, msg) and resync(seat) (re-send state after a reconnect).
import { H, PLAYED_SEASONS, careerSummary, db, isPlayable, namedPlayers, pick, playersById, psByKey, psKey, seededRng, shuffle } from "../game/js/data.js";
import { SIXTH, SLOT_WEIGHT, slotValue, teamSummary } from "../game/js/shared/draftLogic.js";
import { decoys, eligible } from "../game/js/shared/careerLogic.js";
import { COLS, attrs, compare, pool as guessPool } from "../game/js/shared/guessLogic.js";
import { playGame } from "../game/js/games/draft_sim.js";
import { DEFAULT_TACTICS, TACTICS } from "../game/js/shared/gameSim.js";
import { answersFor, criterionById, facts, makeConnections, makeGrid, rarity } from "../game/js/shared/leagueFacts.js";

export const GAMES = ["hl", "guess", "career", "draft", "conn", "grid"];

// pools are computed once, on first use
let _hlPool, _careerPool, _guessTargets;
const hlPool = () => (_hlPool ??= db.player_seasons.filter((ps) => isPlayable(ps, 10)));
const careerPool = () => (_careerPool ??= eligible());
const guessTargets = () => (_guessTargets ??= guessPool("normal"));
const guessable = new Set(namedPlayers.map((p) => p.player_id));

// ---------------------------------------------------------------- Higher or Lower duel
const HL_CATS = {
  ppg: (ps) => ps.stats.ppg, rpg: (ps) => ps.stats.rpg, apg: (ps) => ps.stats.apg,
  rating: (ps) => ps.rating_mock, val: (ps) => ps.stats.valuation_per_game,
};
const HL_ROUNDS = 15, HL_MS = 10000, HL_PAUSE = 2600;

class HLDuel {
  constructor(room, rnd) { this.room = room; this.rnd = rnd; this.scores = [0, 0]; this.i = -1; }
  start() { this.next(); }
  next() {
    this.i++;
    if (this.i >= HL_ROUNDS) return this.room.finish({ winner: winnerOf(this.scores), scores: this.scores, reason: "done" });
    const cat = pick(Object.keys(HL_CATS), this.rnd);
    const ok = (ps) => HL_CATS[cat](ps) !== null && HL_CATS[cat](ps) !== undefined;
    let a, b;
    do a = pick(hlPool(), this.rnd); while (!ok(a));
    do b = pick(hlPool(), this.rnd); while (!ok(b) || b.player_id === a.player_id);
    this.cur = { cat, a, b, at: Date.now(), answers: [null, null], done: false };
    this.room.broadcast(this.roundMsg());
    this.room.timer(() => this.reveal(), HL_MS + 400);
  }
  roundMsg() {
    const c = this.cur;
    return { t: "hl:round", i: this.i, n: HL_ROUNDS, cat: c.cat, a: psKey(c.a), b: psKey(c.b), ms: Math.max(0, HL_MS - (Date.now() - c.at)), scores: this.scores };
  }
  onMessage(seat, m) {
    const c = this.cur;
    if (m.t !== "hl:answer" || !c || c.done || m.i !== this.i || c.answers[seat]) return;
    if (m.c !== "higher" && m.c !== "lower") return;
    const ms = Date.now() - c.at;
    if (ms > HL_MS + 400) return;
    c.answers[seat] = { c: m.c, ms };
    this.room.send(1 - seat, { t: "opp:answered", i: this.i });
    if (c.answers.every(Boolean)) this.reveal();
  }
  reveal() {
    const c = this.cur;
    if (!c || c.done) return;
    c.done = true;
    this.room.clearTimers();
    const va = HL_CATS[c.cat](c.a), vb = HL_CATS[c.cat](c.b);
    const answers = c.answers.map((x, seat) => {
      if (!x) return { c: null, ok: false, pts: 0 };
      const ok = vb === va || (x.c === "higher" ? vb > va : vb < va);
      const pts = ok ? 100 + Math.round(50 * Math.max(0, HL_MS - x.ms) / HL_MS) : 0;
      this.scores[seat] += pts;
      return { c: x.c, ok, pts };
    });
    this.room.broadcast({ t: "hl:reveal", i: this.i, answers, scores: this.scores });
    this.room.timer(() => this.next(), HL_PAUSE);
  }
  resync(seat) { if (this.cur && !this.cur.done) this.room.send(seat, this.roundMsg()); }
}

// ---------------------------------------------------------------- Career Path buzzer
const CAR_ROUNDS = 10, CAR_MS = 20000, CAR_PAUSE = 3200;

class CareerDuel {
  constructor(room, rnd) {
    this.room = room; this.rnd = rnd; this.scores = [0, 0]; this.i = -1;
    this.targets = shuffle(careerPool().slice(), rnd).slice(0, CAR_ROUNDS);
  }
  start() { this.next(); }
  next() {
    this.i++;
    if (this.i >= CAR_ROUNDS) return this.room.finish({ winner: winnerOf(this.scores), scores: this.scores, reason: "done" });
    const target = this.targets[this.i];
    const options = shuffle([target, ...decoys(target, careerPool(), 3, this.rnd)], this.rnd).map((p) => p.player_id);
    // the path is sent without the player's id, so the answer isn't in the message
    const path = careerSummary(target.player_id).records.map((r) => ({ season: r.season, team_id: r.team_id, games: r.stats?.games ?? null, ppg: r.stats?.ppg ?? null, age: r.age ?? null }));
    this.cur = { target: target.player_id, options, path, at: Date.now(), picks: [null, null], done: false };
    this.room.broadcast(this.roundMsg());
    this.room.timer(() => this.reveal(null), CAR_MS + 400);
  }
  roundMsg() {
    const c = this.cur;
    return { t: "car:round", i: this.i, n: CAR_ROUNDS, path: c.path, options: c.options, locked: c.picks, ms: Math.max(0, CAR_MS - (Date.now() - c.at)), scores: this.scores };
  }
  onMessage(seat, m) {
    const c = this.cur;
    if (m.t !== "car:answer" || !c || c.done || m.i !== this.i || c.picks[seat] || !c.options.includes(m.pid)) return;
    c.picks[seat] = m.pid;
    if (m.pid === c.target) { this.scores[seat] += 3; return this.reveal(seat); }
    this.room.send(seat, { t: "car:wrong", i: this.i, pid: m.pid });
    this.room.send(1 - seat, { t: "opp:wrong", i: this.i });
    if (c.picks.every(Boolean)) this.reveal(null);
  }
  reveal(winnerSeat) {
    const c = this.cur;
    if (!c || c.done) return;
    c.done = true;
    this.room.clearTimers();
    this.room.broadcast({ t: "car:reveal", i: this.i, answer: c.target, winner: winnerSeat, picks: c.picks, scores: this.scores });
    this.room.timer(() => this.next(), CAR_PAUSE);
  }
  resync(seat) { if (this.cur && !this.cur.done) this.room.send(seat, this.roundMsg()); }
}

// ---------------------------------------------------------------- Guess the Player race
const GUESS_MAX = 8, GUESS_MS = 180000;

class GuessDuel {
  constructor(room, rnd) {
    this.room = room;
    this.target = pick(guessTargets(), rnd);
    this.t = attrs(this.target);
    this.p = [0, 1].map(() => ({ rows: [], solved: false, doneMs: null }));
  }
  start() {
    this.at = Date.now();
    this.room.send(0, this.stateMsg(0));
    this.room.send(1, this.stateMsg(1));
    this.room.timer(() => this.end("time"), GUESS_MS + 500);
  }
  stateMsg(seat) {
    const me = this.p[seat], opp = this.p[1 - seat];
    return { t: "guess:state", seat, max: GUESS_MAX, ms: Math.max(0, GUESS_MS - (Date.now() - this.at)), cols: COLS,
      rows: me.rows, solved: me.solved, opp: { colors: opp.rows.map((r) => r.colors), solved: opp.solved } };
  }
  onMessage(seat, m) {
    if (m.t !== "guess:guess" || this.over) return;
    const me = this.p[seat];
    if (me.solved || me.rows.length >= GUESS_MAX || !guessable.has(m.pid) || me.rows.some((r) => r.pid === m.pid)) return;
    const cells = compare(attrs(playersById.get(m.pid)), this.t);
    const solved = m.pid === this.target.player_id;
    const row = { pid: m.pid, cells, colors: COLS.map(([k]) => (solved ? "g" : cells[k].c)) };
    me.rows.push(row);
    if (solved) me.solved = true;
    if (solved || me.rows.length >= GUESS_MAX) me.doneMs = Date.now() - this.at;
    this.room.send(seat, { t: "guess:row", row, solved, tries: me.rows.length });
    this.room.send(1 - seat, { t: "guess:opp", colors: row.colors, solved, tries: me.rows.length });
    this.check();
  }
  check() {
    const [a, b] = this.p;
    const done = (x) => x.doneMs !== null;
    if (done(a) && done(b)) return this.end("done");
    // stop early once the result can't change: one solved in n tries, the other used n tries without solving
    for (const [x, y] of [[a, b], [b, a]]) if (x.solved && !y.solved && y.rows.length >= x.rows.length) return this.end("done");
  }
  end(reason) {
    if (this.over) return;
    this.over = true;
    const [a, b] = this.p;
    let winner = null;
    if (a.solved !== b.solved) winner = a.solved ? 0 : 1;
    else if (a.solved && b.solved) {
      if (a.rows.length !== b.rows.length) winner = a.rows.length < b.rows.length ? 0 : 1;
      else winner = a.doneMs <= b.doneMs ? 0 : 1;
    }
    this.room.finish({ winner, scores: [a, b].map((x) => (x.solved ? x.rows.length : null)), reason,
      detail: { target: this.target.player_id, tries: [a.rows.length, b.rows.length], solved: [a.solved, b.solved], ms: [a.doneMs, b.doneMs], rows: [a.rows, b.rows] } });
  }
  resync(seat) { if (!this.over) this.room.send(seat, this.stateMsg(seat)); }
}

// ---------------------------------------------------------------- Head-to-head draft
const DRAFT_SLOTS = ["PG", "SG", "SF", "PF", "C", SIXTH];
const DRAFT_MS = 30000, DRAFT_RESPINS = 1, PLAN_MS = 15000;

function draftRoster(teamId, season) {
  const best = new Map();
  for (const ps of H.getPlayersByTeam(teamId, season)) {
    if (!isPlayable(ps, 3)) continue;
    const cur = best.get(ps.player_id);
    if (!cur || ps.stats.games > cur.stats.games) best.set(ps.player_id, ps);
  }
  return [...best.values()].sort((a, b) => b.stats.mpg - a.stats.mpg);
}

class DraftDuel {
  constructor(room, rnd) {
    this.room = room; this.rnd = rnd;
    this.teams = [0, 1].map(() => ({ slots: {}, respins: DRAFT_RESPINS }));
    this.used = new Set();
    this.round = 0;
    this.order = [];
    this.at = 0;
  }
  start() { this.startRound(); }
  turn() { return this.order[this.at]; }
  free(seat) { return DRAFT_SLOTS.filter((s) => !this.teams[seat].slots[s]); }
  startRound() {
    if (this.round >= DRAFT_SLOTS.length) return this.end();
    this.order = this.round % 2 === 0 ? [0, 1] : [1, 0]; // snake order
    this.at = 0;
    this.newSpin();
    this.beginTurn();
  }
  newSpin() {
    const need = Math.max(3, this.order.length - this.at + 1);
    for (let tries = 0; tries < 500; tries++) {
      const season = pick(PLAYED_SEASONS, this.rnd);
      const st = pick(H.getTeamsBySeason(season), this.rnd);
      if (!st) continue;
      const roster = draftRoster(st.team_id, season);
      if (roster.filter((ps) => !this.used.has(ps.player_id)).length >= need) {
        this.spin = { season, team_id: st.team_id, team_name: st.team_name, roster };
        return;
      }
    }
  }
  beginTurn() {
    this.room.clearTimers();
    this.turnAt = Date.now();
    this.room.broadcast(this.stateMsg());
    const seat = this.turn(), at = this.at, round = this.round;
    this.room.timer(() => { if (this.round === round && this.at === at) this.autoPick(seat); }, DRAFT_MS + 500);
  }
  stateMsg(last = null) {
    return {
      t: "draft:state", round: this.round, rounds: DRAFT_SLOTS.length, turn: this.turn(), slots: DRAFT_SLOTS,
      ms: Math.max(0, DRAFT_MS - (Date.now() - this.turnAt)),
      spin: { season: this.spin.season, team_id: this.spin.team_id, team_name: this.spin.team_name, keys: this.spin.roster.map(psKey) },
      teams: this.teams.map((t) => ({ respins: t.respins, slots: Object.fromEntries(Object.entries(t.slots).map(([s, x]) => [s, psKey(x.ps)])) })),
      used: [...this.used], last,
    };
  }
  autoPick(seat) {
    let best = null;
    for (const ps of this.spin.roster) {
      if (this.used.has(ps.player_id)) continue;
      for (const slot of this.free(seat)) {
        const v = slotValue(ps, slot) * SLOT_WEIGHT(slot);
        if (!best || v > best.v) best = { ps, slot, v };
      }
    }
    if (best) this.place(seat, best.ps, best.slot, true);
  }
  onMessage(seat, m) {
    if (this.planning) { // the game plan, after the draft
      if (m.t !== "draft:tactics" || this.planning.done[seat]) return;
      const tac = { ...DEFAULT_TACTICS };
      for (const k of Object.keys(TACTICS)) if (TACTICS[k][m.tactics?.[k]]) tac[k] = m.tactics[k];
      this.planning.tactics[seat] = tac; this.planning.done[seat] = true;
      this.room.send(1 - seat, { t: "draft:plan:opp" });
      if (this.planning.done.every(Boolean)) this.playFinal();
      return;
    }
    if (this.over || seat !== this.turn()) return;
    if (m.t === "draft:respin") {
      const t = this.teams[seat];
      if (t.respins <= 0) return;
      t.respins--;
      this.newSpin();
      return this.beginTurn();
    }
    if (m.t !== "draft:pick") return;
    const ps = psByKey(m.key);
    if (!ps || !this.spin.roster.includes(ps) || this.used.has(ps.player_id) || !this.free(seat).includes(m.slot)) return;
    this.place(seat, ps, m.slot, false);
  }
  place(seat, ps, slot, auto) {
    this.teams[seat].slots[slot] = { ps, value: slotValue(ps, slot) };
    this.used.add(ps.player_id);
    const last = { seat, key: psKey(ps), slot, auto };
    this.at++;
    if (this.at >= this.order.length) {
      this.round++;
      if (this.round >= DRAFT_SLOTS.length) { this.room.broadcast({ t: "draft:last", last }); return this.end(); }
      this.order = this.round % 2 === 0 ? [0, 1] : [1, 0];
      this.at = 0;
      this.newSpin();
    }
    this.room.clearTimers();
    this.turnAt = Date.now();
    this.room.broadcast(this.stateMsg(last));
    const s = this.turn(), at = this.at, round = this.round;
    this.room.timer(() => { if (this.round === round && this.at === at) this.autoPick(s); }, DRAFT_MS + 500);
  }
  /** The draft is done: both sides pick a game plan, then the teams play. */
  end() {
    this.room.clearTimers();
    this.planning = { tactics: [{ ...DEFAULT_TACTICS }, { ...DEFAULT_TACTICS }], done: [false, false], at: Date.now() };
    this.room.broadcast(this.planMsg());
    this.room.timer(() => this.playFinal(), PLAN_MS + 500);
  }
  planMsg() { return { t: "draft:plan", ms: Math.max(0, PLAN_MS - (Date.now() - this.planning.at)), teams: this.stateMsg().teams }; }
  playFinal() {
    if (this.over) return;
    this.over = true;
    this.room.clearTimers();
    const tactics = this.planning.tactics;
    this.planning = null;
    const names = this.room.names();
    const sums = this.teams.map((t) => teamSummary({ slots: t.slots, slotList: DRAFT_SLOTS }));
    const sides = this.teams.map((t, seat) => ({
      name: names[seat], strength: sums[seat].total, drafted: true, id: "online-" + seat,
      roster: DRAFT_SLOTS.map((s) => t.slots[s].ps), tactics: tactics[seat],
    }));
    const g = playGame(sides[0], sides[1], this.rnd, true);
    const winner = g.winner === sides[0] ? 0 : 1;
    this.room.finish({ winner, scores: [g.hs, g.as], reason: "done", detail: {
      teams: this.teams.map((t, seat) => ({ name: names[seat], slots: Object.fromEntries(DRAFT_SLOTS.map((s) => [s, psKey(t.slots[s].ps)])),
        avg: sums[seat].avg, chem: sums[seat].chem, total: sums[seat].total, grade: sums[seat].grade, label: sums[seat].label, links: sums[seat].links.map((l) => l.text) })),
      game: { seed: g.seed, hs: g.hs, as: g.as, winner, tactics, ot: g.ot },
    } });
  }
  resync(seat) {
    if (this.planning) return this.room.send(seat, { ...this.planMsg(), done: this.planning.done[seat] });
    if (!this.over && this.spin) this.room.send(seat, this.stateMsg());
  }
}


// ---------------------------------------------------------------- Connections race
// Same 16 players for both. Find the four groups; four mistakes and you're out. 4 minutes.
// More groups wins; then fewer mistakes; then whoever finished first.
const CONN_MS = 240000, CONN_MISTAKES = 4;

class ConnDuel {
  constructor(room, rnd) {
    this.room = room; this.rnd = rnd;
    this.groups = makeConnections(rnd);
    this.order = shuffle(this.groups.flatMap((g) => g.players), rnd);
    this.p = [0, 1].map(() => ({ solved: [], mistakes: 0, tried: new Set(), doneMs: null }));
    this.over = false;
  }
  start() {
    this.at = Date.now();
    this.room.broadcast({ t: "conn:start" });
    [0, 1].forEach((seat) => this.room.send(seat, this.stateMsg(seat)));
    this.room.timer(() => this.end("time"), CONN_MS + 500);
  }
  groupInfo(level) { const g = this.groups[level]; return { level, label: g.label, players: g.players }; }
  stateMsg(seat) {
    const me = this.p[seat], them = this.p[1 - seat];
    return { t: "conn:state", order: this.order, solved: me.solved.map((l) => this.groupInfo(l)), mistakes: me.mistakes, max: CONN_MISTAKES,
      opp: { solved: them.solved.length, mistakes: them.mistakes, done: them.doneMs !== null }, ms: Math.max(0, CONN_MS - (Date.now() - this.at)) };
  }
  onMessage(seat, m) {
    if (m.t !== "conn:guess" || this.over || !Array.isArray(m.pids) || m.pids.length !== 4) return;
    const me = this.p[seat];
    if (me.doneMs !== null) return;
    const pids = [...new Set(m.pids.map(String))];
    if (pids.length !== 4 || !pids.every((p) => this.order.includes(p))) return;
    const solvedPids = new Set(me.solved.flatMap((l) => this.groups[l].players));
    if (pids.some((p) => solvedPids.has(p))) return;
    const key = pids.slice().sort().join(",");
    if (me.tried.has(key)) return;
    me.tried.add(key);
    const g = this.groups.find((x) => pids.every((p) => x.players.includes(p)));
    if (g) {
      me.solved.push(g.level);
      this.room.send(seat, { t: "conn:right", group: this.groupInfo(g.level) });
    } else {
      me.mistakes++;
      const best = Math.max(...this.groups.map((x) => pids.filter((p) => x.players.includes(p)).length));
      this.room.send(seat, { t: "conn:wrong", oneAway: best === 3, mistakes: me.mistakes });
    }
    if (me.solved.length === 4 || me.mistakes >= CONN_MISTAKES) me.doneMs = Date.now() - this.at;
    this.room.send(1 - seat, { t: "conn:opp", solved: me.solved.length, mistakes: me.mistakes, done: me.doneMs !== null });
    if (this.p.every((x) => x.doneMs !== null)) this.end("done");
    // the result can't change any more: one finished all four groups, the other is out
    else if (this.p.some((x) => x.solved.length === 4) && this.p.some((x) => x.doneMs !== null && x.solved.length < 4)) this.end("done");
  }
  end(reason) {
    if (this.over) return;
    this.over = true;
    const [a, b] = this.p;
    let winner = null;
    if (a.solved.length !== b.solved.length) winner = a.solved.length > b.solved.length ? 0 : 1;
    else if (a.mistakes !== b.mistakes) winner = a.mistakes < b.mistakes ? 0 : 1;
    else if (a.solved.length && a.doneMs !== null && b.doneMs !== null && a.doneMs !== b.doneMs) winner = a.doneMs < b.doneMs ? 0 : 1;
    this.room.finish({ winner, scores: [a.solved.length, b.solved.length], reason: "done",
      detail: { groups: this.groups.map((g) => ({ level: g.level, label: g.label, players: g.players })), solved: [a.solved, b.solved], mistakes: [a.mistakes, b.mistakes], ms: [a.doneMs, b.doneMs], timeUp: reason === "time" } });
  }
  resync(seat) { if (!this.over && this.at) this.room.send(seat, this.stateMsg(seat)); }
}

// ---------------------------------------------------------------- The Grid duel
// Same board for both. 9 guesses and 3 minutes each; every right answer scores its rarity (0-100).
const GRID_MS = 180000, GRID_GUESSES = 9;

class GridDuel {
  constructor(room, rnd) {
    this.room = room; this.rnd = rnd;
    this.board = makeGrid(rnd);
    this.p = [0, 1].map(() => ({ cells: Array(9).fill(null), left: GRID_GUESSES, wrong: 0, doneMs: null }));
    this.over = false;
  }
  start() {
    this.at = Date.now();
    [0, 1].forEach((seat) => this.room.send(seat, this.stateMsg(seat)));
    this.room.timer(() => this.end("time"), GRID_MS + 500);
  }
  score(x) { return x.cells.reduce((s, c) => s + (c ? c.rarity : 0), 0); }
  stateMsg(seat) {
    const me = this.p[seat], them = this.p[1 - seat];
    return { t: "grid:state", rows: this.board.rows, cols: this.board.cols, cells: me.cells, left: me.left, score: this.score(me),
      opp: { filled: them.cells.map(Boolean), left: them.left, score: this.score(them) }, scores: this.p.map((x) => this.score(x)), ms: Math.max(0, GRID_MS - (Date.now() - this.at)) };
  }
  onMessage(seat, m) {
    if (m.t !== "grid:guess" || this.over) return;
    const me = this.p[seat];
    const cell = Number(m.cell), pid = String(m.pid || "");
    if (me.doneMs !== null || !(cell >= 0 && cell < 9) || me.cells[cell] || me.left <= 0 || !playersById.has(pid)) return;
    if (me.cells.some((c) => c?.pid === pid)) return;
    me.left--;
    const r = criterionById(this.board.rows[Math.floor(cell / 3)]), c = criterionById(this.board.cols[cell % 3]);
    const f = facts().get(pid);
    const right = !!(f && r.test(f) && c.test(f));
    if (right) me.cells[cell] = { pid, rarity: rarity(pid, answersFor(r, c)) };
    else me.wrong++;
    this.room.send(seat, { t: "grid:result", cell, pid, right, rarity: right ? me.cells[cell].rarity : 0, left: me.left, score: this.score(me) });
    if (me.left <= 0 || me.cells.every(Boolean)) me.doneMs = Date.now() - this.at;
    this.room.send(1 - seat, { t: "grid:opp", filled: me.cells.map(Boolean), left: me.left, score: this.score(me), done: me.doneMs !== null });
    this.room.broadcast({ t: "grid:scores", scores: this.p.map((x) => this.score(x)) });
    if (this.p.every((x) => x.doneMs !== null)) this.end("done");
  }
  end(reason) {
    if (this.over) return;
    this.over = true;
    const [a, b] = this.p.map((x) => this.score(x));
    const fa = this.p[0].cells.filter(Boolean).length, fb = this.p[1].cells.filter(Boolean).length;
    const winner = a !== b ? (a > b ? 0 : 1) : fa !== fb ? (fa > fb ? 0 : 1) : null;
    this.room.finish({ winner, scores: [a, b], reason: "done",
      detail: { rows: this.board.rows, cols: this.board.cols, cells: this.p.map((x) => x.cells), filled: [fa, fb], timeUp: reason === "time" } });
  }
  resync(seat) { if (!this.over && this.at) this.room.send(seat, this.stateMsg(seat)); }
}

function winnerOf([a, b]) { return a === b ? null : a > b ? 0 : 1; }

const ENGINES = { hl: HLDuel, career: CareerDuel, guess: GuessDuel, draft: DraftDuel, conn: ConnDuel, grid: GridDuel };
export function createEngine(game, room, seed) {
  return new ENGINES[game](room, seededRng("online-" + seed));
}
