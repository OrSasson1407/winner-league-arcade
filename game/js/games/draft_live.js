// Box score + live game view (LED scoreboard, game clock, play-by-play) for simulated games.
import { clubColors } from "../lib/clubs.js";
import { confetti, sound } from "../lib/fx.js";
import { reducedMotion } from "../lib/settings.js";
import { icon } from "../lib/icons.js";
import { esc, html } from "../ui.js";
import { nameLink } from "../components/playerCard.js";
import { boxScore, playByPlay } from "./draft_sim.js";
import { closeModal, openModal } from "../lib/modal.js";
import { emit } from "../lib/achievements.js";

const teamColor = (t) => (t.drafted ? "var(--accent)" : clubColors(t.id)[0]);

function boxTable(team, lines, score) {
  const top = Math.max(...lines.map((l) => l.pts));
  return html`<div class="box-team">
    <div class="row"><span class="dot" style="background:${teamColor(team)}"></span><b>${esc(team.name)}</b><span class="spacer"></span><b class="led">${score}</b></div>
    <table class="stat-table box"><thead><tr><th>Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
    <tbody>${lines.map((l) => `<tr class="${l.pts === top && top > 0 ? "best" : ""}"><td>${nameLink(l.player_id, l.name)}</td><td class="muted">${esc(l.pos)}</td><td>${l.min}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td></tr>`).join("")}
    <tr class="tot"><td>Team</td><td></td><td>200</td><td><b>${lines.reduce((s, l) => s + l.pts, 0)}</b></td><td>${lines.reduce((s, l) => s + l.reb, 0)}</td><td>${lines.reduce((s, l) => s + l.ast, 0)}</td></tr></tbody></table>
  </div>`;
}

export function boxScoreHtml(game) {
  const box = boxScore(game);
  return html`<div class="box-wrap">${boxTable(game.home, box.home, game.hs)}${boxTable(game.away, box.away, game.as)}</div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Simulated game. Player lines follow each player's real per-game profile in the season they were drafted from.</p>`;
}

let dialog = null;
let stopLive = null;
function modal() {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "profile-modal";
    dialog.setAttribute("aria-label", "Game");
    dialog.addEventListener("click", (e) => { if (e.target === dialog) { stopLive?.(); closeModal(dialog); } });
    // "close" fires asynchronously: if the dialog was reopened meanwhile (box score -> live), keep running
    dialog.addEventListener("close", () => { if (!dialog.open) { stopLive?.(); stopLive = null; } });
    document.body.appendChild(dialog);
  }
  return dialog;
}

function header(game) {
  return `<div class="muted" style="font-weight:700;letter-spacing:2px;font-size:12px">${esc((game.label || "").toUpperCase())}</div>
    <h2 style="font-size:28px">${esc(game.home.name)} ${game.neutral ? "vs" : "(home) vs"} ${esc(game.away.name)}</h2>`;
}

export function openBoxScore(game) {
  const d = modal();
  stopLive?.();
  d.innerHTML = `<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button><div class="profile">${header(game)}${boxScoreHtml(game)}</div>`;
  d.querySelector(".profile-close").addEventListener("click", () => { stopLive?.(); closeModal(d); });
  openModal(d);
}

