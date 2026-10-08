// Guess the Player: Wordle-style clues about a hidden player, plus a hint shop and personal stats.
import { clueValue, fmtHeight } from "../lib/units.js";
import { POSITIONS, birthYear, careerSummary, namedPlayers, pick, playersById, seasonYear, seededRng, teamName } from "../data.js";
import { autocomplete, esc, fmt1, html, localDate, store, toast, track } from "../ui.js";
import { bestSeason, nameLink, playerCard } from "../components/playerCard.js";
import { confetti, sound } from "../lib/fx.js";
import { icon } from "../lib/icons.js";
import { closeModal, openModal } from "../lib/modal.js";
import { emit } from "../lib/achievements.js";
import { challengeFor, challengeRng } from "../lib/challenge.js";
import { COLS, attrs, clueSpeech, compare, pool } from "../shared/guessLogic.js";
import { announce } from "../lib/a11y.js";
import { shot } from "../lib/shot.js";
import { markDaily } from "../lib/daily.js";
import { challengeBanner, challengeShareText, recordChallenge } from "../pages/challenge.js";
import { tokens, useToken } from "../lib/wallet.js";
import { LEAGUE, PLAYED_SEASONS } from "../data.js";
import { recordAnswer } from "../lib/knowledge.js";
import { LEAGUES } from "../leagueChoice.js";

const MAX_GUESSES = 8;
const STATS_KEY = "guess:stats";

// Hint shop: each hint costs one guess.
const HINTS = [
  { id: "letter", ic: "search", label: "First letter", get: (p) => `The name starts with “${p.name[0]}”` },
  { id: "nat", ic: "shield", label: "Nationality", get: (p) => `Nationality: ${(p.nationalities || []).join(", ") || "unknown"}` },
  { id: "club", ic: "arena", label: "A club they played for", get: (p) => {
    const s = careerSummary(p.player_id);
    const counts = new Map();
    for (const r of s.records) counts.set(r.team_id, (counts.get(r.team_id) || 0) + 1);
    const club = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return `Played for ${teamName(club)}`;
  } },
  { id: "line", ic: "chart", label: "A season stat line", get: (p) => {
    const b = bestSeason(careerSummary(p.player_id).records);
    return `${b.season}: ${b.stats.games} GP, ${fmt1(b.stats.ppg)} PPG, ${fmt1(b.stats.rpg)} RPG, ${fmt1(b.stats.apg)} APG`;
  } },
];

const today = () => localDate();

