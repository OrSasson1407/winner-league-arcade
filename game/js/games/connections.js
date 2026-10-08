// Connections: 16 players, four hidden groups of four (a club, a team-season, a stat, a birth year…).
// Pick four that belong together. Four mistakes allowed. Daily puzzle (same for everyone) or Unlimited.
import { LEAGUE, playersById, seededRng, shuffle } from "../data.js";
import { esc, html, localDate, store, toast, track } from "../ui.js";
import { icon } from "../lib/icons.js";
import { confetti, sound } from "../lib/fx.js";
import { emit } from "../lib/achievements.js";
import { markDaily } from "../lib/daily.js";
import { announce } from "../lib/a11y.js";
import { shot } from "../lib/shot.js";
import { makeConnections } from "../shared/leagueFacts.js";
import { arrowGrid, gameKeys, press } from "../lib/shortcuts.js";

const MISTAKES = 4;
const LEVEL_NAMES = ["Easiest", "Medium", "Hard", "Trickiest"];
const EMOJI = ["🟨", "🟩", "🟦", "🟪"];
const STATS_KEY = "conn:stats";
// Unlimited puzzles come in three difficulties (the daily one is always Normal, the same for everyone)
const DIFFS = { easy: "Easy", normal: "Normal", expert: "Expert" };
const MAX_HINTS = 2; // each one costs a mistake

