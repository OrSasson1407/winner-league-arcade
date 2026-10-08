// My Career (#/mycareer): create a player, grow up in a club academy, turn pro and play a whole career
// in the Winner League against the real teams of each season.
import { skeletonHtml, undoToast } from "../lib/ux.js";
import { fmtHeight, fmtMoney } from "../lib/units.js";
import { PLAYED_SEASONS, db, playersById, teamName } from "../wl.js";
import { countUp, esc, fmt1, html, store, toast } from "../ui.js";
import { crestSvg, icon } from "../lib/icons.js";
import { avatarHtml, getMe } from "../lib/me.js";
import { DEFAULT_AV, playerAvatarSvg } from "../lib/avatarArt.js";
import { closeModal, confirmDialog, openModal } from "../lib/modal.js";
import { confetti, sound } from "../lib/fx.js";
import { emit } from "../lib/achievements.js";
import { announce } from "../lib/a11y.js";
import { clubColors } from "../lib/clubs.js";
import { leaders } from "./records.js";
import * as E from "../mycareer/engine.js";
import { declineCallup, nationalCallup, ntNext, ntSim, playNationalSummer, playNtGame, startTournament, teammates } from "../mycareer/nationalTeam.js";
import { loadNational, ntTeam } from "../national.js";
import { ntBadge } from "./national.js";
import { maybeEvent, resolveEvent } from "../mycareer/events.js";
import { badgeMedals, bracket, contractHtml, gauge, radar, scheduleGrid, standings } from "../mycareer/visuals.js";
import { clubThemeVars } from "../lib/clubTheme.js";
import { MOCK_NOTE, elLoaded, loadEuroleague } from "../euroleague.js";
import { loadNba, nbaReady } from "../mycareer/nba.js";
import * as NP from "../mycareer/nbaPath.js";
import { tr } from "../i18n/index.js";
import { cssHex, set3D, want3D } from "../three3d/core.js";
const scenes3d = () => import("../three3d/scenes.js"); // loads Three.js only when a 3D view opens
import { DESIGNS, designOf } from "../three3d/player.js";
import { drawCareerCard } from "../mycareer/shareCard.js";
import { keysFor, openGameView } from "../lib/gameView.js";
import { teamPreview } from "../shared/gameSim.js";
import { shareOrDownload } from "../games/draft_card.js";
import { bindMomentum, momentumHtml, watchGame } from "../mycareer/live.js";
import { careerIntro, clearFlashes, newsFlash } from "../mycareer/flash.js";
import { reducedMotion } from "../lib/settings.js";
import { gameKeys, press } from "../lib/shortcuts.js";

const KEY = "mc:save";
const NATS = ["Israel", "United States", "Serbia", "Lithuania", "Greece", "France", "Spain", "Nigeria", "Canada", "Argentina", "Croatia", "Ukraine"];
const TROPHY = { title: ["trophy", "Champion"], euroleague: ["crown", "EuroLeague"], nba: ["crown", "NBA title"], cup: ["medal", "State Cup"], allstar: ["star", "All-Star"], nbaallstar: ["star", "NBA All-Star"] };
const money = fmtMoney;
const roleName = (r) => E.ROLE_NAMES[r] || r;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const r1 = (v) => Math.round(v * 10) / 10;

let dialog = null;
function modal(label) {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "profile-modal mc-modal";
    dialog.addEventListener("click", (e) => { if (e.target === dialog && !dialog.dataset.locked) closeModal(dialog); });
    document.body.appendChild(dialog);
  }
  dialog.setAttribute("aria-label", label);
  delete dialog.dataset.locked;
  return dialog;
}

