// The game screen for any simulated game: a pre-game graphic, the live view on the court (driven by the
// engine's own events), and the final: momentum, box score, team stats and the player of the game.
import { clubColors } from "./clubs.js";
import { crestSvg, icon } from "./icons.js";
import { closeModal, openModal } from "./modal.js";
import { announce } from "./a11y.js";
import { confetti, sound } from "./fx.js";
import { esc, html } from "../ui.js";
import { TACTICS } from "../shared/gameSim.js";
import { bindMomentum, courtSvg, momentumHtml, SPOTS } from "../mycareer/live.js";
import { COURT, clockOf } from "../mycareer/pbp.js";
import { cssHex, set3D, want3D, webglOk } from "../three3d/core.js";
import { designOf } from "../three3d/player.js";

const SECONDS_PER_SECOND = 52;
export const ESTIMATE_NOTE = "Played possession by possession from each player's real per-game numbers. Shot attempts, turnovers and fouls aren't in the league data, so the engine estimates them.";

const colorOf = (t) => t.color || (t.id ? clubColors(t.id)[0] : "#e4002b");
const crest = (t, size) => (t.id ? crestSvg(t.id, t.name, size) : `<span class="gv-dot" style="background:${colorOf(t)};width:${size}px;height:${size}px"></span>`);

/** Box score table for one side. */
export function boxTableHtml(team, lines, score, { meId = null, link = null } = {}) {
  const top = Math.max(...lines.map((l) => l.pts));
  const tot = (k) => lines.reduce((s, l) => s + l[k], 0);
  const name = (l) => (link ? link(l) : esc(l.name));
  const row = (l) => `<tr class="${l.id === meId ? "me-row" : l.pts === top && top > 0 ? "best" : ""}"><td>${name(l)}${l.starter ? "" : ' <small class="muted">bench</small>'}</td><td class="muted">${esc(l.pos || "")}</td>
    <td>${l.min}</td><td><b>${l.pts}</b></td><td>${l.fgm}-${l.fga}</td><td>${l.tpm}-${l.tpa}</td><td>${l.ftm}-${l.fta}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td>${l.pf}</td><td>${l.pm > 0 ? "+" : ""}${l.pm}</td></tr>`;
  return html`<div class="box-team gv-box"><div class="row">${crest(team, 22)}<b>${esc(team.name)}</b><span class="spacer"></span><b class="led">${score}</b></div>
    <div class="grid-wrap"><table class="stat-table box"><thead><tr><th>Player</th><th></th><th>MIN</th><th>PTS</th><th>FG</th><th>3P</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th><th>+/-</th></tr></thead>
    <tbody>${lines.slice().sort((a, b) => b.min - a.min).filter((l) => l.min > 0).map(row).join("")}
      <tr class="tot"><td>Team</td><td></td><td></td><td><b>${tot("pts")}</b></td><td>${tot("fgm")}-${tot("fga")}</td><td>${tot("tpm")}-${tot("tpa")}</td><td>${tot("ftm")}-${tot("fta")}</td><td>${tot("reb")}</td><td>${tot("ast")}</td><td>${tot("stl")}</td><td>${tot("blk")}</td><td>${tot("tov")}</td><td>${tot("pf")}</td><td></td></tr></tbody></table></div></div>`;
}

/** Team comparison after the game. */
function teamStatsHtml(home, away, sim) {
  const [a, b] = sim.team;
  const rows = [["Field goals", `${a.fg} (${a.fgp}%)`, `${b.fg} (${b.fgp}%)`, a.fgp, b.fgp], ["Three-pointers", `${a.tp} (${a.tpp}%)`, `${b.tp} (${b.tpp}%)`, a.tpp, b.tpp],
    ["Free throws", `${a.ft} (${a.ftp}%)`, `${b.ft} (${b.ftp}%)`, a.ftp, b.ftp], ["Rebounds (offensive)", `${a.reb} (${a.oreb})`, `${b.reb} (${b.oreb})`, a.reb, b.reb],
    ["Assists", a.ast, b.ast, a.ast, b.ast], ["Turnovers", a.tov, b.tov, -a.tov, -b.tov], ["Steals · blocks", `${a.stl} · ${a.blk}`, `${b.stl} · ${b.blk}`, a.stl + a.blk, b.stl + b.blk],
    ["Points in the paint", a.paint, b.paint, a.paint, b.paint], ["Fast-break points", a.fb, b.fb, a.fb, b.fb], ["Bench points", a.bench, b.bench, a.bench, b.bench]];
  return html`<div class="card pad gv-stats"><h3>${icon("chart")} Team stats</h3><table class="stat-table gv-cmp"><thead><tr><th>${esc(home.name)}</th><th></th><th>${esc(away.name)}</th></tr></thead><tbody>
    ${rows.map(([l, x, y, vx, vy]) => `<tr><td class="${vx > vy ? "gv-win" : ""}">${x}</td><td class="muted">${l}</td><td class="${vy > vx ? "gv-win" : ""}">${y}</td></tr>`).join("")}</tbody></table></div>`;
}