export function renderConnections(root, signal, params, query = {}) {
  let mode = ["daily", "free"].includes(query.mode) ? query.mode : store.get("conn:mode", "daily");
  let diff = DIFFS[store.get("conn:level", "normal")] ? store.get("conn:level", "normal") : "normal";
  let puzzle, S;

  function load(fresh = false) {
    store.set("conn:mode", mode);
    const key = mode === "daily" ? `conn:daily:${localDate()}` : "conn:free";
    const saved = !fresh && store.get(key);
    if (saved?.puzzle) { puzzle = saved.puzzle; S = saved.state; }
    else {
      const rnd = mode === "daily" ? seededRng("connections-" + localDate()) : Math.random;
      puzzle = makeConnections(rnd, { level: mode === "daily" ? "normal" : diff });
      S = { order: shuffle(puzzle.flatMap((g) => g.players), rnd), selected: [], solved: [], mistakes: 0, guesses: [], over: false, won: false, hints: [], level: mode === "daily" ? "normal" : diff };
      track("connections");
    }
    draw();
  }
  const save = () => store.set(mode === "daily" ? `conn:daily:${localDate()}` : "conn:free", { puzzle, state: S });
  const groupOf = (pid) => puzzle.find((g) => g.players.includes(pid));
  const name = (pid) => playersById.get(pid)?.name ?? pid;

  function submit() {
    if (S.over || S.selected.length !== 4) return;
    const set = [...S.selected].sort().join(",");
    if (S.guesses.some((g) => [...g].sort().join(",") === set)) { toast("Already tried that four"); return; }
    S.guesses.push([...S.selected]);
    const g = groupOf(S.selected[0]);
    const right = S.selected.every((p) => groupOf(p) === g);
    if (right) {
      S.solved.push(g.level);
      S.order = S.order.filter((p) => !g.players.includes(p));
      S.selected = [];
      sound.play("place");
      announce(`Correct: ${g.label}. ${g.players.map(name).join(", ")}.`);
      if (S.solved.length === 4) finish(true);
    } else {
      S.mistakes++;
      const best = Math.max(...puzzle.map((x) => S.selected.filter((p) => x.players.includes(p)).length));
      sound.play("bad");
      const msg = best === 3 ? "One away…" : "Not a group";
      toast(msg);
      announce(`${msg}. ${MISTAKES - S.mistakes} mistakes left.`);
      root.querySelector(".cn-board")?.classList.add("shake");
      if (S.mistakes >= MISTAKES) finish(false);
    }
    save();
    draw();
  }

  /** A hint (costs a mistake): first the topic of the easiest group still hidden, then one of its players. */
  function hint() {
    S.hints ||= [];
    if (S.over || S.hints.length >= MAX_HINTS || S.mistakes >= MISTAKES - 1) return;
    const g = puzzle.find((x) => !S.solved.includes(x.level));
    if (!g) return;
    const told = S.hints.find((h) => h.level === g.level && h.type === "topic");
    if (!told) S.hints.push({ type: "topic", level: g.level });
    else S.hints.push({ type: "player", level: g.level, pid: g.players.find((p) => S.order.includes(p)) });
    S.mistakes++;
    sound.play("tick");
    const h = S.hints[S.hints.length - 1];
    announce(h.type === "topic" ? `Hint: one group is ${g.label}.` : `Hint: ${name(h.pid)} is in that group.`);
    save(); draw();
  }

  function finish(won) {
    S.over = true; S.won = won;
    if (!won) { for (const g of puzzle) if (!S.solved.includes(g.level)) S.solved.push(g.level); S.order = []; }
    const st = store.get(STATS_KEY, { played: 0, wins: 0, streak: 0, best: 0, perfect: 0 });
    st.played++;
    if (won) { st.wins++; st.streak++; st.best = Math.max(st.best, st.streak); if (!S.mistakes && !S.hints?.length) st.perfect++; } else st.streak = 0;
    store.set(STATS_KEY, st);
    emit("conn:end", { won, mistakes: S.mistakes, mode, streak: st.streak });
    if (mode === "daily") markDaily("connections", won ? `solved, ${S.mistakes} mistake${S.mistakes === 1 ? "" : "s"}` : "not solved");
    if (won) { confetti(S.mistakes ? 1800 : 3200); sound.play("win"); }
    setTimeout(() => shot(won, root.querySelector(".cn-solved")), 50);
    announce(won ? `Solved with ${S.mistakes} mistakes!` : "Out of mistakes. All groups revealed.");
  }

  function shareText() {
    const rows = S.guesses.map((g) => g.map((p) => EMOJI[groupOf(p).level]).join(""));
    const extra = [mode === "free" && S.level !== "normal" ? DIFFS[S.level] : "", S.hints?.length ? `💡×${S.hints.length}` : ""].filter(Boolean).join(" · ");
    return `Winner League Arcade · Connections${mode === "daily" ? ` ${localDate()}` : ""}${extra ? ` · ${extra}` : ""}\n${rows.join("\n")}`;
  }

  function draw() {
    const st = store.get(STATS_KEY, { played: 0, wins: 0, streak: 0, best: 0, perfect: 0 });
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Connections</h1>
        <p>${LEAGUE === "el" ? "Find four groups of four players who share something: a club, a team-season, a long career… Every player fits exactly one group." : "Find four groups of four players who share something: a club, a team-season, a stat, a birth year… Every player fits exactly one group."}</p></div>
        <div class="row"><div class="seg" id="mode" role="radiogroup" aria-label="Puzzle">
          <button role="radio" data-m="daily" aria-checked="${mode === "daily"}" class="${mode === "daily" ? "on" : ""}">Daily</button>
          <button role="radio" data-m="free" aria-checked="${mode === "free"}" class="${mode === "free" ? "on" : ""}">Unlimited</button></div>
          ${mode === "free" ? `<div class="seg sm" id="diff" role="radiogroup" aria-label="Difficulty">${Object.entries(DIFFS).map(([k, l]) => `<button role="radio" data-d="${k}" aria-checked="${diff === k}" class="${diff === k ? "on" : ""}">${l}</button>`).join("")}</div>` : ""}</div>
      </div>
      <div class="cn-wrap">
        <div class="cn-solved">${S.solved.map((lv) => { const g = puzzle[lv]; return html`<div class="cn-group lv${lv} pop" role="group" aria-label="${esc(g.label)}">
          <b>${esc(g.label)}</b><span>${g.players.map((p) => `<button class="link-name" data-profile="${p}">${esc(name(p))}</button>`).join(", ")}</span></div>`; }).join("")}</div>
        ${(S.hints || []).filter((h) => h.type === "topic" && !S.solved.includes(h.level)).map((h) => `<div class="cn-hint lv${h.level}">${icon("bulb", { size: 15 })} <span>Hint: one group is</span> <b>${esc(puzzle[h.level].label)}</b></div>`).join("")}
        ${S.order.length ? html`<div class="cn-board" role="group" aria-label="Players">${S.order.map((p) => {
          const on = S.selected.includes(p);
          const hinted = (S.hints || []).some((h) => h.pid === p && !S.solved.includes(h.level));
          return `<button class="cn-tile ${on ? "on" : ""} ${hinted ? `hinted lv${groupOf(p).level}` : ""}" data-p="${p}" aria-pressed="${on}" ${S.over ? "disabled" : ""}>${esc(name(p))}${hinted ? ` <span class="sr-only">(hint)</span>` : ""}</button>`;
        }).join("")}</div>` : ""}
        <div class="cn-bar">
          <span class="cn-mistakes" role="img" aria-label="${MISTAKES - S.mistakes} mistakes left">Mistakes left ${Array.from({ length: MISTAKES }, (_, i) => `<i class="${i < MISTAKES - S.mistakes ? "" : "used"}"></i>`).join("")}</span>
          ${S.over ? html`<span class="spacer"></span>
            <button class="btn" id="share">${icon("link", { size: 15 })} Copy result</button>
            ${mode === "free" ? `<button class="btn primary" id="again">${icon("refresh", { size: 15 })} New puzzle</button>` : `<span class="muted">New daily puzzle tomorrow · try Unlimited</span>`}`
          : html`<span class="spacer"></span>
            <button class="btn ghost" id="hint" ${(S.hints?.length || 0) >= MAX_HINTS || S.mistakes >= MISTAKES - 1 ? "disabled" : ""} title="The topic of the easiest group still hidden, then one of its players. Each hint costs a mistake.">${icon("bulb", { size: 15 })} Hint <small>(${MAX_HINTS - (S.hints?.length || 0)} left · costs a mistake)</small></button>
            <button class="btn ghost" id="shuffle">${icon("refresh", { size: 15 })} Shuffle</button>
            <button class="btn ghost" id="clear" ${S.selected.length ? "" : "disabled"}>Deselect</button>
            <button class="btn primary" id="submit" ${S.selected.length === 4 ? "" : "disabled"}>${icon("check", { size: 15 })} Submit</button>`}
        </div>
        ${S.over ? html`<div class="card pad cn-end pop"><h3>${S.won ? (S.mistakes ? `Solved with ${S.mistakes} mistake${S.mistakes === 1 ? "" : "s"}` : "Perfect! No mistakes") : "So close! Here are the groups"}</h3>
          <pre class="cn-share" aria-label="Your guesses">${S.guesses.map((g) => g.map((p) => EMOJI[groupOf(p).level]).join("")).join("\n")}</pre></div>` : ""}
        <p class="muted cn-legend">${EMOJI.map((e, i) => `${e} ${LEVEL_NAMES[i]}`).join(" · ")} · Played ${st.played} · Won ${st.wins} · Streak ${st.streak} · Perfect ${st.perfect}</p>
      </div>`;
    root.querySelector("#diff")?.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (b && b.dataset.d !== diff) { diff = b.dataset.d; store.set("conn:level", diff); load(true); } }, { signal });
    root.querySelector("#hint")?.addEventListener("click", hint, { signal });
    root.querySelector("#mode").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b && b.dataset.m !== mode) { mode = b.dataset.m; load(); } }, { signal });
    root.querySelector(".cn-board")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-p]"); if (!b || S.over) return;
      const p = b.dataset.p;
      if (S.selected.includes(p)) S.selected = S.selected.filter((x) => x !== p);
      else if (S.selected.length < 4) S.selected.push(p);
      else { toast("Four at a time: deselect one first"); return; }
      sound.play("tick");
      save(); draw();
      root.querySelector(`[data-p="${p}"]`)?.focus();
    }, { signal });
    root.querySelector("#shuffle")?.addEventListener("click", () => { S.order = shuffle(S.order); save(); draw(); }, { signal });
    root.querySelector("#clear")?.addEventListener("click", () => { S.selected = []; save(); draw(); }, { signal });
    root.querySelector("#submit")?.addEventListener("click", submit, { signal });
    root.querySelector("#again")?.addEventListener("click", () => load(true), { signal });
    root.querySelector("#share")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(shareText()); toast("Result copied"); } catch { toast("Couldn't copy"); } }, { signal });
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input,textarea,select") || document.querySelector("dialog[open]")) return;
    if (e.key === "Enter" && S.selected.length === 4 && !e.target.closest?.("button")) { e.preventDefault(); submit(); }
  }, { signal });
  arrowGrid(root, ".cn-tile", 4, signal);
  gameKeys(signal, { s: press(root, "#shuffle"), h: press(root, "#hint"), Escape: press(root, "#clear"), Backspace: press(root, "#clear") });

  load();
}