export async function renderMyCareer(root, signal) {
  if (!elLoaded() || !nbaReady()) {
    root.innerHTML = `<span class="sr-only">Loading the EuroLeague and NBA data for your career…</span>${skeletonHtml("mycareer")}`;
    root.setAttribute("aria-busy", "true");
    // offline without them: the career stays where the loaded data reaches (Israel at least)
    await Promise.all([loadEuroleague().catch(() => {}), loadNba().catch(() => {})]);
    root.removeAttribute("aria-busy");
    if (signal.aborted) return;
  }
  let C = store.get(KEY, null);
  if (C && (C.v || 1) < 2) { // saves from before salaries were in dollars
    C.money = Math.round(C.money / 3.7);
    if (C.contract) C.contract.salary = Math.round(C.contract.salary / 3.7 / 1000) * 1000;
    C.chem ??= {}; C.trustBy ??= {}; C.injuries ??= [];
    C.v = 2;
    store.set(KEY, C);
  }
  if (C && !C.ceil) { E.ensureDev(C); store.set(KEY, C); } // talent, staff and work ethic for older saves
  let tab = "season", lastGame = null, view = null;
  const save = () => store.set(KEY, C);
  const av = () => C?.av || (getMe().style === "player" ? getMe().av : DEFAULT_AV);
  const face = (size = 64) => `<span class="avatar-chip player mc-face" style="--av:${clubColors(C.club || C.academy.club)[0]};width:${size}px;height:${size}px" aria-hidden="true">${playerAvatarSvg(av(), clubColors(C.club || C.academy.club)[0])}</span>`;

  const THEME_KEYS = ["--accent", "--accent2", "--accent-ink", "--sel", "--sel-line", "--club", "--club2"];
  root.classList.add("mc-page");
  signal.addEventListener("abort", () => { clearFlashes(); root.classList.remove("mc-page"); THEME_KEYS.forEach((k) => root.style.removeProperty(k)); });
  /** The career screens wear your current club's colours (adjusted for contrast; off in high contrast). */
  function clubTheme() {
    THEME_KEYS.forEach((k) => root.style.removeProperty(k));
    const team = C && (C.cur?.team || C.loan?.team || C.club || C.academy?.club);
    if (!team || document.documentElement.dataset.contrast === "high") return;
    const vars = clubThemeVars(team, document.documentElement.dataset.theme);
    for (const [k, v] of Object.entries(vars || {})) root.style.setProperty(k, v);
    const [c1, c2] = clubColors(team);
    root.style.setProperty("--club", c1); root.style.setProperty("--club2", c2);
  }
  // "Share career card": a broadcast-style image of the player (any tab that shows the button)
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-share-card]");
    if (!b || !C) return;
    b.disabled = true;
    try {
      const team = C.cur?.team || C.club || C.academy?.club;
      const canvas = await drawCareerCard(C, playerAvatarSvg(av(), clubColors(team)[0]), { overall: E.bestOverall(C), hofScore: E.hallOfFameScore(C), hofLine: E.HOF_LINE });
      const how = await shareOrDownload(canvas, `my-career-${C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, `${C.name} · My Career`);
      toast(how === "shared" ? "Shared!" : "Career card saved as an image");
    } catch { toast("Couldn't make the image. Try again."); }
    b.disabled = false;
  }, { signal });
  // switching theme or contrast in Settings re-computes the club colours for it
  document.addEventListener("settings-changed", () => clubTheme(), { signal });
  let meterBase = null; // gauges show the change since before the last game
  let freshBadge = null;

  function draw() {
    clubTheme();
    if (!C) return drawCreate();
    if (C.ntCur) return drawNational(); // a championship in progress, game by game
    if (C.phase === "academy") return drawAcademy();
    if (C.phase === "turnpro" || (C.phase === "offseason" && (!C.contract || C.contract.left <= 0))) return drawOffers();
    if (C.phase === "offseason") return drawOffseason();
    if (C.phase === "season") return drawSeason();
    if (C.phase === "retired") return drawRetired();
  }

  // ---------------------------------------------------------------- creation
  function drawCreate() {
    const f = view?.form || { name: getMe().nickname || "", nat: "Israel", pos: "SG", pos2: "SF", height: 196, arch: "scorer", diff: "star", alloc: {}, debut: "2015-16", academy: "" };
    view = { form: f };
    const D = E.DIFFICULTY[f.diff];
    const used = Object.values(f.alloc).reduce((a, b) => a + b, 0);
    const preview = E.createPlayer({ ...f, academy: f.academy || "maccabi_tel_aviv" });
    const clubs = db.season_teams.filter((t) => t.season === f.debut).map((t) => t.team_id);
    if (!clubs.includes(f.academy)) f.academy = clubs[0];
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>My Career</h1>
        <p>Create a player, grow up in a club academy and play a whole career in the Winner League against the real teams of every season. Get good enough and the EuroLeague and the NBA call.</p></div></div>
      <div class="mc-create">
        <div class="card pad mc-form">
          <div class="row mc-two"><div class="field"><label for="mc-name">Name</label><input id="mc-name" class="input" maxlength="22" value="${esc(f.name)}" placeholder="Your player's name"></div>
            <div class="field"><label for="mc-nat">Nationality</label><select id="mc-nat" class="input">${NATS.map((n) => `<option ${n === f.nat ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
          <div class="row mc-two"><div class="field"><label>Position</label><div class="seg sm" id="mc-pos">${E.POSITIONS.map((p) => `<button data-v="${p}" class="${p === f.pos ? "on" : ""}" aria-pressed="${p === f.pos}">${p}</button>`).join("")}</div></div>
            <div class="field"><label>Second position</label><div class="seg sm" id="mc-pos2">${E.POSITIONS.map((p) => `<button data-v="${p}" class="${p === f.pos2 ? "on" : ""}" aria-pressed="${p === f.pos2}">${p}</button>`).join("")}</div></div></div>
          <div class="field"><label for="mc-h">Height: <b>${fmtHeight(f.height)}</b></label><input id="mc-h" type="range" min="175" max="222" value="${f.height}" class="mc-range">
            <small class="muted">Taller: more rebounds and blocks, less speed (and fewer threes above 2.05 m). Shorter: better passer, harder at the rim.</small></div>
          ${f.nat !== "Israel" ? `<p class="mc-note">${icon("info", { size: 15 })} Foreign player: clubs can give real minutes to only ${E.FOREIGN_LIMIT} foreigners (a simplified version of the league's rules), so you'll need to beat the other foreigners on the roster. Israeli players get a small edge in minutes and salary.</p>` : ""}
          <div class="field"><label>Player type</label><div class="mc-cards" id="mc-arch">${Object.entries(E.ARCHETYPES).map(([k, a]) => `<button class="mc-pick ${k === f.arch ? "on" : ""}" data-v="${k}" aria-pressed="${k === f.arch}"><b>${a.name}</b><small>${a.desc}</small></button>`).join("")}</div></div>
          <div class="field"><label>Start</label><div class="mc-cards two" id="mc-diff">${Object.entries(E.DIFFICULTY).map(([k, d]) => `<button class="mc-pick ${k === f.diff ? "on" : ""}" data-v="${k}" aria-pressed="${k === f.diff}"><b>${d.name}</b><small>${d.desc}</small></button>`).join("")}</div></div>
          <div class="field"><label>Training points to spend <b class="led">${D.points - used}</b> <span class="muted">(max +10 per skill)</span></label>
            <div class="mc-alloc">${Object.entries(E.ATTRS).map(([k, l]) => `<div class="mc-al"><span>${l}</span><button class="icon-btn" data-al="${k}" data-d="-1" aria-label="Less ${l}" ${(f.alloc[k] || 0) <= 0 ? "disabled" : ""}>−</button><b>${preview.attrs[k]}</b><button class="icon-btn" data-al="${k}" data-d="1" aria-label="More ${l}" ${used >= D.points || (f.alloc[k] || 0) >= 10 ? "disabled" : ""}>+</button></div>`).join("")}</div></div>
          <div class="row mc-two"><div class="field"><label for="mc-debut">Pro debut season</label><select id="mc-debut" class="input">${PLAYED_SEASONS.map((s) => `<option ${s === f.debut ? "selected" : ""}>${s}</option>`).join("")}</select>
              <small class="muted">Two academy years come first. Seasons after ${E.LAST_REAL} are simulated from the latest rosters.</small></div>
            <div class="field"><label for="mc-acad">Academy</label><select id="mc-acad" class="input">${clubs.map((c) => `<option value="${c}" ${c === f.academy ? "selected" : ""}>${esc(teamName(c))}</option>`).join("")}</select></div></div>
        </div>
        <div class="card pad mc-preview">
          <span class="avatar-chip player" style="--av:${clubColors(f.academy)[0]};width:110px;height:110px">${playerAvatarSvg(getMe().style === "player" ? getMe().av : DEFAULT_AV, clubColors(f.academy)[0])}</span>
          <h2>${esc(f.name || "Your player")}</h2>
          <p class="muted" style="margin:0">${f.pos}/${f.pos2} · ${fmtHeight(f.height)} · ${esc(f.nat)} · age 16</p>
          <div class="mc-ovr"><small>OVERALL</small><b class="led">${E.bestOverall(preview)}</b></div>
          <p class="muted" style="font-size:12px;margin:0">${getMe().style === "player" ? "Your profile avatar is used for the player." : `Build a player avatar on your <a href="#/me">profile</a> to use it here.`}</p>
          <button class="btn primary big-btn" id="mc-go" ${f.name.trim() ? "" : "disabled"}>${icon("play", { size: 16 })} Start at the ${esc(teamName(f.academy))} academy</button>
        </div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const redraw = () => { const y = scrollY; drawCreate(); scrollTo(0, y); };
    $("#mc-name").addEventListener("input", (e) => { f.name = e.target.value; $("#mc-go").disabled = !f.name.trim(); root.querySelector(".mc-preview h2").textContent = f.name || "Your player"; }, { signal });
    $("#mc-nat").addEventListener("change", (e) => { f.nat = e.target.value; redraw(); }, { signal });
    const seg = (id, key) => $(id).addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { f[key] = b.dataset.v; redraw(); } }, { signal });
    seg("#mc-pos", "pos"); seg("#mc-pos2", "pos2"); seg("#mc-arch", "arch");
    $("#mc-diff").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { f.diff = b.dataset.v; f.alloc = {}; redraw(); } }, { signal });
    $("#mc-h").addEventListener("change", (e) => { f.height = Number(e.target.value); redraw(); }, { signal });
    $("#mc-h").addEventListener("input", (e) => { root.querySelector("label[for=mc-h] b").textContent = fmtHeight(Number(e.target.value)); }, { signal });
    root.querySelector(".mc-alloc").addEventListener("click", (e) => { const b = e.target.closest("[data-al]"); if (!b) return; const k = b.dataset.al; f.alloc[k] = Math.max(0, (f.alloc[k] || 0) + Number(b.dataset.d)); redraw(); }, { signal });
    $("#mc-debut").addEventListener("change", (e) => { f.debut = e.target.value; redraw(); }, { signal });
    $("#mc-acad").addEventListener("change", (e) => { f.academy = e.target.value; redraw(); }, { signal });
    $("#mc-go").addEventListener("click", () => {
      C = E.newPlayer({ ...f, av: getMe().style === "player" ? getMe().av : null });
      view = null; save(); sound.play("place");
      draw();
      const club = teamName(C.academy.club);
      careerIntro({ name: C.name, year: `Summer ${Number(C.debut.slice(0, 4)) - 2}`, club,
        sub: `${C.pos}/${C.pos2} · ${fmtHeight(C.height)} · age ${C.age} · overall ${E.bestOverall(C)}`,
        crest: crestSvg(C.academy.club, club, 96), avatar: face(150),
        onDone: () => { announce(`${C.name} joins the ${club} academy.`); root.querySelector("#ac-play")?.focus(); } });
    }, { signal });
  }

  // ---------------------------------------------------------------- shared header
  function header() {
    const team = C.cur?.team || C.club || C.academy.club;
    const ov = E.bestOverall(C);
    const chem = Math.round(C.chem?.[team] || 0);
    const S = C.cur;
    const rec = S ? S.standings[S.team] : null;
    const rank = S ? E.table(S).findIndex((t) => t.id === S.team) + 1 : 0;
    const nx = S ? nextOpp() : null;
    const chips = [
      S ? `<div class="hub-chip"><small>${esc(S.label)}</small><b>${rec.w}-${rec.l}</b><span>#${rank} in the ${S.league === "el" ? "EuroLeague" : S.league === "nba" ? "NBA" : "league"}</span></div>` : "",
      nx && nx.opp ? `<div class="hub-chip"><small>${nx.eu ? "Next game · EuroLeague" : "Next game"}</small><span class="hub-opp">${crestSvg(nx.opp, teamName(nx.opp), 22)} ${nx.home === false ? "at" : "vs"} ${esc(teamName(nx.opp))}</span></div>` : "",
      C.contract ? `<div class="hub-chip"><small>Contract</small><b>${money(C.contract.salary)}</b><span>${C.contract.left} season${C.contract.left === 1 ? "" : "s"} left</span></div>` : "",
      `<div class="hub-chip"><small>Bank</small><b>${money(C.money)}</b><span>${icon("bolt", { size: 12 })} ${C.tp} training points</span></div>`,
    ].filter(Boolean).join("");
    return html`<h1 class="sr-only">My Career: ${esc(C.name)}</h1><section class="mc-hub" aria-label="Player hub">
      <svg class="hub-court" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="200" cy="100" r="34"/><path d="M200 0v200M0 40h70v120H0M400 40h-70v120h70M70 70a30 30 0 0 1 0 60M330 70a30 30 0 0 0 0 60"/></svg>
      <div class="hub-main">
        <div class="hub-face">${want3D() ? `<button class="hub-face-btn" id="mc-locker" title="Locker room (3D)" aria-label="Open the locker room in 3D">${face(104)}<span class="hub-3d">3D</span></button>` : face(104)}</div>
        <div class="hub-id"><small>${esc(C.pos)}/${esc(C.pos2)} · ${fmtHeight(C.height)}${C.weight ? ` · ${Math.round(C.weight)} kg` : ""} · age ${C.age}${C.label ? ` · ${C.label}${S?.simulated ? " (simulated)" : ""}` : ""}</small>
          <h2 class="mc-name">${esc(C.name)}</h2>
          <span class="mc-club">${crestSvg(team, teamName(team), 24)} ${esc(teamName(team))}${C.loan ? " (on loan)" : C.phase === "academy" ? " academy" : ""}${S ? ` · ${roleName(S.role)}` : ""} <span class="pill mc-nat">${C.nat === "Israel" ? "Israeli" : "Foreign player"}</span></span></div>
        <div class="hub-ovr"><small>OVERALL</small><b class="led">${ov}</b></div>
      </div>
      <div class="hub-row">
        <div class="hub-gauges">${gauge("Coach trust", C.trust, meterBase?.trust)}${gauge("Popularity", C.pop, meterBase?.pop)}${C.phase !== "academy" ? gauge("Chemistry", chem, meterBase?.chem) : ""}</div>
        <div class="hub-chips">${chips}</div>
      </div>
    </section>`;
  }
  const TABS = [["season", "calendar", "Season"], ["table", "chart", "Table"], ["train", "bolt", "Training"], ["career", "clock", "Career"], ["trophies", "trophy", "Trophies"]];
  function tabs(active) {
    return `<div class="seg mc-tabs" id="mc-tabs" role="tablist">${TABS.filter(([k]) => (C.cur || !["season", "table"].includes(k)) && !(C.retired && k === "train")).map(([k, ic, l]) => `<button role="tab" aria-selected="${k === active}" class="${k === active ? "on" : ""}" data-tab="${k}">${icon(ic, { size: 15 })} ${l}</button>`).join("")}</div>`;
  }
  let tabRedraw = null, swipeBound = false;
  function goTab(k, focus = false) {
    const order = [...root.querySelectorAll("#mc-tabs [data-tab]")].map((b) => b.dataset.tab);
    if (!order.includes(k) || k === tab || !tabRedraw) return;
    const dir = order.indexOf(k) > order.indexOf(tab) ? 1 : -1;
    tab = k; tabRedraw();
    const panel = root.querySelector("#mc-tabs")?.nextElementSibling;
    if (panel && !reducedMotion()) panel.classList.add(dir > 0 ? "mc-slide-l" : "mc-slide-r");
    if (focus) root.querySelector(`#mc-tabs [data-tab="${k}"]`)?.focus();
  }
  function bindTabs(redraw) {
    tabRedraw = redraw;
    mount3D();
    const bar = root.querySelector("#mc-tabs");
    bar?.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) goTab(b.dataset.tab); }, { signal });
    bar?.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const order = [...bar.querySelectorAll("[data-tab]")].map((b) => b.dataset.tab);
      e.preventDefault();
      const fwd = (e.key === "ArrowRight") !== (document.documentElement.dir === "rtl"); // right to left: ← is "next"
      goTab(order[(order.indexOf(tab) + (fwd ? 1 : -1) + order.length) % order.length], true);
    }, { signal });
    if (swipeBound) return;
    swipeBound = true;
    // swipe left/right on the career screen switches tabs (not on things that scroll sideways)
    let sw = null;
    const scrollsX = (el) => {
      for (; el && el !== root; el = el.parentElement) {
        if (el.matches?.("input, select, textarea, .mo-wrap")) return true;
        if (el.scrollWidth > el.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
      }
      return false;
    };
    root.addEventListener("touchstart", (e) => { const t = e.touches[0]; sw = e.touches.length === 1 && !scrollsX(e.target) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; }, { passive: true, signal });
    root.addEventListener("touchend", (e) => {
      const st = sw; sw = null;
      if (!st || !root.querySelector("#mc-tabs")) return;
      const t = e.changedTouches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Date.now() - st.at > 700) return;
      const order = [...root.querySelectorAll("#mc-tabs [data-tab]")].map((b) => b.dataset.tab);
      const next = order[order.indexOf(tab) + ((dx < 0) !== (document.documentElement.dir === "rtl") ? 1 : -1)]; // right to left: swipe right for the next tab
      if (next) goTab(next);
    }, { passive: true, signal });
  }

  // ---------------------------------------------------------------- academy
  function drawAcademy() {
    const clubs = db.season_teams.filter((t) => t.season === C.debut).map((t) => t.team_id).filter((c) => c !== C.academy.club);
    const last = C.academy.log[C.academy.log.length - 1];
    root.innerHTML = html`${header()}
      <div class="mc-grid">
        <div class="card pad">
          <h2>${icon("whistle")} Academy · year ${C.academy.year} of 2</h2>
          <p class="muted">You're ${C.age}. Train hard in the youth team, or go on loan to another club's youth team for more minutes (faster growth, but away from your club).</p>
          <div class="field"><label>This season</label><div class="mc-cards two" id="ac-where">
            <button class="mc-pick ${!view?.loan ? "on" : ""}" data-v="">${icon("shield", { size: 18 })}<b>Stay at ${esc(teamName(C.academy.club))}</b><small>Your academy. The club will offer you your first contract.</small></button>
            <button class="mc-pick ${view?.loan ? "on" : ""}" data-v="loan">${icon("arrowRight", { size: 18 })}<b>Go on loan</b><small>More of the ball elsewhere: you grow about 5% faster this year.</small></button></div></div>
          ${view?.loan ? `<div class="field"><label for="ac-loan">Loan to</label><select id="ac-loan" class="input">${clubs.map((c) => `<option value="${c}" ${c === view.loan ? "selected" : ""}>${esc(teamName(c))} youth team</option>`).join("")}</select></div>` : ""}
          <div class="field"><label>Focus</label><div class="seg sm" id="ac-focus">${[["balanced", "Balanced"], ...Object.entries(E.SUMMER_CAMPS).map(([k, c]) => [k, c.name])].map(([k, l]) => `<button data-v="${k}" class="${(view?.focus || "balanced") === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <button class="btn primary big-btn" id="ac-play">${icon("play", { size: 16 })} Play the academy season</button>
        </div>
        <div class="card pad">
          <h3>${icon("clock")} Academy record</h3>
          ${C.academy.log.length ? `<table class="stat-table"><thead><tr><th>Age</th><th>Team</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>OVR</th></tr></thead><tbody>${C.academy.log.map((l) => `<tr><td>${l.age}</td><td>${esc(teamName(l.club))}${l.loan ? " (loan)" : ""}</td><td>${l.games}</td><td>${l.ppg}</td><td>${l.rpg}</td><td>${l.apg}</td><td><b>${l.overall}</b></td></tr>`).join("")}</tbody></table>` : `<p class="muted">Your first youth season is about to start.</p>`}
          ${last ? `<p class="muted" style="font-size:13px">Training points carry over: spend them in the Training tab once you turn pro, or now:</p>` : ""}
          ${trainHtml(true)}
        </div>
      </div>`;
    root.querySelector("#ac-where").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; view = { ...(view || {}), loan: b.dataset.v ? clubs[0] : null }; drawAcademy(); }, { signal });
    root.querySelector("#ac-loan")?.addEventListener("change", (e) => { view.loan = e.target.value; }, { signal });
    root.querySelector("#ac-focus").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { view = { ...(view || {}), focus: b.dataset.v }; drawAcademy(); } }, { signal });
    root.querySelector("#ac-play").addEventListener("click", () => {
      const r = E.academySeason(C, { loanTo: view?.loan || null, focus: view?.focus || "balanced" });
      view = null; save(); sound.play("place");
      toast(`Academy season: ${r.entry.ppg} PPG · overall ${r.entry.overall}`);
      setTimeout(() => showDevReport(r.dev, "Academy year review"), 200);
      announce(`Academy season done. ${r.entry.ppg} points per game. Overall ${r.entry.overall}.`);
      draw();
    }, { signal });
    bindTrain(drawAcademy);
  }

  // ---------------------------------------------------------------- training
  function trainHtml(compact = false) {
    const lastAttrs = C.history.filter((h) => h.pro && h.attrs).slice(-1)[0]?.attrs || null;
    return html`<div class="mc-train">
      ${compact ? "" : radar(C.attrs, lastAttrs)}
      ${compact ? "" : talentHtml()}
      <div class="mc-attrs">${Object.entries(E.ATTRS).map(([k, l]) => {
        const v = C.attrs[k], cost = E.trainCost(v), capped = v >= E.trainLimit(C, k);
        const [lo, hi] = E.scoutRange(C, k), pot = lo === hi ? `${lo}` : `${lo}–${hi}`;
        return `<div class="mc-attr"><span>${l}</span><div class="progress mc-pot" title="Potential ${pot}"><s style="inset-inline-start:${lo}%;width:${Math.max(1, hi - lo)}%"></s><i style="width:${v}%"></i></div><b>${Math.floor(v)}<small class="muted mc-potv">/${pot}</small></b>
          <button class="btn" data-train="${k}" ${C.tp < cost || capped ? "disabled" : ""} aria-label="Train ${l} (${cost} TP), potential ${pot}">+1 <small>${capped ? "max" : `${cost} TP`}</small></button></div>`;
      }).join("")}</div>
      ${compact ? "" : planHtml()}
      ${compact ? "" : html`<h3 style="margin-top:14px">${icon("medal")} Badges</h3>${badgeMedals(C, { fresh: freshBadge, cost: E.badgeCost })}`}
      ${compact ? "" : movesHtml()}
    </div>`;
  }
  /** The practice week: four areas and rest, in steps of 5%. */
  function planHtml() {
    const P = E.planOf(C);
    const inj = Math.round((E.planInjury(C) - 1) * 100), wear = Math.round((E.planWear(C) - 1) * 100);
    return html`<h3 style="margin-top:14px">${icon("calendar")} Training plan</h3>
      <p class="muted" style="font-size:13px;margin:0 0 8px">How your practice week is split. More time on an area makes its skills grow faster over the summer; rest protects your body.</p>
      <div class="seg sm mc-presets" id="mc-presets" role="group" aria-label="Plan presets">${Object.entries(E.PLAN_PRESETS).map(([k, pr]) => `<button data-preset="${k}" class="${JSON.stringify(pr.plan) === JSON.stringify(P) ? "on" : ""}">${pr.name}</button>`).join("")}</div>
      <div class="mc-plan">${Object.entries(E.PLAN_AREAS).map(([k, a]) => html`<div class="mc-plan-row ${k === "rest" ? "rest" : ""}">
        <span><b>${a.name}</b>${a.attrs.length ? `<small class="muted">${a.attrs.map((x) => `<span>${E.ATTRS[x]}</span>`).join(" · ")}</small>` : `<small class="muted">Takes whatever is left</small>`}</span>
        <div class="progress"><i style="width:${(P[k] / E.PLAN_MAX) * 100}%"></i></div>
        ${k === "rest" ? `<b class="mc-plan-v">${P[k]}%</b>` : `<span class="mc-plan-step"><button class="btn sm" data-plan="${k}" data-d="-1" ${P[k] <= 0 || P.rest >= E.PLAN_MAX ? "disabled" : ""} aria-label="Less ${a.name}">−</button><b class="mc-plan-v">${P[k]}%</b><button class="btn sm" data-plan="${k}" data-d="1" ${P[k] >= E.PLAN_MAX || P.rest <= 0 ? "disabled" : ""} aria-label="More ${a.name}">+</button></span>`}
      </div>`).join("")}</div>
      <p class="muted" style="font-size:12px;margin:6px 0 0"><span>Injury risk ${inj > 0 ? "+" : inj < 0 ? "−" : "±"}${Math.abs(inj)}%</span> · <span>Wear on your legs ${wear > 0 ? "+" : wear < 0 ? "−" : "±"}${Math.abs(wear)}%</span></p>`;
  }
  /** Signature moves: earned on the court, learned with training points. */
  function movesHtml() {
    return html`<h3 style="margin-top:14px">${icon("star")} Signature moves</h3>
      <p class="muted" style="font-size:13px;margin:0 0 8px">Unlocked by what you do on the court and your skills. Each one changes your game a little, and the commentators call it by name.</p>
      <div class="mc-moves">${Object.entries(E.MOVES).map(([id, m]) => {
        const st = E.moveStatus(C, id);
        return `<div class="mc-move ${st.learned ? "on" : st.ok ? "ready" : ""}"><b>${st.learned ? icon("check", { size: 14 }) : ""} ${esc(m.name)}</b><small class="muted">${esc(m.desc)}</small>
          ${st.learned ? `<small class="good-text">Learned</small>` : st.ok ? `<button class="btn sm primary" data-move="${id}" ${C.tp < E.MOVE_COST ? "disabled" : ""}>Learn · ${E.MOVE_COST} TP</button>` : `<small class="muted">${st.missing.map((x) => `<span>${esc(x)}</span>`).join(" · ")}</small>`}</div>`;
      }).join("")}</div>`;
  }
  /** What the summer's body plan will do (shown before the season starts). */
  function bodyLine() {
    const kg = E.BODY_PLANS[C.bodyPlan || "keep"].kg, next = { ...C, weight: (C.weight ?? E.idealWeight(C)) + kg };
    const b = E.bodyEffects(next), f = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 10) / 10)}`;
    const d = Math.round(next.weight - E.idealWeight(C));
    return d === 0 ? "At your usual weight: no effect." : `At ${d > 0 ? "+" : "−"}${Math.abs(d)} kg: rebounding ${f(b.reb)}, finishing ${f(b.fin)}, athleticism ${f(b.ath)}.${d > 6 ? " <span>Heavy after 30: a few more injuries.</span>" : ""}`;
  }
  /** What the scouts and the staff know about you: development type, work ethic, the miles on your legs. */
  function talentHtml() {
    const trait = C.scouted >= 2 ? E.TRAITS[C.trait] : null;
    return html`<div class="mc-talent">
      <span title="${trait ? esc(trait.desc) : "The scouts need two seasons to tell"}">${icon("chart", { size: 14 })} ${trait ? esc(trait.name) : "Development type: unknown yet"}</span>
      <span>${icon("bolt", { size: 14 })} Work ethic: <b>${E.workLabel(C.work ?? 55)}</b></span>
      <span>${icon("clock", { size: 14 })} ${Math.round(C.mileage || 0).toLocaleString("en-US")} career minutes</span>
    </div>
    <p class="muted" style="font-size:12px;margin:4px 0 8px">The shaded band is your potential as the scouts see it: it narrows every season. Training can't pass it.${(C.work ?? 55) >= 75 ? " <span>A gym rat gets 3 extra points.</span>" : ""}</p>`;
  }
  /** The yearly development report: changes, and why. */
  function devReportHtml(rep) {
    if (!rep) return "";
    const bad = (f) => f.id === "mileage" || f.id === "rushed" || f.value < 0.995;
    const fx = (f) => {
      if (f.id === "rushed") return `${f.value}`;
      if (f.id === "mentor" || f.id === "staff-nutrition") return "✓";
      if (f.id === "mileage") return `+${Math.round((f.value - 1) * 100)}% decline`;
      const p = Math.round(Math.abs(f.value - 1) * 100);
      return p ? `${f.value >= 1 ? "+" : "−"}${p}%` : "±0%";
    };
    const phase = rep.growthPhase === "growing" ? `At ${rep.age - 1} you're still growing: these factors decide how much.` : rep.growthPhase === "peak" ? "Your peak years: growth now comes from training." : "Past the peak: staff, work ethic and fewer miles slow the decline.";
    return html`<div class="mc-dev">
      ${rep.breakout ? `<p class="mc-dev-flag good">${icon("rocket", { size: 16 })} Breakout summer: your ceiling went up too.</p>` : rep.slump ? `<p class="mc-dev-flag bad">${icon("x", { size: 16 })} A lost summer.</p>` : ""}
      <div class="mc-growth">${Object.entries(rep.ch).map(([k, v]) => `<span class="${v >= 0 ? "up" : "down"}">${E.ATTRS[k]} ${v >= 0 ? "+" : ""}${v}</span>`).join("")}</div>
      <h4 style="margin:12px 0 6px">Why</h4>
      <p class="muted" style="font-size:13px;margin:0 0 6px">${phase}</p>
      <ul class="clean mc-factors">${rep.factors.map((f) => `<li class="${bad(f) ? "down" : f.value > 1.005 || f.id === "mentor" || f.id === "staff-nutrition" ? "up" : ""}"><b>${esc(f.label)}</b><span class="mc-fx" dir="ltr">${fx(f)}</span><small class="muted">${esc(f.text)}</small></li>`).join("")}</ul>
      ${rep.trait ? `<p class="muted" style="font-size:13px">Scouts: you're a <b>${esc(E.TRAITS[rep.trait].name.toLowerCase())}</b>. ${esc(E.TRAITS[rep.trait].desc)}</p>` : ""}
    </div>`;
  }
  function showDevReport(rep, title = "Development report") {
    const d = modal(title);
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile mc-review"><small class="muted">DEVELOPMENT · AGE ${rep.age}</small><h2>${esc(title)}</h2>${devReportHtml(rep)}
      <button class="btn primary" id="mc-dev-ok">${icon("check", { size: 15 })} Got it</button></div>`;
    const close = () => closeModal(d);
    d.querySelector(".profile-close").addEventListener("click", close);
    d.querySelector("#mc-dev-ok").addEventListener("click", close);
    openModal(d);
  }
  function bindTrain(redraw) {
    const keep = (sel) => { const y = scrollY; redraw(); scrollTo(0, y); if (sel) root.querySelector(sel)?.focus(); };
    root.querySelectorAll("[data-train]").forEach((b) => b.addEventListener("click", () => { if (E.train(C, b.dataset.train)) { save(); sound.play("tick"); const y = scrollY; redraw(); scrollTo(0, y); } }, { signal }));
    root.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => {
      if (E.stepPlan(C, b.dataset.plan, Number(b.dataset.d))) { save(); sound.play("tick"); keep(`[data-plan="${b.dataset.plan}"][data-d="${b.dataset.d}"]`); }
    }, { signal }));
    root.querySelector("#mc-presets")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-preset]"); if (!b) return;
      C.plan = { ...E.PLAN_PRESETS[b.dataset.preset].plan }; save(); sound.play("tick"); keep(`[data-preset="${b.dataset.preset}"]`);
    }, { signal });
    root.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
      if (E.learnMove(C, b.dataset.move)) { save(); sound.play("win"); toast(`New move: ${E.MOVES[b.dataset.move].name}`); emit("mc:move", { id: b.dataset.move }); keep(); }
    }, { signal }));
    root.querySelectorAll("[data-badge]").forEach((b) => b.addEventListener("click", () => {
      if (E.buyBadge(C, b.dataset.badge)) { save(); sound.play("win"); toast(`Badge unlocked: ${E.BADGES[b.dataset.badge].name}`); emit("mc:badge", { id: b.dataset.badge }); freshBadge = b.dataset.badge; const y = scrollY; redraw(); scrollTo(0, y); freshBadge = null; }
    }, { signal }));
  }

  // ---------------------------------------------------------------- contracts
  function drawOffers() {
    if (!view?.offers) {
      view = { offers: E.makeOffers(C, { homeGrown: C.phase === "turnpro" ? C.academy.club : null }), tried: {} };
      const n = view.offers.length;
      if (n) setTimeout(() => newsFlash({ kicker: "TRANSFER NEWS", tone: "info", ic: "clipboard", title: `${n} club${n === 1 ? "" : "s"} want${n === 1 ? "s" : ""} ${C.name}`, text: view.offers.map((o) => o.name).join(", ") }), 300);
    }
    const first = C.phase === "turnpro";
    root.innerHTML = html`${header()}
      <div class="card pad">
        <h2>${icon("clipboard")} ${first ? "Your first pro contract" : "Free agency"}</h2>
        <p class="muted">${first ? `The academy years are over. ${esc(teamName(C.academy.club))} wants to keep its own, and other clubs are calling.` : "Your contract is up. Here's who wants you."} Accept an offer, or try to negotiate (the club may walk away).</p>
        ${nbaPanelHtml()}
        <div class="field"><label>Agent</label><div class="mc-cards" id="mc-agent">${Object.entries(E.AGENTS).map(([k, a]) => `<button class="mc-pick ${C.agent === k ? "on" : ""}" data-v="${k}" aria-pressed="${C.agent === k}"><b>${a.name}</b><small>${a.desc} Fee ${Math.round(a.fee * 100)}%.</small></button>`).join("")}</div></div>
        <div class="mc-offers">${view.offers.map((o, i) => html`<div class="card pad mc-offer ${o.homeGrown ? "home" : ""}">
          <div class="row">${crestSvg(o.team, o.name, 36)}<div><b>${esc(o.name)}</b><small class="muted">${o.nba ? `<span class="pill eu-pill nba-pill">${icon("globe", { size: 12 })} NBA</span>` : o.abroad ? `<span class="pill eu-pill">${icon("globe", { size: 12 })} EuroLeague · abroad</span>` : ""}${o.homeGrown ? "Your academy club" : o.own ? "Your current club" : ""}${o.loyal ? " · loyalty bonus" : ""}</small></div></div>
          <div class="mc-terms"><span>${money(o.salary)}<small>/season gross</small></span><span>${o.years} yr${o.years > 1 ? "s" : ""}</span><span>${roleName(o.role)}</span></div>
          ${contractTags(o)}
          <small class="muted">≈ ${money(E.netPay(o.salary, C.agent))} net after ~${Math.round(E.taxRate(o.salary) * 100)}% tax and the agent's ${Math.round(E.AGENTS[C.agent].fee * 100)}% · ${E.FAM_NAMES[o.fam] || ""} depth: #${(o.rank ?? 0) + 1}${C.nat !== "Israel" ? ` · ${o.foreigners} foreigners on the roster (minutes for ${E.FOREIGN_LIMIT})` : ""}</small>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn primary" data-sign="${i}">${icon("check", { size: 15 })} Sign</button>
            ${view.tried[i] ? `<span class="muted" style="font-size:12px">${esc(view.tried[i])}</span>` : html`
              <button class="btn" data-neg="${i}" data-more="0.12">Ask +12%</button>
              <button class="btn" data-neg="${i}" data-more="0.25">Ask +25%</button>
              ${o.role !== "starter" ? `<button class="btn" data-neg="${i}" data-more="0.05" data-role="${o.role === "bench" ? "rotation" : "starter"}">Ask for ${o.role === "bench" ? "rotation" : "starter"} minutes</button>` : ""}
              ${!o.nba && !o.nbaOut && nbaReady() ? `<button class="btn" data-neg="${i}" data-nbaout="1" title="Leave for the NBA at no cost; about 5% less salary">Ask for an NBA-out clause</button>` : ""}`}
          </div>
        </div>`).join("")}</div>
      </div>`;
    root.querySelector("#mc-agent").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b || b.dataset.v === C.agent) return;
      C.agent = b.dataset.v; view = null; save(); drawOffers();
    }, { signal });
    bindNbaPanel(drawOffers);
    root.querySelectorAll("[data-neg]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.neg), o = view.offers[i];
      const res = E.negotiate(C, o, { more: Number(b.dataset.more || 0), role: b.dataset.role || o.role, nbaOut: !!b.dataset.nbaout });
      if (res) { view.offers[i] = { ...res }; view.tried[i] = "Deal improved! Sign it while it's on the table."; sound.play("place"); }
      else { view.offers.splice(i, 1); newsFlash({ kicker: "TRANSFER NEWS", tone: "info", ic: "clipboard", title: `${o.name} walk away from the talks`, text: "They felt you asked for too much." }); sound.play("bad"); if (!view.offers.length) view.offers = E.makeOffers(C).slice(0, 1).map((x) => ({ ...x, salary: Math.round(x.salary * 0.85 / 1000) * 1000 })); }
      drawOffers();
    }, { signal }));
    root.querySelectorAll("[data-sign]").forEach((b) => b.addEventListener("click", () => {
      const o = view.offers[Number(b.dataset.sign)];
      const firstPro = !C.contract;
      E.sign(C, o);
      if (firstPro) emit("mc:pro", {});
      emit("mc:sign", { nba: !!o.nba, abroad: !!o.abroad });
      C.phase = "offseason"; view = null; save(); sound.play("win");
      announce(`Signed with ${o.name}: ${money(o.salary)} per season for ${o.years} seasons.`);
      draw();
      ceremony(o);
    }, { signal }));
  }

  // ---------------------------------------------------------------- 3D (the locker room, the trophy cabinet, the signing)
  const SHOE_COLORS = ["#f4f4f4", "#111111", "#d71920", "#0a3e8c", "#ffd200", "#00843d", "#ff7a1a", "#6d28d9"];
  /**
   * How your player looks in 3D, from the career: the avatar, height and weight; muscle from athleticism, defence and
   * rebounding (and bulking up); grey hair after 32 and shorter long hair after 36; the kit and shoes you picked.
   */
  const body3d = () => {
    const a = { ...av() };
    const age = C.age || 20;
    if (age >= 36 && ["long", "afro", "bun", "dreads", "curly", "mohawk"].includes(a.hair)) a.hair = "short";
    const strength = ((C.attrs?.ath ?? 60) + (C.attrs?.def ?? 60) + (C.attrs?.reb ?? 60)) / 3;
    const muscle = Math.max(0, Math.min(1, (strength - 50) / 40 + (C.bodyPlan === "bulk" ? 0.15 : C.bodyPlan === "slim" ? -0.1 : 0)));
    const team = clubNow();
    return { av: a, name: C.name, num: a.num ?? 7, height: C.height, weight: C.weight ?? E.idealWeight(C),
      look: { muscle, grey: Math.max(0, Math.min(1, (age - 32) / 7)), kit: C.gear?.kit || "home", shoes: C.gear?.shoes || SHOE_COLORS[0], design: designOf(team) } };
  };
  const clubNow = () => C.loan?.team || C.contract?.team || C.club || C.academy?.club;
  /** Trophies and individual awards for the 3D cabinet, oldest first. */
  function cabinetItems() {
    const NAME = { title: "Champion", nba: "NBA title", euroleague: "EuroLeague", cup: "State Cup", allstar: "All-Star", nbaallstar: "NBA All-Star" };
    // drawn inside the 3D canvas, so translated here (the page translator doesn't reach canvas text)
    return [...C.trophies.map((t) => ({ type: t.type, label: tr(NAME[t.type] || t.type), season: t.season })), ...C.awards.map((a) => ({ type: "award", label: tr(a.name), season: a.season }))]
      .sort((a, b) => String(a.season).localeCompare(String(b.season)));
  }
  let view3d = null;
  /** Mount the 3D views of the screen just drawn (the old ones are cleaned up). */
  function mount3D() {
    view3d?.abort();
    view3d = new AbortController();
    const sig = view3d.signal;
    signal.addEventListener("abort", () => view3d?.abort(), { once: true });
    root.querySelector("#mc-locker")?.addEventListener("click", openLocker, { signal: sig });
    const cab = root.querySelector("#mc-cabinet3d");
    if (cab) scenes3d().then(({ trophyCabinet }) => trophyCabinet(cab, { items: cabinetItems(), colors: clubColors(clubNow()).map(cssHex), signal: sig })).catch(() => cab.remove());
  }
  function openLocker() {
    const team = clubNow();
    const d = modal("Locker room");
    const ctl = new AbortController();
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile"><small class="muted">LOCKER ROOM · ${esc(teamName(team).toUpperCase())}</small><h2>${esc(C.name)}</h2>
        <div class="stage-box locker-box" id="lk-3d"></div>
        <p class="muted" style="font-size:12px">Drag (or use the arrow keys) to turn. Your look comes from your avatar; height, weight, training and age shape the body. ${esc(teamName(team))} wear the ${esc(DESIGNS[designOf(team)].toLowerCase())} design.</p>
        <div class="row lk-gear" style="flex-wrap:wrap;gap:14px;margin-bottom:12px">
          <div><small class="muted">KIT</small><div class="seg sm" id="lk-kit" role="radiogroup">${[["home", "Home"], ["away", "Away"]].map(([k, l]) => `<button role="radio" data-kit="${k}" aria-checked="${(C.gear?.kit || "home") === k}" class="${(C.gear?.kit || "home") === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div><small class="muted">VIEW</small><button class="btn sm" id="lk-close-up" aria-pressed="false">${icon("search", { size: 14 })} Close-up</button></div>
          <div><small class="muted">SHOES</small><div class="lk-shoes" id="lk-shoes" role="radiogroup">${SHOE_COLORS.map((c) => `<button role="radio" data-shoe="${c}" aria-checked="${(C.gear?.shoes || SHOE_COLORS[0]) === c}" aria-label="Shoe colour ${c}" class="${(C.gear?.shoes || SHOE_COLORS[0]) === c ? "on" : ""}" style="--sw:${c}"></button>`).join("")}</div></div>
        </div>
        <div class="row"><button class="btn ghost" id="lk-off">${icon("close", { size: 14 })} Turn 3D views off</button><span class="spacer"></span><button class="btn primary" id="lk-close">Close</button></div></div>`;
    const close = () => closeModal(d);
    d.querySelector(".profile-close").addEventListener("click", close);
    d.querySelector("#lk-close").addEventListener("click", close);
    d.querySelector("#lk-off").addEventListener("click", () => { set3D(false); close(); toast("3D views are off. Turn them back on in Settings."); draw(); });
    d.addEventListener("close", () => sceneCtl.abort(), { once: true });
    openModal(d);
    let sceneCtl = ctl;
    let lk = null, closeUp = false;
    const mountScene = () => scenes3d().then(({ lockerRoom }) => lockerRoom(d.querySelector("#lk-3d"), { ...body3d(), colors: clubColors(team).map(cssHex), club: teamName(team), signal: sceneCtl.signal }))
      .then((S) => { lk = S; if (closeUp) S?.closeUp(true); })
      .catch(() => { const b = d.querySelector("#lk-3d"); if (b) b.innerHTML = `<p class="muted">3D isn't available on this device.</p>`; });
    // your kit and shoes: saved with the career, the scene rebuilds with them
    const regear = (patch, sel, attr, val) => {
      C.gear = { ...(C.gear || {}), ...patch }; save();
      d.querySelectorAll(sel).forEach((b) => { const on = b.dataset[attr] === val; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
      sceneCtl.abort(); sceneCtl = new AbortController(); mountScene();
    };
    d.querySelector("#lk-close-up").addEventListener("click", (e) => { closeUp = !closeUp; e.currentTarget.setAttribute("aria-pressed", String(closeUp)); e.currentTarget.classList.toggle("on", closeUp); lk?.closeUp(closeUp); });
    d.querySelector("#lk-kit").addEventListener("click", (e) => { const b = e.target.closest("[data-kit]"); if (b) regear({ kit: b.dataset.kit }, "[data-kit]", "kit", b.dataset.kit); });
    d.querySelector("#lk-shoes").addEventListener("click", (e) => { const b = e.target.closest("[data-shoe]"); if (b) regear({ shoes: b.dataset.shoe }, "[data-shoe]", "shoe", b.dataset.shoe); });
    mountScene();
  }

  // ---------------------------------------------------------------- the road to the NBA
  /** Contract details on an offer: an option year, a two-way deal, an NBA-out clause, a draft pick. */
  function contractTags(o) {
    const tags = [o.rookie ? `Draft pick #${o.rookie}` : "", o.twoWay ? "Two-way contract: every other game with the G League team, no playoffs" : "",
      o.option === "player" ? "Player option on the last year" : o.option === "team" ? "Team option on the last year" : "", o.nbaOut ? "NBA-out clause" : ""].filter(Boolean);
    return tags.length ? `<div class="mc-tags">${tags.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>` : "";
  }
  /** Summer cards: the NBA Draft, NBA teams calling during a European contract, the player option. */
  function nbaPanelHtml() {
    const out = [];
    if (NP.draftEligible(C)) {
      const p = NP.draftProjection(C);
      out.push(html`<div class="card pad nba-card"><h3>${icon("star")} NBA Draft</h3>
        <p>You're ${C.age} and eligible. ${p.undrafted ? "Scouts don't see you being picked yet: you'd probably go undrafted." : `Scouts project picks <b>${p.lo}–${Math.min(60, p.hi)}</b>${p.lo > 30 ? " (second round: a two-way contract)" : p.hi <= 30 ? " (first round: a rookie contract)" : " (first or second round)"}.`}</p>
        <p class="muted" style="font-size:12px">Declaring is once and final. Picked: you sign with that team (it handles your current contract). Undrafted: you stay where you are. Draft order: the real NBA teams of the season just played, weakest first.</p>
        <button class="btn primary" id="mc-draft">${icon("arrowRight", { size: 15 })} Declare for the draft</button></div>`);
    }
    const calls = C.phase === "offseason" && C.contract?.left > 0 ? NP.nbaCalls(C) : [];
    if (calls.length) {
      const cost = NP.buyoutCost(C);
      out.push(html`<div class="card pad nba-card"><h3>${icon("globe")} The NBA is calling</h3>
        <p class="muted" style="margin:0 0 8px">${cost.clause ? "Your NBA-out clause lets you leave at no cost." : `Leaving costs a buyout of ${money(cost.total)}: the NBA team pays ${money(cost.nbaPays)}, you pay ${money(cost.you)} from your savings (${money(C.money)}).`}</p>
        ${calls.map((o, i) => `<div class="row" style="margin:6px 0">${crestSvg(o.team, o.name, 28)}<b>${esc(o.name)}</b><span class="muted">${roleName(o.role)} · ${money(o.salary)}/season · ${o.years} yr${o.years > 1 ? "s" : ""}</span><span class="spacer"></span>
          <button class="btn primary sm" data-call="${i}" ${cost.you > C.money ? "disabled" : ""}>Go to the NBA</button></div>${contractTags(o)}`).join("")}
        <small class="muted">Or stay: the offer is gone once the season starts.</small></div>`);
    }
    if (C.optionPending && C.contract?.left === 1) {
      out.push(html`<div class="card pad nba-card"><h3>${icon("clipboard")} Your player option</h3>
        <p>One more season at ${esc(teamName(C.contract.team))} for ${money(C.contract.salary)}, or opt out and become a free agent now. Your market value is about ${money(E.value(C))} a season in Europe.</p>
        <div class="row"><button class="btn" id="mc-opt-stay">Stay one more season</button><button class="btn primary" id="mc-opt-out">Opt out</button></div></div>`);
    }
    return out.join("");
  }
  function bindNbaPanel(redraw) {
    root.querySelector("#mc-draft")?.addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Declare for the NBA Draft?", message: "It's once and final. If a team picks you, you sign with it.", ok: "Declare" }))) return;
      const d = NP.runDraft(C);
      save();
      draftNight(d, redraw);
    }, { signal });
    root.querySelectorAll("[data-call]").forEach((b) => b.addEventListener("click", () => {
      const o = NP.nbaCalls(C)[Number(b.dataset.call)];
      if (!o || !NP.buyOut(C, o)) return toast("Not enough savings for your part of the buyout");
      emit("mc:sign", { nba: true, abroad: true });
      view = null; save(); sound.play("win");
      redraw(); ceremony(o);
    }, { signal }));
    root.querySelector("#mc-opt-stay")?.addEventListener("click", () => { NP.useOption(C, false); save(); redraw(); }, { signal });
    root.querySelector("#mc-opt-out")?.addEventListener("click", () => { NP.useOption(C, true); view = null; save(); draw(); }, { signal });
  }
  /** Draft night: the teams on the clock one by one, then your name (or not). */
  function draftNight(d, redraw) {
    const dlg = modal("NBA Draft");
    dlg.dataset.locked = "1";
    const last = d.undrafted ? 60 : d.pick;
    const n = d.order.length || 30;
    dlg.innerHTML = html`<div class="profile draft-night"><small class="muted">NBA DRAFT · ${esc((C.draft?.season || "").slice(0, 4))}</small>
      <h2 id="dn-title">${icon("star", { size: 22 })} On the clock…</h2>
      <div class="dn-board" id="dn-board" aria-live="polite"></div>
      <div id="dn-end"></div></div>`;
    openModal(dlg);
    const board = dlg.querySelector("#dn-board");
    let i = 1;
    const step = () => {
      if (!dlg.isConnected) return;
      if (i > last) return reveal();
      const t = d.order[(i - 1) % n];
      if (t) board.insertAdjacentHTML("afterbegin", `<div class="dn-pick ${!d.undrafted && i === d.pick ? "me" : ""}"><b>${i}</b>${crestSvg(t.id, t.name, 22)}<span>${esc(t.name)}</span><small class="muted">${!d.undrafted && i === d.pick ? esc(C.name) : i === 31 ? "Second round" : ""}</small></div>`);
      i++;
      setTimeout(step, reducedMotion() ? 0 : i < last - 3 ? 70 : 600);
    };
    const reveal = () => {
      const end = dlg.querySelector("#dn-end"), title = dlg.querySelector("#dn-title");
      if (d.undrafted) {
        title.textContent = "Undrafted";
        end.innerHTML = `<p>Sixty names were called, and yours wasn't one of them. You stay where you are: keep improving, the NBA can still call.</p><button class="btn primary" id="dn-ok">Back to the summer</button>`;
        sound.play("bad");
      } else {
        title.innerHTML = `${icon("star", { size: 22 })} Pick ${d.pick}: ${esc(d.name)}`;
        end.innerHTML = `<p>With the ${d.pick}${d.pick === 1 ? "st" : d.pick === 2 ? "nd" : d.pick === 3 ? "rd" : "th"} pick, the ${esc(d.name)} select <b>${esc(C.name)}</b>. ${d.round === 1 ? "A first-round rookie contract." : "Second round: a two-way contract."}</p><button class="btn primary" id="dn-ok">Sign the contract</button>`;
        confetti(3500); sound.play("victory");
      }
      dlg.querySelector("#dn-ok").addEventListener("click", () => {
        if (!d.undrafted) { // the signing opens in the same window (closing and reopening races the Back step)
          const o = NP.draftContract(C, d);
          E.sign(C, o);
          C.phase = "offseason";
          emit("mc:sign", { nba: true, abroad: true });
          view = null; save();
          draw(); ceremony(o);
        } else { closeModal(dlg); redraw(); }
      });
      dlg.querySelector("#dn-ok").focus();
    };
    step();
  }

  // ---------------------------------------------------------------- off-season
  function drawOffseason() {
    const last = C.history[C.history.length - 1];
    const nextLabel = E.seasonLabel(C.debut, C.seasonNo);
    const expected = E.roleOn(C, nextLabel, C.contract.team);
    if (tab === "season" || tab === "table") tab = "train"; // no season running in the summer
    // loan targets: clubs where you'd play more (starter first), weaker clubs first
    const ROLE_RANK = { starter: 0, rotation: 1, bench: 2 };
    const weaker = E.teamsOf(nextLabel).filter((t) => t.id !== C.contract.team).map((t) => ({ ...t, role: E.roleOn(C, nextLabel, t.id) }))
      .filter((t) => t.role !== "bench").sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.strength - b.strength).slice(0, 6);
    root.innerHTML = html`${header()}
      ${tabs(tab)}
      ${tab === "train" ? html`<div class="mc-grid">
        <div class="card pad">
          <h2>${icon("sun")} Summer · before ${nextLabel}</h2>
          ${last ? `<p class="muted">Last season: ${esc(teamName(last.team))}, ${last.avg.ppg} PPG, ${last.avg.rpg} RPG, ${last.avg.apg} APG${last.awards.length ? ` · ${last.awards.join(", ")}` : ""}.</p>` : `<p class="muted">Your pro career starts now.</p>`}
          <p>Contract: <b>${esc(teamName(C.contract.team))}</b>, ${money(C.contract.salary)}/season (≈ ${money(E.netPay(C.contract.salary, C.agent))} net), ${C.contract.left} season${C.contract.left === 1 ? "" : "s"} left. Expected role: <b>${roleName(expected)}</b>.</p>
          ${nbaPanelHtml()}
          ${depthHtml(nextLabel, C.loan?.team || C.contract.team)}
          ${C.injury ? `<p class="bad-text">${icon("heart", { size: 15 })} Still recovering from a ${esc(C.injury.name.toLowerCase())}: about ${C.injury.games} more games.</p>` : ""}
          ${C.lastDev ? `<button class="btn ghost" id="mc-devrep">${icon("chart", { size: 15 })} Last summer's development report</button>` : ""}
          <div class="field"><label>Summer camp ${view?.camp ? `<span class="muted">(done)</span>` : ""}</label><div class="mc-cards two" id="mc-camp">${Object.entries(E.SUMMER_CAMPS).map(([k, c]) => `<button class="mc-pick" data-v="${k}" ${view?.camp ? "disabled" : ""}><b>${c.name}</b><small>${c.attrs.map((a) => `<span>${E.ATTRS[a]}</span>`).join(" & ")} <span>+1 to +3, up to your potential</span></small>${C.staff?.skills ? `<small>+1 more with your skills coach</small>` : ""}</button>`).join("")}</div></div>
          ${E.eliteAllowed(C) || C.eliteSeason === C.seasonNo ? html`<div class="field"><label>Elite camp abroad <small class="muted">(once a summer · stretches your ceiling, can teach a move)</small></label>
            <div class="mc-cards" id="mc-elite">${Object.entries(E.ELITE_CAMPS).map(([k, c]) => { const can = E.eliteAllowed(C) && C.money >= c.cost;
              return `<button class="mc-pick" data-v="${k}" ${can ? "" : "disabled"}><b>${esc(c.name)}</b><small>${esc(c.desc)}</small><small>${c.attrs.map((a) => `<span>${E.ATTRS[a]}</span>`).join(" & ")} <span>+2 to +4, ceiling +2</span></small><small><span>Move: ${esc(E.MOVES[c.move].name)}</span></small><small><b>${money(c.cost)}</b>${C.eliteSeason === C.seasonNo ? "" : can ? "" : ` · <span>Not enough savings</span>`}</small></button>`; }).join("")}</div>
            ${C.eliteSeason === C.seasonNo ? `<small class="muted">Done for this summer.</small>` : ""}</div>` : ""}
          <div class="field"><label>Body this summer <small class="muted">(now ${Math.round(C.weight ?? E.idealWeight(C))} kg · usual for your height ${E.idealWeight(C)} kg)</small></label>
            <div class="seg sm" id="mc-body" role="radiogroup">${Object.entries(E.BODY_PLANS).map(([k, b]) => `<button role="radio" data-v="${k}" aria-checked="${(C.bodyPlan || "keep") === k}" class="${(C.bodyPlan || "keep") === k ? "on" : ""}">${b.name}${b.kg ? ` (${b.kg > 0 ? "+" : "−"}${Math.abs(b.kg)} kg)` : ""}</button>`).join("")}</div>
            <small class="muted">${bodyLine()}</small></div>
          <div class="field"><label>Your staff <small class="muted">(paid from your savings, ${money(C.money)} now, at the end of each season)</small></label>
            <div class="mc-cards" id="mc-staff">${Object.entries(E.STAFF).map(([k, st]) => { const on = !!C.staff?.[k], can = on || C.money >= st.cost;
              return `<button class="mc-pick ${on ? "on" : ""}" data-v="${k}" aria-pressed="${on}" ${can ? "" : "disabled"}><b>${icon(k === "nutrition" ? "heart" : k === "strength" ? "bolt" : "whistle", { size: 15 })} ${st.name}</b><small>${st.desc}</small><small><b>${money(st.cost)}</b> a season</small>${on ? `<small>Hired (tap to let go)</small>` : can ? "" : `<small>Not enough savings</small>`}</button>`; }).join("")}</div></div>
          ${expected === "bench" && !C.loan ? (weaker.length ? html`<div class="field"><label for="mc-loan">Not enough minutes? Go on loan for a season</label>
            <div class="row"><select id="mc-loan" class="input" style="flex:1">${weaker.map((t) => `<option value="${t.id}">${esc(t.name)} (${roleName(t.role)})</option>`).join("")}</select><button class="btn" id="mc-loan-go">Loan me out</button></div></div>`
            : `<p class="muted">No club would give you more minutes yet. Keep training: the coach notices.</p>`) : ""}
          ${C.loan ? `<p class="muted">On loan to <b>${esc(teamName(C.loan.team))}</b> this season.</p>` : ""}
          <div class="row" style="margin-top:12px"><button class="btn primary big-btn" id="mc-start">${icon("play", { size: 16 })} Start the ${nextLabel} season</button>
            ${C.age >= 30 ? `<button class="btn ghost" id="mc-retire">${icon("flag", { size: 15 })} Retire</button>` : ""}</div>
        </div>
        <div class="card pad"><h3>${icon("bolt")} Training</h3>${trainHtml()}</div>
      </div>` : tab === "career" ? careerHtml() : trophiesHtml()}`;
    bindTabs(drawOffseason);
    bindTrain(drawOffseason);
    bindNbaPanel(drawOffseason);
    root.querySelector("#mc-camp")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b || view?.camp) return;
      const g = E.summerCamp(C, b.dataset.v);
      view = { ...(view || {}), camp: b.dataset.v }; save();
      toast(Object.entries(g).map(([k, v]) => `${E.ATTRS[k]} +${v}`).join(" · "));
      drawOffseason();
    }, { signal });
    root.querySelector("#mc-staff")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b || b.disabled) return;
      C.staff ??= {}; C.staff[b.dataset.v] = !C.staff[b.dataset.v]; save(); sound.play("tick");
      const y = scrollY; drawOffseason(); scrollTo(0, y);
      root.querySelector(`#mc-staff [data-v="${b.dataset.v}"]`)?.focus();
    }, { signal });
    root.querySelector("#mc-devrep")?.addEventListener("click", () => showDevReport(C.lastDev), { signal });
    root.querySelector("#mc-elite")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b || b.disabled) return;
      const r = E.eliteCamp(C, b.dataset.v); if (!r) return;
      save(); sound.play("win");
      toast([...Object.entries(r.gains).map(([k, v]) => `${E.ATTRS[k]} +${v}`), r.move ? `New move: ${E.MOVES[r.move].name}` : null].filter(Boolean).join(" · "));
      const y = scrollY; drawOffseason(); scrollTo(0, y);
    }, { signal });
    root.querySelector("#mc-body")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b) return;
      C.bodyPlan = b.dataset.v; save(); sound.play("tick");
      const y = scrollY; drawOffseason(); scrollTo(0, y); root.querySelector(`#mc-body [data-v="${b.dataset.v}"]`)?.focus();
    }, { signal });
    root.querySelector("#mc-loan-go")?.addEventListener("click", () => {
      const t = root.querySelector("#mc-loan").value;
      C.loan = { team: t, season: nextLabel }; save(); emit("mc:loan", {});
      newsFlash({ kicker: "TRANSFER NEWS", tone: "info", ic: "arrowRight", title: `${C.name} loaned to ${teamName(t)}`, text: `A season-long loan for ${nextLabel}, for more minutes.` }); drawOffseason();
    }, { signal });
    root.querySelector("#mc-start")?.addEventListener("click", () => {
      E.startSeason(C); C.phase = "season"; view = null; tab = "season"; lastGame = null; save();
      sound.play("spin"); announce(`${C.label} season starts. Role: ${roleName(C.cur.role)}.`);
      draw();
    }, { signal });
    root.querySelector("#mc-retire")?.addEventListener("click", async () => {
      if (await confirmDialog({ title: "Retire?", message: "Your career ends here. You'll get your final ceremony.", ok: "Retire", danger: true })) doRetire();
    }, { signal });
  }

  // ---------------------------------------------------------------- season
  function nextOpp() {
    const S = C.cur;
    if (S.phase === "regular" && E.nextEuro(S)) return E.nextEuro(S); // a EuroLeague game comes first
    if (S.phase === "regular") {
      const g = S.schedule[S.round]?.find(([h, a]) => h === S.team || a === S.team);
      return g ? { opp: g[0] === S.team ? g[1] : g[0], home: g[0] === S.team, label: `Round ${S.round + 1} of ${S.schedule.length}` } : { bye: true, label: `Round ${S.round + 1}: no game (bye)` };
    }
    if (S.phase === "playoffs" && S.playoffs && !S.playoffs.out) {
      const s = S.playoffs.series.find((x) => x.a === S.team || x.b === S.team);
      if (s) return { opp: s.a === S.team ? s.b : s.a, label: `${(S.league === "nba" ? (S.playoffs.need?.length === 4 ? ["First round", "Second round", "Semi-finals", "NBA Finals"] : ["First round", "Semi-finals", "NBA Finals"]) : S.league === "el" ? ["Playoffs", "Final Four semi-final", "Final Four final"] : ["Quarter-finals", "Semi-finals", "Final"])[S.playoffs.round]} · series ${s.a === S.team ? s.w.join("-") : [...s.w].reverse().join("-")}` };
    }
    return null;
  }
  function ledHtml(g) {
    if (!g) return "";
    const S = C.cur, me = S.team, opp = g.opp;
    const L = g.line;
    return html`<div class="mc-led ${g.won ? "won" : "lost"}">
      <div class="mc-led-head"><span>${esc(g.label || "")}</span><b>${g.won ? "WIN" : "LOSS"}</b></div>
      <div class="mc-led-score">
        <div class="mc-led-team"><span>${esc(teamName(me))}</span><b class="led" data-count="${g.my}">${g.my}</b></div>
        <span class="mc-led-dash">–</span>
        <div class="mc-led-team"><b class="led" data-count="${g.their}">${g.their}</b><span>${esc(teamName(opp))}</span></div>
      </div>
      <div class="mc-led-q">${g.q[0].map((_, i) => `<span>${i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ""}`} <b>${g.q[0][i]}-${g.q[1][i]}</b></span>`).join("")}</div>
      ${momentumHtml(withTimeline(g), teamName(me), teamName(opp))}
      <div class="mc-line">${L.injured ? "Out injured" : L.gleague ? "With the G League team (two-way contract)" : L.rested ? "Rested (load management)" : L.dnp ? "Did not play (coach's decision)" : `<b>${esc(C.name)}</b> ${L.min} min · <b>${L.pts} pts</b> · ${L.reb} reb · ${L.ast} ast · ${L.stl} stl · ${L.blk} blk · ${L.fgm}/${L.fga} FG · ${L.tpm}/${L.tpa} 3P${L.tov != null ? ` · ${L.tov} TO` : ""} · ${L.pf ?? 0} PF${L.pm != null ? ` · ${L.pm > 0 ? "+" : ""}${L.pm}` : ""}${L.fouledOut ? " · <b>fouled out</b>" : ""}`}</div>
      <button class="btn" id="mc-box">${icon("chart", { size: 15 })} Box score</button>
    </div>`;
  }
  /** Games played through the game engine carry their real timeline (for the momentum chart). */
  function withTimeline(g) {
    if (!g.sim) return g;
    const r = E.simFor(C, C.cur, g);
    const flip = !g.home; // the chart is drawn from your side
    return { ...g, tl: { events: r.events.map((e) => (flip ? { ...e, score: [e.score[1], e.score[0]] } : e)), lead: r.lead.map(([t, l]) => [t, flip ? -l : l]), length: r.length, quarter: r.quarter } };
  }
  /** The shared game screen for one of your games (pre-game, live, final) from the game engine. */
  function gameScreen(g, start, onClose) {
    const S = C.cur, r = E.simFor(C, S, g);
    const mine = { name: teamName(S.team), id: S.team }, theirs = { name: teamName(g.opp), id: g.opp };
    const [home, away] = g.home ? [mine, theirs] : [theirs, mine];
    const link = (l) => (l.id === "me" ? `<b>${esc(C.name)}</b>` : E.isNbaPlayer(l.id) ? esc(l.name) : playersById.has(l.id) ? `<button class="link-name" data-profile="${l.id}">${esc(l.name)}</button>` : `<a class="link-name" href="#/euroleague/player/${esc(l.id)}">${esc(l.name)}</a>`);
    let pre = null;
    if (start === "pregame") {
      // the preview shows the season numbers of the two rosters, not this game's
      pre = { previews: [0, 1].map((side) => previewOf(side === (g.home ? 0 : 1) ? S.team : g.opp)), lineups: r.box.map((lines) => lines.filter((l) => l.starter).map((l) => ({ name: l.id === "me" ? C.name : l.name, pos: l.pos }))), tactics: [{}, {}] };
      pre.keys = keysFor(home, away, pre);
    }
    return openGameView({ home, away, sim: r, label: g.label || "", pre, start, meId: "me", link, celebrate: g.won ? (g.home ? 0 : 1) : null, onClose });
  }
  function previewOf(tid) {
    const europe = C.cur.league === "el"; // EuroLeague numbers are placeholders: no preview numbers
    const rows = (europe ? [] : C.cur.league === "nba" ? E.careerRoster(C.cur.label, tid) : E.rosterOf(E.dataSeason(C.cur.label), tid)).slice(0, 9);
    if (!rows.length) return { rating: "–", pts: "–", reb: "–", ast: "–", three: "–", star: null };
    const t = { players: rows.map((ps) => ({ id: ps.player_id, name: E.playerName(ps.player_id), pos: ps.position, rating: ps.rating_mock, mpg: ps.stats.mpg || 1,
      use: (ps.stats.ppg || 0) / (ps.stats.mpg || 1), reb: (ps.stats.rpg || 0) / (ps.stats.mpg || 1), ast: (ps.stats.apg || 0) / (ps.stats.mpg || 1), s3: (ps.stats.fg3_pct ?? 0) > 5 ? 0.33 : 0.05 })) };
    return teamPreview(t);
  }
  function openBox(g) {
    if (g.sim) return gameScreen(g, "final");
    const b = E.boxScore(C, C.cur, g);
    const tbl = (name, lines, score) => `<div class="box-team"><div class="row"><b>${esc(name)}</b><span class="spacer"></span><b class="led">${score}</b></div>
      <table class="stat-table box"><thead><tr><th>Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>
      ${lines.map((l) => `<tr class="${l.me ? "best" : ""}"><td>${l.me ? `<b>${esc(l.name)}</b>` : l.pid && l.nba ? esc(l.name) : l.pid && l.el ? `<a class="link-name" href="#/euroleague/player/${esc(l.pid)}">${esc(l.name)}</a>` : l.pid ? `<button class="link-name" data-profile="${l.pid}">${esc(l.name)}</button>` : esc(l.name)}</td><td class="muted">${esc(l.pos)}</td><td>${l.min}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td></tr>`).join("")}</tbody></table></div>`;
    const d = modal("Box score");
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile"><h2>${esc(teamName(C.cur.team))} ${g.my} – ${g.their} ${esc(teamName(g.opp))}</h2><p class="muted">${esc(g.label || "")}${C.cur.simulated ? " · simulated season" : ""}</p>
      <div class="box-wrap">${tbl(teamName(C.cur.team), b.team, g.my)}${tbl(teamName(g.opp), b.opp, g.their)}</div>
      <p class="muted" style="font-size:12px">Teammates and opponents are the real rosters of ${E.dataSeason(C.cur.label)}; their lines follow each player's real per-game profile.</p></div>`;
    d.querySelector(".profile-close").addEventListener("click", () => closeModal(d));
    openModal(d);
  }
  function showEvent(ev) {
    const d = modal(ev.title);
    d.dataset.locked = "1";
    d.innerHTML = html`<div class="profile mc-event"><small class="muted">BETWEEN GAMES</small><h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p>
      <div class="mc-choices">${ev.choices.map((c, i) => `<button class="btn ${i === 0 ? "primary" : ""}" data-ch="${i}">${esc(c)}</button>`).join("")}</div></div>`;
    d.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
      const res = resolveEvent(C, ev.id, Number(b.dataset.ch));
      save(); closeModal(d); toast(res); announce(res); draw();
      if (ev.id.startsWith("charity")) emit("mc:charity", { n: C.charity || 0 });
    }));
    openModal(d);
    d.querySelector("[data-ch]")?.focus();
  }
  function showInjury() {
    const inj = C.injury;
    const d = modal("Injury");
    d.dataset.locked = "1";
    d.innerHTML = html`<div class="profile mc-event"><small class="muted">MEDICAL REPORT</small><h2>${icon("heart", { size: 22 })} ${esc(inj.name)}${inj.again ? " (again)" : ""}</h2>
      <p>${esc(inj.desc || "")} The doctors expect you to miss about <b>${inj.games} game${inj.games === 1 ? "" : "s"}</b>${inj.severe ? ", into next season (the summer counts as about 15 games of rehab)" : ""}.</p>
      ${inj.ath ? `<p class="bad-text">Lasting effect: athleticism ${inj.ath}, defense ${Math.round(inj.ath / 2)}.</p>` : ""}
      <div class="mc-choices"><button class="btn primary" data-r="0">${inj.severe ? "Surgery and full rehab" : `Full recovery (${inj.games} games)`}</button>
        ${inj.noRush ? `<p class="muted" style="margin:0">${inj.severe ? "There's no rushing back from this one." : "League protocol: no early return."}</p>` : `<button class="btn" data-r="1">Rush back (${Math.max(1, Math.round(inj.games * 0.45))} games). For the next 10 games you're three times as likely to get hurt again, and it costs a little athleticism for good.</button>`}</div></div>`;
    d.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { E.treatInjury(C, b.dataset.r === "1"); save(); closeModal(d); draw(); }));
    openModal(d);
    d.querySelector("[data-r]")?.focus();
  }

  function afterGames(out) {
    const mine = out.games || out;
    for (const g of mine) {
      emit("mc:game", { pts: g.line.pts, reb: g.line.reb, ast: g.line.ast, stl: g.line.stl, blk: g.line.blk, dnp: !!g.line.dnp, role: C.cur.role, won: g.won });
      if (g.line.pts >= 30) newsFlash({ kicker: "TONIGHT", tone: "good", ic: "flame", title: `${g.line.pts}-point night for ${C.name}!`, text: `${g.line.pts} pts, ${g.line.reb} reb, ${g.line.ast} ast against ${teamName(g.opp)}.` });
    }
    if (mine.length) { lastGame = mine[mine.length - 1]; sound.play(lastGame.won ? "place" : "bad"); }
    if (out.cup?.game) { lastGame = out.cup.game; const cg = out.cup.game, cupLine = `${teamName(C.cur.team)} ${cg.my}-${cg.their} ${teamName(cg.opp)}`;
      newsFlash({ kicker: "STATE CUP", tone: cg.won ? "good" : "info", ic: "medal", text: cupLine,
        title: out.cup.winner === C.cur.team ? `${teamName(C.cur.team)} win the State Cup!` : cg.won ? "State Cup: through to the next round" : "State Cup: knocked out" });
      if (out.cup.winner === C.cur.team) { confetti(3000); sound.play("victory"); emit("mc:trophy", { type: "cup" }); } }
    if (out.euro) {
      const x = out.euro;
      if (x.won) { newsFlash({ kicker: "EUROLEAGUE FINAL FOUR", tone: "good", ic: "crown", title: `${teamName(C.cur.team)} are EuroLeague champions!`, text: `${C.name} lifts the trophy at the Final Four.` }); confetti(5000); sound.play("victory"); emit("mc:trophy", { type: "euroleague" }); }
      else if (x.inIt) newsFlash({ kicker: "EUROLEAGUE FINAL FOUR", tone: "info", ic: "globe", title: `Final Four: ${teamName(x.f4.champion)} win the EuroLeague`, text: `${teamName(C.cur.team)} made the Final Four but fell short.` });
      else newsFlash({ kicker: "EUROLEAGUE", tone: "info", ic: "globe", title: `EuroLeague season over: #${x.rank} for ${teamName(C.cur.team)}`, text: `${teamName(x.f4.champion)} won the Final Four.` });
    }
    if (out.allStar) { if (out.allStar.picked) { newsFlash({ kicker: "ALL-STAR GAME", tone: "good", ic: "star", title: C.cur.league === "nba" ? `${C.name} is an NBA All-Star!` : `${C.name} is an All-Star!`, text: C.cur.league === "nba" ? "Selected for the NBA All-Star Game." : "Selected for this season's All-Star game." }); confetti(2000); emit("mc:trophy", { type: "allstar" }); } }
    save();
  }
  const liveOn = () => store.get("mc:live", true) !== false;
  function play(fn, { live = false } = {}) {
    if (!C.cur) return draw(); // the season already ended (its review was closed with Esc): show where things stand
    meterBase = { trust: C.trust, pop: C.pop, chem: Math.round(C.chem?.[C.cur.team] || 0) };
    const S = C.cur;
    const out = fn();
    const mine = out.games || out;
    if (live && liveOn() && mine.length === 1) {
      const g = mine[0];
      const b = E.boxScore(C, S, g);
      const w = (l) => l.filter((x) => !x.me && x.min > 0).map((x) => ({ name: x.name, w: x.min }));
      C.pending = out; // closing the tab while watching brings you back to this game
      save(); // the result is already decided: watching it doesn't change anything
      if (g.sim) return gameScreen(g, "pregame", () => afterPlay(out));
      return watchGame({ C, S, g, names: { us: w(b.team), them: w(b.opp) }, jersey: av().num ?? 7, onDone: () => afterPlay(out) });
    }
    afterPlay(out);
  }
  function afterPlay(out) {
    delete C.pending;
    afterGames(out);
    if (C.cur.phase === "done") return finishSeason();
    draw();
    if (C.injury?.pending) return showInjury();
    if (out.coach) { newsFlash({ title: "Coaching change", text: out.coach.text }); return; }
    const ev = lastGame && !C.injury ? maybeEvent(C, lastGame) : null;
    if (ev) showEvent(ev);
  }
  function finishSeason() {
    const S = C.cur;
    const title = S.playoffs?.champion === S.team;
    const { summary, dev } = E.endSeason(C);
    if (title) { confetti(4500); sound.play("victory"); emit("mc:trophy", { type: S.league === "nba" ? "nba" : "title" }); }
    for (const a of summary.awards) emit("mc:award", { name: a });
    emit("mc:season", { seasons: C.history.filter((h) => h.pro).length, pts: C.totals.pts, overall: summary.overall });
    save();
    const d = modal("Season review");
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile mc-review"><small class="muted">SEASON REVIEW · ${summary.season}${summary.simulated ? " (simulated)" : ""}</small>
      <h2>${title ? `${icon("trophy", { size: 26 })} Champions!` : esc(summary.playoffs || "Season over")}</h2>
      <div class="mc-review-stats">${[["PPG", summary.avg.ppg], ["RPG", summary.avg.rpg], ["APG", summary.avg.apg], ["VAL", summary.avg.val], ["GP", summary.avg.gp], ["Finish", "#" + summary.standing]].map(([l, v]) => `<div><small>${l}</small><b class="led">${v}</b></div>`).join("")}</div>
      ${summary.awards.length ? `<div class="mc-awards">${summary.awards.map((a) => `<span class="pill">${icon("medal", { size: 13 })} ${esc(a)}</span>`).join("")}</div>` : ""}
      ${summary.allStar ? `<p>${icon("star", { size: 15 })} ${summary.league === "nba" ? "NBA All-Star" : "All-Star"}</p>` : ""}${summary.cupWon ? `<p>${icon("medal", { size: 15 })} State Cup winners</p>` : ""}
      ${summary.euro ? `<p>${icon("globe", { size: 15 })} EuroLeague: ${summary.euro.champion ? "<b>champions!</b>" : summary.euro.f4 ? "Final Four" : `#${summary.euro.rank} of ${summary.euro.of}`} · ${summary.euro.avg.gp} games, ${summary.euro.avg.ppg} PPG</p>` : ""}
      ${summary.league === "el" ? `<p class="muted">A season abroad in the EuroLeague. Individual awards are only given in the Winner League here.</p>` : ""}
      ${summary.summerLeague ? `<p>${icon("star", { size: 15 })} <b>NBA Summer League invite.</b> Scouts saw this season: NBA offers can now come from overall 88.</p>` : ""}
      <h3>Summer development (age ${C.age})</h3>
      ${devReportHtml(dev)}
      <p class="muted">Income after agent fee: ${money(summary.income)}</p>
      <button class="btn primary" id="mc-next">${icon("arrowRight", { size: 15 })} To the off-season</button></div>`;
    const go = () => { closeModal(d); tab = "train"; draw(); const call = nationalCallup(C); if (call) afterBack(() => showCallup(call)); };
    d.querySelector(".profile-close").addEventListener("click", go);
    d.querySelector("#mc-next").addEventListener("click", go);
    openModal(d);
    if (C.age >= 40) { toast("At 40, it's time: your career ends."); doRetire(); }
  }

  // ---------------------------------------------------------------- the national team
  /** Run fn once the history step of a just-closed window has landed (it would close the next window otherwise). */
  function afterBack(fn) {
    let done = false;
    const run = () => { if (done) return; done = true; removeEventListener("popstate", run); setTimeout(fn, 60); };
    addEventListener("popstate", run);
    setTimeout(run, 900);
  }
  async function showCallup(call) {
    const t = ntTeam(call.team);
    let N = null;
    try { N = await loadNational(); } catch { /* the teammates list needs the data; the call-up works without it */ }
    const mates = teammates(C, call, N);
    const d = modal("National team call-up");
    d.dataset.locked = "1";
    d.innerHTML = html`<div class="profile mc-event nt-call"><small class="muted">NATIONAL TEAM · SUMMER ${call.year}</small>
      <h2 class="nt-title">${ntBadge(t, 44)} ${esc(t.name)} calls you up!</h2>
      <p class="nt-event"><b>${esc(call.event.name)}</b></p>
      <p><span>The coach wants you for the summer games.</span> <span>Expected role:</span> <b>${roleName(call.role)}</b>. <span>${esc(t.name)} is #${t.rank} in the FIBA world ranking.</span></p>
      ${call.newCaptain ? `<p class="mc-dev-flag good">${icon("star", { size: 16 })} <span>The coach is giving you the captain's armband.</span></p>` : call.captain ? `<p class="muted"><span>You'll lead the team as captain.</span></p>` : ""}
      ${mates.names.length ? html`<p class="muted" style="font-size:13px;margin-bottom:4px">${mates.source === "roster" ? "Your teammates (the real 2025 roster):" : mates.source === "league" ? `Your teammates: the best Israeli players in the league in ${esc(mates.season)}.` : "Your teammates: the best Israeli players in the latest league season in the data."}</p>
        <p class="nt-mates">${mates.names.map((n) => `<span>${esc(n)}</span>`).join("")}</p>` : ""}
      <p class="muted" style="font-size:12px"><span>Opponents come from the same FIBA zone, with strengths from the 2026 world ranking.</span>${call.year < 2025 ? ` <span>A simulation, not that year's real tournament.</span>` : ""}</p>
      <div class="mc-choices"><button class="btn primary" data-nt="go">${icon("flag", { size: 15 })} Join the national team</button>
        <button class="btn" data-nt="no">Rest this summer instead</button></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Joining: popularity, and a development boost next summer, but more minutes on your legs. Saying no costs some popularity.</p></div>`;
    d.querySelector('[data-nt="go"]').addEventListener("click", () => {
      if (call.event?.kind === "championship") { startTournament(C, call, N); save(); closeModal(d); sound.play("win"); afterBack(() => draw()); return; }
      const r = playNationalSummer(C, call); save(); sound.play(r.w >= r.l ? "win" : "place"); emit("mc:national", { caps: C.national.caps }); draw(); showNationalResults(r);
    });
    d.querySelector('[data-nt="no"]').addEventListener("click", () => { declineCallup(C, call); save(); closeModal(d); toast("You stayed home this summer"); draw(); });
    openModal(d);
    d.querySelector('[data-nt="go"]').focus();
  }
  /** A national team's kit colours: the two main colours of its flag (cached). */
  const flagCache = new Map();
  function flagColors(t) {
    if (!t.iso) return Promise.resolve(clubColors(t.id));
    if (flagCache.has(t.iso)) return flagCache.get(t.iso);
    const p = new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = 48; c.height = 32;
          const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, 48, 32);
          const d = g.getImageData(0, 0, 48, 32).data, count = new Map();
          for (let i = 0; i < d.length; i += 4) { const k = [d[i], d[i + 1], d[i + 2]].map((v) => Math.round(v / 32) * 32).join(","); count.set(k, (count.get(k) || 0) + 1); }
          const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k.split(",").map(Number));
          const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 120;
          const first = top[0], second = top.find((x) => far(x, first)) || [255, 255, 255];
          const hex = (x) => "#" + x.map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("");
          res([hex(first), hex(second)]);
        } catch { res(clubColors(t.id)); }
      };
      img.onerror = () => res(clubColors(t.id));
      img.src = `flags/${t.iso}.svg`;
    });
    flagCache.set(t.iso, p);
    return p;
  }
  /** A championship with the national team, game by game (like the league). */
  function drawNational() {
    const T = C.ntCur, t = ntTeam(T.call.team), nx = ntNext(C), o = nx ? ntTeam(nx.opp) : null;
    const w = T.games.filter((g) => g.won).length, l = T.games.length - w;
    root.innerHTML = html`${header()}
      <div class="mc-grid">
        <div class="card pad mc-next nt-tourney">
          <small class="muted">NATIONAL TEAM · SUMMER ${T.call.year}</small>
          <h2 class="nt-title">${ntBadge(t, 40)} ${esc(t.name)} · ${esc(T.ev.name)}</h2>
          <p class="muted">${T.stage === "group" ? "Group stage: three wins in five games go through." : T.stage === "bronze" ? "The bronze-medal game." : "Knockout: lose and you're out."} <span>${w}-${l} so far.</span></p>
          ${nx ? html`<small class="muted">${esc(nx.stage)}${nx.n ? ` · game ${nx.n} of ${nx.of}` : ""}</small>
            <div class="mc-vs">${ntBadge(t, 40)}<b>${esc(t.name)}</b><span class="muted">vs</span><b>${esc(o.name)}</b>${ntBadge(o, 40)}</div>
            <div class="row" style="justify-content:center;flex-wrap:wrap">
              <button class="btn primary big-btn" id="nt-play">${icon("play", { size: 16 })} Play the game</button>
              <button class="btn" id="nt-sim">${icon("skip", { size: 15 })} Simulate the rest</button>
              <label class="mc-live-tg"><input type="checkbox" id="nt-live" ${liveOn() ? "checked" : ""}> Watch games live</label>
            </div>` : ""}
          <p class="muted" style="font-size:12px"><span>There are no national-team statistics in the data: players' numbers in these games are estimates from each team's strength (the 2026 FIBA world ranking) and their position. Names are real where the data has them.</span></p>
        </div>
        <div class="card pad"><h3>${icon("calendar")} Games</h3>
          ${T.games.length ? html`<div class="grid-wrap"><table class="stat-table"><thead><tr><th>Stage</th><th>Opponent</th><th>Score</th><th>Min</th><th>Pts</th><th>Reb</th><th>Ast</th></tr></thead>
            <tbody>${T.games.map((g) => { const ot = ntTeam(g.opp); return `<tr><td><small>${esc(g.stage)}</small></td><td><span class="nt-team">${ntBadge(ot, 22)} ${esc(ot.name)}</span></td><td><b class="${g.won ? "good-text" : "bad-text"}">${g.won ? "W" : "L"}</b> ${g.my}-${g.their}</td>${g.line.dnp ? `<td colspan="4" class="muted">Did not play</td>` : `<td>${g.line.min}</td><td>${g.line.pts}</td><td>${g.line.reb}</td><td>${g.line.ast}</td>`}</tr>`; }).join("")}</tbody></table></div>`
            : `<p class="muted">The tournament starts with the group stage: five games.</p>`}
        </div>
      </div>`;
    const done = (r) => {
      sound.play(/Gold|Silver|Bronze/.test(r.summary.finish || "") ? "victory" : r.summary.w >= r.summary.l ? "win" : "place");
      if (/Gold/.test(r.summary.finish || "")) confetti(4000);
      emit("mc:national", { caps: C.national.caps });
      save(); draw(); showNationalResults(r.summary);
    };
    root.querySelector("#nt-live")?.addEventListener("change", (e) => store.set("mc:live", e.target.checked), { signal });
    root.querySelector("#nt-play")?.addEventListener("click", async () => {
      const r = playNtGame(C);
      if (!r) return;
      save();
      const after = () => (r.done ? done(r) : drawNational());
      if (!liveOn()) { toast(`${r.g.won ? "Win" : "Loss"} ${r.g.my}-${r.g.their} · ${r.g.line.pts} pts`); return after(); }
      const ot = ntTeam(r.g.opp);
      const [mc, oc] = await Promise.all([flagColors(t), flagColors(ot)]);
      openGameView({ home: { name: t.name, color: mc[0], colors: mc }, away: { name: ot.name, color: oc[0], colors: oc }, sim: ntSim(r.T, C.name, r.g, true),
        label: `${T.ev.name} · ${r.g.stage}`, start: "live", meId: "me", celebrate: r.g.won ? 0 : null, onClose: () => afterBack(after) });
    }, { signal });
    root.querySelector("#nt-sim")?.addEventListener("click", () => {
      let r = null, guard = 0;
      while (C.ntCur && guard++ < 20) r = playNtGame(C);
      if (r?.done) done(r); else drawNational();
    }, { signal });
  }
  function showNationalResults(r) {
    const t = ntTeam(r.team);
    const d = modal("National team summer");
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile mc-review"><small class="muted">NATIONAL TEAM · SUMMER ${r.year}</small>
      <h2 class="nt-title">${ntBadge(t, 40)} ${esc(t.name)} · ${r.w}-${r.l}</h2>
      <p class="nt-event"><b>${esc(r.event || "")}</b>${r.finish ? ` · <span class="${/Gold/.test(r.finish) ? "nt-gold" : /Silver/.test(r.finish) ? "nt-silver" : /Bronze/.test(r.finish) ? "nt-bronze" : ""}">${/medal/.test(r.finish) ? "🏅 " : ""}${esc(r.finish)}</span>` : ""}${r.captain ? ` · <span>Captain</span>` : ""}</p>
      <div class="grid-wrap"><table class="stat-table"><thead><tr><th>Stage</th><th>Opponent</th><th>Score</th><th>Min</th><th>Pts</th><th>Reb</th><th>Ast</th></tr></thead>
        <tbody>${r.games.map((g) => { const o = ntTeam(g.opp); return `<tr><td><small>${esc(g.stage || "")}</small></td><td><span class="nt-team">${ntBadge(o, 22)} ${esc(o.name)} <small class="muted">#${o.rank}</small></span></td><td><b class="${g.won ? "good-text" : "bad-text"}">${g.won ? "W" : "L"}</b> ${g.my}-${g.their}</td>${g.line.dnp ? `<td colspan="4" class="muted">Did not play</td>` : `<td>${g.line.min}</td><td>${g.line.pts}</td><td>${g.line.reb}</td><td>${g.line.ast}</td>`}</tr>`; }).join("")}</tbody></table></div>
      <p class="muted" style="font-size:13px"><span>Career with ${esc(t.name)}: ${C.national.caps} games, ${C.national.pts} points.</span> <span>Next summer's development gets a boost.</span></p>
      <p class="muted" style="font-size:12px">Results are a simulation: opponents' strengths come from the 2026 FIBA world ranking.</p>
      <button class="btn primary" id="nt-ok">${icon("check", { size: 15 })} Back to the off-season</button></div>`;
    const close = () => closeModal(d);
    d.querySelector(".profile-close").addEventListener("click", close);
    d.querySelector("#nt-ok").addEventListener("click", close);
    if (!d.open) openModal(d); // the same window as the call-up: it stays open with the results
    d.querySelector("#nt-ok").focus();
  }

  function drawSeason() {
    const S = C.cur, nx = nextOpp();
    const avg = E.averages(S.games);
    const out = S.phase === "playoffs" && S.playoffs?.out;
    root.innerHTML = html`${header()}
      ${tabs(tab)}
      ${tab === "season" ? html`<div class="mc-grid">
        <div style="display:grid;gap:14px;align-content:start">
          <div class="card pad mc-next">
            ${C.injury ? `<p class="bad-text">${icon("heart", { size: 15 })} Injured: ${esc(C.injury.name)}, ${C.injury.games} game${C.injury.games === 1 ? "" : "s"} to go.</p>` : ""}
            ${nx && !nx.bye ? html`<small class="muted">${esc(nx.label)}</small>
              <div class="mc-vs">${crestSvg(S.team, teamName(S.team), 40)}<b>${esc(teamName(S.team))}</b><span class="muted">${nx.home === false ? "at" : "vs"}</span><b>${esc(teamName(nx.opp))}</b>${crestSvg(nx.opp, teamName(nx.opp), 40)}</div>` : nx?.bye ? `<p class="muted">${esc(nx.label)}</p>` : ""}
            <div class="row" style="justify-content:center;flex-wrap:wrap">
              ${S.phase === "regular" ? `<button class="btn primary big-btn" id="mc-play">${icon("play", { size: 16 })} ${nx?.bye ? "Next round" : "Play the game"}</button>${!nx?.bye && E.canRest(C) ? `<button class="btn" id="mc-rest" title="Sit this game out: fresher legs and fewer injuries for a few games, but the coach notices (more each time)">${icon("pause", { size: 15 })} Rest this game${C.cur.rests ? ` <small>(${C.cur.rests} so far)</small>` : ""}</button>` : ""}<button class="btn" id="mc-sim">${icon("skip", { size: 15 })} Simulate to the playoffs</button>` : ""}
              ${S.phase === "playoffs" && !out ? `<button class="btn primary big-btn" id="mc-po">${icon("play", { size: 16 })} Play playoff game</button>` : ""}
              ${!out && !C.injury ? `<label class="mc-live-tg"><input type="checkbox" id="mc-live" ${liveOn() ? "checked" : ""}> Watch games live</label>` : ""}
              ${S.phase === "playoffs" && out ? `<p class="muted">${S.playoffs.outAt === -1 ? "You missed the playoffs." : "You're out of the playoffs."}</p><button class="btn primary" id="mc-finish">${icon("skip", { size: 15 })} Finish the season</button>` : ""}
            </div>
          </div>
          ${ledHtml(lastGame)}
        </div>
        <div style="display:grid;gap:14px;align-content:start">
          <div class="card pad"><h3>${icon("chart")} ${S.label} so far</h3>
            <div class="mc-review-stats">${[["GP", avg.gp], ["MIN", avg.min], ["PPG", avg.ppg], ["RPG", avg.rpg], ["APG", avg.apg], ["VAL", avg.val]].map(([l, v]) => `<div><small>${l}</small><b class="led">${v}</b></div>`).join("")}</div>
            <p class="muted" style="font-size:12px;margin:8px 0 0">Team strength ${S.base ?? "–"}${S.boost ? ` → ${r1(S.base + S.boost)} with you (${S.boost > 0 ? "+" : ""}${S.boost})` : ""}${S.coachChanges ? ` · coach changes this season: ${S.coachChanges}` : ""}</p>
            <p class="muted" style="font-size:12px;margin:4px 0 0">FG ${avg.fg ?? "–"}% · 3P ${avg.tp ?? "–"}% · FT ${avg.ft ?? "–"}% ${S.cup.none ? "" : ` · State Cup: ${S.cup.winner ? (S.cup.winner === S.team ? "won!" : "out") : S.cup.alive ? `round ${S.cup.round + 1}` : "out"}`}${S.allStar ? ` · All-Star: ${S.allStar.picked ? "selected" : "not selected"}` : ""}</p></div>
          ${euroCard(S)}
          <div class="card pad"><h3>${icon("calendar")} Schedule</h3>${scheduleGrid(S)}
            <p class="muted" style="font-size:12px;margin:8px 0 0">Tap a played game to see its scoreboard.</p></div>
          <div class="card pad">${depthHtml(S.label, S.team)}</div>
          ${C.log.length ? `<div class="card pad"><h3>${icon("info")} News</h3><ul class="clean mc-news">${C.log.slice(0, 6).map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </div>` : tab === "table" ? tableHtml() : tab === "train" ? `<div class="card pad">${trainHtml()}</div>` : tab === "career" ? careerHtml() : trophiesHtml()}`;
    bindTabs(drawSeason);
    bindTrain(drawSeason);
    root.querySelector("#mc-play")?.addEventListener("click", () => play(() => E.playRound(C), { live: true }), { signal });
    root.querySelector("#mc-rest")?.addEventListener("click", () => { play(() => E.playRound(C, { rest: true })); toast("You sat this one out: fresher legs for the next few games"); }, { signal });
    root.querySelector("#mc-live")?.addEventListener("change", (e) => store.set("mc:live", e.target.checked), { signal });
    bindMomentum(root.querySelector(".mc-led .mc-momentum"), lastGame, signal);
    root.querySelector("#mc-sim")?.addEventListener("click", () => play(() => { const all = { games: [] }; let guard = 0; while (C.cur.phase === "regular" && guard++ < 120) { const o = E.playRound(C); all.games.push(...o.games); if (o.cup) all.cup = o.cup; if (o.allStar) all.allStar = o.allStar; if (C.injury?.pending) E.treatInjury(C, false); } return all; }), { signal });
    root.querySelector("#mc-po")?.addEventListener("click", () => play(() => ({ games: E.playPlayoffDay(C) }), { live: true }), { signal });
    root.querySelector("#mc-finish")?.addEventListener("click", () => { E.simPlayoffs(C); finishSeason(); }, { signal });
    root.querySelector("#mc-box")?.addEventListener("click", () => openBox(lastGame), { signal });
    root.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { lastGame = S.games[Number(b.dataset.g)]; drawSeason(); root.querySelector(".mc-led")?.scrollIntoView({ block: "nearest" }); }, { signal }));
    root.querySelectorAll(".mc-led [data-count]").forEach((el) => countUp(el, Number(el.dataset.count), 0, 700));
  }

  /** Who you're competing with for minutes at your position group. */
  function depthHtml(label, tid) {
    const dc = E.depthChart(C, label, tid);
    const nbaTeam = E.isNba(label, tid);
    const rows = dc.rivals.map((ps) => ({ name: E.playerName(ps.player_id), pid: ps.player_id, wl: playersById.has(ps.player_id), nba: E.isNbaPlayer(ps.player_id), r: ps.rating_mock, foreign: !dc.abroad && !E.isIsraeliPlayer(ps.player_id) }));
    rows.splice(dc.rank, 0, { me: true, name: C.name, r: Math.round(dc.myScore), foreign: !dc.abroad && C.nat !== "Israel" });
    return html`<h3>${icon("users")} Depth chart · ${E.FAM_NAMES[dc.fam]} at ${esc(teamName(tid))}</h3>
      <ol class="mc-depth">${rows.slice(0, 7).map((x, i) => `<li class="${x.me ? "me" : ""}"><span>${i + 1}</span>${x.me ? `<b>${esc(x.name)} (you)</b>` : x.wl ? `<button class="link-name" data-profile="${x.pid}">${esc(x.name)}</button>` : x.nba ? esc(x.name) : `<a class="link-name" href="#/euroleague/player/${esc(x.pid)}">${esc(x.name)}</a>`}${x.foreign ? ` <small class="muted">foreign</small>` : ""}<b class="led">${x.r}</b></li>`).join("")}</ol>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Your number includes coach trust, chemistry${C.nat === "Israel" && !dc.abroad ? " and the Israeli-player edge" : ""}.${nbaTeam ? ` NBA roster: real players of that season, ratings moved onto the Winner League scale.` : dc.abroad ? ` EuroLeague roster; its ratings are placeholder data, rescaled to the Winner League.` : ""}${dc.foreign ? ` Foreign players on the roster: ${dc.foreigners} (minutes for ${E.FOREIGN_LIMIT}).${dc.slotOk ? "" : " <b>You're not among the top foreigners yet: bench.</b>"}` : ""}</p>`;
  }
  /** Signing ceremony: the contract, a signature, and the first photo in the new jersey. */
  function ceremony(o) {
    const [c1, c2] = clubColors(o.team);
    const toHex = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; return x.fillStyle; };
    const jersey = `<span class="avatar-chip player ct-av" style="--av:${c1};width:150px;height:150px">${playerAvatarSvg({ ...av(), j1: toHex(c1), j2: toHex(c2) }, c1)}</span>`;
    const d = modal("Contract signed");
    const three = want3D();
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile">${contractHtml(C, o, money, three ? `<div class="stage-box sign-box" id="ct-3d"></div>` : jersey, E.seasonLabel(C.debut, C.seasonNo))}
        <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" id="ct-go">${icon("arrowRight", { size: 15 })} Let's go</button></div></div>`;
    const close = () => closeModal(d);
    d.querySelector(".profile-close").addEventListener("click", close);
    d.querySelector("#ct-go").addEventListener("click", close);
    openModal(d);
    if (three) {
      const ctl = new AbortController();
      d.addEventListener("close", () => ctl.abort(), { once: true });
      scenes3d().then(({ signingScene }) => signingScene(d.querySelector("#ct-3d"), { ...body3d(), colors: [cssHex(c1), cssHex(c2)], club: o.name, nba: !!o.nba, signal: ctl.signal }))
        .catch(() => { const b = d.querySelector("#ct-3d"); if (b) b.outerHTML = jersey; });
    }
    setTimeout(() => { confetti(1800); sound.play("place"); }, 900);
    d.querySelector("#ct-go").focus();
  }


  function tableHtml() {
    const S = C.cur, abroad = S.league === "el", nba = S.league === "nba";
    return html`<div class="mc-stack">
      <div class="card pad" style="min-width:0"><h2>${icon(abroad || nba ? "globe" : "chart")} ${abroad ? "EuroLeague " : nba ? "NBA " : ""}${S.label} standings${S.simulated ? ` <span class="muted" style="font-size:14px">(simulated season)</span>` : ""}</h2>
        ${standings(S)}
        <p class="muted" style="font-size:12px">▲▼ change since the last round. ${nba ? "One game against every team. The top 16 make the playoffs, best of seven in every round. Teams and rosters are the real NBA of that season, ratings on the Winner League scale." : abroad ? `The top 8 make the playoffs (best of five); the winners go to a one-game Final Four. ${esc(MOCK_NOTE)} Team strengths are rescaled to the Winner League.` : "The top 8 (highlighted) make the playoffs, best of three. Team strengths come from each club's real roster that season."}</p></div>
      <div class="card pad" style="min-width:0"><h2>${icon("trophy")} ${abroad ? "Playoffs & Final Four" : "Playoffs"}</h2>
        ${S.playoffs ? bracket(S, abroad ? ["Playoffs", "Final Four semis", "Final"] : nba ? (S.playoffs.need?.length === 4 ? ["First round", "Second round", "Semi-finals", "NBA Finals"] : ["First round", "Semi-finals", "NBA Finals"]) : undefined) : `<p class="muted">The bracket appears when the regular season ends. Finish in the top 8 to get in.</p>`}</div>
      ${S.el ? html`<div class="card pad" style="min-width:0"><h2>${icon("globe")} EuroLeague ${S.el.season}</h2>
        ${euroTableHtml(S.el, S.team, 99)}
        ${S.el.f4 ? `<p><b>Final Four:</b> ${S.el.f4.teams.map((t) => esc(teamName(t))).join(", ")} · champion <b>${esc(teamName(S.el.champion))}</b></p>` : `<p class="muted" style="font-size:12px">One game against every club, spread over the league season. The top four go to the Final Four when the league's regular season ends.</p>`}
        <p class="muted" style="font-size:12px">${esc(MOCK_NOTE)} EuroLeague strengths are rescaled to the Winner League through clubs that play in both.</p></div>` : ""}
    </div>`;
  }
  function euroTableHtml(el, me, limit = 8) {
    const rows = E.euroTable(el);
    const mine = rows.findIndex((t) => t.id === me);
    const shown = rows.slice(0, limit);
    if (mine >= limit) shown.push(rows[mine]);
    return `<table class="stat-table mc-table2"><thead><tr><th>#</th><th>Club</th><th>W</th><th>L</th><th>+/-</th></tr></thead><tbody>${shown.map((r) => {
      const i = rows.indexOf(r);
      return `<tr class="${r.id === me ? "me-row" : ""} ${i < 4 ? "po" : ""} ${i === 3 ? "cut" : ""}"><td>${i + 1}</td><td><span class="tm">${crestSvg(r.id, r.name, 20)} ${esc(r.name)}</span></td><td><b>${r.w}</b></td><td>${r.l}</td><td>${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`;
    }).join("")}</tbody></table>`;
  }
  /** The EuroLeague campaign of your Israeli club, on the season tab. */
  function euroCard(S) {
    if (!S.el && S.league === "nba") return `<div class="card pad eu-card"><h3>${icon("globe")} A season in the NBA</h3><p class="muted" style="margin:0">${esc(teamName(S.team))}: ${S.schedule.length} games, one against every team, then the playoffs. Teammates and opponents are the real NBA rosters of that season.</p></div>`;
    if (!S.el) return S.league === "el" ? `<div class="card pad eu-card"><h3>${icon("globe")} A season abroad</h3><p class="muted" style="margin:0">${esc(teamName(S.team))} play the EuroLeague: ${S.schedule.length} rounds, then the playoffs and a one-game Final Four. Teammates and opponents are the real rosters of that EuroLeague season. ${esc(MOCK_NOTE)}</p></div>` : "";
    const rows = E.euroTable(S.el), mine = rows.findIndex((t) => t.id === S.team);
    const r = S.el.standings[S.team];
    return html`<div class="card pad eu-card"><div class="row"><h3 style="margin:0">${icon("globe")} EuroLeague ${S.el.season}</h3><span class="spacer"></span><a class="btn ghost sm" href="#/euroleague/season/${S.el.season}">Clubs</a></div>
      <p style="margin:8px 0">${r.w}-${r.l} · <b>#${mine + 1}</b> of ${rows.length} · round ${S.el.round} of ${S.el.schedule.length}${S.el.f4 ? ` · champion: <b>${esc(teamName(S.el.champion))}</b>` : ""}</p>
      ${euroTableHtml(S.el, S.team, 4)}
      <p class="muted" style="font-size:12px;margin:6px 0 0">Played between league rounds. The top four reach the Final Four. ${esc(MOCK_NOTE)}</p></div>`;
  }

  // ---------------------------------------------------------------- career & legacy
  function recordRank(cat, mine) {
    const list = leaders(cat, {}, 5000, { player_seasons: db.player_seasons, players: playersById }); // the Winner League's records, whatever league is chosen
    const rank = list.filter((r) => r.value > mine).length + 1;
    return { rank, top: list[0] };
  }
  function careerHtml() {
    const pro = C.history.filter((h) => h.pro);
    const t = C.totals;
    const recs = [["pts", "Points", t.pts], ["reb", "Rebounds", t.reb], ["ast", "Assists", t.ast], ["stl", "Steals", t.stl], ["blk", "Blocks", t.blk], ["gp", "Games", t.gp]];
    const bestSeason = pro.filter((h) => h.league !== "el").reduce((b, h) => (!b || h.avg.ppg > b.avg.ppg ? h : b), null);
    return html`<div class="mc-grid">
      <div class="card pad" style="min-width:0"><div class="row"><h2 style="margin:0">${icon("clock")} Career</h2><span class="spacer"></span><button class="btn" data-share-card>${icon("camera", { size: 15 })} Share career card</button></div>
        ${pro.length ? `<div class="grid-wrap"><table class="stat-table"><thead><tr><th>Season</th><th>Team</th><th>Age</th><th>Role</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>VAL</th><th>OVR</th><th>Europe</th></tr></thead>
          <tbody>${pro.map((h) => `<tr><td>${h.season}${h.simulated ? "*" : ""}</td><td>${esc(teamName(h.team))}${h.loan ? " (loan)" : ""}</td><td>${h.age}</td><td>${roleName(h.role)}</td><td>${h.avg.gp}</td><td>${h.avg.ppg}</td><td>${h.avg.rpg}</td><td>${h.avg.apg}</td><td>${h.avg.val}</td><td><b>${h.overall}</b></td><td>${h.league === "nba" ? `<span class="pill eu-pill">NBA${h.title ? " · 🏆" : ""}</span>` : h.league === "el" ? `<span class="pill eu-pill">EuroLeague club</span>` : h.euro ? (h.euro.champion ? "🏆 Champion" : h.euro.f4 ? "Final Four" : `#${h.euro.rank}`) : "–"}</td></tr>`).join("")}</tbody></table></div>
          <p class="muted" style="font-size:12px">* simulated season (after ${E.LAST_REAL}, rosters based on ${E.LAST_REAL}).</p>` : `<p class="muted">No pro seasons yet.</p>`}
      </div>
      <div style="display:grid;gap:16px;align-content:start"><div class="card pad"><h3>${icon("trophy")} Against the real records</h3>
        <p class="muted" style="font-size:13px;margin-top:0">Your Winner League totals ranked among every real player since 2010-11 (regular season).${C.elTotals?.gp ? ` In Europe: ${C.elTotals.gp} EuroLeague games, ${C.elTotals.pts.toLocaleString()} points.` : ""}</p>
        <ul class="clean mc-recs">${recs.map(([cat, l, v]) => { const r = recordRank(cat, v); return `<li><span>${l}</span><b>${v.toLocaleString()}</b><span class="${r.rank === 1 ? "good-text" : "muted"}">#${r.rank}${r.rank === 1 ? " · all-time record!" : ` · record ${Math.round(r.top.value).toLocaleString()} (${esc(playersById.get(r.top.pid)?.name || "")})`}</span></li>`; }).join("")}</ul>
        ${bestSeason ? (() => { const r = recordRank("sppg", bestSeason.avg.ppg); return `<p style="font-size:14px">Best scoring season: <b>${bestSeason.avg.ppg} PPG</b> (${bestSeason.season}) · would rank <b>#${r.rank}</b> among real single seasons.</p>`; })() : ""}
      </div>
      ${C.national?.summers?.length ? (() => { const t = ntTeam(C.national.team); return html`<div class="card pad"><h3><a class="nt-team" href="#/nt/${t.id}">${ntBadge(t, 24)} ${esc(t.name)} national team</a></h3>
        <p style="margin:0 0 8px"><b>${C.national.caps}</b> games · <b>${C.national.pts}</b> points · ${C.national.reb} rebounds · ${C.national.ast} assists</p>
        ${C.national.medals?.length || C.national.captain || C.national.best ? html`<div class="nt-honours">
          ${(C.national.medals || []).map((m) => `<span class="pill nt-${m.medal.toLowerCase()}">🏅 <span>${esc(m.medal)}</span> · ${esc(m.event)}</span>`).join("")}
          ${C.national.captain ? `<span class="pill">${icon("star", { size: 12 })} <span>Captain since ${C.national.captain}</span></span>` : ""}
          ${(C.national.milestones || []).map((m) => `<span class="pill"><span>${m} caps</span></span>`).join("")}
        </div>
        ${C.national.best ? `<p class="muted" style="font-size:13px;margin:6px 0"><span>Best game: ${C.national.best.pts} points against ${esc(ntTeam(C.national.best.opp)?.name || "")}</span> <span>(${esc(C.national.best.event)})</span></p>` : ""}` : ""}
        <ul class="clean mc-news">${C.national.summers.slice().reverse().map((s) => `<li>${s.declined ? `<span class="muted">Summer ${s.year}: turned down the call-up</span>` : `<b>${esc(s.event || `Summer ${s.year}`)}</b> <span class="muted">${s.w}-${s.l}${s.finish ? ` · ${esc(s.finish)}` : ""} · ${roleName(s.role)}${s.captain ? " · captain" : ""}</span>`}</li>`).join("")}</ul></div>`; })() : ""}
      <div class="card pad"><h3>${icon("heart")} Injury history</h3>
        ${(C.injuries || []).length ? `<ul class="clean mc-news">${C.injuries.slice().reverse().map((i) => `<li><b>${esc(i.name)}</b> <span class="muted">${i.season || ""} · age ${i.age} · ${i.games} games</span></li>`).join("")}</ul>` : `<p class="muted">Clean bill of health.</p>`}
        <p class="muted" style="font-size:13px;margin:8px 0 0">Career earnings (net, after expenses): ${money(C.money)}</p>
        <p class="muted" style="font-size:13px;margin:4px 0 0"><span>Work ethic: ${E.workLabel(C.work ?? 55)}</span> · <span>${Math.round(C.mileage || 0).toLocaleString("en-US")} career minutes on the legs</span>${Object.keys(E.STAFF).some((k) => C.staff?.[k]) ? ` · <span>Staff: ${Object.keys(E.STAFF).filter((k) => C.staff?.[k]).map((k) => E.STAFF[k].name).join(", ")}</span>` : ""}</p></div>
      </div>
    </div>`;
  }
  function trophiesHtml() {
    const count = (type) => C.trophies.filter((x) => x.type === type).length;
    const score = E.hallOfFameScore(C);
    const ms = C.milestones;
    const MS = [["debut", "Pro debut"], ["pts20", "20-point game"], ["pts30", "30-point game"], ["pts40", "40-point game"], ["dd", "Double-double"], ["td", "Triple-double"], ["k1", "1,000 career points"]];
    return html`<div class="mc-grid">
      <div class="card pad"><h2>${icon("trophy")} Trophy cabinet</h2>
        ${want3D() && cabinetItems().length ? `<div class="stage-box cabinet-box" id="mc-cabinet3d"></div><p class="muted" style="font-size:12px;margin:4px 0 10px">Drag to turn the cabinet.</p>` : ""}
        <div class="mc-cabinet">${Object.entries(TROPHY).map(([k, [ic, l]]) => `<div class="mc-trophy ${count(k) ? "got" : ""}">${icon(ic, { size: 34 })}<b class="led">${count(k)}</b><small>${l}</small></div>`).join("")}
          <div class="mc-trophy ${C.awards.length ? "got" : ""}">${icon("medal", { size: 34 })}<b class="led">${C.awards.length}</b><small>Awards</small></div></div>
        ${C.awards.length ? `<ul class="clean mc-awardlist">${C.awards.slice().reverse().map((a) => `<li>${icon("medal", { size: 13 })} ${esc(a.name)} <span class="muted">${a.season}</span></li>`).join("")}</ul>` : `<p class="muted">Win games, win awards. They'll all live here.</p>`}
      </div>
      <div class="card pad"><h3>${icon("crown")} Hall of Fame</h3>
        <div class="progress xp-bar"><i style="width:${Math.min(100, (score / E.HOF_LINE) * 100)}%"></i></div>
        <p class="muted" style="margin:4px 0 12px">Hall of Fame score ${score} / ${E.HOF_LINE}${C.hof ? " · inducted!" : ""}. Titles, MVPs, All-League teams, All-Star games, awards and career points all count.</p>
        <h3>${icon("flag")} Milestones</h3>
        <ul class="clean mc-ms">${MS.map(([k, l]) => `<li class="${ms[k] ? "got" : ""}">${icon(ms[k] ? "check" : "lock", { size: 14 })} ${l}${ms[k] ? ` <span class="muted">${ms[k]}</span>` : ""}</li>`).join("")}</ul>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- retirement
  function doRetire() {
    const r = E.retire(C);
    emit("mc:retire", { hof: r.hof, legends: r.legends.length, seasons: C.history.filter((h) => h.pro).length, pts: C.totals.pts });
    save(); if (r.hof) confetti(5000); sound.play("victory");
    tab = "career"; draw();
  }
  function drawRetired() {
    const pro = C.history.filter((h) => h.pro);
    root.innerHTML = html`<div class="card pad mc-retired">
        ${face(120)}
        <small class="muted">${pro.length} SEASONS · ${C.totals.gp} GAMES · ${C.totals.pts.toLocaleString()} POINTS</small>
        <h1>${esc(C.name)}</h1>
        <p>${C.hof ? `${icon("crown", { size: 18 })} <b>Hall of Fame</b> · ` : ""}${C.legendOf?.length ? `Jersey retired by ${C.legendOf.map((t) => esc(teamName(t))).join(" and ")} · ` : ""}${plural(C.trophies.filter((x) => x.type === "title").length, "title")} · ${plural(C.awards.filter((a) => a.name === "MVP").length, "MVP")}</p>
        ${C.legendOf?.length ? `<div class="mc-jersey" style="--c:${clubColors(C.legendOf[0])[0]};--c2:${clubColors(C.legendOf[0])[1]}"><span>${esc(C.name.split(" ").pop().toUpperCase())}</span><b>${av().num ?? 7}</b></div>` : ""}
        <button class="btn primary" id="mc-new">${icon("refresh", { size: 15 })} Start a new career</button>
      </div>
      ${tabs(tab === "season" || tab === "table" || tab === "train" ? "career" : tab)}
      ${tab === "trophies" ? trophiesHtml() : careerHtml()}`;
    bindTabs(drawRetired);
    root.querySelector("#mc-new").addEventListener("click", () => {
      const old = C;
      C = null; store.set(KEY, null); view = null; draw();
      undoToast(`${old.name}'s career closed`, () => { C = old; store.set(KEY, old); view = null; tab = "career"; draw(); });
    }, { signal });
  }

  gameKeys(signal, { p: press(root, "#mc-play"),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [String(n), () => { const b = root.querySelectorAll("#mc-tabs [data-tab]")[n - 1]; if (!b) return false; b.click(); }])) });
  draw();
  // the tab closed while a game was on screen: the game counts already, finish it from where you were
  if (C?.pending) {
    const out = C.pending, g = (out.games || out)[0];
    toast("Back to your game");
    if (g?.sim) gameScreen(g, "pregame", () => afterPlay(out)); else afterPlay(out);
  }
}
