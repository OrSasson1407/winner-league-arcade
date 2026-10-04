// Winner League Arcade server: serves the game (static files) and runs online 1v1 at /ws.
//   npm install && npm start            → http://localhost:5173/game/
// Environment: PORT (default 5173), HOST (default 127.0.0.1 locally, 0.0.0.0 when PORT is set by a host).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { GAMES, createEngine } from "./duels.js";
import { BOT_LEVELS, createBot } from "./bot.js";
import { applyResult, findByCode, leaderboard, recordFor, recordMsg, setProfile } from "./records.js";
import { CHAT, cleanCode, friendCode, matchRange } from "../game/js/shared/rating.js";
import { cleanAv } from "../game/js/lib/avatarArt.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 5173;
const HOST = process.env.HOST || (process.env.PORT || process.argv.includes("--lan") ? "0.0.0.0" : "127.0.0.1");
const RECONNECT_GRACE = 20000;

// ---------------------------------------------------------------- static files
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".webmanifest"]);
const ALLOWED = ["game", "src"]; // only the game and its data helpers are public
const gzCache = new Map(); // file -> { mtime, body }

// ---------------------------------------------------------------- feedback ("Send feedback" in the app)
// Stored in server/data/feedback.jsonl (when the host keeps the disk) and printed to the server log.
// Read them with GET /api/feedback and the header "x-admin-key: <WLA_SECRET>".
const FEEDBACK_FILE = path.join(ROOT, "server", "data", "feedback.jsonl");
const fbHits = new Map(); // ip -> [timestamps]
const fbRecent = [];
function feedback(req, res) {
  const json = (code, body) => res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
  if (req.method === "GET") {
    const key = req.headers["x-admin-key"];
    if (!process.env.WLA_SECRET || key !== process.env.WLA_SECRET) return json(403, { error: "forbidden" });
    let rows = fbRecent;
    try { rows = fs.readFileSync(FEEDBACK_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch {}
    return json(200, rows.slice(-300));
  }
  if (req.method !== "POST") return json(405, { error: "method" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now();
  const hits = (fbHits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= 6) return json(429, { error: "busy" });
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 8000) req.destroy(); });
  req.on("end", () => {
    let d;
    try { d = JSON.parse(body); } catch { return json(400, { error: "bad json" }); }
    const kind = ["bug", "idea", "other"].includes(d.kind) ? d.kind : "other";
    const cleanText = (v, n) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f<>]/g, "").trim().slice(0, n);
    const message = cleanText(d.message, 1500);
    if (message.length < 3) return json(400, { error: "empty" });
    hits.push(now); fbHits.set(ip, hits);
    const row = { at: new Date(now).toISOString(), kind, message, tech: cleanText(d.tech, 1500) };
    fbRecent.push(row); if (fbRecent.length > 300) fbRecent.shift();
    console.log("[feedback]", JSON.stringify(row));
    fs.mkdir(path.dirname(FEEDBACK_FILE), { recursive: true }, () => fs.appendFile(FEEDBACK_FILE, JSON.stringify(row) + "\n", () => {}));
    json(200, { ok: true });
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  if (url === "/" || url === "/game") { res.writeHead(302, { Location: "/game/" }).end(); return; }
  if (url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); return; }
  if (url === "/api/feedback") { feedback(req, res); return; }
  let file = path.normalize(path.join(ROOT, url));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !ALLOWED.includes(rel.split(path.sep)[0])) { res.writeHead(404).end("Not found"); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { file = path.join(file, "index.html"); st = fs.existsSync(file) ? fs.statSync(file) : null; }
    if (err || !st) { res.writeHead(404).end("Not found"); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = { "Content-Type": (TYPES[ext] || "application/octet-stream") + (TEXT.has(ext) ? "; charset=utf-8" : ""), "Cache-Control": "no-store, must-revalidate" };
    if (TEXT.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      let c = gzCache.get(file);
      if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, body: zlib.gzipSync(fs.readFileSync(file), { level: 6 }) }; gzCache.set(file, c); }
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Content-Length": c.body.length }).end(c.body);
    } else {
      res.writeHead(200, { ...headers, "Content-Length": st.size });
      fs.createReadStream(file).pipe(res);
    }
  });
});

