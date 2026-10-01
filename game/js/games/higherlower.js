// Higher or Lower: compare a stat between two real player-seasons.
// Game types: Classic (one miss ends it), 3 Lives, Time attack (60 s). Pairs: random, or the same player in two seasons.
import { db, isPlayable, pick, playersById, psByKey, psKey } from "../data.js";
import { animate, countUp, html, store, toast, track } from "../ui.js";
import { playerCard } from "../components/playerCard.js";
import { sound } from "../lib/fx.js";
import { icon } from "../lib/icons.js";
import { emit } from "../lib/achievements.js";
import { announce } from "../lib/a11y.js";
import { challengeFor, challengeRng } from "../lib/challenge.js";
import { challengeBanner, challengeShareText, recordChallenge } from "../pages/challenge.js";

const CATS = {
  ppg: { label: "Points per game", get: (ps) => ps.stats.ppg, dec: 1 },
  rpg: { label: "Rebounds per game", get: (ps) => ps.stats.rpg, dec: 1 },
  apg: { label: "Assists per game", get: (ps) => ps.stats.apg, dec: 1 },
  rating: { label: "Game rating", get: (ps) => ps.rating_mock, dec: 0 },
  val: { label: "Efficiency (VAL) per game", get: (ps) => ps.stats.valuation_per_game, dec: 1 },
};
const MODES = { mixed: "Mixed", ppg: "Points", rpg: "Rebounds", apg: "Assists", rating: "Rating" };
const TYPES = { classic: "Classic", lives: "3 Lives", time: "Time attack" };
const PAIRS = { random: "Random", same: "Same player" };
const LIVES = 3;
const TIME_LIMIT = 60;
const TIME_PENALTY = 3; // seconds lost on a wrong answer in time attack

// Classic keeps the original best-score key so earlier records still count.
const bestKey = (mode, type, pairs) => `hl:best:${mode}${type === "classic" ? "" : ":" + type}${pairs === "same" ? ":same" : ""}`;

