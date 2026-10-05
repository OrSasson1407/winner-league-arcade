// Bot opponent for when nobody else is online. It sits in a room like a real player and answers
// through the same engine calls, with human-like delays and mistakes per difficulty.
import { namedPlayers, psKey } from "../game/js/data.js";
import { SLOT_WEIGHT, slotValue } from "../game/js/shared/draftLogic.js";
import { answersFor, criterionById } from "../game/js/shared/leagueFacts.js";

export const BOT_LEVELS = {
  easy: { name: "Rookie Bot", icon: "whistle", color: "#199e70", level: 3, frame: "none",
    hl: [0.58, 3500, 7500], career: [0.5, 8000, 15000], guess: { solve: 0.45, at: [6, 8], every: [15000, 22000] }, draft: "easy",
    conn: [0.45, [22000, 34000]], grid: [0.6, [16000, 24000], 0] },
  normal: { name: "Veteran Bot", icon: "rocket", color: "#3987e5", level: 15, frame: "silver",
    hl: [0.72, 2200, 6000], career: [0.7, 5000, 12000], guess: { solve: 0.8, at: [5, 7], every: [11000, 17000] }, draft: "normal",
    conn: [0.62, [16000, 26000]], grid: [0.78, [12000, 19000], 0.4] },
  hard: { name: "Legend Bot", icon: "crown", color: "#d55181", level: 40, frame: "gold",
    hl: [0.88, 1100, 3500], career: [0.88, 2500, 7000], guess: { solve: 1, at: [3, 5], every: [8000, 12000] }, draft: "hard",
    conn: [0.8, [11000, 19000]], grid: [0.92, [8000, 14000], 0.8] },
};
const between = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createBot(levelKey) {
  const L = BOT_LEVELS[levelKey] || BOT_LEVELS.normal;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const bot = {
    sid: "bot-" + Math.random().toString(36).slice(2), isBot: true, botLevel: levelKey, ws: null, room: null,
    profile: { name: L.name, icon: L.icon, color: L.color, frame: L.frame, level: L.level },
    stop() { timers.forEach(clearTimeout); timers.clear(); },
    receive(m) {
      const room = bot.room;
      if (!room) return;
      const seat = room.players.indexOf(bot);
      const eng = () => room.engine;
      const act = (msg) => { if (bot.room === room && !room.over) room.engine.onMessage(seat, msg); };

      if (m.t === "hl:round") {
        const [p, lo, hi] = L.hl;
        later(() => {
          const c = eng().cur;
          if (!c || eng().i !== m.i) return;
          const get = { ppg: (ps) => ps.stats.ppg, rpg: (ps) => ps.stats.rpg, apg: (ps) => ps.stats.apg, rating: (ps) => ps.rating_mock, val: (ps) => ps.stats.valuation_per_game }[c.cat];
          const right = get(c.b) >= get(c.a) ? "higher" : "lower";
          act({ t: "hl:answer", i: m.i, c: Math.random() < p ? right : right === "higher" ? "lower" : "higher" });
        }, Math.min(9500, between(lo, hi)));
      }
      if (m.t === "car:round") {
        const [p, lo, hi] = L.career;
        later(() => {
          const c = eng().cur;
          if (!c || eng().i !== m.i || c.done) return;
          const wrong = c.options.filter((x) => x !== c.target && x !== c.picks[1 - seat]);
          act({ t: "car:answer", i: m.i, pid: Math.random() < p || !wrong.length ? c.target : pickOne(wrong) });
        }, Math.min(19500, between(lo, hi)));
      }
      if (m.t === "guess:state" && !bot.guessing) {
        bot.guessing = true;
        const G = L.guess;
        const solveAt = Math.random() < G.solve ? Math.round(between(G.at[0], G.at[1])) : 99;
        let tries = 0;
        const step = () => {
          if (bot.room !== room || room.over || eng().over) return;
          tries++;
          const target = eng().target.player_id;
          const used = new Set(eng().p[seat].rows.map((r) => r.pid));
          let pid = target;
          if (tries < solveAt) do pid = pickOne(namedPlayers).player_id; while (pid === target || used.has(pid));
          act({ t: "guess:guess", pid });
          if (pid !== target && tries < 8) later(step, between(...G.every));
        };
        later(step, between(...G.every));
      }
      if (m.t === "draft:state" && m.turn === seat) {
        later(() => {
          const e = eng();
          if (e.over || e.turn() !== seat || e.round !== m.round) return;
          const free = e.free(seat);
          const options = [];
          for (const ps of e.spin.roster) {
            if (e.used.has(ps.player_id)) continue;
            for (const slot of free) options.push({ ps, slot, v: slotValue(ps, slot) * SLOT_WEIGHT(slot) + (L.draft === "easy" ? Math.random() * 25 : 0) });
          }
          options.sort((a, b) => b.v - a.v);
          const choice = L.draft === "hard" ? options[0] : L.draft === "normal" ? pickOne(options.slice(0, 3)) : pickOne(options.slice(0, 6));
          if (choice) act({ t: "draft:pick", key: psKey(choice.ps), slot: choice.slot });
        }, between(1800, 4500));
      }
      if (m.t === "conn:state" && !bot.connecting) { // Connections: groups in order of difficulty, with some wrong tries
        bot.connecting = true;
        const [p, every] = L.conn;
        const step = () => {
          const e = eng();
          if (bot.room !== room || room.over || e.over) return;
          const me = e.p[seat];
          if (me.doneMs !== null) return;
          const open = e.groups.filter((g) => !me.solved.includes(g.level));
          if (!open.length) return;
          let pids;
          if (Math.random() < p) pids = open[0].players;
          else { // a near miss: three from one group and one from another
            const a = open[0], b = open[1] || open[0];
            pids = [...a.players.slice(0, 3), b.players.find((x) => !a.players.includes(x)) || a.players[3]];
            if (me.tried.has(pids.slice().sort().join(","))) pids = open[0].players;
          }
          act({ t: "conn:guess", pids });
          later(step, between(...every));
        };
        later(step, between(...every));
      }
      if (m.t === "grid:state" && !bot.gridding) { // The Grid: fill a cell, sometimes with a rare answer, sometimes wrong
        bot.gridding = true;
        const [p, every, rare] = L.grid;
        const step = () => {
          const e = eng();
          if (bot.room !== room || room.over || e.over) return;
          const me = e.p[seat];
          if (me.doneMs !== null || me.left <= 0) return;
          const empty = me.cells.map((c, i) => (c ? null : i)).filter((i) => i !== null);
          const cell = pickOne(empty);
          const r = criterionById(e.board.rows[Math.floor(cell / 3)]), c = criterionById(e.board.cols[cell % 3]);
          const used = new Set(me.cells.filter(Boolean).map((x) => x.pid));
          const answers = answersFor(r, c).filter((f) => !used.has(f.pid)).sort((a, b) => b.games - a.games);
          let pid;
          if (Math.random() < p && answers.length) {
            const pool = Math.random() < rare ? answers.slice(Math.floor(answers.length / 2)) : answers.slice(0, Math.max(1, Math.ceil(answers.length / 3)));
            pid = pickOne(pool).pid;
          } else pid = pickOne(namedPlayers).player_id;
          act({ t: "grid:guess", cell, pid });
          later(step, between(...every));
        };
        later(step, between(...every));
      }
      if (m.t === "draft:plan") { // the bot picks a game plan
        later(() => {
          const pick = (o) => o[Math.floor(Math.random() * o.length)];
          act({ t: "draft:tactics", tactics: { pace: pick(["slow", "normal", "fast"]), defense: pick(["man", "man", "zone", "press"]), focus: pick(["balanced", "star", "paint", "threes"]) } });
        }, between(2000, 6000));
      }
      if (m.t === "end") { bot.guessing = false; bot.connecting = false; bot.gridding = false; later(() => room.chatFrom?.(bot, m.result === "win" ? 6 : 1), 1200); }
      if (m.t === "opp:rematch") later(() => room.rematchFrom?.(bot), 1500);
      if (m.t === "match") { bot.guessing = false; bot.connecting = false; bot.gridding = false; }
    },
  };
  return bot;
}