function quartersHtml(home, away, sim) {
  const n = sim.quarters[0].length;
  const head = Array.from({ length: n }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ""}`));
  return html`<div class="grid-wrap"><table class="stat-table gv-qs"><thead><tr><th></th>${head.map((h) => `<th>${h}</th>`).join("")}<th>Final</th></tr></thead><tbody>
    ${[home, away].map((t, s) => `<tr><td><span class="tm">${crest(t, 18)} ${esc(t.name)}</span></td>${sim.quarters[s].map((q) => `<td>${q}</td>`).join("")}<td><b>${sim.score[s]}</b></td></tr>`).join("")}</tbody></table></div>`;
}

function mvpHtml(home, away, sim) {
  const m = sim.mvp;
  if (!m) return "";
  const l = m.line, team = m.side === 0 ? home : away;
  return html`<div class="gv-mvp"><span class="bc-strap">Player of the game</span><b>${esc(m.name)}</b><small class="muted">${esc(team.name)}</small>
    <span class="gv-mvp-line">${l.pts} PTS · ${l.reb} REB · ${l.ast} AST${l.stl ? ` · ${l.stl} STL` : ""}${l.blk ? ` · ${l.blk} BLK` : ""} · ${l.fgm}-${l.fga} FG</span></div>`;
}

/** Pre-game graphic: projected starters, team numbers, game plans and keys to the game. */
function pregameHtml(home, away, pre) {
  const side = (t, s) => {
    const pv = pre.previews[s];
    const tac = pre.tactics?.[s] || {};
    return html`<div class="gv-pre-team" style="--club:${colorOf(t)}">
      <div class="gv-pre-head">${crest(t, 46)}<b>${esc(t.name)}</b></div>
      <ul class="clean gv-pre-nums"><li><span>Team rating</span><b>${pv.rating}</b></li><li><span>Top-8 points (per game, added up)</span><b>${pv.pts}</b></li><li><span>Top-8 rebounds</span><b>${pv.reb}</b></li><li><span>Top-8 assists</span><b>${pv.ast}</b></li><li><span>Shots from three</span><b>${pv.three}%</b></li></ul>
      <small class="muted">STARTERS</small><ol class="clean gv-five">${pre.lineups[s].map((p) => `<li><span class="pill">${esc(p.pos || "")}</span> ${esc(p.name)}</li>`).join("")}</ol>
      <small class="muted">GAME PLAN</small><p class="gv-plan">${esc(TACTICS.pace[tac.pace || "normal"].label)} pace · ${esc(TACTICS.defense[tac.defense || "man"].label)} · ${esc(TACTICS.focus[tac.focus || "balanced"].label)}</p>
    </div>`;
  };
  return html`<div class="gv-pre"><span class="bc-strap">Tip-off</span>
    <div class="gv-pre-grid">${side(home, 0)}<div class="gv-vs">VS</div>${side(away, 1)}</div>
    ${pre.keys?.length ? html`<div class="gv-keys"><b>Keys to the game</b><ul class="clean">${pre.keys.map((k) => `<li>${icon("check", { size: 14 })} ${esc(k)}</li>`).join("")}</ul></div>` : ""}</div>`;
}

/** Simple "keys to the game" from the two previews and game plans. */
export function keysFor(home, away, pre) {
  const [a, b] = pre.previews, keys = [];
  if (Math.abs(a.reb - b.reb) >= 3) keys.push(`${a.reb > b.reb ? home.name : away.name} should win the boards (${Math.max(a.reb, b.reb)} rebounds a game from the top 8 against ${Math.min(a.reb, b.reb)}).`);
  if (Math.abs(a.three - b.three) >= 6) keys.push(`${a.three > b.three ? home.name : away.name} live by the three: ${Math.max(a.three, b.three)}% of their shots.`);
  for (const [t, pv] of [[home, a], [away, b]]) if (pv.star) keys.push(`Stop ${pv.star.name}, ${t.name}'s main scorer.`);
  const zone = pre.tactics?.findIndex((x) => x?.defense === "zone");
  if (zone >= 0) keys.push(`${zone === 0 ? home.name : away.name} play zone: open threes for the other side, fewer points at the rim.`);
  return keys.slice(0, 4);
}

