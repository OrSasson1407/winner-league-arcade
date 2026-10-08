// What you know: every answer in the knowledge games (Career Path, Guess the Player, Higher or Lower, The Grid,
// Connections) is recorded with the players, clubs and seasons it was about, right or wrong. From that: the
// clubs and seasons you know best and worst, the players who fool you most, your success rate per game over
// time, and practice built on your weak spots. Kept on this device, per league (storage.js scopes "know:").
import { localDate, store } from "../ui.js";

const KEY = "know:data";
const blank = () => ({ clubs: {}, seasons: {}, players: {}, games: {} });
export const knowledge = () => ({ ...blank(), ...store.get(KEY, {}) });

/** Record one answer. ok: right or wrong; players, clubs, seasons: what it was about. */
export function recordAnswer({ game, ok, players = [], clubs = [], seasons = [] }) {
  try {
    const d = knowledge();
    const bump = (map, k) => { if (k == null || k === "") return; const e = (map[k] ||= [0, 0]); e[0]++; if (ok) e[1]++; };
    for (const c of new Set(clubs)) bump(d.clubs, c);
    for (const s of new Set(seasons)) bump(d.seasons, s);
    for (const p of new Set(players)) bump(d.players, p);
    const day = localDate(), g = (d.games[game] ||= {}), e = (g[day] ||= [0, 0]);
    e[0]++; if (ok) e[1]++;
    // keep it small: the 600 most-seen players, 180 days per game
    const pl = Object.entries(d.players);
    if (pl.length > 700) d.players = Object.fromEntries(pl.sort((a, b) => b[1][0] - a[1][0]).slice(0, 600));
    for (const k of Object.keys(d.games)) { const days = Object.keys(d.games[k]).sort(); if (days.length > 180) for (const x of days.slice(0, days.length - 180)) delete d.games[k][x]; }
    store.set(KEY, d);
  } catch { /* knowledge is a bonus: never break a game over it */ }
}

/** Entries with enough answers, as { id, n, ok, pct }, sorted from the best known. */
export function ranked(map, min = 3) {
  return Object.entries(map).filter(([, [n]]) => n >= min).map(([id, [n, ok]]) => ({ id, n, ok, pct: Math.round((ok / n) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.n - a.n);
}
/** The players who fooled you most: most wrong answers (and the share of them). */
export function confusing(map, limit = 8) {
  return Object.entries(map).map(([id, [n, ok]]) => ({ id, n, ok, miss: n - ok })).filter((x) => x.miss >= 2)
    .sort((a, b) => b.miss - a.miss || a.ok / a.n - b.ok / b.n).slice(0, limit);
}
/** A game's answers per day for the last `days` days: [{ day, n, ok }] (oldest first). */
export function trend(game, days = 14) {
  const g = knowledge().games[game] || {};
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA"), e = g[key] || [0, 0];
    out.push({ day: key, n: e[0], ok: e[1] });
  }
  return out;
}
/** A game's totals: all time and the last 7 days. */
export function totals(game) {
  const g = knowledge().games[game] || {};
  const week = new Set(trend(game, 7).map((x) => x.day));
  let n = 0, ok = 0, wn = 0, wok = 0;
  for (const [day, [a, b]] of Object.entries(g)) { n += a; ok += b; if (week.has(day)) { wn += a; wok += b; } }
  return { n, ok, pct: n ? Math.round((ok / n) * 100) : null, week: { n: wn, ok: wok, pct: wn ? Math.round((wok / wn) * 100) : null } };
}
/** Your weak spots for practice: the weakest clubs and seasons (enough answers to tell), and the players who fool you. */
export function weakSpots() {
  const d = knowledge();
  const clubs = ranked(d.clubs, 3).filter((x) => x.pct < 70).slice(-6).map((x) => x.id);
  const seasons = ranked(d.seasons, 3).filter((x) => x.pct < 70).slice(-4).map((x) => x.id);
  const players = confusing(d.players, 20).map((x) => x.id);
  return { clubs, seasons, players, enough: clubs.length + seasons.length + players.length >= 3 };
}
