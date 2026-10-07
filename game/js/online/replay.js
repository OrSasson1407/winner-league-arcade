// Watch an online match again, round by round: what you answered and what your opponent answered.
// The server records every round (server/duels.js) and keeps it with the match in the history.
import { esc, html } from "../ui.js";
import { icon } from "../lib/icons.js";
import { psByKey, playersById, teamName } from "../data.js";
import { closeModal, openModal } from "../lib/modal.js";

const HL_LABEL = { ppg: "Points per game", rpg: "Rebounds per game", apg: "Assists per game", rating: "Game rating", val: "Efficiency (VAL) per game" };
const name = (pid) => playersById.get(pid)?.name || pid || "–";
const psName = (key) => { const ps = psByKey(key); return ps ? `${name(ps.player_id)} <small class="muted">${esc(teamName(ps.team_id))} ${esc(ps.season)}</small>` : esc(key); };
const num = (v) => (v == null ? "–" : Number(v) % 1 ? Number(v).toFixed(1) : String(v));
const mark = (ok) => (ok ? `<span class="rp-ok">${icon("check", { size: 14 })}</span>` : `<span class="rp-bad">${icon("x", { size: 14 })}</span>`);
const secs = (ms) => (ms == null ? "" : `<small class="muted">${(ms / 1000).toFixed(1)} s</small>`);

/**
 * game: hl | career | guess | draft | conn | grid | coach. seat: your seat (0/1). names: [yours, theirs]. scores: per seat.
 */