export function renderGuess(root, signal, params, query) {
  const ch = challengeFor(query, "guess"); // challenge mode: same mystery player for everyone
  let mode = ["daily", "free"].includes(query?.mode) ? query.mode : store.get("guess:mode", "daily");
  let level = store.get("guess:level", "normal");
  let state;
  const FREE_KEY = "guess:free"; // the unfinished Unlimited game, so a refresh doesn't lose it

  const items = namedPlayers.map((p) => {
    const s = careerSummary(p.player_id);
    return { id: p.player_id, label: p.name, sub: `${teamName(s.lastTeam)} · ${s.firstSeason === s.lastSeason ? s.firstSeason : s.firstSeason.slice(0, 4) + "–" + s.lastSeason.slice(5)}` };
  });

  const free = () => state.free || 0; // hints paid with a free-hint helper from the shop: they cost no guess
  const allowed = () => MAX_GUESSES - state.hints.length + free(); // hints use up guesses
  const tries = () => state.guesses.length + state.hints.length - free();
  const canFree = () => mode === "free" && !ch && tokens("hint") > 0;

  function restore(saved) {
    state.guesses = (saved.guesses || []).map((id) => playersById.get(id)).filter(Boolean);
    state.hints = saved.hints || [];
    state.free = saved.free || 0;
    state.over = !!saved.over; state.won = !!saved.won;
  }

  function start({ fresh = false } = {}) {
    if (ch) {
      const list = pool("normal");
      const target = list[Math.floor(challengeRng(ch.code)() * list.length)];
      state = { target, t: attrs(target), guesses: [], hints: [], over: false, won: false };
      track("guess");
      return render();
    }
    store.set("guess:mode", mode);
    store.set("guess:level", level);
    const list = pool(level);
    let target;
    const savedFree = mode === "free" && !fresh ? store.get(FREE_KEY) : null;
    if (savedFree && savedFree.level === level && !savedFree.over && playersById.get(savedFree.target)) {
      target = playersById.get(savedFree.target);
      state = { target, t: attrs(target), guesses: [], hints: [], over: false, won: false };
      restore(savedFree);
      if (tries()) toast("Resumed your unfinished game");
      return render();
    }
    track("guess");
    if (mode === "daily") target = list[Math.floor(seededRng("guess-" + today() + "-" + level)() * list.length)];
    else target = pick(list);
    state = { target, t: attrs(target), guesses: [], hints: [], over: false, won: false };
    if (mode === "daily") {
      const saved = store.get(`guess:daily:${today()}:${level}`);
      if (saved) restore(saved);
    } else saveFree();
    render();
  }

  function persist() {
    if (ch) return;
    if (mode === "daily") store.set(`guess:daily:${today()}:${level}`, { guesses: state.guesses.map((g) => g.player_id), hints: state.hints, over: state.over, won: state.won });
    else saveFree();
  }
  function saveFree() {
    store.set(FREE_KEY, { level, target: state.target.player_id, guesses: state.guesses.map((g) => g.player_id), hints: state.hints, free: free(), over: state.over });
  }

  function endGame() {
    { const cs = careerSummary(state.target.player_id); recordAnswer({ game: "guess", ok: state.won, players: [state.target.player_id], clubs: cs.teams, seasons: cs.played.map((r) => r.season) }); }
    const st = store.get(STATS_KEY, { played: 0, wins: 0, dist: {}, maxStreak: 0, hints: 0 });
    const streak = state.won ? store.get("guess:streak", 0) + 1 : 0;
    store.set("guess:streak", streak);
    st.played++;
    if (state.won) st.wins++;
    const k = state.won ? String(tries()) : "X";
    st.dist[k] = (st.dist[k] || 0) + 1;
    st.maxStreak = Math.max(st.maxStreak || 0, streak);
    st.hints = (st.hints || 0) + state.hints.length;
    st.last = k;
    store.set(STATS_KEY, st);
    if (state.won) { toast(`Got it in ${tries()}!`); confetti(); sound.play("win"); } else sound.play("bad");
    emit("guess:end", { won: state.won, tries: tries(), hints: state.hints.length, mode: ch ? "challenge" : mode, level: ch ? "normal" : level, streak });
    if (ch) recordChallenge(ch.code, state.won ? `solved in ${tries()}/8` : "not solved");
    else if (mode === "daily") markDaily("guess", state.won ? `solved in ${tries()}/8` : "not solved");
  }

  function guess(id) {
    if (state.over) return;
    if (state.guesses.some((g) => g.player_id === id)) return toast("Already guessed");
    state.guesses.push(playersById.get(id));
    if (id === state.target.player_id) { state.over = true; state.won = true; }
    else if (tries() >= MAX_GUESSES) state.over = true;
    if (state.over) endGame();
    persist();
    render();
    const g = playersById.get(id);
    if (state.over) shot(state.won, root.querySelector(".gtable"));
    announce(id === state.target.player_id ? `${g.name} is correct! Solved in ${tries()}.`
      : `Guess ${state.guesses.length}, ${g.name}. ${clueSpeech(compare(attrs(g), state.t), COLS)}.${state.over ? ` Out of tries. It was ${state.target.name}.` : ""}`);
  }

  function buyHint(id) {
    if (state.over || state.hints.includes(id)) return;
    if (canFree() && useToken("hint")) { state.free = free() + 1; toast(`Free hint used · ${tokens("hint")} left`); }
    else if (allowed() - state.guesses.length <= 1) return toast("You need at least one guess left");
    state.hints.push(id);
    sound.play("select");
    persist();
    render();
  }

  function shareText() {
    const rows = state.guesses.map((g) => {
      const c = compare(attrs(g), state.t);
      return COLS.map(([k]) => ({ g: "🟩", y: "🟨", n: "⬛" }[c[k].c])).join("");
    });
    const hintTxt = state.hints.length ? ` (${state.hints.length} hint${state.hints.length > 1 ? "s" : ""})` : "";
    if (ch) return challengeShareText(ch, state.won ? `I got it in ${tries()}/8${hintTxt}` : `I didn't get it in 8${hintTxt}`) + "\n" + rows.join("\n");
    return `Winner League Arcade · Guess the Player ${mode === "daily" ? today() : ""} ${state.won ? tries() : "X"}/${MAX_GUESSES}${hintTxt}\n${rows.join("\n")}`;
  }

  function hintsHtml() {
    const left = allowed() - state.guesses.length;
    return html`<div class="hint-shop">
      <div class="row"><b>${icon("bulb", { size: 16 })} Hint shop</b><span class="muted" style="font-size:13px">Each hint costs one guess</span></div>
      <div class="hint-grid">${HINTS.map((h) => {
        const got = state.hints.includes(h.id);
        return got
          ? `<div class="hint got">${icon(h.ic, { size: 16 })}<span>${esc(h.get(state.target))}</span></div>`
          : `<button class="hint buy" data-hint="${h.id}" ${state.over || (left <= 1 && !canFree()) ? "disabled" : ""}>${icon(h.ic, { size: 16 })}<span>${h.label}</span><small>${canFree() ? `Free (${tokens("hint")})` : "−1 guess"}</small></button>`;
      }).join("")}</div>
    </div>`;
  }

  function statsHtml() {
    const st = store.get(STATS_KEY, { played: 0, wins: 0, dist: {}, maxStreak: 0, hints: 0 });
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "X"];
    const max = Math.max(1, ...keys.map((k) => st.dist[k] || 0));
    const pct = st.played ? Math.round((100 * st.wins) / st.played) : 0;
    return html`<div class="facts gstats">
        <div class="fact"><small>Played</small><b>${st.played}</b></div>
        <div class="fact"><small>Win %</small><b>${pct}%</b></div>
        <div class="fact"><small>Current streak</small><b>${store.get("guess:streak", 0)}</b></div>
        <div class="fact"><small>Best streak</small><b>${Math.max(st.maxStreak || 0, store.get("guess:streak", 0))}</b></div>
        <div class="fact"><small>Hints used</small><b>${st.hints || 0}</b></div>
      </div>
      <h3 style="margin-top:18px">Guess distribution</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 8px">Tries per solved game (hints count as tries). X = not solved.</p>
      ${st.played ? `<div class="dist" role="list">${keys.map((k) => {
        const n = st.dist[k] || 0;
        return `<div class="dist-row ${k === st.last ? "last" : ""}" role="listitem" aria-label="${k === "X" ? "Not solved" : k + " tries"}: ${n} games">
          <span class="dist-k">${k}</span><span class="dist-bar"><i style="width:${Math.max(n ? 6 : 0, (n / max) * 100)}%"></i></span><b class="dist-n">${n}</b></div>`;
      }).join("")}</div>` : `<div class="empty-state">${icon("chart", { size: 28 })}<b>No finished games yet</b></div>`}`;
  }

  let statsDialog = null;
  function openStats() {
    if (!statsDialog) {
      statsDialog = document.createElement("dialog");
      statsDialog.className = "profile-modal stats-modal";
      statsDialog.setAttribute("aria-label", "Guess the Player stats");
      statsDialog.addEventListener("click", (e) => { if (e.target === statsDialog || e.target.closest("[data-close]")) closeModal(statsDialog); });
      document.body.appendChild(statsDialog);
      signal.addEventListener("abort", () => statsDialog.remove());
    }
    statsDialog.innerHTML = `<button class="icon-btn profile-close" data-close aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile"><h2>${icon("chart", { size: 24 })} Your Guess the Player stats</h2>${statsHtml()}</div>`;
    openModal(statsDialog);
  }

  function render() {
    const { target, t } = state;
    const rows = state.guesses.map((g) => {
      const c = compare(attrs(g), t);
      const win = g.player_id === target.player_id;
      return `<tr><td class="name"><b>${nameLink(g.player_id, g.name)}</b>${win ? ` ${icon("check", { size: 16, cls: "ic-good" })}` : ""}</td>${COLS.map(([k]) => `<td class="${c[k].c}">${esc(clueValue(k, c[k]))}${c[k].arrow || ""}</td>`).join("")}</tr>`;
    }).reverse().join("");
    const ts = careerSummary(target.player_id);
    const left = allowed() - state.guesses.length;
    root.innerHTML = html`${ch ? challengeBanner(ch) : ""}
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Guess the Player</h1>
        <p>A mystery player from ${LEAGUES[LEAGUE].phrase} (${PLAYED_SEASONS[0]} to ${PLAYED_SEASONS[PLAYED_SEASONS.length - 1]}). ${MAX_GUESSES} tries; hints cost one each.</p></div>
        <div class="row" ${ch ? "hidden" : ""}>
          <div class="seg" id="mode"><button data-m="daily" class="${mode === "daily" ? "on" : ""}">Daily</button><button data-m="free" class="${mode === "free" ? "on" : ""}">Unlimited</button></div>
          <div class="seg" id="level"><button data-l="easy" class="${level === "easy" ? "on" : ""}">Stars</button><button data-l="normal" class="${level === "normal" ? "on" : ""}">All players</button></div>
          <button class="btn ghost" id="stats">${icon("chart", { size: 16 })} Stats</button>
        </div>
      </div>
      <div class="card pad" style="display:grid;gap:16px">
        ${state.over ? html`
          <div class="reveal">
            ${playerCard(bestSeason(ts.records), { classes: "flip-in" })}
            <div><div class="muted">${state.won ? `You got it in ${tries()}!` : "The answer was"}</div><h2>${esc(target.name)}</h2>
              <div class="muted">${target.primary_position} · ${fmtHeight(target.height_cm)} · ${esc(target.nationality || "")} · ${ts.teams.map(teamName).map(esc).join(", ")}</div></div>
            <span class="spacer"></span>
            <button class="btn" id="share">Copy result</button>
            <button class="btn" id="stats2">${icon("chart", { size: 16 })} Your stats</button>
            ${ch ? `<a class="btn primary" href="#/challenge">Challenge a friend</a>` : mode === "free" ? `<button class="btn primary" id="next">Next player</button>` : `<span class="muted">New daily player tomorrow · try Unlimited</span>`}
          </div>` : html`
          <div class="row"><div class="guess-input"><input id="q" placeholder="Type a player name…" autocomplete="off" aria-label="Player name"></div>
            <span class="tries" aria-live="polite">${Array.from({ length: MAX_GUESSES }, (_, i) => `<i class="${i < state.guesses.length ? "used" : i >= allowed() ? "hint" : ""}"></i>`).join("")}<span class="muted">${left} left</span></span></div>`}
        ${hintsHtml()}
        <div class="legend"><span><i style="background:var(--good)"></i>Match</span><span><i style="background:var(--close)"></i>Close (height ±4 cm, born ±2, jersey ±2, PPG ±2, peak ±3, ±1 club or season, adjacent position, shared nationality, played for that team)</span><span>↑ ↓ the answer is higher / lower</span></div>
        <div class="grid-wrap"><table class="gtable wide"><thead><tr><th><span class="sr-only">Player</span></th>${COLS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="muted" style="font-size:12px;margin:0">*First season in the database (it starts in ${PLAYED_SEASONS[0]}). Jersey = most-worn number. Peak = best game rating in one season.</p>
      </div>`;
    root.querySelector("#mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { mode = b.dataset.m; start(); } }, { signal });
    root.querySelector("#level").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { level = b.dataset.l; start(); } }, { signal });
    root.querySelector(".hint-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-hint]"); if (b) buyHint(b.dataset.hint); }, { signal });
    const q = root.querySelector("#q");
    if (q) {
      autocomplete(q, items, (it) => guess(it.id), { signal, exclude: (it) => state.guesses.some((g) => g.player_id === it.id) });
      q.focus();
    }
    root.querySelector("#stats").addEventListener("click", openStats, { signal });
    root.querySelector("#stats2")?.addEventListener("click", openStats, { signal });
    root.querySelector("#next")?.addEventListener("click", () => start({ fresh: true }), { signal });
    root.querySelector("#share")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(shareText()); toast("Copied to clipboard"); } catch { toast("Could not copy"); }
    }, { signal });
  }

  start();
}