export function renderHigherLower(root, signal, params, query) {
  const ch = challengeFor(query, "hl"); // challenge mode: same pairs in the same order for everyone
  let rnd = Math.random;
  const pool = db.player_seasons.filter((ps) => isPlayable(ps, 10));
  // players with 2+ playable seasons, for "Same player" pairs
  const byPlayer = new Map();
  for (const ps of pool) (byPlayer.get(ps.player_id) || byPlayer.set(ps.player_id, []).get(ps.player_id)).push(ps);
  const multi = [...byPlayer.values()].filter((list) => new Set(list.map((x) => x.season)).size >= 2);

  const SAVE_KEY = "hl:save";
  const saved = ch ? null : store.get(SAVE_KEY);
  const prefs = ch ? { mode: "mixed", type: "classic", pairs: "random" } : store.get("hl:prefs", { mode: "mixed", type: "classic", pairs: "random" });
  let mode = saved?.mode || prefs.mode;
  let type = saved?.type || prefs.type;
  let pairs = saved?.pairs || prefs.pairs;
  let state;
  let tick = null;
  signal.addEventListener("abort", () => clearInterval(tick));

  const nextCat = () => (mode === "mixed" ? pick(Object.keys(CATS), rnd) : mode);
  const valid = (ps, cat) => { const v = CATS[cat].get(ps); return v !== null && v !== undefined; };

  function drawOne(cat, avoid) {
    for (;;) {
      const ps = pick(pool, rnd);
      if (ps.player_id !== avoid?.player_id && valid(ps, cat)) return ps;
    }
  }
  /** Same player, two different seasons (both with a value for the stat). */
  function drawSame(cat) {
    for (let i = 0; i < 500; i++) {
      const list = pick(multi, rnd).filter((ps) => valid(ps, cat));
      const seasons = [...new Set(list.map((x) => x.season))];
      if (seasons.length < 2) continue;
      const [s1, s2] = [pick(seasons, rnd), pick(seasons, rnd)];
      if (s1 === s2) continue;
      return [list.find((x) => x.season === s1), list.find((x) => x.season === s2)];
    }
    return [drawOne(cat), drawOne(cat)];
  }
  function newPair(prevRight) {
    const cat = nextCat();
    if (pairs === "same") { const [left, right] = drawSame(cat); return { cat, left, right }; }
    const left = prevRight && valid(prevRight, cat) ? prevRight : drawOne(cat);
    return { cat, left, right: drawOne(cat, left) };
  }

  function start() {
    clearInterval(tick);
    track("higher-lower");
    if (ch) rnd = challengeRng(ch.code);
    else store.set("hl:prefs", { mode, type, pairs });
    if (type === "time") store.set(SAVE_KEY, null); // time attack is never resumed
    state = { ...newPair(null), score: 0, wrongs: 0, lives: type === "lives" ? LIVES : 1, phase: "ask", result: null, over: false,
      endsAt: type === "time" ? Date.now() + TIME_LIMIT * 1000 : null };
    if (type === "time") startClock();
    render();
  }

  function startClock() {
    clearInterval(tick);
    tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      const el = root.querySelector("#clock");
      if (el) { el.textContent = `${left}s`; el.parentElement.classList.toggle("urgent", left <= 10); }
      if (left <= 10 && left > 0 && el && el.dataset.last !== String(left)) { el.dataset.last = String(left); sound.play("tick"); }
      if (left === 0) { clearInterval(tick); gameOver("Time's up!"); }
    }, 200);
  }

  function gameOver(msg) {
    state.over = true;
    state.phase = "reveal";
    clearInterval(tick);
    const key = bestKey(mode, type, pairs);
    const newBest = state.score > store.get(key, 0);
    if (newBest) store.set(key, state.score);
    if (!ch) store.set(SAVE_KEY, null); // nothing to resume
    if (ch) recordChallenge(ch.code, `streak ${state.score}`);
    emit("hl:over", { score: state.score, type, pairs, mode, wrongs: state.wrongs || 0, xpRun: state.score * 3 });
    render();
    toast(newBest ? `New best: ${state.score}!` : msg);
  }

  function answer(dir) {
    if (state.phase !== "ask" || state.over) return;
    const c = CATS[state.cat];
    const a = c.get(state.left), b = c.get(state.right);
    const ok = a === b || (dir === "higher" ? b > a : b < a);
    state.phase = "reveal";
    state.result = ok;
    if (ok) state.score++;
    else { state.wrongs = (state.wrongs || 0) + 1; if (type !== "time") state.lives--; }
    emit("hl:answer", { ok, type, pairs, mode, score: state.score, tie: a === b, wrongs: state.wrongs });
    announce(`${ok ? "Correct" : "Wrong"}. ${playersById.get(state.right.player_id)?.name} had ${b.toFixed(c.dec)} ${c.label.toLowerCase()}, versus ${a.toFixed(c.dec)}. Score ${state.score}.`);
    sound.play(ok ? "place" : "bad");
    if (!ok && type !== "time" && state.lives <= 0) { render(); return setTimeout(() => !signal.aborted && gameOver("Game over"), 900); }
    if (!ok && type === "lives") toast(`Wrong! ${state.lives} ${state.lives === 1 ? "life" : "lives"} left`);
    if (!ok && type === "time") { state.endsAt -= TIME_PENALTY * 1000; toast(`Wrong! −${TIME_PENALTY} seconds`); }
    render();
    // time attack moves fast; other types pause to show the answer
    const t = setTimeout(() => {
      if (state.over) return;
      state = { ...state, ...newPair(state.right), phase: "ask", result: null };
      render();
    }, type === "time" ? 650 : 1500);
    signal.addEventListener("abort", () => clearTimeout(t));
  }

  function side(ps, which) {
    const c = CATS[state.cat];
    const reveal = which === "left" || state.phase === "reveal";
    const res = which === "right" && state.phase === "reveal" && state.result !== null ? (state.result ? "ok" : "bad") : "";
    const diff = which === "right" && reveal ? c.get(state.right) - c.get(state.left) : null;
    return html`<div class="card hl-side ${res}" id="side-${which}">
      ${playerCard(ps, { size: "lg", hideRating: !reveal, hideStats: !reveal, info: reveal })}
      <div class="hl-val">
        ${reveal ? html`<div class="val ${which === "right" ? "flip-in" : ""}" id="val-${which}">${c.get(ps).toFixed(c.dec)}</div><div class="cat">${c.label}</div>
          ${diff !== null ? `<div class="diff" style="color:var(${diff >= 0 ? "--good" : "--bad"})">${diff >= 0 ? "+" : ""}${diff.toFixed(c.dec)} vs left</div>` : ""}`
          : html`<div class="cat">${c.label}</div>
          <div class="hl-btns"><button class="btn primary" data-dir="higher">▲ Higher <kbd>↑</kbd></button><button class="btn" data-dir="lower">▼ Lower <kbd>↓</kbd></button></div>`}
      </div>
    </div>`;
  }

  const seg = (id, opts, cur) => `<div class="seg sm" id="${id}" role="radiogroup">${Object.entries(opts).map(([k, l]) => `<button role="radio" aria-checked="${k === cur}" data-v="${k}" class="${k === cur ? "on" : ""}">${l}</button>`).join("")}</div>`;

  function statusBar() {
    const best = store.get(bestKey(mode, type, pairs), 0);
    const label = type === "classic" ? "STREAK" : "SCORE";
    const lives = type === "lives" ? `<span class="lives" role="img" aria-label="${state.lives} lives left">${Array.from({ length: LIVES }, (_, i) => `<i class="${i < state.lives ? "" : "lost"}">${icon("flame", { size: 18 })}</i>`).join("")}</span>` : "";
    const clock = type === "time" ? `<div class="timer">${icon("timer", { size: 20 })}<b id="clock">${Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000))}s</b></div>` : "";
    return `<span class="streak">${label} <span class="led" style="color:var(--accent)">${state.score}</span></span>${lives}${clock}
      <span class="spacer"></span><span class="muted">Best (${TYPES[type]} · ${MODES[mode]}${pairs === "same" ? " · same player" : ""}): ${best}</span>`;
  }

  function render() {
    if (state.phase === "ask" && !state.over && type !== "time" && !ch) {
      store.set(SAVE_KEY, { mode, type, pairs, cat: state.cat, left: psKey(state.left), right: psKey(state.right), score: state.score, lives: state.lives, wrongs: state.wrongs || 0 });
    }
    root.innerHTML = html`${ch ? challengeBanner(ch) : ""}
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Higher or Lower</h1>
        <p>${pairs === "same" ? "The same player in two different seasons." : "Two real player-seasons."} Did the second have a higher or lower number? Regular season only.</p></div>
      </div>
      <div class="card pad hl-controls" ${ch ? "hidden" : ""}>
        <div class="field"><label>Game</label>${seg("type", TYPES, type)}</div>
        <div class="field"><label>Pairs</label>${seg("pairs", PAIRS, pairs)}</div>
        <div class="field"><label>Stat</label>${seg("mode", MODES, mode)}</div>
      </div>
      <div class="row hl-status">${statusBar()}</div>
      <div class="hl">${side(state.left, "left")}<div class="vs">VS</div>${side(state.right, "right")}</div>
      ${state.over ? html`
        <div class="card center-card pop" style="margin-top:20px">
          <h2>${type === "time" ? `Time's up · ${state.score} correct` : `Game over · ${type === "lives" ? "score" : "streak"} ${state.score}`}</h2>
          ${ch ? `<button class="btn" id="ch-share">${icon("users", { size: 16 })} Copy challenge result</button>` : ""}
          <button class="btn primary" id="again">${icon("refresh", { size: 16 })} ${ch ? "Replay challenge" : "Play again"}</button>
        </div>` : ""}`;
    const bind = (id, set) => root.querySelector(id).addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { set(b.dataset.v); start(); } }, { signal });
    bind("#type", (v) => { type = v; }); bind("#pairs", (v) => { pairs = v; }); bind("#mode", (v) => { mode = v; });
    root.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("click", () => answer(b.dataset.dir), { signal }));
    root.querySelector("#again")?.addEventListener("click", start, { signal });
    root.querySelector("#ch-share")?.addEventListener("click", async () => {
      const txt = challengeShareText(ch, `I got a streak of ${state.score}`);
      try { await navigator.clipboard.writeText(txt); toast("Copied: send it to your friend"); } catch { toast(txt); }
    }, { signal });
    if (state.phase === "reveal" && state.result !== null) {
      const c = CATS[state.cat];
      countUp(root.querySelector("#val-right"), c.get(state.right), c.dec, type === "time" ? 300 : 650);
      animate(root.querySelector("#side-right"), state.result ? "glow" : "shake");
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input,select,textarea") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowUp") { e.preventDefault(); answer("higher"); }
    if (e.key === "ArrowDown") { e.preventDefault(); answer("lower"); }
  }, { signal });

  // resume a running Classic / 3 Lives game (time attack always starts fresh)
  const l = saved && psByKey(saved.left), r = saved && psByKey(saved.right);
  if (l && r && CATS[saved.cat] && saved.type !== "time") {
    state = { cat: saved.cat, left: l, right: r, score: saved.score ?? saved.streak ?? 0, wrongs: saved.wrongs || 0, lives: saved.lives ?? 1, phase: "ask", result: null, over: false, endsAt: null };
    render();
    if (state.score) toast(`Resumed: ${type === "lives" ? "score" : "streak"} ${state.score}`);
  } else start();
}
