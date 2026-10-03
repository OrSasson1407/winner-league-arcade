// Watch one of your games live on a top-down court, and the momentum chart (lead over 40 minutes).
import { seededRng, teamName } from "../data.js";
import { crestSvg, icon } from "../lib/icons.js";
import { clubColors } from "../lib/clubs.js";
import { closeModal, openModal } from "../lib/modal.js";
import { announce } from "../lib/a11y.js";
import { reducedMotion } from "../lib/settings.js";
import { sound } from "../lib/fx.js";
import { esc } from "../ui.js";
import { COURT, QUARTER, clockOf, leadSeries, momentumFacts, playByPlay } from "./pbp.js";

const GAME_SECONDS_PER_SECOND = 52; // 1x: the 40 minutes in about 46 seconds

// ---------------------------------------------------------------- momentum chart
export function momentumHtml(g, myName, theirName) {
  const ev = playByPlay(g);
  const pts = leadSeries(ev);
  const f = momentumFacts(ev);
  const W = 600, H = 150, top = 8, bot = 8, mid = top + (H - top - bot) / 2;
  const maxAbs = Math.max(8, ...pts.map(([, l]) => Math.abs(l)));
  const sx = (t) => (t / (4 * QUARTER)) * W;
  const sy = (l) => mid - (l / maxAbs) * ((H - top - bot) / 2);
  let d = `M0 ${sy(0).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += `H${sx(pts[i][0]).toFixed(1)}V${sy(pts[i][1]).toFixed(1)}`;
  const area = `${d}V${mid.toFixed(1)}H0Z`;
  const grid = [1, 2, 3].map((q) => `<line x1="${sx(q * QUARTER)}" x2="${sx(q * QUARTER)}" y1="${top}" y2="${H - bot}" class="mo-q"/>`).join("");
  const desc = `Lead over the game. Biggest lead ${esc(myName)} ${f.bigUs}, ${esc(theirName)} ${f.bigThem}. ${f.changes} lead changes, ${f.ties} ties.`;
  return `<figure class="mc-momentum" data-seed="${g.seed}">
    <figcaption><b>Momentum</b><span class="mo-key"><i class="la"></i>${esc(myName)} ahead</span><span class="mo-key"><i class="lb"></i>${esc(theirName)} ahead</span></figcaption>
    <div class="mo-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${desc}">
      <defs><clipPath id="mo-up-${g.seed}"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="mo-dn-${g.seed}"><rect x="0" y="${mid}" width="${W}" height="${H}"/></clipPath></defs>
      ${grid}
      <path d="${area}" class="mo-a" clip-path="url(#mo-up-${g.seed})"/><path d="${area}" class="mo-b" clip-path="url(#mo-dn-${g.seed})"/>
      <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="mo-zero"/>
      <path d="${d}" class="mo-line"/>
      <line class="mo-cross" x1="0" x2="0" y1="${top}" y2="${H - bot}" visibility="hidden"/>
    </svg><div class="mo-tip" hidden></div><span class="mo-max">+${maxAbs}</span><span class="mo-max dn">+${maxAbs}</span></div>
    <div class="mo-qs" aria-hidden="true"><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></div>
    <p class="mo-facts">Biggest lead: <b>${esc(myName)} +${f.bigUs}</b> · <b>${esc(theirName)} +${f.bigThem}</b> · ${f.changes} lead change${f.changes === 1 ? "" : "s"} · ${f.ties} tie${f.ties === 1 ? "" : "s"}</p>
  </figure>`;
}
/** Hover/touch crosshair with the score at that moment. */
export function bindMomentum(fig, g, signal) {
  if (!fig) return;
  const ev = playByPlay(g).filter((e) => e.pts);
  const svg = fig.querySelector("svg"), cross = fig.querySelector(".mo-cross"), tip = fig.querySelector(".mo-tip");
  const at = (t) => { let s = [0, 0]; for (const e of ev) { if (e.t > t) break; s = e.score; } return s; };
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const t = fx * 4 * QUARTER, s = at(t), c = clockOf(t);
    cross.setAttribute("x1", fx * 600); cross.setAttribute("x2", fx * 600); cross.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.innerHTML = `<small>Q${c.q} ${c.text}</small><b>${s[0]}–${s[1]}</b>`;
    tip.style.left = `${Math.min(r.width - 70, Math.max(0, fx * r.width - 35))}px`;
  };
  const leave = () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; };
  svg.addEventListener("pointermove", move, { signal });
  svg.addEventListener("pointerdown", move, { signal });
  svg.addEventListener("pointerleave", leave, { signal });
}

// ---------------------------------------------------------------- live view
const SPOTS = [[-62, 0], [-48, -42], [-48, 42], [-14, -60], [-14, 60]]; // offense, relative to the basket it attacks
function courtSvg() {
  const [rx] = COURT.hoopR, [lx] = COURT.hoopL;
  const half = (hx, dir) => `<rect x="${dir > 0 ? COURT.w - 58 : 0}" y="${75 - 24.5}" width="58" height="49" class="lv-paint"/>
    <path d="M${dir > 0 ? COURT.w : 0} 9H${hx - dir * 22}A67.5 67.5 0 0 ${dir > 0 ? 0 : 1} ${hx - dir * 22} 141H${dir > 0 ? COURT.w : 0}" class="lv-line"/>
    <circle cx="${dir > 0 ? COURT.w - 58 : 58}" cy="75" r="18" class="lv-line"/>
    <circle cx="${hx}" cy="75" r="2.3" class="lv-rim"/><line x1="${dir > 0 ? COURT.w - 12 : 12}" x2="${dir > 0 ? COURT.w - 12 : 12}" y1="66" y2="84" class="lv-board"/>`;
  return `<rect x="0" y="0" width="${COURT.w}" height="${COURT.h}" class="lv-floor"/>${half(rx, 1)}${half(lx, -1)}
    <line x1="140" x2="140" y1="0" y2="150" class="lv-line"/><circle cx="140" cy="75" r="18" class="lv-line"/>
    <rect x="0" y="0" width="${COURT.w}" height="${COURT.h}" class="lv-line" fill="none"/>`;
}

/**
 * Open the live view for game g. names: { us: [{name, w}], them: [{name, w}] } (real rosters, weighted by
 * their minutes) for the commentary line. Calls onDone when closed.
 */
export function watchGame({ C, S, g, names, jersey = null, onDone }) {
  const ev = playByPlay(g);
  const rnd = seededRng("mc-live-" + g.seed);
  const us = S.team, them = g.opp;
  const [u1, u2] = clubColors(us), [t1, t2] = clubColors(them);
  const pickName = (list) => { const tot = list.reduce((a, b) => a + b.w, 0); let x = rnd() * tot; for (const p of list) { x -= p.w; if (x <= 0) return p.name; } return list[0]?.name || ""; };
  const inGame = g.line.min > 0;
  const d = document.createElement("dialog");
  d.className = "profile-modal mc-live";
  d.style.setProperty("--club", u1);
  d.setAttribute("aria-label", `Live: ${teamName(us)} vs ${teamName(them)}`);
  d.innerHTML = `
    <div class="lv-board-top">
      <div class="lv-team">${crestSvg(us, teamName(us), 30)}<span>${esc(teamName(us))}</span><b class="led" id="lv-s0">0</b></div>
      <div class="lv-clock"><small id="lv-q">Q1</small><b class="led" id="lv-c">10:00</b></div>
      <div class="lv-team r"><b class="led" id="lv-s1">0</b><span>${esc(teamName(them))}</span>${crestSvg(them, teamName(them), 30)}</div>
    </div>
    <div class="lv-court"><svg viewBox="-6 -6 ${COURT.w + 12} ${COURT.h + 12}" aria-hidden="true">
      ${courtSvg()}<g id="lv-shots"></g>
      ${[0, 1].map((side) => [0, 1, 2, 3, 4].map((i) => `<g class="lv-p s${side} ${side === 0 && i === 0 && inGame ? "me" : ""}" data-s="${side}" data-i="${i}" style="--c:${side ? t1 : u1};--c2:${side ? t2 : u2}"><circle r="${side === 0 && i === 0 && inGame ? 5.6 : 4.6}"/>${side === 0 && i === 0 && inGame ? `<text y="2.2" text-anchor="middle">${esc(String(jersey ?? 7))}</text>` : ""}</g>`).join("")).join("")}
      <circle id="lv-ball" r="2.4" class="lv-ball" cx="140" cy="75"/>
    </svg></div>
    <p class="lv-feed" id="lv-feed">${inGame ? "Tip-off!" : g.line.injured ? "You're out injured: watching from the stands." : "Coach's decision: you start on the bench."}</p>
    <div class="lv-me" id="lv-me"></div>
    <div class="lv-ctrl">
      <div class="seg sm" role="group" aria-label="Speed">${[1, 2, 4].map((x) => `<button data-x="${x}" class="${x === 2 ? "on" : ""}" aria-pressed="${x === 2}">${x}×</button>`).join("")}</div>
      <button class="btn" id="lv-pause">${icon("pause", { size: 15 })} Pause</button>
      <button class="btn primary" id="lv-skip">${icon("skip", { size: 15 })} Final score</button>
    </div>
    <div class="lv-end" id="lv-end" hidden></div>`;
  document.body.appendChild(d);
  const $ = (q) => d.querySelector(q);
  const players = [...d.querySelectorAll(".lv-p")];
  const shots = $("#lv-shots"), ball = $("#lv-ball");
  let speed = 2, paused = false, t = 0, idx = 0, raf = 0, last = 0, done = false;
  const mine = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 };
  const place = (el, x, y) => { el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`); el._x = x; el._y = y; };
  const jitter = () => (rnd() - 0.5) * 10;
  function formation(side) { // side has the ball
    const [hx, hy] = side === 0 ? COURT.hoopR : COURT.hoopL, dir = side === 0 ? 1 : -1;
    for (const p of players) {
      const s = Number(p.dataset.s), i = Number(p.dataset.i);
      const [ox, oy] = SPOTS[i];
      const ax = hx + dir * ox + jitter(), ay = hy + oy + jitter();
      if (s === side) place(p, ax, ay);
      else place(p, ax + (hx - ax) * 0.3 + jitter() * 0.4, ay + (hy - ay) * 0.3);
    }
  }
  formation(0);
  const shooterOf = (e) => (e.me ? players[0] : players[(e.side ? 5 : 0) + 1 + Math.floor(rnd() * 4)]);
  function mark(e) {
    const g2 = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g2.setAttribute("class", `lv-shot ${e.made ? "in" : "out"} ${e.me ? "me" : ""} s${e.side}`);
    g2.innerHTML = e.made ? `<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="${e.me ? 3 : 2}"/>` : `<path d="M${e.x - 2.2} ${e.y - 2.2}l4.4 4.4m0 -4.4l-4.4 4.4"/>`;
    shots.appendChild(g2);
  }
  function say(e) {
    const who = e.me ? C.name : pickName(e.side ? names.them : names.us);
    const club = teamName(e.side ? them : us);
    const what = e.kind === "ft" ? (e.made ? "makes a free throw" : "misses a free throw") : e.made ? (e.kind === "3" ? "hits a three!" : "scores") : e.kind === "3" ? "misses from deep" : "misses";
    const c = clockOf(e.t);
    $("#lv-feed").innerHTML = `<small>Q${c.q} · ${c.text}</small> ${e.me ? "<b>" : ""}${esc(who)}${e.me ? "</b>" : ""} <span class="muted">(${esc(club)})</span> ${what}`;
  }
  function apply(e, animate) {
    if (e.me && e.kind !== "ft") { mine.fga++; if (e.kind === "3") mine.tpa++; if (e.made) { mine.fgm++; if (e.kind === "3") mine.tpm++; } }
    if (e.me) mine.pts += e.pts;
    $("#lv-s0").textContent = e.score[0]; $("#lv-s1").textContent = e.score[1];
    mark(e);
    if (!animate) return;
    formation(e.side);
    const sh = shooterOf(e);
    place(sh, e.x, e.y);
    const [hx, hy] = e.side === 0 ? COURT.hoopR : COURT.hoopL;
    ball.setAttribute("cx", e.x.toFixed(1)); ball.setAttribute("cy", e.y.toFixed(1));
    ball.classList.remove("fly"); void ball.getBBox(); ball.classList.add("fly");
    ball.style.setProperty("--dx", `${(hx - e.x).toFixed(1)}px`); ball.style.setProperty("--dy", `${(hy - e.y).toFixed(1)}px`);
    say(e);
    if (e.me && e.made) { sh.classList.remove("lv-pop"); void sh.getBBox(); sh.classList.add("lv-pop"); sound.play("tick"); }
  }
  const meLine = () => inGame ? `<b>${esc(C.name)}</b> ${mine.pts} pts · ${mine.fgm}/${mine.fga} FG · ${mine.tpm}/${mine.tpa} 3P` : "";
  function setClock() { const c = clockOf(Math.min(t, 4 * QUARTER)); $("#lv-q").textContent = `Q${c.q}`; $("#lv-c").textContent = c.text; $("#lv-me").innerHTML = meLine(); }
  let lastQ = 1;
  function tick(now) {
    if (done) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (!paused) t += dt * GAME_SECONDS_PER_SECOND * speed;
    while (idx < ev.length && ev[idx].t <= t) apply(ev[idx++], true);
    const q = clockOf(t).q;
    if (q !== lastQ) { announce(`End of quarter ${lastQ}: ${$("#lv-s0").textContent} to ${$("#lv-s1").textContent}.`); lastQ = q; }
    setClock();
    if (t >= 4 * QUARTER) return finish();
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    while (idx < ev.length) apply(ev[idx++], false);
    t = 4 * QUARTER; setClock();
    $("#lv-c").textContent = "FINAL";
    $("#lv-feed").innerHTML = `<b>${g.won ? "Win!" : "Loss."}</b> ${esc(teamName(us))} ${g.my}–${g.their} ${esc(teamName(them))}`;
    d.querySelector(".lv-ctrl").hidden = true;
    const end = $("#lv-end");
    end.hidden = false;
    end.innerHTML = `${momentumHtml(g, teamName(us), teamName(them))}<div class="row" style="justify-content:center"><button class="btn primary" id="lv-done">${icon("arrowRight", { size: 15 })} Continue</button></div>`;
    bindMomentum(end.querySelector(".mc-momentum"), g, ctl.signal);
    end.querySelector("#lv-done").addEventListener("click", close);
    end.querySelector("#lv-done").focus();
    sound.play(g.won ? "win" : "bad");
    announce(`Final: ${teamName(us)} ${g.my}, ${teamName(them)} ${g.their}.`);
  }
  const ctl = new AbortController();
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    done = true; cancelAnimationFrame(raf); ctl.abort();
    closeModal(d); d.remove(); onDone?.();
  }
  d.addEventListener("close", () => { if (!closed) { closed = true; done = true; cancelAnimationFrame(raf); ctl.abort(); d.remove(); onDone?.(); } });
  d.querySelector(".lv-ctrl .seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-x]"); if (!b) return;
    speed = Number(b.dataset.x);
    d.querySelectorAll("[data-x]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    d.querySelector(".lv-court").style.setProperty("--lv-move", `${0.5 / speed}s`);
  });
  $("#lv-pause").addEventListener("click", () => {
    paused = !paused;
    $("#lv-pause").innerHTML = paused ? `${icon("play", { size: 15 })} Resume` : `${icon("pause", { size: 15 })} Pause`;
  });
  $("#lv-skip").addEventListener("click", finish);
  openModal(d);
  d.querySelector(".lv-court").style.setProperty("--lv-move", `${0.5 / speed}s`);
  if (reducedMotion()) finish();
  else { $("#lv-skip").focus(); raf = requestAnimationFrame(tick); }
}