/**
 * Open the game screen.
 * opts: { home, away: { name, id?, color? }, sim (with events), label, pre (optional pre-game data),
 *         start: "pregame" | "live" | "final", celebrate: side (0|1) or null, meId, link (box-score name renderer), onClose }
 */
export function openGameView(opts) {
  const { home, away, sim, label = "", pre = null, celebrate = null, meId = null, link = null, onClose } = opts;
  let start = opts.start || (pre ? "pregame" : "live");
  const d = document.createElement("dialog");
  d.className = "profile-modal gv-modal";
  d.setAttribute("aria-label", `${home.name} vs ${away.name}`);
  d.style.setProperty("--club", colorOf(home));
  document.body.appendChild(d);
  const ctl = new AbortController();
  let raf = 0, closed = false;
  const close = () => { if (closed) return; closed = true; cancelAnimationFrame(raf); ctl.abort(); closeModal(d); setTimeout(() => d.remove(), 300); onClose?.(); };
  d.addEventListener("close", () => { if (!closed) { closed = true; cancelAnimationFrame(raf); ctl.abort(); setTimeout(() => d.remove(), 300); onClose?.(); } });
  const top = () => `<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
    <div class="gv-head"><small class="muted">${esc(label.toUpperCase())}</small><h2>${esc(home.name)} <span class="muted">vs</span> ${esc(away.name)}</h2></div>`;
  const wire = () => d.querySelector(".profile-close").addEventListener("click", close);

  function showPregame() {
    d.innerHTML = top() + pregameHtml(home, away, pre) + html`<div class="row gv-actions"><button class="btn primary" id="gv-live" aria-keyshortcuts="L" title="Watch live (L)">${icon("play", { size: 15 })} Watch live</button><button class="btn" id="gv-final" aria-keyshortcuts="F" title="Final score (F)">${icon("skip", { size: 15 })} Final score</button></div>
      <p class="muted gv-note">${ESTIMATE_NOTE}</p>`;
    wire();
    d.querySelector("#gv-live").addEventListener("click", showLive);
    d.querySelector("#gv-final").addEventListener("click", showFinal);
    d.querySelector("#gv-live").focus();
  }

  function showFinal() {
    cancelAnimationFrame(raf);
    keys = null;
    const won = sim.score[0] > sim.score[1] ? 0 : 1;
    const g = { tl: { events: sim.events || [], lead: sim.lead, length: sim.length, quarter: sim.quarter }, seed: 1 };
    d.innerHTML = top() + html`<div class="gv-final">
      <div class="gv-score">${crest(home, 40)}<b class="led">${sim.score[0]}</b><span>–</span><b class="led">${sim.score[1]}</b>${crest(away, 40)}</div>
      <p class="gv-result"><span class="bc-strap">Final${sim.ot ? ` · ${sim.ot > 1 ? `${sim.ot} OT` : "OT"}` : ""}</span> ${esc((won === 0 ? home : away).name)} win</p>
      ${quartersHtml(home, away, sim)}
      ${mvpHtml(home, away, sim)}
      ${sim.events ? momentumHtml(g, home.name, away.name) : ""}
      ${teamStatsHtml(home, away, sim)}
      <div class="box-wrap">${boxTableHtml(home, sim.box[0], sim.score[0], { meId, link })}${boxTableHtml(away, sim.box[1], sim.score[1], { meId, link })}</div>
      <p class="muted gv-note">${ESTIMATE_NOTE}</p></div>`;
    wire();
    if (sim.events) bindMomentum(d.querySelector(".mc-momentum"), g, ctl.signal);
    if (celebrate !== null && celebrate === won) { confetti(2600); sound.play("win"); } else sound.play("place");
    announce(`Final: ${home.name} ${sim.score[0]}, ${away.name} ${sim.score[1]}.${sim.mvp ? ` Player of the game: ${sim.mvp.name}.` : ""}`);
    d.querySelector(".profile-close").focus();
  }

  function showLive() {
    const ev = (sim.events || []).filter((e) => ["2", "3", "ft", "miss", "tov", "timeout", "period", "period-end"].includes(e.type));
    const [h1, h2] = home.colors || clubColors(home.id || "x"), [a1, a2] = away.colors || clubColors(away.id || "y"); // colors: e.g. a national team's flag
    d.innerHTML = top() + html`
      <div class="lv-board-top">
        <div class="lv-team">${crest(home, 30)}<span>${esc(home.name)}</span><b class="led" id="gv-s0">0</b></div>
        <div class="lv-clock"><small id="gv-q">Q1</small><b class="led" id="gv-c">10:00</b></div>
        <div class="lv-team r"><b class="led" id="gv-s1">0</b><span>${esc(away.name)}</span>${crest(away, 30)}</div>
      </div>
      <div class="lv-court ${want3D() ? "is3d" : ""}"><div class="lv-court3d" id="gv-3d"></div><svg viewBox="-6 -6 ${COURT.w + 12} ${COURT.h + 12}" aria-hidden="true">${courtSvg()}<g id="gv-shots"></g>
        ${[0, 1].map((s) => [0, 1, 2, 3, 4].map((i) => `<g class="lv-p s${s}" data-s="${s}" data-i="${i}" style="--c:${s ? a1 : h1};--c2:${s ? a2 : h2}"><circle r="4.6"/></g>`).join("")).join("")}
        <circle id="gv-ball" r="2.4" class="lv-ball" cx="140" cy="75"/></svg></div>
      <p class="lv-feed" id="gv-feed" aria-live="off">Tip-off!</p>
      <div class="lv-ctrl"><div class="seg sm" role="group" aria-label="Speed">${[1, 2, 4].map((x) => `<button data-x="${x}" class="${x === 2 ? "on" : ""}" aria-pressed="${x === 2}">${x}×</button>`).join("")}</div>
        ${webglOk() ? `<button class="btn" id="gv-3dt" aria-pressed="${want3D()}">${want3D() ? "2D court" : "3D court"}</button>` : ""}
        <button class="btn" id="gv-pause" aria-keyshortcuts="Space" title="Pause (Space)">${icon("pause", { size: 15 })} Pause</button><button class="btn primary" id="gv-skip" aria-keyshortcuts="F" title="Final score (F)">${icon("skip", { size: 15 })} Final score</button></div>`;
    wire();
    const $ = (q) => d.querySelector(q);
    const dots = [...d.querySelectorAll(".lv-p")], ball = $("#gv-ball"), shots = $("#gv-shots");
    const place = (el, x, y) => el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    let jit = 1;
    const rnd = () => { jit = (jit * 16807) % 2147483647; return jit / 2147483647; };
    const formation = (side) => {
      const hx = side === 0 ? COURT.hoopR[0] : COURT.hoopL[0], dir = side === 0 ? 1 : -1;
      for (const p of dots) {
        const s = Number(p.dataset.s), [ox, oy] = SPOTS[Number(p.dataset.i)];
        const x = hx + dir * ox + (rnd() - 0.5) * 10, y = 75 + oy + (rnd() - 0.5) * 10;
        if (s === side) place(p, x, y); else place(p, x + (hx - x) * 0.3, y + (75 - y) * 0.3);
      }
    };
    formation(0);
    // the 3D court: built when it's on, fed the same events, removed with the live view
    const live3d = new AbortController();
    ctl.signal.addEventListener("abort", () => live3d.abort(), { once: true });
    let c3 = null, c3p = null;
    const build3d = () => (c3p ||= import("../three3d/court3d.js").then(({ court3D }) => court3D($("#gv-3d"), { teams: [{ c1: cssHex(h1), c2: cssHex(h2), design: designOf(home.id), name: home.name, id: home.id }, { c1: cssHex(a1), c2: cssHex(a2), design: designOf(away.id), name: away.name }], signal: live3d.signal }))
      .then((c) => { c3 = c; if (!c) $(".lv-court").classList.remove("is3d"); return c; }, () => { $(".lv-court").classList.remove("is3d"); }));
    if (want3D()) build3d();
    let speed = 2, paused = false, t = 0, idx = 0, last = 0, done = false;
    // reduced motion: players and ball jump to their spots instead of gliding (the CSS drops the movement)
    const setClock = () => { const c = clockOf(Math.min(t, sim.length), sim.quarter); $("#gv-q").textContent = c.label; $("#gv-c").textContent = c.text; };
    const apply = (e, animate) => {
      $("#gv-s0").textContent = e.score[0]; $("#gv-s1").textContent = e.score[1];
      const shot = ["2", "3", "miss"].includes(e.type) || (e.type === "ft" && e.x);
      if (shot && e.x != null) {
        const g2 = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const made = e.type !== "miss";
        g2.setAttribute("class", `lv-shot ${made ? "in" : "out"} s${e.side} ${e.pid === meId ? "me" : ""}`);
        g2.innerHTML = made ? `<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="${e.pid === meId ? 3 : 2}"/>` : `<path d="M${e.x - 2.2} ${e.y - 2.2}l4.4 4.4m0 -4.4l-4.4 4.4"/>`;
        shots.appendChild(g2);
      }
      if (!animate) return;
      if (c3 && (e.side === 0 || e.side === 1)) c3.formation(e.side);
      if (c3 && shot && e.x != null) c3.shot(e);
      if (e.side === 0 || e.side === 1) formation(e.side);
      if (shot && e.x != null) {
        const sh = dots[(e.side ? 5 : 0) + Math.floor(rnd() * 5)];
        place(sh, e.x, e.y);
        sh.classList.toggle("me", e.pid === meId);
        const hx = e.side === 0 ? COURT.hoopR[0] : COURT.hoopL[0];
        ball.setAttribute("cx", e.x.toFixed(1)); ball.setAttribute("cy", e.y.toFixed(1));
        ball.classList.remove("fly"); void ball.getBBox(); ball.classList.add("fly");
        ball.style.setProperty("--dx", `${(hx - e.x).toFixed(1)}px`); ball.style.setProperty("--dy", `${(75 - e.y).toFixed(1)}px`);
      }
      const c = clockOf(e.t, sim.quarter);
      const strap = e.type === "timeout" ? `<span class="bc-strap">Timeout</span> ` : e.type.startsWith("period") ? `<span class="bc-strap">${e.type === "period" ? "Tip" : "Break"}</span> ` : "";
      $("#gv-feed").innerHTML = `<small>${c.label} · ${c.text}</small> ${strap}${e.pid === meId ? `<b>${esc(e.text)}</b>` : esc(e.text)}`;
      if (e.type === "timeout" || e.type === "period-end") announce(e.text);
    };
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); live3d.abort(); showFinal(); };
    const tick = (now) => {
      if (done || closed) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      if (!paused) t += dt * SECONDS_PER_SECOND * speed;
      while (idx < ev.length && ev[idx].t <= t) apply(ev[idx++], true);
      setClock();
      if (t >= sim.length) return finish();
      raf = requestAnimationFrame(tick);
    };
    d.querySelector(".lv-ctrl .seg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-x]"); if (!b) return;
      speed = Number(b.dataset.x);
      d.querySelectorAll("[data-x]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      d.querySelector(".lv-court").style.setProperty("--lv-move", `${0.5 / speed}s`);
    });
    $("#gv-pause").addEventListener("click", () => { paused = !paused; $("#gv-pause").innerHTML = paused ? `${icon("play", { size: 15 })} Resume` : `${icon("pause", { size: 15 })} Pause`; });
    $("#gv-skip").addEventListener("click", finish);
    $("#gv-3dt")?.addEventListener("click", (e) => {
      const on = !$(".lv-court").classList.contains("is3d");
      set3D(on);
      $(".lv-court").classList.toggle("is3d", on);
      e.currentTarget.textContent = on ? "2D court" : "3D court";
      e.currentTarget.setAttribute("aria-pressed", String(on));
      if (on) build3d();
    });
    keys = (e) => { // Space pause · 1 2 4 speed · F final score
      if (e.key === " " || e.key === "k") { e.preventDefault(); $("#gv-pause").click(); }
      else if (["1", "2", "4"].includes(e.key)) d.querySelector(`[data-x="${e.key}"]`)?.click();
      else if (e.key === "f" || e.key === "F") finish();
    };
    d.querySelector(".lv-court").style.setProperty("--lv-move", "0.25s");
    $("#gv-skip").focus();
    raf = requestAnimationFrame(tick);
  }

  // keyboard: the current screen's keys (L watch live / F final score before the game; live keys above)
  let keys = null;
  d.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, select, textarea")) return;
    if (keys) return keys(e);
    if ((e.key === "l" || e.key === "L") && d.querySelector("#gv-live")) d.querySelector("#gv-live").click();
    else if ((e.key === "f" || e.key === "F") && d.querySelector("#gv-final")) d.querySelector("#gv-final").click();
  });
  openModal(d);
  if (start === "pregame" && pre) showPregame(); else if (start === "final") showFinal(); else showLive();
  return { close };
}