export function openReplay({ game, seat, names, replay, scores }) {
  const me = seat, op = 1 - seat;
  const both = (fn) => `<td>${fn(me)}</td><td>${fn(op)}</td>`;
  const head = `<th>${esc(names[0])}</th><th>${esc(names[1])}</th>`;
  let body = "";
  if (game === "hl") {
    body = `<table class="stat-table rp-table"><thead><tr><th>#</th><th>Pair</th>${head}</tr></thead><tbody>${(replay.rounds || []).map((r, i) => `<tr>
      <td>${i + 1}</td><td><small class="muted">${esc(HL_LABEL[r.cat] || r.cat)}</small><br>${psName(r.a)} <b>${num(r.va)}</b><br>vs ${psName(r.b)} <b>${num(r.vb)}</b></td>
      ${both((s) => { const a = r.ans[s] || {}; return a.c ? `${mark(a.ok)} ${a.c === "higher" ? "▲" : "▼"} <b>+${a.pts}</b> ${secs(a.ms)}` : `<span class="muted">No answer</span>`; })}</tr>`).join("")}</tbody></table>`;
  } else if (game === "career") {
    body = `<table class="stat-table rp-table"><thead><tr><th>#</th><th>The player</th>${head}</tr></thead><tbody>${(replay.rounds || []).map((r, i) => `<tr>
      <td>${i + 1}</td><td><b>${esc(name(r.target))}</b></td>
      ${both((s) => { const p = r.picks[s]; return p ? `${mark(p === r.target)} ${esc(name(p))}${r.winner === s ? ` <b>+3</b>` : ""}` : `<span class="muted">No answer</span>`; })}</tr>`).join("")}</tbody></table>`;
  } else if (game === "guess") {
    const col = (s) => `<ol class="rp-guess">${(replay.rows?.[s] || []).map((r) => `<li><span class="rp-colors">${r.colors.map((c) => `<i class="rp-c ${c}"></i>`).join("")}</span> ${esc(name(r.pid))}</li>`).join("") || `<li class="muted">No guesses</li>`}</ol>`;
    body = `<p>The player was <b>${esc(name(replay.target))}</b>.</p><div class="rp-two"><div><h3>${esc(names[0])}</h3>${col(me)}</div><div><h3>${esc(names[1])}</h3>${col(op)}</div></div>`;
  } else if (game === "draft") {
    body = `<table class="stat-table rp-table"><thead><tr><th>#</th><th>Who</th><th>Spin</th><th>Pick</th><th>Slot</th></tr></thead><tbody>${(replay.picks || []).map((p, i) => `<tr>
      <td>${i + 1}</td><td>${esc(names[p.seat === me ? 0 : 1])}</td><td><small>${esc(teamName(p.spin?.team_id))} ${esc(p.spin?.season || "")}</small></td>
      <td>${psName(p.key)}${p.auto ? ` <small class="muted">(time ran out)</small>` : ""}</td><td>${esc(p.slot)}</td></tr>`).join("")}</tbody></table>`;
  } else if (game === "conn") {
    const levelName = (l) => replay.groups?.find((g) => g.level === l)?.label || "";
    body = `<div class="rp-groups">${(replay.groups || []).map((g) => `<div class="cn-group lv${g.level}"><b>${esc(g.label)}</b><span>${g.players.map((p) => esc(name(p))).join(", ")}</span></div>`).join("")}</div>
      <table class="stat-table rp-table"><thead><tr><th>Time</th><th>Who</th><th>Four</th><th></th></tr></thead><tbody>${(replay.tries || []).map((t) => `<tr>
      <td>${secs(t.ms)}</td><td>${esc(names[t.seat === me ? 0 : 1])}</td><td>${t.pids.map((p) => esc(name(p))).join(", ")}</td><td>${mark(t.ok)} ${t.ok ? esc(levelName(t.level)) : ""}</td></tr>`).join("")}</tbody></table>`;
  } else if (game === "coach") {
    const PLAN = { pace: "Pace", defense: "Defense", focus: "Focus" };
    const plan = (t) => (t ? Object.keys(PLAN).map((k) => `${PLAN[k]}: ${esc(t[k])}`).join("<br>") : `<span class="muted">Default plan</span>`);
    body = `<table class="stat-table rp-table"><thead><tr><th>Team-season</th><th>Rating</th><th>Picked by</th></tr></thead><tbody>${(replay.choices || []).map((c, i) => {
      const by = replay.picks?.indexOf(i);
      return `<tr><td>${esc(teamName(c.team_id))} ${esc(c.season)}</td><td>${c.s}</td><td>${by >= 0 ? `${esc(names[by === me ? 0 : 1])}${by === replay.first ? ` <small class="muted">(first pick)</small>` : ""}` : `<span class="muted">–</span>`}</td></tr>`;
    }).join("")}</tbody></table>
      <table class="stat-table rp-table"><thead><tr><th>Game plan</th>${head}</tr></thead><tbody><tr><td></td>${both((s) => plan(replay.tactics?.[s]))}</tr></tbody></table>`;
  } else if (game === "grid") {
    body = `<table class="stat-table rp-table"><thead><tr><th>Time</th><th>Who</th><th>Square</th><th>Player</th><th></th></tr></thead><tbody>${(replay.tries || []).map((t) => `<tr>
      <td>${secs(t.ms)}</td><td>${esc(names[t.seat === me ? 0 : 1])}</td><td>${Math.floor(t.cell / 3) + 1}·${(t.cell % 3) + 1}</td><td>${esc(name(t.pid))}</td><td>${mark(t.right)}${t.right ? ` rarity ${t.rarity}` : ""}</td></tr>`).join("")}</tbody></table>`;
  }
  const d = document.createElement("dialog");
  d.className = "profile-modal rp-modal";
  d.setAttribute("aria-label", "Match replay");
  d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
    <div class="profile"><small class="muted">MATCH REPLAY</small><h2>${esc(names[0])} <span class="led">${esc(String(scores?.[me] ?? "–"))}</span> – <span class="led">${esc(String(scores?.[op] ?? "–"))}</span> ${esc(names[1])}</h2>
    <div class="grid-wrap">${body || `<p class="muted">Nothing was recorded for this match.</p>`}</div></div>`;
  d.querySelector(".profile-close").addEventListener("click", () => closeModal(d));
  d.addEventListener("close", () => setTimeout(() => d.remove(), 300));
  document.body.appendChild(d);
  openModal(d);
}
