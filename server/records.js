// Online records: ELO per game, wins/losses, win streak, and the leaderboard.
// Records live in memory and are saved to the store (Postgres with DATABASE_URL, else server/data,
// see db.js). Every player also keeps a copy as a token signed with the server's secret (WLA_SECRET):
// if the server ever forgets a record, the player's browser sends the token back and it is restored;
// the signature means it can't be edited in the browser.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RATED_GAMES, START_ELO, eloUpdate, friendCode, rankOf } from "../game/js/shared/rating.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
/** Where the signing secret came from: "env" (stable across restarts) or "local" (a file, lost with the disk). */
export const secretSource = process.env.WLA_SECRET ? "env" : "local";

function loadSecret() {
  if (process.env.WLA_SECRET) return process.env.WLA_SECRET;
  const f = path.join(DIR, ".secret");
  try { return fs.readFileSync(f, "utf8").trim(); } catch {}
  const s = crypto.randomBytes(32).toString("hex");
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, s); } catch {}
  return s;
}
const SECRET = loadSecret();
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

const records = new Map(); // sid -> record
const dirty = new Set(); // sids changed since the last save
let store = null;

export function blankRecord(sid) {
  const per = (v) => Object.fromEntries(RATED_GAMES.map((g) => [g, v]));
  return { v: 1, sid, elo: per(START_ELO), peak: per(START_ELO), w: per(0), l: per(0), d: per(0), streak: 0, best: 0, n: 0, ts: 0, wk: blankWeek(), profile: null };
}
/** ISO week id ("2026-W40"): leagues count this week's results. */
export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}
const blankWeek = () => ({ id: weekId(), pts: 0, w: 0, d: 0, l: 0, g: 0 });
/** Records made before a game existed get its defaults (tokens and the saved file keep old shapes). */
function normalize(rec) {
  for (const [k, v] of [["elo", START_ELO], ["peak", START_ELO], ["w", 0], ["l", 0], ["d", 0]]) {
    rec[k] = { ...rec[k] };
    for (const g of RATED_GAMES) if (typeof rec[k][g] !== "number") rec[k][g] = v;
  }
  if (!rec.wk || rec.wk.id !== weekId()) rec.wk = blankWeek();
  return rec;
}

export function tokenOf(rec) {
  const { profile, ...data } = rec;
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readToken(token, sid) {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const rec = JSON.parse(Buffer.from(body, "base64url").toString());
    return rec.sid === sid && rec.v === 1 ? rec : null;
  } catch { return null; }
}

/** The player's record, restored from their token when it's newer than what the server has. */
export function recordFor(sid, token) {
  let rec = records.get(sid);
  const fromToken = token ? readToken(token, sid) : null;
  if (fromToken && (!rec || fromToken.n > rec.n)) { rec = { ...blankRecord(sid), ...fromToken, profile: rec?.profile ?? null }; records.set(sid, rec); dirty.add(sid); }
  if (!rec) { rec = blankRecord(sid); records.set(sid, rec); }
  return normalize(rec);
}
/** A finished match against a person (ranked or friendly) counts for this week's league table: win 3, draw 1. */
export function addWeekly(recs, winner) {
  recs.forEach((r, seat) => {
    normalize(r);
    r.wk.g++;
    if (winner === null) { r.wk.d++; r.wk.pts += 1; }
    else if (winner === seat) { r.wk.w++; r.wk.pts += 3; }
    else r.wk.l++;
    r.ts = Date.now();
    dirty.add(r.sid);
  });
}
/** This week's numbers for a record (zeros once a new week starts). */
export const weekOf = (rec) => (rec?.wk?.id === weekId() ? rec.wk : blankWeek());

export function setProfile(rec, profile) {
  rec.profile = { ...profile, code: friendCode(rec.sid) };
  dirty.add(rec.sid);
}

/** Apply a rated result. winner: 0 | 1 | null (draw). Returns the rating change per seat. */
export function applyResult(game, recs, winner) {
  const [a, b] = recs;
  const games = (r) => r.w[game] + r.l[game] + r.d[game];
  const before = [a.elo[game], b.elo[game]];
  const score = winner === null ? 0.5 : winner === 0 ? 1 : 0;
  const [na, nb] = eloUpdate(before[0], before[1], score, games(a), games(b));
  [[a, na], [b, nb]].forEach(([r, elo], seat) => {
    r.elo[game] = elo;
    r.peak[game] = Math.max(r.peak[game], elo);
    if (winner === null) r.d[game]++;
    else if (winner === seat) { r.w[game]++; r.streak++; r.best = Math.max(r.best, r.streak); }
    else { r.l[game]++; r.streak = 0; }
    r.n++; r.ts = Date.now();
    dirty.add(r.sid);
  });
  return [na - before[0], nb - before[1]];
}

/** Public summary for the browser (ranks, records), plus the signed token to keep. */
export function recordMsg(rec) {
  return { t: "record", token: tokenOf(rec), rec: { elo: rec.elo, peak: rec.peak, w: rec.w, l: rec.l, d: rec.d, streak: rec.streak, best: rec.best, code: friendCode(rec.sid) } };
}

export function leaderboard(game, meSid) {
  const rows = [...records.values()].filter((r) => r.profile && (game === "all"
    ? RATED_GAMES.some((g) => r.w[g] + r.l[g] + r.d[g] > 0)
    : r.w[game] + r.l[game] + r.d[game] > 0));
  const score = (r) => (game === "all" ? RATED_GAMES.reduce((s, g) => s + r.w[g], 0) : r.elo[game]);
  rows.sort((x, y) => score(y) - score(x));
  const view = (r, i) => {
    const w = game === "all" ? RATED_GAMES.reduce((s, g) => s + r.w[g], 0) : r.w[game];
    const l = game === "all" ? RATED_GAMES.reduce((s, g) => s + r.l[g], 0) : r.l[game];
    const best = game === "all" ? Math.max(...RATED_GAMES.map((g) => r.elo[g])) : r.elo[game];
    return { pos: i + 1, name: r.profile.name, icon: r.profile.icon, color: r.profile.color, frame: r.profile.frame, level: r.profile.level, style: r.profile.style, av: r.profile.av,
      code: r.profile.code, elo: best, rank: rankOf(best).id, w, l, streak: r.streak, me: r.sid === meSid };
  };
  const top = rows.slice(0, 25).map(view);
  const myIdx = rows.findIndex((r) => r.sid === meSid);
  return { t: "leaders", game, rows: top, me: myIdx >= 25 ? view(rows[myIdx], myIdx) : null, total: rows.length };
}

/** Find a known player by friend code. */
export function findByCode(code) {
  for (const r of records.values()) if (r.profile?.code === code) return r;
  return null;
}

// ---------------------------------------------------------------- persistence
/** Load every saved record (call once, before the server takes connections). */
export async function initRecords(s) {
  store = s;
  for (const r of await store.loadRecords()) if (r?.sid) records.set(r.sid, normalize({ ...blankRecord(r.sid), ...r }));
  return records.size;
}
let saving = null;
/** Write the records that changed (players with no games and no profile get no row). */
export async function saveRecords() {
  if (!store || !dirty.size || saving) return saving;
  const sids = [...dirty];
  dirty.clear();
  const list = sids.map((sid) => records.get(sid)).filter((r) => r && (r.n > 0 || r.profile));
  saving = store.saveRecords(list)
    .catch((e) => { console.error("[db] saving records failed:", e.message); sids.forEach((sid) => dirty.add(sid)); }) // try again next time
    .finally(() => { saving = null; });
  return saving;
}
setInterval(saveRecords, 10000).unref();