/** Live view: the clock runs through 4 quarters; events are the box score's baskets, in time order. */
export function openLiveGame(game, { celebrate = () => false } = {}) {
  const d = modal();
  stopLive?.();
  const box = boxScore(game);
  const events = playByPlay(game, box);
  let speed = 1, t = 0, idx = 0, hs = 0, as = 0, timer = null;
  d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
    <div class="profile live">
      ${header(game)}
      <div class="scoreboard" role="group" aria-label="Scoreboard">
        <div class="sb-team"><span class="sb-bar" style="background:${teamColor(game.home)}"></span><span class="sb-name">${esc(game.home.name)}</span></div>
        <div class="sb-score led" id="sb-hs" aria-live="off">0</div>
        <div class="sb-mid"><div class="sb-q led" id="sb-q">Q1</div><div class="sb-clock led" id="sb-clock">10:00</div></div>
        <div class="sb-score led" id="sb-as">0</div>
        <div class="sb-team right"><span class="sb-name">${esc(game.away.name)}</span><span class="sb-bar" style="background:${teamColor(game.away)}"></span></div>
      </div>
      <div class="row">
        <div class="seg sm" id="speed" role="radiogroup" aria-label="Speed">${[1, 3, 10].map((s) => `<button role="radio" aria-checked="${s === 1}" data-s="${s}" class="${s === 1 ? "on" : ""}">${s}×</button>`).join("")}</div>
        <button class="btn" id="pause">${icon("pause", { size: 15 })} Pause</button><button class="btn" id="skip">${icon("skip", { size: 15 })} Skip to final</button>
        <span class="spacer"></span><span class="muted" id="sb-status" aria-live="polite">Tip-off!</span>
      </div>
      <div class="pbp" id="pbp" aria-live="polite"></div>
      <div id="final-box"></div>
    </div>`;
  d.querySelector(".profile-close").addEventListener("click", () => { stopLive?.(); closeModal(d); });
  openModal(d);
  const $ = (s) => d.querySelector(s);
  const pbp = $("#pbp");
  const clock = (gt) => {
    const q = Math.min(4, Math.floor(gt / 600) + 1);
    const left = Math.max(0, q * 600 - gt);
    return [q, `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(Math.floor(left % 60)).padStart(2, "0")}`];
  };
  const push = (e) => {
    const [q, c] = clock(e.t);
    const team = e.side === "home" ? game.home : game.away;
    const row = document.createElement("div");
    row.className = "pbp-row";
    row.innerHTML = `<span class="pbp-time">Q${q} ${c}</span><span class="dot" style="background:${teamColor(team)}"></span><span>${esc(e.text)}</span><b class="pbp-score">${hs}-${as}</b>`;
    pbp.prepend(row);
    while (pbp.children.length > 60) pbp.lastChild.remove();
  };
  const finish = (completed = false) => {
    clearInterval(timer); timer = null;
    emit("draft:live", { completed, final: game.label === "Final" });
    while (idx < events.length) { const e = events[idx++]; if (e.side === "home") hs += e.v; else as += e.v; }
    $("#sb-hs").textContent = game.hs; $("#sb-as").textContent = game.as;
    $("#sb-q").textContent = "FINAL"; $("#sb-clock").textContent = "00:00";
    $("#sb-status").textContent = `${game.winner.name} win ${Math.max(game.hs, game.as)}-${Math.min(game.hs, game.as)}`;
    $("#final-box").innerHTML = `<h3 style="margin-top:6px">Box score</h3>${boxScoreHtml(game)}`;
    ["#pause", "#skip"].forEach((s) => { $(s).disabled = true; });
    if (celebrate(game)) { confetti(3000); sound.play("win"); } else sound.play("place");
  };
  const tick = () => {
    t += 5 * speed; // 1×: a 40-minute game takes ~48 s
    while (idx < events.length && events[idx].t <= t) {
      const e = events[idx++];
      if (e.side === "home") hs += e.v; else as += e.v;
      push(e);
    }
    const [q, c] = clock(Math.min(t, 2400));
    $("#sb-hs").textContent = hs; $("#sb-as").textContent = as;
    $("#sb-q").textContent = `Q${q}`; $("#sb-clock").textContent = c;
    $("#sb-status").textContent = hs === as ? (hs ? `Tied ${hs}-${as}` : "Tip-off!")
      : `${hs > as ? game.home.name : game.away.name} lead by ${Math.abs(hs - as)}`;
    if (t >= 2400) finish(true);
  };
  const play = () => { if (!timer) timer = setInterval(tick, 100); };
  $("#speed").addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]"); if (!b) return;
    speed = Number(b.dataset.s);
    d.querySelectorAll("#speed button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
  });
  $("#pause").addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; $("#pause").innerHTML = `${icon("play", { size: 15 })} Resume`; }
    else { play(); $("#pause").innerHTML = `${icon("pause", { size: 15 })} Pause`; }
  });
  $("#skip").addEventListener("click", () => finish(false));
  stopLive = () => clearInterval(timer);
  if (reducedMotion()) finish(); else play();
}