// ---------------------------------------------------------------- online lobby
const clients = new Map(); // sid -> client
const queues = new Map(GAMES.map((g) => [g, []])); // game -> [{ c, at }]
const invites = new Map(); // code -> { host, game, at, to? }
const rooms = new Map(); // id -> room
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const send = (c, msg) => {
  if (c?.isBot) { c.receive(msg); return; }
  if (c?.ws?.readyState === 1) c.ws.send(JSON.stringify({ ...msg, now: Date.now() }));
};
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const eloOf = (c, game) => (c.isBot ? null : c.rec?.elo[game] ?? 1000);
const publicProfile = (c, game) => ({ name: c.profile.name, icon: c.profile.icon, color: c.profile.color, frame: c.profile.frame, level: c.profile.level, style: c.profile.style, av: c.profile.av,
  code: c.isBot ? null : friendCode(c.sid), elo: eloOf(c, game), bot: !!c.isBot, botLevel: c.botLevel || null });
const onlineByCode = (code) => { for (const c of clients.values()) if (c.ws && friendCode(c.sid) === code) return c; return null; };

function newCode() {
  for (;;) {
    const code = Array.from(crypto.randomBytes(5), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    if (!invites.has(code)) return code;
  }
}

function stats() {
  const waiting = Object.fromEntries(GAMES.map((g) => [g, queues.get(g).length]));
  const live = [...rooms.values()].filter((r) => !r.over);
  return { t: "stats", online: [...clients.values()].filter((c) => c.ws).length, playing: live.reduce((s, r) => s + r.players.filter((p) => !p.isBot).length, 0), waiting };
}
let statsTimer = null;
function pushStats() { // batched: at most one broadcast per second
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    const s = stats();
    for (const c of clients.values()) if (!c.room) send(c, s);
  }, 1000);
}

function leaveLobby(c) {
  for (const [, q] of queues) { const i = q.findIndex((x) => x.c === c); if (i >= 0) q.splice(i, 1); }
  for (const [code, inv] of invites) if (inv.host === c) { invites.delete(code); if (inv.to) send(inv.to, { t: "invite:gone", code }); }
}

/** Rating-based matchmaking: the allowed rating gap grows the longer people wait. */
function matchQueue(game) {
  const q = queues.get(game);
  const now = Date.now();
  for (let i = 0; i < q.length; i++) {
    for (let j = i + 1; j < q.length; j++) {
      const a = q[i], b = q[j];
      if (!a.c.ws || !b.c.ws) continue;
      const waited = (now - Math.min(a.at, b.at)) / 1000;
      if (Math.abs(eloOf(a.c, game) - eloOf(b.c, game)) <= matchRange(waited)) {
        q.splice(j, 1); q.splice(i, 1);
        createRoom(game, a.c, b.c, "ranked");
        return matchQueue(game);
      }
    }
  }
}
setInterval(() => GAMES.forEach(matchQueue), 2000).unref();

// ---------------------------------------------------------------- rooms
function createRoom(game, a, b, mode) {
  leaveLobby(a); leaveLobby(b);
  const room = {
    id: crypto.randomUUID(), game, mode, rated: mode === "ranked", players: [a, b], timers: new Set(), over: false, rematch: new Set(), seq: 0,
    send(seat, msg) { send(this.players[seat], msg); },
    broadcast(msg) { this.players.forEach((p) => send(p, msg)); },
    timer(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); if (!this.over) fn(); }, ms); this.timers.add(t); return t; },
    clearTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); },
    names() { return this.players.map((p) => p.profile.name); },
    finish(res) { finishRoom(this, res); },
    chatFrom(c, i) { const seat = this.players.indexOf(c); if (seat >= 0) send(this.players[1 - seat], { t: "chat", i }); },
    rematchFrom(c) { onMessage(c, { t: "rematch" }); },
  };
  rooms.set(room.id, room);
  a.room = room; b.room = room;
  startMatch(room);
  pushStats();
}

function startMatch(room) {
  room.over = false;
  room.rematch.clear();
  room.seq++;
  room.engine = createEngine(room.game, room, `${room.id}-${room.seq}`);
  room.players.forEach((p, seat) => send(p, matchMsg(room, seat)));
  // a short countdown before the first round
  room.timer(() => room.engine.start(), 3500);
}
const matchMsg = (room, seat, extra = {}) => ({ t: "match", room: room.id, game: room.game, mode: room.mode, rated: room.rated, seat,
  you: publicProfile(room.players[seat], room.game), opp: publicProfile(room.players[1 - seat], room.game), seq: room.seq, ...extra });

