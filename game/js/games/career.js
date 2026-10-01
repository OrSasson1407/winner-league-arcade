// Career Path Quiz: see a player's journey, name the player.
import { careerSummary, namedPlayers, pick, playersById, seasonYear, shuffle, teamName } from "../data.js";
import { animate, esc, fmt1, html, store, toast, track } from "../ui.js";
import { bestSeason, playerCard } from "../components/playerCard.js";
import { clubColors } from "../lib/clubs.js";
import { confetti, sound } from "../lib/fx.js";
import { icon } from "../lib/icons.js";
import { posPill } from "../lib/icons.js";
import { confirmDialog } from "../lib/modal.js";
import { emit } from "../lib/achievements.js";
import { challengeFor, challengeRng } from "../lib/challenge.js";
import { decoys, eligible } from "../shared/careerLogic.js";
import { challengeBanner, challengeShareText, recordChallenge } from "../pages/challenge.js";

const SAVE_KEY = "career:save";

const ROUNDS = 10;

export function renderCareer(root, signal, params, query) {
  const pool = eligible();
  const ch = challengeFor(query, "career"); // challenge mode: same 10 careers for everyone
  let rnd = Math.random;
  let state;

  function save() {
    if (ch) return; // challenges don't touch your saved game
    store.set(SAVE_KEY, { targets: state.targets.map((p) => p.player_id), round: state.round, score: state.score, hint: state.hint,
      answered: state.answered, options: state.options.map((p) => p.player_id) });
  }

  function resume() {
    const sv = store.get(SAVE_KEY);
    if (!sv || sv.round >= ROUNDS) return false;
    const targets = sv.targets.map((id) => playersById.get(id));
    const options = sv.options.map((id) => playersById.get(id));
    if (targets.some((x) => !x) || options.some((x) => !x)) return false;
    state = { targets, round: sv.round, score: sv.score, hint: sv.hint, answered: sv.answered, options };
    if (sv.round || sv.answered) toast(`Resumed: round ${sv.round + 1}, score ${sv.score}`);
    render();
    return true;
  }

  function start() {
    track("career");
    if (ch) rnd = challengeRng(ch.code);
    const targets = shuffle(pool, rnd).slice(0, ROUNDS);
    state = { targets, round: 0, score: 0, hint: false, answered: null, options: [] };
    prepare();
  }

  function prepare() {
    const target = state.targets[state.round];
    state.options = shuffle([target, ...decoys(target, pool, 3, rnd)], rnd);
    state.hint = false;
    state.answered = null;
    render();
  }

  function answer(id) {
    if (state.answered) return;
    const target = state.targets[state.round];
    state.answered = id;
    const right = id === target.player_id;
    if (right) state.score += state.hint ? 2 : 3;
    sound.play(right ? "place" : "bad");
    render();
    animate(root.querySelector(`.choice[data-id="${id}"]`), right ? "glow" : "shake");
  }

  function next() {
    state.round++;
    if (state.round >= ROUNDS) return finish();
    prepare();
  }

  function finish() {
    if (!ch) store.set(SAVE_KEY, null);
    if (ch) recordChallenge(ch.code, `${state.score}/30`);
    emit("career:finish", { score: state.score, hints: state.hintsUsed || 0 });
    const best = store.get("career:best", 0);
    if (state.score > best) { store.set("career:best", state.score); if (state.score > 0) { confetti(); sound.play("win"); toast("New best score!"); } }
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Career Path</h1></div></div>
      <div class="card center-card">
        <div class="muted">Final score</div>
        <div class="big-score">${state.score}<span class="muted" style="font-size:28px">/${ROUNDS * 3}</span></div>
        <p class="muted">${state.score >= 27 ? "League historian" : state.score >= 20 ? "True fan" : state.score >= 12 ? "Solid" : "Keep watching!"} · Best: ${Math.max(best, state.score)}</p>
        ${ch ? `<button class="btn" id="ch-share">${icon("users", { size: 16 })} Copy challenge result</button>` : ""}
        <button class="btn primary" id="again">${ch ? "Replay challenge" : "Play again"}</button>
      </div>`;
    root.querySelector("#again").addEventListener("click", start, { signal });
    root.querySelector("#ch-share")?.addEventListener("click", async () => {
      const txt = challengeShareText(ch, `I scored ${state.score}/30`);
      try { await navigator.clipboard.writeText(txt); toast("Copied: send it to your friend"); } catch { toast(txt); }
    }, { signal });
  }

  function render() {
    save();
    const target = state.targets[state.round];
    const s = careerSummary(target.player_id);
    const correct = target.player_id;
    root.innerHTML = html`${ch ? challengeBanner(ch) : ""}
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Career Path</h1>
        <p>Whose career is this? 3 points, or 2 if you use the hint.</p></div>
        <div class="row"><span class="streak">Score ${state.score}</span><span class="muted">Round ${state.round + 1}/${ROUNDS}</span><button class="btn ghost" id="new-game">New game</button></div>
      </div>
      <div class="progress" style="margin-bottom:18px"><i style="width:${(state.round / ROUNDS) * 100}%"></i></div>
      <div class="career-layout">
        <div class="card pad" style="display:grid;gap:14px">
          <h3>The journey</h3>
          <div class="path">${s.records.map((r, i) => html`
            <div class="stop" style="--club:${clubColors(r.team_id)[0]};animation-delay:${i * 0.07}s"><span class="season">${r.season}</span><span class="team">${esc(teamName(r.team_id))}</span>
              <span class="line">${r.stats ? `${r.stats.games} GP · ${fmt1(r.stats.ppg)} PPG` : "no games"}${r.age ? ` · age ${r.age}` : ""}</span></div>`).join("")}
          </div>
        </div>
        <div class="card pad" style="display:grid;gap:16px;align-content:start">
          <h3>Who is it?</h3>
          <div class="choices">${state.options.map((p) => {
            let cls = "";
            if (state.answered) cls = p.player_id === correct ? "right" : p.player_id === state.answered ? "wrong" : "";
            return `<button class="choice ${cls}" data-id="${p.player_id}" ${state.answered ? "disabled" : ""}>${esc(p.name)}</button>`;
          }).join("")}</div>
          <div class="hint-box">
            ${state.hint || state.answered ? html`
              ${posPill(target.primary_position)}
              ${target.height_cm ? `<span class="pill">${target.height_cm} cm</span>` : ""}
              ${target.nationality ? `<span class="pill">${esc(target.nationality)}</span>` : ""}
              ${target.birth_date ? `<span class="pill">born ${target.birth_date.slice(0, 4)}</span>` : ""}`
              : `<button class="btn" id="hint">${icon("bulb", { size: 16 })} Hint (−1 point)</button>`}
          </div>
          ${state.answered ? html`<div class="answer-card pop">${playerCard(bestSeason(s.records), { size: "sm" })}
            <div style="display:grid;gap:8px"><b style="font-size:18px">${state.answered === correct ? `${icon("check", { size: 18, cls: "ic-good" })} Correct! +` + (state.hint ? 2 : 3) : `${icon("x", { size: 18, cls: "ic-bad" })} It was ` + esc(target.name)}</b>
            <button class="btn" data-profile="${target.player_id}">Full career →</button>
            <button class="btn primary" id="next">${state.round + 1 >= ROUNDS ? "See score" : "Next →"}</button></div></div>` : ""}
        </div>
      </div>`;
    root.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => answer(b.dataset.id), { signal }));
    root.querySelector("#hint")?.addEventListener("click", () => { state.hint = true; render(); }, { signal });
    root.querySelector("#next")?.addEventListener("click", next, { signal });
    root.querySelector("#new-game")?.addEventListener("click", async () => {
      if (await confirmDialog({ title: "Start a new game?", message: `Your current game (round ${state.round + 1}, score ${state.score}) will be lost.`, ok: "New game" })) start();
    }, { signal });
  }

  if (ch || !resume()) start();
}
