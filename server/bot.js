// Bot opponent for when nobody else is online. It sits in a room like a real player and answers
// through the same engine calls, with human-like delays and mistakes per difficulty.
import { namedPlayers, psKey } from "../game/js/data.js";
import { SLOT_WEIGHT, slotValue } from "../game/js/shared/draftLogic.js";

export const BOT_LEVELS = {
  easy: { name: "Rookie Bot", icon: "whistle", color: "#199e70", level: 3, frame: "none",
    hl: [0.58, 3500, 7500], career: [0.5, 8000, 15000], guess: { solve: 0.45, at: [6, 8], every: [15000, 22000] }, draft: "easy" },
  normal: { name: "Veteran Bot", icon: "rocket", color: "#3987e5", level: 15, frame: "silver",
    hl: [0.72, 2200, 6000], career: [0.7, 5000, 12000], guess: { solve: 0.8, at: [5, 7], every: [11000, 17000] }, draft: "normal" },
  hard: { name: "Legend Bot", icon: "crown", color: "#d55181", level: 40, frame: "gold",
    hl: [0.88, 1100, 3500], career: [0.88, 2500, 7000], guess: { solve: 1, at: [3, 5], every: [8000, 12000] }, draft: "hard" },
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
      if (m.t === "end") { bot.guessing = false; later(() => room.chatFrom?.(bot, m.result === "win" ? 6 : 1), 1200); }
      if (m.t === "opp:rematch") later(() => room.rematchFrom?.(bot), 1500);
      if (m.t === "match") bot.guessing = false;
    },
  };
  return bot;
}
