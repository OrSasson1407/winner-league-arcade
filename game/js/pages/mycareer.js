// My Career (#/mycareer): create a player, grow up in a club academy, turn pro and play a whole career
// in the Winner League against the real teams of each season.
import { PLAYED_SEASONS, db, playersById, teamName } from "../data.js";
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
import { maybeEvent, resolveEvent } from "../mycareer/events.js";

const KEY = "mc:save";
const NATS = ["Israel", "United States", "Serbia", "Lithuania", "Greece", "France", "Spain", "Nigeria", "Canada", "Argentina", "Croatia", "Ukraine"];
const TROPHY = { title: ["trophy", "Champion"], cup: ["medal", "State Cup"], allstar: ["star", "All-Star"] };
const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;
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

export function renderMyCareer(root, signal) {
  let C = store.get(KEY, null);
  if (C && (C.v || 1) < 2) { // saves from before salaries were in dollars
    C.money = Math.round(C.money / 3.7);
    if (C.contract) C.contract.salary = Math.round(C.contract.salary / 3.7 / 1000) * 1000;
    C.chem ??= {}; C.trustBy ??= {}; C.injuries ??= [];
    C.v = 2;
    store.set(KEY, C);
  }
  let tab = "season", lastGame = null, view = null;
  const save = () => store.set(KEY, C);
  const av = () => C?.av || (getMe().style === "player" ? getMe().av : DEFAULT_AV);
  const face = (size = 64) => `<span class="avatar-chip player mc-face" style="--av:${clubColors(C.club || C.academy.club)[0]};width:${size}px;height:${size}px" aria-hidden="true">${playerAvatarSvg(av(), clubColors(C.club || C.academy.club)[0])}</span>`;

  function draw() {
    if (!C) return drawCreate();
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
        <p>Create a player, grow up in a club academy and play a whole career in the Winner League against the real teams of every season.</p></div></div>
      <div class="mc-create">
        <div class="card pad mc-form">
          <div class="row mc-two"><div class="field"><label for="mc-name">Name</label><input id="mc-name" class="input" maxlength="22" value="${esc(f.name)}" placeholder="Your player's name"></div>
            <div class="field"><label for="mc-nat">Nationality</label><select id="mc-nat" class="input">${NATS.map((n) => `<option ${n === f.nat ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
          <div class="row mc-two"><div class="field"><label>Position</label><div class="seg sm" id="mc-pos">${E.POSITIONS.map((p) => `<button data-v="${p}" class="${p === f.pos ? "on" : ""}" aria-pressed="${p === f.pos}">${p}</button>`).join("")}</div></div>
            <div class="field"><label>Second position</label><div class="seg sm" id="mc-pos2">${E.POSITIONS.map((p) => `<button data-v="${p}" class="${p === f.pos2 ? "on" : ""}" aria-pressed="${p === f.pos2}">${p}</button>`).join("")}</div></div></div>
          <div class="field"><label for="mc-h">Height: <b>${(f.height / 100).toFixed(2)} m</b></label><input id="mc-h" type="range" min="175" max="222" value="${f.height}" class="mc-range">
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
          <p class="muted" style="margin:0">${f.pos}/${f.pos2} · ${(f.height / 100).toFixed(2)} m · ${esc(f.nat)} · age 16</p>
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
    $("#mc-h").addEventListener("input", (e) => { root.querySelector("label[for=mc-h] b").textContent = `${(e.target.value / 100).toFixed(2)} m`; }, { signal });
    root.querySelector(".mc-alloc").addEventListener("click", (e) => { const b = e.target.closest("[data-al]"); if (!b) return; const k = b.dataset.al; f.alloc[k] = Math.max(0, (f.alloc[k] || 0) + Number(b.dataset.d)); redraw(); }, { signal });
    $("#mc-debut").addEventListener("change", (e) => { f.debut = e.target.value; redraw(); }, { signal });
    $("#mc-acad").addEventListener("change", (e) => { f.academy = e.target.value; redraw(); }, { signal });
    $("#mc-go").addEventListener("click", () => {
      C = E.createPlayer({ ...f, av: getMe().style === "player" ? getMe().av : null });
      view = null; save(); sound.play("place");
      announce(`${C.name} joins the ${teamName(C.academy.club)} academy.`);
      draw();
    }, { signal });
  }

  // ---------------------------------------------------------------- shared header
  function header() {
    const team = C.cur?.team || C.club || C.academy.club;
    const ov = E.bestOverall(C);
    return html`<h1 class="sr-only">My Career: ${esc(C.name)}</h1><div class="card mc-head" style="--club:${clubColors(team)[0]}">
      ${face(72)}
      <div class="mc-id"><small class="muted">${esc(C.pos)}/${esc(C.pos2)} · ${(C.height / 100).toFixed(2)} m · age ${C.age}${C.label ? ` · ${C.label}${C.cur?.simulated ? " (simulated season)" : ""}` : ""}</small>
        <h2 class="mc-name">${esc(C.name)}</h2>
        <span class="mc-club">${crestSvg(team, teamName(team), 22)} ${esc(teamName(team))}${C.loan ? " (on loan)" : C.phase === "academy" ? " academy" : ""}${C.cur ? ` · ${roleName(C.cur.role)}` : ""} <span class="pill mc-nat">${C.nat === "Israel" ? "Israeli" : "Foreign player"}</span></span></div>
      <div class="mc-ovr"><small>OVERALL</small><b class="led">${ov}</b></div>
      <div class="mc-meters">
        <div><small>Coach trust</small><div class="progress"><i style="width:${C.trust}%"></i></div></div>
        <div><small>Popularity</small><div class="progress"><i style="width:${C.pop}%"></i></div></div>
        ${C.phase !== "academy" ? `<div><small>Team chemistry</small><div class="progress"><i style="width:${Math.round(C.chem?.[team] || 0)}%"></i></div></div>` : ""}
        <div class="mc-facts"><span>${icon("coin", { size: 14 })} ${money(C.money)}</span><span>${icon("bolt", { size: 14 })} ${C.tp} TP</span></div>
      </div>
    </div>`;
  }
  const TABS = [["season", "calendar", "Season"], ["table", "chart", "Table"], ["train", "bolt", "Training"], ["career", "clock", "Career"], ["trophies", "trophy", "Trophies"]];
  function tabs(active) {
    return `<div class="seg mc-tabs" id="mc-tabs" role="tablist">${TABS.filter(([k]) => (C.cur || !["season", "table"].includes(k)) && !(C.retired && k === "train")).map(([k, ic, l]) => `<button role="tab" aria-selected="${k === active}" class="${k === active ? "on" : ""}" data-tab="${k}">${icon(ic, { size: 15 })} ${l}</button>`).join("")}</div>`;
  }
  function bindTabs(redraw) {
    root.querySelector("#mc-tabs")?.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; redraw(); } }, { signal });
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
            <button class="mc-pick ${view?.loan ? "on" : ""}" data-v="loan">${icon("arrowRight", { size: 18 })}<b>Go on loan</b><small>More minutes elsewhere: +0.8 to every skill this year.</small></button></div></div>
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
      announce(`Academy season done. ${r.entry.ppg} points per game. Overall ${r.entry.overall}.`);
      draw();
    }, { signal });
    bindTrain(drawAcademy);
  }

  // ---------------------------------------------------------------- training
  function trainHtml(compact = false) {
    const badges = Object.entries(E.BADGES);
    return html`<div class="mc-train">
      <div class="mc-attrs">${Object.entries(E.ATTRS).map(([k, l]) => {
        const v = C.attrs[k], cost = E.trainCost(v), capped = v >= Math.min(99, E.ageCap(C.age));
        return `<div class="mc-attr"><span>${l}</span><div class="progress"><i style="width:${v}%"></i></div><b>${Math.floor(v)}</b>
          <button class="btn" data-train="${k}" ${C.tp < cost || capped ? "disabled" : ""} aria-label="Train ${l} (${cost} TP)">+1 <small>${capped ? "max" : `${cost} TP`}</small></button></div>`;
      }).join("")}</div>
      ${compact ? "" : html`<h3 style="margin-top:14px">${icon("medal")} Badges</h3>
        <div class="mc-badges">${badges.map(([id, b]) => {
          const t = C.badges[id] ?? -1, next = t + 1;
          const need = b.need + next * 6, ok = next <= 2 && C.attrs[b.attr] >= need && C.tp >= E.badgeCost(next);
          return `<div class="mc-badge ${t >= 0 ? "t" + t : ""}"><b>${b.name}${t >= 0 ? ` · ${E.BADGE_TIERS[t]}` : ""}</b><small>${b.desc}</small>
            ${next <= 2 ? `<button class="btn" data-badge="${id}" ${ok ? "" : "disabled"}>${E.BADGE_TIERS[next]} · ${E.badgeCost(next)} TP <small class="muted">(${E.ATTRS[b.attr]} ${need}+)</small></button>` : `<span class="muted">Maxed</span>`}</div>`;
        }).join("")}</div>`}
    </div>`;
  }
  function bindTrain(redraw) {
    root.querySelectorAll("[data-train]").forEach((b) => b.addEventListener("click", () => { if (E.train(C, b.dataset.train)) { save(); sound.play("tick"); const y = scrollY; redraw(); scrollTo(0, y); } }, { signal }));
    root.querySelectorAll("[data-badge]").forEach((b) => b.addEventListener("click", () => {
      if (E.buyBadge(C, b.dataset.badge)) { save(); sound.play("win"); toast(`Badge unlocked: ${E.BADGES[b.dataset.badge].name}`); emit("mc:badge", { id: b.dataset.badge }); const y = scrollY; redraw(); scrollTo(0, y); }
    }, { signal }));
  }

  // ---------------------------------------------------------------- contracts
  function drawOffers() {
    if (!view?.offers) view = { offers: E.makeOffers(C, { homeGrown: C.phase === "turnpro" ? C.academy.club : null }), tried: {} };
    const first = C.phase === "turnpro";
    root.innerHTML = html`${header()}
      <div class="card pad">
        <h2>${icon("clipboard")} ${first ? "Your first pro contract" : "Free agency"}</h2>
        <p class="muted">${first ? `The academy years are over. ${esc(teamName(C.academy.club))} wants to keep its own, and other clubs are calling.` : "Your contract is up. Here's who wants you."} Accept an offer, or try to negotiate (the club may walk away).</p>
        <div class="field"><label>Agent</label><div class="mc-cards" id="mc-agent">${Object.entries(E.AGENTS).map(([k, a]) => `<button class="mc-pick ${C.agent === k ? "on" : ""}" data-v="${k}" aria-pressed="${C.agent === k}"><b>${a.name}</b><small>${a.desc} Fee ${Math.round(a.fee * 100)}%.</small></button>`).join("")}</div></div>
        <div class="mc-offers">${view.offers.map((o, i) => html`<div class="card pad mc-offer ${o.homeGrown ? "home" : ""}">
          <div class="row">${crestSvg(o.team, o.name, 36)}<div><b>${esc(o.name)}</b><small class="muted">${o.homeGrown ? "Your academy club" : o.own ? "Your current club" : ""}${o.loyal ? " · loyalty bonus" : ""}</small></div></div>
          <div class="mc-terms"><span>${money(o.salary)}<small>/season gross</small></span><span>${o.years} yr${o.years > 1 ? "s" : ""}</span><span>${roleName(o.role)}</span></div>
          <small class="muted">≈ ${money(E.netPay(o.salary, C.agent))} net after ~${Math.round(E.taxRate(o.salary) * 100)}% tax and the agent's ${Math.round(E.AGENTS[C.agent].fee * 100)}% · ${E.FAM_NAMES[o.fam] || ""} depth: #${(o.rank ?? 0) + 1}${C.nat !== "Israel" ? ` · ${o.foreigners} foreigners on the roster (minutes for ${E.FOREIGN_LIMIT})` : ""}</small>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn primary" data-sign="${i}">${icon("check", { size: 15 })} Sign</button>
            ${view.tried[i] ? `<span class="muted" style="font-size:12px">${esc(view.tried[i])}</span>` : html`
              <button class="btn" data-neg="${i}" data-more="0.12">Ask +12%</button>
              <button class="btn" data-neg="${i}" data-more="0.25">Ask +25%</button>
              ${o.role !== "starter" ? `<button class="btn" data-neg="${i}" data-more="0.05" data-role="${o.role === "bench" ? "rotation" : "starter"}">Ask for ${o.role === "bench" ? "rotation" : "starter"} minutes</button>` : ""}`}
          </div>
        </div>`).join("")}</div>
      </div>`;
    root.querySelector("#mc-agent").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b || b.dataset.v === C.agent) return;
      C.agent = b.dataset.v; view = null; save(); drawOffers();
    }, { signal });
    root.querySelectorAll("[data-neg]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.neg), o = view.offers[i];
      const res = E.negotiate(C, o, { more: Number(b.dataset.more), role: b.dataset.role || o.role });
      if (res) { view.offers[i] = { ...res }; view.tried[i] = "Deal improved! Sign it while it's on the table."; sound.play("place"); }
      else { view.offers.splice(i, 1); toast(`${o.name} walked away`); sound.play("bad"); if (!view.offers.length) view.offers = E.makeOffers(C).slice(0, 1).map((x) => ({ ...x, salary: Math.round(x.salary * 0.85 / 1000) * 1000 })); }
      drawOffers();
    }, { signal }));
    root.querySelectorAll("[data-sign]").forEach((b) => b.addEventListener("click", () => {
      const o = view.offers[Number(b.dataset.sign)];
      const firstPro = !C.contract;
      E.sign(C, o);
      if (firstPro) emit("mc:pro", {});
      C.phase = "offseason"; view = null; save(); sound.play("win");
      toast(`Signed with ${o.name}: ${money(o.salary)} × ${o.years}`);
      announce(`Signed with ${o.name}.`);
      draw();
    }, { signal }));
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
          ${depthHtml(nextLabel, C.loan?.team || C.contract.team)}
          ${C.injury ? `<p class="bad-text">${icon("heart", { size: 15 })} Still recovering from a ${esc(C.injury.name.toLowerCase())}: about ${C.injury.games} more games.</p>` : ""}
          <div class="field"><label>Summer camp ${view?.camp ? `<span class="muted">(done)</span>` : ""}</label><div class="mc-cards two" id="mc-camp">${Object.entries(E.SUMMER_CAMPS).map(([k, c]) => `<button class="mc-pick" data-v="${k}" ${view?.camp ? "disabled" : ""}><b>${c.name}</b><small>${c.attrs.map((a) => E.ATTRS[a]).join(" & ")} +1 to +3${C.coach ? " (+1 coach)" : ""}</small></button>`).join("")}</div></div>
          <div class="field"><label>Personal coach</label><button class="btn ${C.coach ? "primary" : ""}" id="mc-coach">${icon("whistle", { size: 15 })} ${C.coach ? `Hired (${money(E.COACH_COST)}/season) · fire` : `Hire for ${money(E.COACH_COST)}/season`}</button>
            <small class="muted">More training points after games, and a bigger summer camp.</small></div>
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
    root.querySelector("#mc-camp")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b || view?.camp) return;
      const g = E.summerCamp(C, b.dataset.v);
      view = { ...(view || {}), camp: b.dataset.v }; save();
      toast(Object.entries(g).map(([k, v]) => `${E.ATTRS[k]} +${v}`).join(" · "));
      drawOffseason();
    }, { signal });
    root.querySelector("#mc-coach")?.addEventListener("click", () => { C.coach = !C.coach; save(); drawOffseason(); }, { signal });
    root.querySelector("#mc-loan-go")?.addEventListener("click", () => {
      const t = root.querySelector("#mc-loan").value;
      C.loan = { team: t, season: nextLabel }; save(); emit("mc:loan", {});
      toast(`Loaned to ${teamName(t)} for ${nextLabel}`); drawOffseason();
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
    if (S.phase === "regular") {
      const g = S.schedule[S.round]?.find(([h, a]) => h === S.team || a === S.team);
      return g ? { opp: g[0] === S.team ? g[1] : g[0], home: g[0] === S.team, label: `Round ${S.round + 1} of ${S.schedule.length}` } : { bye: true, label: `Round ${S.round + 1}: no game (bye)` };
    }
    if (S.phase === "playoffs" && S.playoffs && !S.playoffs.out) {
      const s = S.playoffs.series.find((x) => x.a === S.team || x.b === S.team);
      if (s) return { opp: s.a === S.team ? s.b : s.a, label: `${["Quarter-finals", "Semi-finals", "Final"][S.playoffs.round]} · series ${s.a === S.team ? s.w.join("-") : [...s.w].reverse().join("-")}` };
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
      <div class="mc-led-q">${[0, 1, 2, 3].map((i) => `<span>Q${i + 1} <b>${g.q[0][i]}-${g.q[1][i]}</b></span>`).join("")}</div>
      <div class="mc-line">${L.injured ? "Out injured" : L.dnp ? "Did not play (coach's decision)" : `<b>${esc(C.name)}</b> ${L.min} min · <b>${L.pts} pts</b> · ${L.reb} reb · ${L.ast} ast · ${L.stl} stl · ${L.blk} blk · ${L.fgm}/${L.fga} FG · ${L.tpm}/${L.tpa} 3P · ${L.pf ?? 0} PF${L.fouledOut ? " · <b>fouled out</b>" : ""}`}</div>
      <button class="btn" id="mc-box">${icon("chart", { size: 15 })} Box score</button>
    </div>`;
  }
  function openBox(g) {
    const b = E.boxScore(C, C.cur, g);
    const tbl = (name, lines, score) => `<div class="box-team"><div class="row"><b>${esc(name)}</b><span class="spacer"></span><b class="led">${score}</b></div>
      <table class="stat-table box"><thead><tr><th>Player</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>
      ${lines.map((l) => `<tr class="${l.me ? "best" : ""}"><td>${l.me ? `<b>${esc(l.name)}</b>` : l.pid ? `<button class="link-name" data-profile="${l.pid}">${esc(l.name)}</button>` : esc(l.name)}</td><td class="muted">${esc(l.pos)}</td><td>${l.min}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td></tr>`).join("")}</tbody></table></div>`;
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
        ${inj.noRush ? `<p class="muted" style="margin:0">${inj.severe ? "There's no rushing back from this one." : "League protocol: no early return."}</p>` : `<button class="btn" data-r="1">Rush back (${Math.max(1, Math.round(inj.games * 0.45))} games). For the next 10 games you're three times as likely to get hurt again.</button>`}</div></div>`;
    d.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { E.treatInjury(C, b.dataset.r === "1"); save(); closeModal(d); draw(); }));
    openModal(d);
    d.querySelector("[data-r]")?.focus();
  }

  function afterGames(out) {
    const mine = out.games || out;
    for (const g of mine) {
      emit("mc:game", { pts: g.line.pts, reb: g.line.reb, ast: g.line.ast, stl: g.line.stl, blk: g.line.blk, dnp: !!g.line.dnp, role: C.cur.role, won: g.won });
      if (g.line.pts >= 30) toast(`${g.line.pts}-point night!`);
    }
    if (mine.length) { lastGame = mine[mine.length - 1]; sound.play(lastGame.won ? "place" : "bad"); }
    if (out.cup?.game) { lastGame = out.cup.game; toast(`State Cup ${out.cup.round}: ${out.cup.game.won ? "won" : "lost"}`); if (out.cup.winner === C.cur.team) { confetti(3000); sound.play("victory"); emit("mc:trophy", { type: "cup" }); } }
    if (out.coach) { toast("Coaching change!"); announce(out.coach.text); }
    if (out.allStar) { if (out.allStar.picked) { toast("You're an All-Star!"); confetti(2000); emit("mc:trophy", { type: "allstar" }); } }
    save();
  }
  function play(fn) {
    const out = fn();
    afterGames(out);
    if (C.cur.phase === "done") return finishSeason();
    draw();
    if (C.injury?.pending) return showInjury();
    if (out.coach) return showNews("Coaching change", out.coach.text);
    const ev = lastGame && !C.injury ? maybeEvent(C, lastGame) : null;
    if (ev) showEvent(ev);
  }
  function finishSeason() {
    const S = C.cur;
    const title = S.playoffs?.champion === S.team;
    const { summary, growth } = E.endSeason(C);
    if (title) { confetti(4500); sound.play("victory"); emit("mc:trophy", { type: "title" }); }
    for (const a of summary.awards) emit("mc:award", { name: a });
    emit("mc:season", { seasons: C.history.filter((h) => h.pro).length, pts: C.totals.pts, overall: summary.overall });
    save();
    const d = modal("Season review");
    d.innerHTML = html`<button class="icon-btn profile-close" aria-label="Close">${icon("close", { size: 18 })}</button>
      <div class="profile mc-review"><small class="muted">SEASON REVIEW · ${summary.season}${summary.simulated ? " (simulated)" : ""}</small>
      <h2>${title ? `${icon("trophy", { size: 26 })} Champions!` : esc(summary.playoffs || "Season over")}</h2>
      <div class="mc-review-stats">${[["PPG", summary.avg.ppg], ["RPG", summary.avg.rpg], ["APG", summary.avg.apg], ["VAL", summary.avg.val], ["GP", summary.avg.gp], ["Finish", "#" + summary.standing]].map(([l, v]) => `<div><small>${l}</small><b class="led">${v}</b></div>`).join("")}</div>
      ${summary.awards.length ? `<div class="mc-awards">${summary.awards.map((a) => `<span class="pill">${icon("medal", { size: 13 })} ${esc(a)}</span>`).join("")}</div>` : ""}
      ${summary.allStar ? `<p>${icon("star", { size: 15 })} All-Star</p>` : ""}${summary.cupWon ? `<p>${icon("medal", { size: 15 })} State Cup winners</p>` : ""}
      <h3>Summer development (age ${C.age})</h3>
      <div class="mc-growth">${Object.entries(growth).map(([k, v]) => `<span class="${v >= 0 ? "up" : "down"}">${E.ATTRS[k]} ${v >= 0 ? "+" : ""}${v}</span>`).join("")}</div>
      <p class="muted">Income after agent fee: ${money(summary.income)}</p>
      <button class="btn primary" id="mc-next">${icon("arrowRight", { size: 15 })} To the off-season</button></div>`;
    const go = () => { closeModal(d); tab = "train"; draw(); };
    d.querySelector(".profile-close").addEventListener("click", go);
    d.querySelector("#mc-next").addEventListener("click", go);
    openModal(d);
    if (C.age >= 40) { toast("At 40, it's time: your career ends."); doRetire(); }
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
              ${S.phase === "regular" ? `<button class="btn primary big-btn" id="mc-play">${icon("play", { size: 16 })} ${nx?.bye ? "Next round" : "Play the game"}</button><button class="btn" id="mc-sim">${icon("skip", { size: 15 })} Simulate to the playoffs</button>` : ""}
              ${S.phase === "playoffs" && !out ? `<button class="btn primary big-btn" id="mc-po">${icon("play", { size: 16 })} Play playoff game</button>` : ""}
              ${S.phase === "playoffs" && out ? `<p class="muted">${S.playoffs.outAt === -1 ? "You missed the playoffs." : "You're out of the playoffs."}</p><button class="btn primary" id="mc-finish">${icon("skip", { size: 15 })} Finish the season</button>` : ""}
            </div>
          </div>
          ${ledHtml(lastGame)}
        </div>
        <div style="display:grid;gap:14px;align-content:start">
          <div class="card pad"><h3>${icon("chart")} ${S.label} so far</h3>
            <div class="mc-review-stats">${[["GP", avg.gp], ["MIN", avg.min], ["PPG", avg.ppg], ["RPG", avg.rpg], ["APG", avg.apg], ["VAL", avg.val]].map(([l, v]) => `<div><small>${l}</small><b class="led">${v}</b></div>`).join("")}</div>
            <p class="muted" style="font-size:12px;margin:8px 0 0">Team strength ${S.base ?? "–"}${S.boost ? ` → ${r1(S.base + S.boost)} with you (${S.boost > 0 ? "+" : ""}${S.boost})` : ""}${S.coachChanges ? ` · coach changes this season: ${S.coachChanges}` : ""}</p>
            <p class="muted" style="font-size:12px;margin:4px 0 0">FG ${avg.fg ?? "–"}% · 3P ${avg.tp ?? "–"}% · FT ${avg.ft ?? "–"}% · State Cup: ${S.cup.winner ? (S.cup.winner === S.team ? "won!" : "out") : S.cup.alive ? `round ${S.cup.round + 1}` : "out"}${S.allStar ? ` · All-Star: ${S.allStar.picked ? "selected" : "not selected"}` : ""}</p></div>
          <div class="card pad"><h3>${icon("clock")} Games</h3>
            <ol class="mc-games">${S.games.slice().reverse().slice(0, 12).map((g, i) => `<li><button class="mc-g ${g.won ? "w" : "l"}" data-g="${S.games.length - 1 - i}"><b>${g.won ? "W" : "L"}</b> ${g.my}-${g.their} ${g.home ? "vs" : "at"} ${esc(teamName(g.opp))}<small>${g.line.dnp ? "DNP" : `${g.line.pts} pts · ${g.line.reb} reb · ${g.line.ast} ast`}${g.cup ? " · Cup" : g.playoff ? " · Playoffs" : ""}</small></button></li>`).join("") || `<li class="muted">No games yet.</li>`}</ol></div>
          <div class="card pad">${depthHtml(S.label, S.team)}</div>
          ${C.log.length ? `<div class="card pad"><h3>${icon("info")} News</h3><ul class="clean mc-news">${C.log.slice(0, 6).map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </div>` : tab === "table" ? tableHtml() : tab === "train" ? `<div class="card pad">${trainHtml()}</div>` : tab === "career" ? careerHtml() : trophiesHtml()}`;
    bindTabs(drawSeason);
    bindTrain(drawSeason);
    root.querySelector("#mc-play")?.addEventListener("click", () => play(() => E.playRound(C)), { signal });
    root.querySelector("#mc-sim")?.addEventListener("click", () => play(() => { const all = { games: [] }; let guard = 0; while (C.cur.phase === "regular" && guard++ < 60) { const o = E.playRound(C); all.games.push(...o.games); if (o.cup) all.cup = o.cup; if (o.allStar) all.allStar = o.allStar; if (C.injury?.pending) E.treatInjury(C, false); } return all; }), { signal });
    root.querySelector("#mc-po")?.addEventListener("click", () => play(() => ({ games: E.playPlayoffDay(C) })), { signal });
    root.querySelector("#mc-finish")?.addEventListener("click", () => { E.simPlayoffs(C); finishSeason(); }, { signal });
    root.querySelector("#mc-box")?.addEventListener("click", () => openBox(lastGame), { signal });
    root.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { lastGame = S.games[Number(b.dataset.g)]; drawSeason(); root.querySelector(".mc-led")?.scrollIntoView({ block: "nearest" }); }, { signal }));
    root.querySelectorAll(".mc-led [data-count]").forEach((el) => countUp(el, Number(el.dataset.count), 0, 700));
  }

  /** Who you're competing with for minutes at your position group. */
  function depthHtml(label, tid) {
    const dc = E.depthChart(C, label, tid);
    const rows = dc.rivals.map((ps) => ({ name: playersById.get(ps.player_id)?.name || ps.player_id, pid: ps.player_id, r: ps.rating_mock, foreign: !E.isIsraeliPlayer(ps.player_id) }));
    rows.splice(dc.rank, 0, { me: true, name: C.name, r: Math.round(dc.myScore), foreign: C.nat !== "Israel" });
    return html`<h3>${icon("users")} Depth chart · ${E.FAM_NAMES[dc.fam]} at ${esc(teamName(tid))}</h3>
      <ol class="mc-depth">${rows.slice(0, 7).map((x, i) => `<li class="${x.me ? "me" : ""}"><span>${i + 1}</span>${x.me ? `<b>${esc(x.name)} (you)</b>` : `<button class="link-name" data-profile="${x.pid}">${esc(x.name)}</button>`}${x.foreign ? ` <small class="muted">foreign</small>` : ""}<b class="led">${x.r}</b></li>`).join("")}</ol>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Your number includes coach trust, chemistry${C.nat === "Israel" ? " and the Israeli-player edge" : ""}.${dc.foreign ? ` Foreign players on the roster: ${dc.foreigners} (minutes for ${E.FOREIGN_LIMIT}).${dc.slotOk ? "" : " <b>You're not among the top foreigners yet: bench.</b>"}` : ""}</p>`;
  }
  function showNews(title, text) {
    const d = modal(title);
    d.innerHTML = html`<div class="profile mc-event"><small class="muted">BREAKING</small><h2>${icon("whistle", { size: 22 })} ${esc(title)}</h2><p>${esc(text)}</p>
      <div class="mc-choices"><button class="btn primary" id="mc-ok">OK</button></div></div>`;
    d.querySelector("#mc-ok").addEventListener("click", () => { closeModal(d); draw(); });
    openModal(d);
    d.querySelector("#mc-ok").focus();
  }

  function tableHtml() {
    const S = C.cur, rows = E.table(S);
    return html`<div class="card pad"><h2>${icon("chart")} ${S.label} standings${S.simulated ? ` <span class="muted" style="font-size:14px">(simulated season)</span>` : ""}</h2>
      <table class="stat-table mc-table"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${r.id === S.team ? "me-row" : ""} ${i === 7 ? "cut" : ""}"><td>${i + 1}</td><td>${crestSvg(r.id, r.name, 20)} ${esc(r.name)}</td><td><b>${r.w}</b></td><td>${r.l}</td><td>${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`).join("")}</tbody></table>
      <p class="muted" style="font-size:12px">Top 8 make the playoffs (best of three). Team strengths come from each club's real roster that season.</p></div>`;
  }

  // ---------------------------------------------------------------- career & legacy
  function recordRank(cat, mine) {
    const list = leaders(cat, {}, 5000);
    const rank = list.filter((r) => r.value > mine).length + 1;
    return { rank, top: list[0] };
  }
  function careerHtml() {
    const pro = C.history.filter((h) => h.pro);
    const t = C.totals;
    const recs = [["pts", "Points", t.pts], ["reb", "Rebounds", t.reb], ["ast", "Assists", t.ast], ["stl", "Steals", t.stl], ["blk", "Blocks", t.blk], ["gp", "Games", t.gp]];
    const bestSeason = pro.reduce((b, h) => (!b || h.avg.ppg > b.avg.ppg ? h : b), null);
    return html`<div class="mc-grid">
      <div class="card pad" style="min-width:0"><h2>${icon("clock")} Career</h2>
        ${pro.length ? `<div class="grid-wrap"><table class="stat-table"><thead><tr><th>Season</th><th>Team</th><th>Age</th><th>Role</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>VAL</th><th>OVR</th></tr></thead>
          <tbody>${pro.map((h) => `<tr><td>${h.season}${h.simulated ? "*" : ""}</td><td>${esc(teamName(h.team))}${h.loan ? " (loan)" : ""}</td><td>${h.age}</td><td>${roleName(h.role)}</td><td>${h.avg.gp}</td><td>${h.avg.ppg}</td><td>${h.avg.rpg}</td><td>${h.avg.apg}</td><td>${h.avg.val}</td><td><b>${h.overall}</b></td></tr>`).join("")}</tbody></table></div>
          <p class="muted" style="font-size:12px">* simulated season (after ${E.LAST_REAL}, rosters based on ${E.LAST_REAL}).</p>` : `<p class="muted">No pro seasons yet.</p>`}
      </div>
      <div style="display:grid;gap:16px;align-content:start"><div class="card pad"><h3>${icon("trophy")} Against the real records</h3>
        <p class="muted" style="font-size:13px;margin-top:0">Your career totals ranked among every real player since 2010-11 (regular season).</p>
        <ul class="clean mc-recs">${recs.map(([cat, l, v]) => { const r = recordRank(cat, v); return `<li><span>${l}</span><b>${v.toLocaleString()}</b><span class="${r.rank === 1 ? "good-text" : "muted"}">#${r.rank}${r.rank === 1 ? " · all-time record!" : ` · record ${Math.round(r.top.value).toLocaleString()} (${esc(playersById.get(r.top.pid)?.name || "")})`}</span></li>`; }).join("")}</ul>
        ${bestSeason ? (() => { const r = recordRank("sppg", bestSeason.avg.ppg); return `<p style="font-size:14px">Best scoring season: <b>${bestSeason.avg.ppg} PPG</b> (${bestSeason.season}) · would rank <b>#${r.rank}</b> among real single seasons.</p>`; })() : ""}
      </div>
      <div class="card pad"><h3>${icon("heart")} Injury history</h3>
        ${(C.injuries || []).length ? `<ul class="clean mc-news">${C.injuries.slice().reverse().map((i) => `<li><b>${esc(i.name)}</b> <span class="muted">${i.season || ""} · age ${i.age} · ${i.games} games</span></li>`).join("")}</ul>` : `<p class="muted">Clean bill of health.</p>`}
        <p class="muted" style="font-size:13px;margin:8px 0 0">Career earnings (net, after expenses): ${money(C.money)}</p></div>
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
    root.querySelector("#mc-new").addEventListener("click", async () => {
      if (await confirmDialog({ title: "Start a new career?", message: "This career stays in your records here until you start the new one.", ok: "New career" })) { C = null; store.set(KEY, null); view = null; draw(); }
    }, { signal });
  }

  draw();
}
