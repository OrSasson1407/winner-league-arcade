// The Grid: a 3×3 board. Each cell needs a player who matches its row and its column
// (e.g. played for Maccabi Haifa AND averaged 15+ points in a season). 9 guesses for 9 cells,
// each player once. Rarer right answers score more. Daily (same for everyone) or Unlimited.
import { careerSummary, namedPlayers, playersById, seededRng, teamName } from "../data.js";
import { recordAnswer } from "../lib/knowledge.js";
import { autocomplete, esc, html, localDate, store, toast, track } from "../ui.js";
import { crestSvg, icon } from "../lib/icons.js";
import { confetti, sound } from "../lib/fx.js";
import { emit } from "../lib/achievements.js";
import { markDaily } from "../lib/daily.js";
import { announce } from "../lib/a11y.js";
import { shot } from "../lib/shot.js";
import { answersFor, criterionById, facts, makeGrid, rarity } from "../shared/leagueFacts.js";
import { arrowGrid, gameKeys, press } from "../lib/shortcuts.js";

const GUESSES = 9;
const STATS_KEY = "grid:stats";
const ATTR_ICON = { il: "flag", us: "flag", pg: "jersey", c: "jersey", ppg15: "ball", rpg8: "hoop", apg5: "users", s8: "calendar", cl4: "shield", h205: "arrowRight", h188: "arrowLeft", gp200: "clock" };