function finishRoom(room, { winner, scores, reason, detail = null }) {
  if (room.over) return;
  room.over = true;
  room.clearTimers();
  let delta = [0, 0];
  if (room.rated && room.players.every((p) => p.rec)) {
    delta = applyResult(room.game, room.players.map((p) => p.rec), winner);
  }
  room.players.forEach((p, seat) => {
    send(p, {
      t: "end", game: room.game, seat, winner, scores, reason, detail, mode: room.mode, rated: room.rated,
      result: winner === null ? "draw" : winner === seat ? "win" : "lose",
      delta: delta[seat], elo: room.rated ? p.rec?.elo[room.game] : null, streak: room.rated ? p.rec?.streak : null,
    });
    if (room.rated && p.rec) send(p, recordMsg(p.rec));
  });
  pushStats();
}

function forfeit(room, loserSeat, reason) {
  if (room.over) return;
  finishRoom(room, { winner: 1 - loserSeat, scores: null, reason });
}

function closeRoom(room, leaver) {
  room.clearTimers();
  rooms.delete(room.id);
  room.players.forEach((p) => {
    if (p.room === room) p.room = null;
    if (p.isBot) p.stop();
    else if (p !== leaver) send(p, { t: "opp:left" });
  });
  pushStats();
}

function seatOf(c) { return c.room ? c.room.players.indexOf(c) : -1; }

// ---------------------------------------------------------------- messages
function onMessage(c, m) {
  switch (m.t) {
    case "ping": return send(c, { t: "pong", c: m.c });
    case "profile": {
      c.profile = { name: clean(m.name, 18) || "Guest", icon: clean(m.icon, 12) || "ball", color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : "#ff7a1a",
        frame: clean(m.frame, 16) || "none", level: Math.max(1, Math.min(999, Number(m.level) || 1)),
        style: m.style === "player" ? "player" : "icon", av: m.style === "player" ? cleanAv(m.av) : null };
      c.rec = recordFor(c.sid, m.rec);
      setProfile(c.rec, c.profile);
      send(c, recordMsg(c.rec));
      return;
    }
    case "stats": return send(c, stats());
    case "leaders": return send(c, leaderboard(GAMES.includes(m.game) ? m.game : "all", c.sid));
    case "queue": {
      if (!GAMES.includes(m.game) || c.room) return;
      leaveLobby(c);
      queues.get(m.game).push({ c, at: Date.now() });
      send(c, { t: "queued", game: m.game });
      matchQueue(m.game);
      return pushStats();
    }
    case "bot": { // nobody around: play the computer (not rated)
      if (!GAMES.includes(m.game) || c.room) return;
      leaveLobby(c);
      const bot = createBot(BOT_LEVELS[m.level] ? m.level : "normal");
      return createRoom(m.game, c, bot, "bot");
    }
    case "invite": {
      if (!GAMES.includes(m.game) || c.room) return;
      leaveLobby(c);
      const code = newCode();
      invites.set(code, { host: c, game: m.game, at: Date.now() });
      return send(c, { t: "invited", code, game: m.game });
    }
    case "invite:friend": { // invite someone by player code; they get a pop-up wherever they are in the arcade
      const to = onlineByCode(cleanCode(m.code));
      if (!GAMES.includes(m.game) || c.room) return;
      if (!to || to === c) return send(c, { t: "error", code: "friend-offline", msg: "That player isn't online right now." });
      if (to.room && !to.room.over) return send(c, { t: "error", code: "friend-busy", msg: `${to.profile.name} is in a match right now.` });
      leaveLobby(c);
      const code = newCode();
      invites.set(code, { host: c, game: m.game, at: Date.now(), to });
      send(c, { t: "invited", code, game: m.game, to: to.profile.name });
      return send(to, { t: "invite:incoming", code, game: m.game, from: publicProfile(c, m.game) });
    }
    case "invite:decline": {
      const inv = invites.get(cleanCode(m.code));
      if (!inv || inv.to !== c) return;
      invites.delete(cleanCode(m.code));
      return send(inv.host, { t: "invite:declined", name: c.profile.name });
    }
    case "join": {
      const code = cleanCode(m.code).slice(0, 8);
      const inv = invites.get(code);
      if (!inv || !inv.host.ws) return send(c, { t: "error", code: "bad-code", msg: "That invite isn't active anymore. Ask your friend for a new one." });
      if (inv.host === c) return send(c, { t: "error", code: "own-code", msg: "That's your own invite. Send it to a friend." });
      if (inv.host.room) return send(c, { t: "error", code: "bad-code", msg: "Your friend already started another match." });
      if (c.room) { if (!c.room.over) return; closeRoom(c.room, c); }
      invites.delete(code);
      return createRoom(inv.game, inv.host, c, "friendly");
    }
    case "friends": { // status of the player's friends (codes kept in their browser)
      const codes = Array.isArray(m.codes) ? m.codes.slice(0, 100).map(cleanCode) : [];
      const list = codes.map((code) => {
        const on = onlineByCode(code);
        const r = on?.rec || findByCode(code);
        if (!r?.profile && !on) return { code, known: false };
        const p = on ? on.profile : r.profile;
        return { code, known: true, online: !!on, playing: !!(on?.room && !on.room.over), name: p.name, icon: p.icon, color: p.color, frame: p.frame, level: p.level, style: p.style, av: p.av };
      });
      return send(c, { t: "friends", list });
    }
    case "whois": {
      const code = cleanCode(m.code);
      const on = onlineByCode(code);
      const r = on?.rec || findByCode(code);
      const p = on?.profile || r?.profile;
      return send(c, p ? { t: "whois", code, found: true, name: p.name, icon: p.icon, color: p.color, frame: p.frame, level: p.level, style: p.style, av: p.av, online: !!on }
        : { t: "whois", code, found: false });
    }
    case "cancel": leaveLobby(c); send(c, { t: "cancelled" }); return pushStats();
    case "leave": {
      const room = c.room;
      if (!room) return;
      if (!room.over) forfeit(room, seatOf(c), "forfeit");
      return closeRoom(room, c);
    }
    case "rematch": {
      const room = c.room;
      if (!room || !room.over) return;
      room.rematch.add(c);
      if (room.rematch.size === 2) { room.players.reverse(); return startMatch(room); } // swap seats
      return send(room.players[1 - seatOf(c)], { t: "opp:rematch" });
    }
    case "react": { // quick emoji reactions between opponents
      const room = c.room;
      const EMOJI = ["👏", "🔥", "😅", "😮", "💪", "🏀"];
      if (room && EMOJI.includes(m.e)) send(room.players[1 - seatOf(c)], { t: "react", e: m.e });
      return;
    }
    case "chat": { // preset lines only, sent by index
      const room = c.room;
      const now = Date.now();
      if (!room || !Number.isInteger(m.i) || m.i < 0 || m.i >= CHAT.length || now - (c.lastChat || 0) < 1500) return;
      c.lastChat = now;
      return send(room.players[1 - seatOf(c)], { t: "chat", i: m.i });
    }
    default:
      if (c.room && !c.room.over && typeof m.t === "string") c.room.engine.onMessage(seatOf(c), m);
  }
}

// ---------------------------------------------------------------- connections
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const sid = /^[a-zA-Z0-9-]{8,64}$/.test(url.searchParams.get("sid") || "") ? url.searchParams.get("sid") : crypto.randomUUID();
  let c = clients.get(sid);
  if (c?.ws && c.ws !== ws) { try { c.ws.close(4000, "replaced"); } catch {} }
  if (!c) { c = { sid, ws: null, profile: { name: "Guest", icon: "ball", color: "#ff7a1a", frame: "none", level: 1 }, rec: null, room: null, goneTimer: null }; clients.set(sid, c); }
  c.ws = ws;
  ws.alive = true;
  clearTimeout(c.goneTimer);
  send(c, { ...stats(), t: "welcome", sid, code: friendCode(sid) });

  // back after a dropped connection: a finished match is closed, a running one resumes
  if (c.room?.over) closeRoom(c.room, c);
  if (c.room) {
    const room = c.room, seat = seatOf(c);
    send(c, matchMsg(room, seat, { resumed: true }));
    room.send(1 - seat, { t: "opp:back" });
    if (!room.over) room.engine.resync(seat);
  }

  ws.on("pong", () => { ws.alive = true; });
  ws.on("message", (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m && typeof m === "object") { try { onMessage(c, m); } catch (e) { console.error("message error", m.t, e); } }
  });
  ws.on("close", () => {
    if (c.ws !== ws) return; // replaced by a newer connection
    c.ws = null;
    leaveLobby(c);
    pushStats();
    const room = c.room;
    if (room) room.send(1 - seatOf(c), { t: "opp:away", ms: RECONNECT_GRACE });
    c.goneTimer = setTimeout(() => {
      if (c.ws) return;
      if (c.room) { if (!c.room.over) forfeit(c.room, seatOf(c), "disconnect"); closeRoom(c.room, c); }
      clients.delete(sid);
      pushStats();
    }, RECONNECT_GRACE);
  });
});

// drop dead connections (sleeping laptops, lost Wi-Fi)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
  const old = Date.now() - 60 * 60 * 1000; // invites live for an hour
  for (const [code, inv] of invites) if (inv.at < old) invites.delete(code);
}, 25000);

server.listen(PORT, HOST, () => {
  console.log(`Winner League Arcade: http://localhost:${PORT}/game/  (online play at ws://…/ws, close this window to stop)`);
});