export function renderGrid(root, signal, params, query = {}) {
  let mode = ["daily", "free"].includes(query.mode) ? query.mode : store.get("grid:mode", "daily");
  let G, active = null;
  const items = namedPlayers.filter((p) => facts().has(p.player_id)).map((p) => {
    const s = careerSummary(p.player_id);
    return { id: p.player_id, label: p.name, sub: `${teamName(s.lastTeam)} · ${s.firstSeason === s.lastSeason ? s.firstSeason : s.firstSeason.slice(0, 4) + "–" + s.lastSeason.slice(5)}` };
  });

  function load(fresh = false) {
    store.set("grid:mode", mode);
    const key = mode === "daily" ? `grid:daily:${localDate()}` : "grid:free";
    const saved = !fresh && store.get(key);
    if (saved?.rows) G = saved;
    else {
      const board = makeGrid(mode === "daily" ? seededRng("grid-" + localDate()) : Math.random);
      G = { ...board, cells: Array(9).fill(null), left: GUESSES, wrong: [], over: false };
      track("grid");
    }
    active = null;
    draw();
  }
  const save = () => store.set(mode === "daily" ? `grid:daily:${localDate()}` : "grid:free", G);
  const rowC = (i) => criterionById(G.rows[i]), colC = (i) => criterionById(G.cols[i]);
  const filled = () => G.cells.filter(Boolean).length;
  const score = () => G.cells.reduce((s, c) => s + (c ? c.rarity : 0), 0);

  function guess(cell, pid) {
    if (G.over || G.cells[cell]) return;
    if (G.cells.some((c) => c?.pid === pid)) { toast("Already used on the board"); return; }
    const r = rowC(Math.floor(cell / 3)), c = colC(cell % 3);
    const f = facts().get(pid);
    G.left--;
    const name = playersById.get(pid).name;
    recordAnswer({ game: "grid", ok: !!(f && r.test(f) && c.test(f)), players: [pid], clubs: [r.club, c.club].filter(Boolean) });
    if (f && r.test(f) && c.test(f)) {
      const rare = rarity(pid, answersFor(r, c));
      G.cells[cell] = { pid, rarity: rare };
      sound.play("place");
      announce(`Correct: ${name}. Rarity ${rare}. ${G.left} guesses left.`);
      shot(true, root.querySelector(`[data-cell="${cell}"]`));
    } else {
      G.wrong.push({ cell, pid });
      sound.play("bad");
      toast(`${name} doesn't fit both`);
      announce(`${name} doesn't fit ${r.label} and ${c.label}. ${G.left} guesses left.`);
    }
    active = null;
    if (!G.left || filled() === 9) finish();
    save();
    draw();
  }

  function finish() {
    G.over = true;
    const n = filled();
    const st = store.get(STATS_KEY, { played: 0, full: 0, bestScore: 0 });
    st.played++; if (n === 9) st.full++; st.bestScore = Math.max(st.bestScore, score());
    store.set(STATS_KEY, st);
    emit("grid:end", { filled: n, score: score(), mode });
    if (mode === "daily") markDaily("grid", `${n}/9 · rarity ${score()}`);
    if (n === 9) { confetti(2600); sound.play("win"); }
    announce(`Board finished: ${n} of 9, rarity score ${score()}.`);
  }

  function shareText() {
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (G.cells[r * 3 + c] ? "🟩" : "⬜")).join(""));
    return `Winner League Arcade · The Grid${mode === "daily" ? ` ${localDate()}` : ""}\n${rows.join("\n")}\n${filled()}/9 · rarity ${score()}`;
  }

  const head = (cr) => cr.club
    ? `<span class="gh-crest">${crestSvg(cr.club, teamName(cr.club), 34)}</span><b>${esc(cr.label)}</b>`
    : `<span class="gh-ic">${icon(ATTR_ICON[cr.id] || "star", { size: 22 })}</span><b>${esc(cr.label)}</b>`;

  function draw() {
    const st = store.get(STATS_KEY, { played: 0, full: 0, bestScore: 0 });
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>The Grid</h1>
        <p>Name a player for every square who fits both its row and its column. 9 guesses, each player once. Rarer answers score more.</p></div>
        <div class="row"><div class="seg" id="mode" role="radiogroup" aria-label="Puzzle">
          <button role="radio" data-m="daily" aria-checked="${mode === "daily"}" class="${mode === "daily" ? "on" : ""}">Daily</button>
          <button role="radio" data-m="free" aria-checked="${mode === "free"}" class="${mode === "free" ? "on" : ""}">Unlimited</button></div></div>
      </div>
      <div class="grid-layout">
        <div class="gr-board" role="group" aria-label="The Grid: rows × columns">
          <div class="gr-corner"><b class="led">${G.left}</b><small>guesses left</small></div>
          ${[0, 1, 2].map((c) => `<div class="gr-head col">${head(colC(c))}</div>`).join("")}
          ${[0, 1, 2].map((r) => `<div class="gr-head row">${head(rowC(r))}</div>${[0, 1, 2].map((c) => {
            const i = r * 3 + c, cell = G.cells[i];
            const label = `${rowC(r).label} and ${colC(c).label}`;
            if (cell) return `<div class="gr-cell done" data-cell="${i}" aria-label="${esc(label)}"><button class="link-name" data-profile="${cell.pid}">${esc(playersById.get(cell.pid).name)}</button><small>Rarity ${cell.rarity}</small></div>`;
            return `<button class="gr-cell ${active === i ? "on" : ""}" data-cell="${i}" ${G.over ? "disabled" : ""} aria-label="${esc(label)}: choose a player">${G.over ? `<small class="muted">${answersFor(rowC(r), colC(c)).length} possible</small>` : icon("search", { size: 18 })}</button>`;
          }).join("")}`).join("")}
        </div>
        <div class="card pad gr-side">
          ${G.over ? html`<h3>${filled() === 9 ? "Full board!" : `${filled()} of 9`}</h3>
              <p class="gr-score"><b class="led">${score()}</b><span class="muted">rarity score</span></p>
              <div class="row"><button class="btn" id="share">${icon("link", { size: 15 })} Copy result</button>
                ${mode === "free" ? `<button class="btn primary" id="again">${icon("refresh", { size: 15 })} New grid</button>` : ""}</div>
              <button class="btn ghost" id="answers">${icon("eye", { size: 15 })} Show some answers</button>
              <div id="answer-list"></div>`
          : active !== null ? html`<h3>${esc(rowC(Math.floor(active / 3)).label)} <span class="muted">×</span> ${esc(colC(active % 3).label)}</h3>
              <div class="search guess-search"><input id="gr-in" class="input" placeholder="Type a player's name…" autocomplete="off" aria-label="Player for this square"></div>
              <button class="btn ghost" id="gr-cancel">Cancel</button>`
          : html`<h3>${icon("target")} Pick a square</h3><p class="muted" style="margin:0">Then type a player who fits both. Wrong answers use up a guess.</p>`}
          ${G.wrong.length ? `<p class="muted gr-wrong">Misses: ${G.wrong.map((w) => esc(playersById.get(w.pid).name)).join(", ")}</p>` : ""}
          <p class="muted" style="font-size:12px;margin:0">Rarity is how little-known the player is among all the right answers (by games played): 0 = the most obvious pick, 100 = the deepest cut. Played ${st.played} · Full boards ${st.full} · Best ${st.bestScore}.</p>
        </div>
      </div>`;
    root.querySelector("#mode").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b && b.dataset.m !== mode) { mode = b.dataset.m; load(); } }, { signal });
    root.querySelector(".gr-board").addEventListener("click", (e) => {
      const b = e.target.closest("button.gr-cell"); if (!b || G.over) return;
      active = Number(b.dataset.cell); draw();
    }, { signal });
    const inp = root.querySelector("#gr-in");
    if (inp) {
      autocomplete(inp, items, (it) => guess(active, it.id), { signal, exclude: (it) => G.cells.some((c) => c?.pid === it.id) });
      inp.focus({ preventScroll: true });
      if (innerWidth < 860) inp.scrollIntoView({ block: "center", behavior: "smooth" }); // the input sits under the board on phones
    }
    root.querySelector("#gr-cancel")?.addEventListener("click", () => { active = null; draw(); }, { signal });
    root.querySelector("#again")?.addEventListener("click", () => load(true), { signal });
    root.querySelector("#share")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(shareText()); toast("Result copied"); } catch { toast("Couldn't copy"); } }, { signal });
    root.querySelector("#answers")?.addEventListener("click", () => {
      root.querySelector("#answer-list").innerHTML = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => {
        const list = answersFor(rowC(r), colC(c)).sort((a, b) => b.games - a.games);
        return `<p class="gr-ans"><b>${esc(rowC(r).label)} × ${esc(colC(c).label)}</b> (${list.length}): ${list.slice(0, 4).map((f) => `<button class="link-name" data-profile="${f.pid}">${esc(f.name)}</button>`).join(", ")}${list.length > 4 ? "…" : ""}</p>`;
      })).join("");
    }, { signal });
  }

  arrowGrid(root, ".gr-cell", 3, signal);
  gameKeys(signal, Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), press(root, `button.gr-cell[data-cell="${n - 1}"]`)])));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && active !== null && !document.querySelector("dialog[open]")) { active = null; draw(); } }, { signal });
  load();
}
