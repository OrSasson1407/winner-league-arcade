// All-Time Draft: spin a real team-season, pick one player, fill PG/SG/SF/PF/C.
// Modes: solo, vs computer, 2-4 player draft room (snake order, shared spin per round).
import { bindGamePlan, gamePlanHtml } from "../lib/gamePlan.js";
import { undoToast } from "../lib/ux.js";
import { H, PLAYED_SEASONS, POSITIONS, db, isPlayable, pick, playersById, shuffle, teamName } from "../data.js";
import { esc, fmt1, html, localDate, ratingClass, store, toast, track } from "../ui.js";
import { IL_FLAG, nameLink, playerCard } from "../components/playerCard.js";
import { reducedMotion } from "../lib/settings.js";
import { icon } from "../lib/icons.js";
import { posFamily, posPill } from "../lib/icons.js";
import { myName } from "../lib/me.js";
import { emit } from "../lib/achievements.js";
import { announce } from "../lib/a11y.js";
import { courtHtml } from "../lib/court.js";
import { spinWheel } from "../lib/wheel.js";
import { challengeFor, challengeRng } from "../lib/challenge.js";
import { challengeBanner, challengeShareText, recordChallenge } from "../pages/challenge.js";
import { clubColors } from "../lib/clubs.js";
import { confetti, sound } from "../lib/fx.js";
import { simulateSeasonAsync, warmSeason } from "../lib/background.js";
import { CHEM_CAP, SIXTH, SLOT_WEIGHT, chemistry, slotValue, teamSummary } from "../shared/draftLogic.js";
import { openBoxScore, openLiveGame } from "./draft_live.js";
import { drawTeamCard, shareOrDownload } from "./draft_card.js";
import { hasMode } from "../lib/shop.js";
import { tokens, useToken } from "../lib/wallet.js";
import { LEAGUE } from "../data.js";
import { LEAGUES } from "../leagueChoice.js";

const SPINS_PER_TEAM = 2;
const BUDGET = 75;
const ERAS = {
  all: { label: "All seasons", seasons: PLAYED_SEASONS },
  early: { label: "2010-11 – 2014-15", seasons: PLAYED_SEASONS.filter((s) => s < "2015") },
  mid: { label: "2015-16 – 2019-20", seasons: PLAYED_SEASONS.filter((s) => s >= "2015" && s < "2020") },
  recent: { label: "2020-21 – 2025-26", seasons: PLAYED_SEASONS.filter((s) => s >= "2020") },
};
const CPU_LEVELS = { easy: "Easy", normal: "Normal", hard: "Hard" };
const slotLabel = (slot) => (slot === SIXTH ? "6th" : slot);
const SAVE_KEY = "draft:save";

export { SIXTH, slotValue, chemistry, teamSummary };
export const cost = (ps) => Math.max(3, Math.round((ps.rating_mock - 55) / 2));

// ---------------------------------------------------------------- save / resume
const psKey = (ps) => `${ps.player_id}|${ps.season}|${ps.team_id}`;
let psIndex = null;
const psByKey = (k) => (psIndex ??= new Map(db.player_seasons.map((ps) => [psKey(ps), ps]))).get(k);

function serialize(S, cfg) {
  return {
    v: 1, savedAt: new Date().toISOString(), cfg,
    teams: S.teams.map((t) => ({ name: t.name, cpu: t.cpu, spins: t.spins, budget: t.budget, idx: t.idx, slotList: t.slotList,
      slots: Object.fromEntries(Object.entries(t.slots).map(([k, v]) => [k, { key: psKey(v.ps), value: v.value }])) })),
    round: S.round, order: S.order, at: S.at, used: [...S.used],
    spin: S.spin && { season: S.spin.season, team_id: S.spin.team_id, team_name: S.spin.team_name, keys: S.spin.roster.map(psKey) },
    // after the draft: the results, the game plan and the season on screen (re-played from its seed)
    phase: S.phase, plan: S.plan || null, seasonView: S.seasonView || null,
  };
}

function deserialize(saved) {
  const teams = saved.teams.map((t) => ({ ...t, slots: Object.fromEntries(Object.entries(t.slots).map(([k, v]) => [k, { ps: psByKey(v.key), value: v.value }])) }));
  if (teams.some((t) => Object.values(t.slots).some((x) => !x.ps))) return null; // data changed since saving
  const roster = saved.spin ? saved.spin.keys.map(psByKey).filter(Boolean) : [];
  return {
    teams, round: saved.round, order: saved.order, at: saved.at, used: new Set(saved.used),
    spin: saved.spin ? { season: saved.spin.season, team_id: saved.spin.team_id, team_name: saved.spin.team_name, roster, fresh: false } : null,
    selected: null, cursor: 0, phase: saved.phase === "results" ? "results" : "draft",
    plan: saved.plan || null, seasonView: saved.seasonView || null, saved: saved.phase === "results",
  };
}

const isIsraeli = (pid) => {
  const p = playersById.get(pid);
  return p?.nationality === "Israel" || (p?.nationalities || []).includes("Israel");
};

// ---------------------------------------------------------------- component
export function renderDraft(root, signal, params, query) {
  const ch = challengeFor(query, "draft"); // challenge mode: same spins for everyone
  let rnd = Math.random;
  let cfg = store.get("draft:cfg", { mode: "solo", humans: 2, cpuLevel: "normal", timer: 0, era: "all", club: "", israelis: false, budget: false, blind: false, sixth: true });
  if (cfg.sixth === undefined) cfg.sixth = true;
  let S = null; // game state
  let timerId = null;
  let view = store.get("draft:view", "cards");
  signal.addEventListener("abort", () => clearInterval(timerId));

  const clubs = db.teams.filter((t) => PLAYED_SEASONS.some((s) => H.getPlayersByTeam(t.team_id, s).length)).sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));

  // ------------------------------------------------ setup
  function setup() {
    clearInterval(timerId);
    const board = store.get("draft:board", []);
    const saved = store.get(SAVE_KEY);
    const savedInfo = saved && (() => {
      const filled = saved.teams.reduce((s, t) => s + Object.keys(t.slots).length, 0);
      const total = saved.teams.reduce((s, t) => s + t.slotList.length, 0);
      const when = new Date(saved.savedAt);
      return `${saved.teams.filter((t) => !t.cpu).map((t) => t.name).join(", ")} · ${saved.phase === "results" ? `draft complete${saved.seasonView ? `, season ${saved.seasonView.season}` : ""}` : `${filled}/${total} picks made`} · saved ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    })();
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>All-Time Draft</h1>
        <p>Build the best starting five from ${LEAGUES[LEAGUE].phrase}, ${PLAYED_SEASONS[0]} to ${PLAYED_SEASONS[PLAYED_SEASONS.length - 1]}.</p></div>
        <button class="btn ghost" id="snd">${icon(sound.on ? "soundOn" : "soundOff")} ${sound.on ? "Sound on" : "Sound off"}</button></div>
      ${savedInfo ? html`<div class="card pad resume-banner">
        <div><b>${icon("pause", { size: 16 })} ${saved.phase === "results" ? "Your last draft" : "Unfinished draft"}</b><div class="muted" style="font-size:13px">${esc(savedInfo)}</div></div>
        <span class="spacer"></span><button class="btn primary" id="resume">▶ Resume</button><button class="btn ghost" id="discard">Discard</button>
      </div>` : ""}
      <div class="setup-grid">
        <div class="card pad setup">
          <div class="field"><label>Mode</label>
            <div class="seg" id="mode">${[["solo", "Solo"], ["cpu", "vs Computer"], ["room", "Draft room"]].map(([k, l]) => `<button data-v="${k}" class="${cfg.mode === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div class="field" id="f-humans" ${cfg.mode === "room" ? "" : "hidden"}><label>Players</label>
            <div class="seg" id="humans">${[2, 3, 4].map((n) => `<button data-v="${n}" class="${cfg.humans === n ? "on" : ""}">${n} players</button>`).join("")}</div></div>
          <div class="field" id="f-cpu" ${cfg.mode === "cpu" ? "" : "hidden"}><label>Computer level</label>
            <div class="seg" id="cpuLevel">${Object.entries(CPU_LEVELS).map(([k, l]) => `<button data-v="${k}" class="${cfg.cpuLevel === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div class="field"><label>Pick timer</label>
            <div class="seg" id="timer">${[[0, "Off"], [30, "30 s"], [60, "60 s"]].map(([k, l]) => `<button data-v="${k}" class="${cfg.timer === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div class="field"><label for="era">Era</label>
            <select id="era" class="input">${Object.entries(ERAS).map(([k, e]) => `<option value="${k}" ${cfg.era === k ? "selected" : ""}>${e.label}</option>`).join("")}</select></div>
          <div class="field"><label for="club">Club Legends <span class="muted">(every spin is this club)</span></label>
            <select id="club" class="input"><option value="">Any club</option>${clubs.map((t) => `<option value="${t.team_id}" ${cfg.club === t.team_id ? "selected" : ""}>${esc(t.canonical_name)}</option>`).join("")}</select></div>
          <label class="check"><input type="checkbox" id="israelis" ${cfg.israelis ? "checked" : ""}> <span><b>Israelis only</b><br><small class="muted">Only players with Israeli nationality</small></span></label>
          ${hasMode("draft-underdogs") ? `<label class="check"><input type="checkbox" id="underdogs" ${cfg.underdogs ? "checked" : ""}> <span><b>Underdogs</b><br><small class="muted">Only players rated 84 or lower</small></span></label>` : ""}
          ${hasMode("draft-young") ? `<label class="check"><input type="checkbox" id="young" ${cfg.young ? "checked" : ""}> <span><b>Young guns</b><br><small class="muted">Only seasons when the player was 23 or younger</small></span></label>` : ""}
          ${hasMode("draft-underdogs") && hasMode("draft-young") ? "" : `<a class="muted sh-more" href="#/shop/mode">${icon("coin", { size: 14 })} More draft modes in the shop</a>`}
          <label class="check"><input type="checkbox" id="budget" ${cfg.budget ? "checked" : ""}> <span><b>Salary cap</b><br><small class="muted">${BUDGET} coins for 5 players. Better players cost more.</small></span></label>
          <label class="check"><input type="checkbox" id="sixth" ${cfg.sixth ? "checked" : ""}> <span><b>Sixth man</b><br><small class="muted">A 6th bench pick (any position) that counts 30% of the team score</small></span></label>
          <label class="check"><input type="checkbox" id="blind" ${cfg.blind ? "checked" : ""}> <span><b>Blind mode</b><br><small class="muted">Ratings hidden, stats only</small></span></label>
          <button class="btn primary big-btn" id="start">Start draft</button>
        </div>
        <div class="card pad">
          <h3>${icon("trophy")} Best drafts</h3>
          ${board.length ? html`<ol class="board">${board.map((e) => html`<li><span class="b-score">${e.total.toFixed(1)}</span><span class="b-grade">${e.grade}</span>
            <span class="b-main"><b>${esc(e.name)}</b><small>${esc(e.mode)} · ${esc(e.filters)} · ${esc(e.date)}</small><small>${e.players.map(esc).join(", ")}</small></span></li>`).join("")}</ol>`
            : `<p class="muted">No drafts yet. Your best 10 teams will show up here.</p>`}
          <h3 style="margin-top:18px">How it works</h3>
          <ul class="rules">
            <li>Each round you get a random <b>team + season</b> and pick <b>one</b> player from that real roster.</li>
            <li>Out-of-position players lose points (secondary position −2, next position −5). The sixth man has no position.</li>
            <li><b>Chemistry:</b> +1 for each pair who were real teammates, +0.5 for each pair from the same club (max +${CHEM_CAP}).</li>
            <li>Nobody can draft the same person twice, even from another season.</li>
            <li>Keyboard: <kbd>1</kbd>–<kbd>9</kbd> pick a player, then <kbd>1</kbd>–<kbd>6</kbd> for PG…C, 6th · <kbd>↑</kbd><kbd>↓</kbd> + <kbd>Enter</kbd> · <kbd>R</kbd> re-spin · <kbd>Esc</kbd> cancel.</li>
          </ul>
        </div>
      </div>`;
    const bindSeg = (id, key, num = false) => root.querySelector("#" + id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      cfg[key] = num ? Number(b.dataset.v) : b.dataset.v;
      sound.play("tick");
      setup();
    }, { signal });
    bindSeg("mode", "mode"); bindSeg("humans", "humans", true); bindSeg("cpuLevel", "cpuLevel"); bindSeg("timer", "timer", true);
    root.querySelector("#snd").addEventListener("click", () => { sound.toggle(); setup(); }, { signal });
    root.querySelector("#resume")?.addEventListener("click", resume, { signal });
    root.querySelector("#discard")?.addEventListener("click", async () => {
      const saved = store.get(SAVE_KEY, null);
      store.set(SAVE_KEY, null); setup();
      undoToast("Saved draft discarded", () => { store.set(SAVE_KEY, saved); setup(); });
    }, { signal });
    root.querySelector("#start").addEventListener("click", () => {
      cfg.era = root.querySelector("#era").value;
      cfg.club = root.querySelector("#club").value;
      cfg.israelis = root.querySelector("#israelis").checked;
      cfg.underdogs = !!root.querySelector("#underdogs")?.checked;
      cfg.young = !!root.querySelector("#young")?.checked;
      cfg.budget = root.querySelector("#budget").checked;
      cfg.blind = root.querySelector("#blind").checked;
      cfg.sixth = root.querySelector("#sixth").checked;
      store.set("draft:cfg", cfg);
      startGame();
    }, { signal });
  }

  // ------------------------------------------------ game flow
  function startGame() {
    track("draft");
    if (ch) {
      cfg = { mode: "solo", humans: 2, cpuLevel: "normal", timer: 0, era: "all", club: "", israelis: false, budget: false, blind: false, sixth: true };
      rnd = challengeRng(ch.code);
    }
    const teams = [];
    if (cfg.mode === "room") for (let i = 0; i < cfg.humans; i++) teams.push({ name: i === 0 ? myName("Player 1") : `Player ${i + 1}`, cpu: false });
    else teams.push({ name: myName("Your team"), cpu: false });
    if (cfg.mode === "cpu") teams.push({ name: `Computer (${CPU_LEVELS[cfg.cpuLevel]})`, cpu: true });
    const slotList = cfg.sixth ? [...POSITIONS, SIXTH] : [...POSITIONS];
    teams.forEach((t, i) => Object.assign(t, { slots: {}, spins: SPINS_PER_TEAM, budget: BUDGET, idx: i, slotList }));
    S = { teams, round: 0, order: [], at: 0, used: new Set(), spin: null, selected: null, cursor: 0, phase: "draft" };
    startRound();
  }

  function saveProgress() {
    if (ch) return; // challenges don't touch your saved draft
    if (S && (S.phase === "draft" || S.phase === "results")) store.set(SAVE_KEY, serialize(S, cfg));
  }

  function resume() {
    const saved = store.get(SAVE_KEY);
    const restored = saved && deserialize(saved);
    if (!restored) { toast("That saved draft can't be restored"); store.set(SAVE_KEY, null); return setup(); }
    cfg = { ...cfg, ...saved.cfg };
    S = restored;
    toast("Back where you left off");
    if (S.phase === "results") { const v = S.seasonView; results(); if (v) showSeason(v.season, v.seed, { restoring: true }); return; }
    if (!S.spin || !S.spin.roster.length) newSpin();
    beginTurn();
  }

  const freeSlots = (t) => t.slotList.filter((p) => !t.slots[p]);
  const current = () => S.teams[S.order[S.at]];
  const allDone = () => S.teams.every((t) => !freeSlots(t).length);
  const affordable = (t) => (cfg.budget ? t.budget - 3 * (freeSlots(t).length - 1) : Infinity);
  const availableFor = (t) => S.spin.roster.filter((ps) => !S.used.has(ps.player_id) && cost(ps) <= affordable(t));

  function startRound() {
    const base = S.teams.map((_, i) => i);
    S.order = S.round % 2 === 0 ? base : base.slice().reverse(); // snake order
    S.at = 0;
    newSpin();
    beginTurn();
  }

  function rosterOf(teamId, season) {
    const best = new Map();
    for (const ps of H.getPlayersByTeam(teamId, season)) {
      if (!isPlayable(ps, 3)) continue;
      if (cfg.israelis && !isIsraeli(ps.player_id)) continue;
      if (cfg.underdogs && ps.rating_mock > 84) continue; // shop mode: only players rated 84 or lower
      if (cfg.young && !(ps.age <= 23)) continue; // shop mode: seasons at 23 or younger
      const cur = best.get(ps.player_id);
      if (!cur || ps.stats.games > cur.stats.games) best.set(ps.player_id, ps);
    }
    return [...best.values()].sort((a, b) => b.stats.mpg - a.stats.mpg);
  }

  function spinCandidates(relaxClub = false) {
    const seasons = ERAS[cfg.era].seasons;
    const out = [];
    for (const s of seasons) for (const t of H.getTeamsBySeason(s)) if (relaxClub || !cfg.club || t.team_id === cfg.club) out.push(t);
    return out;
  }

  function newSpin() {
    const pickersLeft = S.order.length - S.at;
    const team = current() ?? S.teams[0];
    for (const relax of [false, true]) {
      const cands = spinCandidates(relax);
      for (let tries = 0; tries < 400 && cands.length; tries++) {
        const st = pick(cands, rnd);
        const roster = rosterOf(st.team_id, st.season);
        const free = roster.filter((ps) => !S.used.has(ps.player_id));
        const need = Math.max(3, pickersLeft + 1);
        const canAfford = !cfg.budget || free.some((ps) => cost(ps) <= affordable(team));
        if (free.length >= need && canAfford) {
          S.spin = { season: st.season, team_id: st.team_id, team_name: st.team_name, roster, fresh: true };
          S.selected = null; S.cursor = 0;
          if (relax && cfg.club) toast("Club pool exhausted: spinning any club");
          return;
        }
      }
    }
    toast("No more players fit these rules");
  }

  function beginTurn() {
    clearInterval(timerId);
    while (S.at < S.order.length && !freeSlots(current()).length) S.at++;
    if (S.at >= S.order.length) {
      if (allDone()) return results();
      S.round++;
      return startRound();
    }
    if (!availableFor(current()).length) newSpin();
    S.selected = null; S.cursor = 0;
    saveProgress(); // auto-save after every pick / new spin
    render();
    if (current().cpu) {
      const t = setTimeout(() => { const p = choosePick(current(), cfg.cpuLevel); if (p) { S.selected = p.ps; place(p.slot, true); } }, 1100);
      signal.addEventListener("abort", () => clearTimeout(t));
    } else if (cfg.timer) {
      S.deadline = Date.now() + cfg.timer * 1000;
      let lastWarn = null;
      timerId = setInterval(() => {
        const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
        const el = root.querySelector("#timer-val");
        if (el) { el.textContent = left + "s"; el.parentElement.classList.toggle("urgent", left <= 5); }
        if (left <= 5 && left > 0 && left !== lastWarn) { lastWarn = left; sound.play("warn"); }
        if (left === 0) {
          clearInterval(timerId);
          const p = choosePick(current(), "normal");
          if (p) { toast(`Time's up: auto-picked ${playersById.get(p.ps.player_id).name}`); S.selected = p.ps; place(p.slot); }
        }
      }, 250);
    }
  }

  /** Computer strategy: best slot value + chemistry gain, budget-aware; lower levels add randomness. */
  function choosePick(team, level) {
    const avail = availableFor(team);
    if (!avail.length) return null;
    const free = freeSlots(team);
    const have = team.slotList.map((p) => team.slots[p]?.ps).filter(Boolean);
    const baseChem = chemistry(have).chem;
    const perSlot = cfg.budget ? team.budget / free.length : 0;
    const scored = avail.map((ps) => {
      let best = null;
      for (const slot of free) { const v = slotValue(ps, slot) * SLOT_WEIGHT(slot); if (!best || v > best.v) best = { slot, v }; }
      let score = best.v + 2 * (chemistry([...have, ps]).chem - baseChem);
      if (cfg.budget) score -= Math.max(0, cost(ps) - perSlot) * 0.6;
      return { ps, slot: best.slot, score };
    }).sort((a, b) => b.score - a.score);
    const top = level === "hard" ? 1 : level === "normal" ? 3 : 6;
    return pick(scored.slice(0, Math.min(top, scored.length)));
  }

  function place(slot, byCpu = false) {
    const t = current();
    const ps = S.selected;
    if (!ps || t.slots[slot]) return;
    t.slots[slot] = { ps, value: slotValue(ps, slot) };
    if (cfg.budget) t.budget -= cost(ps);
    S.used.add(ps.player_id);
    sound.play("place");
    if (byCpu) toast(`${t.name} picked ${playersById.get(ps.player_id).name} (${slot})`);
    else announce(`${playersById.get(ps.player_id).name} placed at ${slot === SIXTH ? "sixth man" : slot}, value ${t.slots[slot].value}.`);
    S.at++;
    beginTurn();
  }

  const bonusSpin = (t) => !ch && cfg.mode === "solo" && !t.spins && tokens("respin") > 0;
  function respin() {
    const t = current();
    if (t && !t.cpu && bonusSpin(t) && useToken("respin")) { t.spins++; toast(`Extra re-spin used · ${tokens("respin")} left`); }
    if (!t || t.cpu || !t.spins) return;
    t.spins--;
    newSpin();
    saveProgress();
    render();
  }

  // ------------------------------------------------ rendering
  /** The team's lineup on a half court (spots take the selected player when targetable). */
  function courtOf(t, targetable) {
    return courtHtml(t.slotList.map((p) => {
      const s = t.slots[p];
      const can = targetable && S.selected && !s;
      return {
        slot: p, label: slotLabel(p), can, hidden: cfg.blind && S.phase === "draft",
        preview: can && !cfg.blind ? slotValue(S.selected, p) : null,
        filled: s && { name: playersById.get(s.ps.player_id).name, pid: s.ps.player_id, value: s.value, color: clubColors(s.ps.team_id)[0],
          sub: `${teamName(s.ps.team_id)} ${s.ps.season}${cfg.budget ? ` · ${cost(s.ps)}c` : ""}` },
      };
    }));
  }

  function poolCards(avail, human) {
    return `<div class="card-grid" id="pool">${S.spin.roster.map((ps, i) => {
      const ok = avail.has(ps.player_id);
      const used = S.used.has(ps.player_id);
      const cls = [used ? "used" : ok ? "pickable" : "locked", S.selected === ps ? "selected" : "", S.cursor === i && human ? "cursor" : ""].join(" ");
      const card = playerCard(ps, { classes: cls, hideRating: cfg.blind, badge: cfg.budget ? `${icon("coin", { size: 12 })} ${cost(ps)}` : "", attrs: `role="button" tabindex="${ok && human ? 0 : -1}"` });
      return `<div class="pc-cell" data-i="${i}" style="position:relative">${card}${i < 10 && human ? `<kbd class="pc-num">${(i + 1) % 10}</kbd>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function poolTable(avail, human) {
    return html`<div class="grid-wrap"><table class="roster">
      <thead><tr><th>#</th><th>Player</th><th>Pos</th><th class="hide-sm">Age</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th>${cfg.budget ? "<th>Cost</th>" : ""}${cfg.blind ? "" : "<th>Rating</th>"}</tr></thead>
      <tbody id="pool">${S.spin.roster.map((ps, i) => {
        const pl = playersById.get(ps.player_id);
        const ok = avail.has(ps.player_id);
        const used = S.used.has(ps.player_id);
        const cls = used ? "used" : ok ? "pick" : "locked";
        const s = ps.stats;
        return html`<tr class="${cls} ${S.selected === ps ? "sel" : ""} ${S.cursor === i && human ? "cur" : ""}" data-i="${i}">
          <td class="muted">${i < 10 ? (i + 1) % 10 : ""}</td>
          <td><b>${nameLink(pl.player_id)}</b>${isIsraeli(ps.player_id) ? ` <span title="Israeli">${IL_FLAG}</span>` : ""}</td>
          <td>${posPill(ps.position, ps.secondary_position)}</td>
          <td class="hide-sm">${ps.age ?? "–"}</td><td>${s.games}</td><td>${fmt1(s.ppg)}</td><td>${fmt1(s.rpg)}</td><td>${fmt1(s.apg)}</td>
          ${cfg.budget ? `<td class="${ok || used ? "" : "too-much"}">${cost(ps)}c</td>` : ""}
          ${cfg.blind ? "" : `<td class="rating ${ratingClass(ps.rating_mock)}">${ps.rating_mock}</td>`}</tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function render() {
    const t = current();
    const sp = S.spin;
    const [c1, c2] = clubColors(sp.team_id);
    const human = !t.cpu;
    const sum = teamSummary(t);
    const avail = new Set(availableFor(t).map((ps) => ps.player_id));
    const multi = S.teams.length > 1;
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>All-Time Draft</h1>
        <p>Round ${S.round + 1} of ${t.slotList.length} · ${human ? `<b>${esc(t.name)}</b> is on the clock` : `<b>${esc(t.name)}</b> is thinking…`}</p></div>
        <div class="row">
          ${cfg.timer && human ? `<div class="timer">${icon("timer", { size: 20 })}<b id="timer-val">${cfg.timer}s</b></div>` : ""}
          <button class="btn ghost" id="snd" aria-label="Sound">${icon(sound.on ? "soundOn" : "soundOff")}</button>
          <button class="btn ghost" id="quit" title="Your draft is saved after every pick">${icon("save", { size: 16 })} Save &amp; exit</button>
        </div>
      </div>
      ${multi ? html`<div class="order">${S.order.map((ti, k) => {
        const tm = S.teams[ti];
        const st = k < S.at ? "done" : k === S.at ? "now" : "";
        return `<div class="chip ${st}"><b>${esc(tm.name)}</b><small>${tm.slotList.length - freeSlots(tm).length}/${tm.slotList.length} · ${fmt1(teamSummary(tm).total)}</small></div>`;
      }).join('<span class="arrow">→</span>')}</div>` : ""}
      <div class="draft">
        <div class="card pad">
          <div class="row"><h3>${esc(t.name)}</h3><span class="spacer"></span>
            ${cfg.budget ? `<span class="pill coin">${icon("coin", { size: 13 })} ${t.budget} left</span>` : ""}</div>
          <div class="row muted" style="font-size:13px;margin-top:6px">
            <span>Avg ${cfg.blind ? "?" : fmt1(sum.avg)}</span><span>·</span><span title="${esc(sum.links.map((l) => l.text).join("\n"))}">Chemistry +${fmt1(sum.chem)}</span>
            <span>·</span><b>${cfg.blind ? "?" : fmt1(sum.total)}</b></div>
          <div id="slots" style="margin-top:12px">${courtOf(t, human)}</div>
          ${sum.links.length ? `<div class="links">${sum.links.slice(0, 4).map((l) => `<div>${icon(l.type === "teammates" ? "link" : "arena", { size: 14 })} ${esc(l.text)}</div>`).join("")}</div>` : ""}
          <p class="muted" style="font-size:13px;margin-bottom:0">${human ? (S.selected ? "Choose a slot for <b>" + esc(playersById.get(S.selected.player_id).name) + "</b>." : "Select a player from the roster.") : "Waiting for the computer…"}</p>
        </div>
        <div class="card spin-wrap" style="--club1:${c1};--club2:${c2}">
          <div class="spin-card">
            <span class="club-dot" aria-hidden="true"></span>
            <div style="min-width:0"><div class="muted" id="spin-season">${sp.season}</div><div class="reel" id="reel"><div class="reel-strip" id="reel-strip"><div>${esc(sp.team_name)}</div></div></div></div>
            <span class="spacer"></span>
            ${human ? `<button class="btn" id="respin" ${t.spins || bonusSpin(t) ? "" : "disabled"}>${icon("refresh", { size: 16 })} ${!t.spins && bonusSpin(t) ? `Extra re-spin (${tokens("respin")})` : `Re-spin (${t.spins})`} <kbd>R</kbd></button>` : ""}
          </div>
          ${multi ? `<div class="muted spin-note">Shared roster: everyone picks from this spin this round. A re-spin changes it for the players still to pick.</div>` : ""}
          <div class="row view-toggle"><span class="muted" style="font-size:13px">${human ? "Click a card (or press its number) to pick" : ""}</span><span class="spacer"></span>
            <div class="seg sm" id="view-mode" role="radiogroup" aria-label="Roster view">${[["cards", "Cards"], ["table", "Table"]].map(([k, l]) => `<button role="radio" aria-checked="${view === k}" data-v="${k}" class="${view === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
          ${view === "cards" ? poolCards(avail, human) : poolTable(avail, human)}
        </div>
      </div>`;
    if (sp.fresh) { sp.fresh = false; animateSpin(); }
    root.querySelector("#snd").addEventListener("click", () => { sound.toggle(); render(); }, { signal });
    root.querySelector("#quit").addEventListener("click", () => { saveProgress(); toast("Draft saved: resume it from the Draft screen"); setup(); }, { signal });
    root.querySelector("#view-mode").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b) return;
      view = b.dataset.v; store.set("draft:view", view); render();
    }, { signal });
    if (!human) return;
    root.querySelector("#pool").addEventListener("click", (e) => {
      const el = e.target.closest("[data-i]");
      if (el) selectRow(Number(el.dataset.i));
    }, { signal });
    root.querySelector("#pool").addEventListener("keydown", (e) => {
      const el = e.target.closest("[data-i]");
      if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); selectRow(Number(el.dataset.i)); }
    }, { signal });
    root.querySelector("#slots").addEventListener("click", (e) => {
      const s = e.target.closest("[data-slot]");
      if (s && S.selected) place(s.dataset.slot);
    }, { signal });
    root.querySelector("#respin")?.addEventListener("click", respin, { signal });
  }

  function selectRow(i) {
    const ps = S.spin.roster[i];
    if (!ps) return;
    if (!availableFor(current()).includes(ps)) { sound.play("bad"); return toast(S.used.has(ps.player_id) ? "Already drafted" : "Not enough coins"); }
    S.selected = ps; S.cursor = i;
    sound.play("select");
    render();
  }

  function animateSpin() {
    const strip = root.querySelector("#reel-strip"), seasonEl = root.querySelector("#spin-season");
    if (!strip) return;
    sound.play("spin");
    if (reducedMotion()) return;
    const final = S.spin;
    // spin wheel of club colours, landing on the real spin; the reel below scrolls in sync
    const wheelHost = root.querySelector(".spin-wrap");
    const seen = new Set([final.team_id]);
    const others = shuffle(db.season_teams.slice(), Math.random).filter((t) => !seen.has(t.team_id) && seen.add(t.team_id)).slice(0, 11).map((t) => ({ id: t.team_id, name: t.team_name }));
    const stopWheel = spinWheel(wheelHost, { final: { id: final.team_id, name: final.team_name }, others, season: final.season });
    signal.addEventListener("abort", stopWheel);
    const fillers = Array.from({ length: 14 }, () => pick(db.season_teams).team_name);
    strip.innerHTML = [...fillers, final.team_name].map((n) => `<div>${esc(n)}</div>`).join("");
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    void strip.offsetWidth;
    strip.style.transition = "";
    strip.style.transform = `translateY(-${fillers.length * 40}px)`;
    seasonEl.textContent = "Spinning…";
    const t = setTimeout(() => { seasonEl.textContent = final.season; }, 950);
    signal.addEventListener("abort", () => clearTimeout(t));
  }

  // keyboard controls (human turn only)
  document.addEventListener("keydown", (e) => {
    if (!S || S.phase !== "draft" || current()?.cpu || e.target.closest?.("input,select,textarea")) return;
    const k = e.key;
    if (S.selected && /^[1-6]$/.test(k)) { const slot = current().slotList[Number(k) - 1]; if (slot && !current().slots[slot]) place(slot); e.preventDefault(); return; }
    if (!S.selected && /^[0-9]$/.test(k)) { selectRow(k === "0" ? 9 : Number(k) - 1); e.preventDefault(); return; }
    if (k === "ArrowDown" || k === "ArrowUp") {
      S.cursor = Math.max(0, Math.min(S.spin.roster.length - 1, S.cursor + (k === "ArrowDown" ? 1 : -1)));
      render(); e.preventDefault();
    } else if (k === "Enter" && !S.selected) { selectRow(S.cursor); e.preventDefault(); }
    else if (k === "Escape") { S.selected = null; render(); }
    else if (k === "r" || k === "R") respin();
  }, { signal });

  // ------------------------------------------------ results
  function filtersLabel() {
    const f = [ERAS[cfg.era].label];
    if (cfg.club) f.push(teamName(cfg.club) + " legends");
    if (cfg.israelis) f.push("Israelis only");
    if (cfg.underdogs) f.push("Underdogs");
    if (cfg.young) f.push("Young guns");
    if (cfg.budget) f.push("Salary cap");
    if (cfg.blind) f.push("Blind");
    return f.join(" · ");
  }

  /** Achievements: report the best human team of this draft. */
  function reportDraft(scored) {
    const humans = scored.filter((x) => !x.t.cpu);
    if (!humans.length) return;
    const best = humans.reduce((a, b) => (b.sum.total > a.sum.total ? b : a));
    const cpu = scored.filter((x) => x.t.cpu);
    const t = best.t;
    emit("draft:finish", {
      total: best.sum.total, chem: best.sum.chem, teammatePairs: best.sum.links.filter((l) => l.type === "teammates").length,
      allOwnPosition: POSITIONS.every((p) => t.slots[p] && t.slots[p].value === t.slots[p].ps.rating_mock),
      cfg: { ...cfg }, respinsUsed: SPINS_PER_TEAM - t.spins, mode: cfg.mode, cpuLevel: cfg.cpuLevel,
      won: cpu.length ? cpu.every((x) => best.sum.total > x.sum.total) : false,
      humans: humans.length, sixth: t.slots[SIXTH]?.value ?? null,
    });
  }

  function saveToBoard(scored) {
    const mode = cfg.mode === "solo" ? "Solo" : cfg.mode === "cpu" ? `vs Computer (${CPU_LEVELS[cfg.cpuLevel]})` : `Draft room (${cfg.humans})`;
    const board = store.get("draft:board", []);
    const date = localDate();
    let best = false;
    for (const { t, sum } of scored) {
      if (t.cpu) continue;
      board.push({ total: Number(sum.total.toFixed(2)), grade: sum.grade, name: t.name, mode, filters: filtersLabel(), date,
        players: t.slotList.map((p) => playersById.get(t.slots[p].ps.player_id).name + (p === SIXTH ? " (6th)" : "")) });
      if (sum.total > store.get("draft:best", 0)) { store.set("draft:best", Number(sum.total.toFixed(1))); best = true; }
    }
    board.sort((a, b) => b.total - a.total);
    store.set("draft:board", board.slice(0, 10));
    return best;
  }

  function results() {
    clearInterval(timerId);
    S.phase = "results";
    S.seasonView = null;
    saveProgress(); // closing the tab now brings you back to these results
    warmSeason(); // load the season simulator in the background
    const scored = S.teams.map((t) => ({ t, sum: teamSummary(t) }));
    const top = Math.max(...scored.map((x) => x.sum.total));
    if (!S.saved) { // first time on this screen only (not when coming back from the simulation)
      S.saved = true;
      const newBest = saveToBoard(scored);
      if (ch) recordChallenge(ch.code, `score ${scored[0].sum.total.toFixed(1)}`);
      reportDraft(scored);
      const humanWon = scored.some((x) => !x.t.cpu && x.sum.total === top);
      if (newBest || (S.teams.length > 1 && humanWon)) { confetti(); sound.play("win"); }
      if (newBest) toast("New personal best!");
    }
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Draft results</h1><p>${esc(filtersLabel())}</p></div>
        <button class="btn ghost" id="snd" aria-label="Sound">${icon(sound.on ? "soundOn" : "soundOff")}</button></div>
      <div class="games ${scored.length === 1 ? "solo" : ""}">${scored.map(({ t, sum }) => {
        const winner = S.teams.length > 1 && sum.total === top;
        return html`<div class="card pad" style="${winner ? "border-color:var(--orange)" : ""}">
          <div class="row"><h2>${esc(t.name)}${winner ? ` ${icon("trophy", { size: 22, cls: "ic-gold" })}` : ""}</h2><span class="spacer"></span><span class="grade">${sum.grade}</span></div>
          <div class="row" style="margin:6px 0 4px"><span class="big-score">${fmt1(sum.total)}</span><span class="muted">${sum.label}</span></div>
          <div class="muted" style="font-size:13px;margin-bottom:12px">Average ${fmt1(sum.avg)} + chemistry ${fmt1(sum.chem)}${cfg.budget ? ` · ${BUDGET - t.budget}/${BUDGET} coins spent` : ""}</div>
          ${courtOf(t, false)}
          ${sum.links.length ? `<div class="links">${sum.links.map((l) => `<div>${icon(l.type === "teammates" ? "link" : "arena", { size: 14 })} ${esc(l.text)}</div>`).join("")}</div>` : `<div class="links muted">No chemistry links</div>`}
          ${t.cpu ? "" : `<button class="btn" data-card="${t.idx}" style="margin-top:12px">${icon("camera", { size: 16 })} Team card</button>`}
        </div>`;
      }).join("")}</div>
      <div class="card pad sim-box">
        <div><h3>${icon("arena")} Simulate a season</h3><p class="muted" style="margin:6px 0 0">Your team${S.teams.length > 1 ? "s join" : " joins"} the real league of a season: double round-robin, then playoffs. Watch games live and open box scores.</p></div>
        <select id="sim-season" class="input" style="max-width:200px"><option value="">Random season</option>${PLAYED_SEASONS.map((s) => `<option>${s}</option>`).join("")}</select>
        <button class="btn primary" id="sim">Play season</button>
        ${S.teams.some((t) => !t.cpu) ? `<details class="gp-box" ${S.plan ? "open" : ""}><summary>${icon("clipboard", { size: 15 })} Game plan for ${esc(S.teams.find((t) => !t.cpu).name)}</summary>
          ${gamePlanHtml(S.plan || {}, planPlayers(S.teams.find((t) => !t.cpu)))}</details>` : ""}
      </div>
      <div class="row" style="justify-content:center;margin-top:24px">
        ${ch ? `<button class="btn" id="ch-share">${icon("users", { size: 16 })} Copy challenge result</button>` : ""}
        <button class="btn primary" id="again">${ch ? "Replay challenge" : "Draft again"}</button>${ch ? "" : `<button class="btn" id="settings">Change settings</button>`}<a class="btn ghost" href="#/">Home</a></div>`;
    root.querySelector("#snd").addEventListener("click", () => { sound.toggle(); root.querySelector("#snd").innerHTML = icon(sound.on ? "soundOn" : "soundOff"); }, { signal });
    root.querySelector("#again").addEventListener("click", startGame, { signal });
    root.querySelector("#settings")?.addEventListener("click", () => { store.set(SAVE_KEY, null); setup(); }, { signal });
    root.querySelector("#ch-share")?.addEventListener("click", async () => {
      const txt = challengeShareText(ch, `my team scored ${teamSummary(S.teams[0]).total.toFixed(1)}`);
      try { await navigator.clipboard.writeText(txt); toast("Copied: send it to your friend"); } catch { toast(txt); }
    }, { signal });
    root.querySelectorAll("[data-card]").forEach((b) => b.addEventListener("click", async () => {
      const t = S.teams[Number(b.dataset.card)];
      const how = await shareOrDownload(drawTeamCard(t, teamSummary(t)), `all-time-draft-${t.name.replace(/\W+/g, "-").toLowerCase()}.png`);
      toast(how === "shared" ? "Shared!" : "Team card downloaded");
    }, { signal }));
    const gpBox = root.querySelector(".gp-box");
    if (gpBox) bindGamePlan(gpBox, { signal, onChange: (p) => { S.plan = p; saveProgress(); } });
    root.querySelector("#sim").addEventListener("click", () => {
      const season = root.querySelector("#sim-season").value || pick(PLAYED_SEASONS);
      showSeason(season);
    }, { signal });
  }

  async function showSeason(season, seed = Math.floor(Math.random() * 1e9), { restoring = false } = {}) {
    const drafted = S.teams.map((t) => ({ name: t.name, strength: teamSummary(t).total, roster: t.slotList.map((p) => t.slots[p].ps),
      ...(!t.cpu && S.plan ? { tactics: S.plan.tactics, minutes: planMinutes(t, S.plan.minutes) } : {}) }));
    const viewing = S.seasonView = { season, seed };
    saveProgress();
    root.innerHTML = html`<div class="season-page" aria-busy="true"><div class="game-head"><div><h1>Season ${season}</h1><p class="muted">${icon("arena", { size: 16 })} Playing ${esc(season)}: every game, possession by possession…</p></div></div>
      <div class="season-grid"><div class="card pad"><span class="sk sk-title"></span>${Array.from({ length: 10 }, () => `<span class="sk sk-line" style="width:${60 + Math.round(Math.random() * 35)}%"></span>`).join("")}</div>
      <div class="card pad"><span class="sk sk-title"></span>${Array.from({ length: 6 }, () => `<span class="sk sk-line" style="width:80%"></span>`).join("")}</div></div></div>`;
    const sim = await simulateSeasonAsync(season, drafted, "season-" + seed);
    if (signal.aborted || S.seasonView !== viewing) return; // you left, or picked another season meanwhile
    const humanTeam = (team) => team.drafted && !S.teams[Number(team.id.split("_")[1])].cpu;
    if (!restoring) {
      if (humanTeam(sim.champion)) { confetti(3200); sound.play("win"); }
      for (const row of sim.table.filter((r) => humanTeam(r.team))) {
        emit("draft:season", { madePlayoffs: sim.seeds.includes(row.team), champion: sim.champion === row.team, wins: row.w, losses: row.l });
      }
    }
    const games = new Map(); // id -> game, for the box score / live buttons
    const reg = (g) => { games.set(String(g.id), g); return g.id; };
    const po = sim.playoffs;
    const seedNo = (t) => sim.seeds.indexOf(t) + 1;
    const teamRow = (t, wins, won) => `<div class="br-team ${won ? "w" : ""} ${t.drafted ? "mine" : ""}"><span class="br-seed">${seedNo(t)}</span><span class="dot" style="background:${t.drafted ? "var(--accent)" : clubColors(t.id)[0]}"></span><span class="br-name">${esc(t.name)}</span><b>${wins}</b></div>`;
    const seriesBox = (sr) => html`<div class="br-series">
      ${teamRow(sr.hi, sr.wins[0], sr.winner === sr.hi)}${teamRow(sr.lo, sr.wins[1], sr.winner === sr.lo)}
      <div class="br-games">${sr.games.map((g) => `<button class="br-game" data-box="${reg(g)}" title="${esc(g.label)}: box score">${g.hs}-${g.as}</button>`).join("")}</div>
    </div>`;
    const finalGame = po.final.games[0];
    reg(finalGame);
    root.innerHTML = html`<div class="season-page">
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>Season ${season}</h1>
        <p>Champion: <b>${esc(sim.champion.name)}</b>${sim.champion.drafted ? ` ${icon("trophy", { size: 18, cls: "ic-gold" })}` : ""}</p></div>
        <div class="row"><button class="btn" id="again-sim">${icon("refresh", { size: 16 })} Replay season</button><button class="btn" id="other">Random season</button><button class="btn primary" id="back">Back to results</button></div></div>
      <div class="card pad final-banner">
        <div><div class="muted" style="font-size:12px;font-weight:700;letter-spacing:2px">THE FINAL</div>
          <h2>${esc(finalGame.home.name)} <span class="led">${finalGame.hs}</span> – <span class="led">${finalGame.as}</span> ${esc(finalGame.away.name)}</h2></div>
        <span class="spacer"></span>
        <button class="btn primary" data-live="${finalGame.id}">${icon("play", { size: 14 })} Watch the final live</button><button class="btn" data-box="${finalGame.id}">${icon("chart", { size: 16 })} Box score</button>
      </div>
      <div class="card pad"><h3>Playoffs</h3>
        <div class="bracket">
          <div class="br-col"><div class="br-title">Quarter-finals · best of 3</div>${po.qf.map(seriesBox).join("")}</div>
          <div class="br-col"><div class="br-title">Semi-finals · best of 3</div>${po.sf.map(seriesBox).join("")}</div>
          <div class="br-col"><div class="br-title">Final · one game</div>${seriesBox(po.final)}<div class="br-champ">${icon("trophy", { size: 18 })} ${esc(sim.champion.name)}</div></div>
        </div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">Click a score for the box score. Simplified league format: top 8 qualify, higher seed has home court.</p>
      </div>
      <div class="season-grid" style="margin-top:18px">
        <div class="card pad"><h3>Standings</h3>
          <div class="grid-wrap"><table class="roster standings"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th class="hide-sm">+/−</th><th class="hide-sm">Strength</th></tr></thead>
          <tbody>${sim.table.map((r, i) => html`<tr class="${r.team.drafted ? "mine" : ""} ${i < 8 ? "top4" : ""}"><td>${i + 1}</td>
            <td><span class="dot" style="background:${r.team.drafted ? "var(--accent)" : clubColors(r.team.id)[0]}"></span>${esc(r.team.name)}</td>
            <td>${r.w}</td><td>${r.l}</td><td class="hide-sm">${r.pf - r.pa > 0 ? "+" : ""}${r.pf - r.pa}</td><td class="hide-sm">${fmt1(r.team.strength)}</td></tr>`).join("")}</tbody></table></div>
          <p class="muted" style="font-size:12px">Top 8 make the playoffs. Real teams' strength comes from their real player ratings in ${season}.</p>
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          ${[...sim.draftedGames.entries()].map(([id, list]) => {
            const t = sim.table.find((r) => r.team.id === id);
            return html`<div class="card pad"><h3>${esc(t.team.name)}: ${t.w}-${t.l}</h3>
              <div class="games-list">${list.map((g) => {
                const home = g.home.id === id;
                const us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.away : g.home;
                return `<div class="${us > them ? "w" : "l"}"><span>${home ? "vs" : "@"} ${esc(opp.name)}</span><b>${us}-${them}</b>
                  <span class="g-acts"><button class="mini" data-box="${reg(g)}" aria-label="Box score" title="Box score">${icon("chart", { size: 13 })}</button><button class="mini" data-live="${g.id}" aria-label="Watch live" title="Watch live">${icon("play", { size: 12 })}</button></span></div>`;
              }).join("")}</div></div>`;
          }).join("")}
        </div>
      </div></div>`;
    root.querySelector(".season-page").addEventListener("click", (e) => {
      const b = e.target.closest("[data-box],[data-live]");
      if (!b) return;
      const g = games.get(b.dataset.box || b.dataset.live);
      if (!g) return;
      if (b.dataset.live) openLiveGame(g, { celebrate: (game) => game.label === "Final" && humanTeam(game.winner) });
      else openBoxScore(g);
    }, { signal });
    root.querySelector("#again-sim").addEventListener("click", () => showSeason(season), { signal });
    announce(`Season ${season} played. Champion: ${sim.champion.name}.`);
    root.querySelector("#other").addEventListener("click", () => showSeason(pick(PLAYED_SEASONS)), { signal });
    root.querySelector("#back").addEventListener("click", () => { S.seasonView = null; saveProgress(); results(); }, { signal });
  }

  // the minutes plan uses the engine's player ids (the same player drafted twice gets "#1")
  function planPlayers(t) {
    const seen = new Map();
    return t.slotList.map((slot) => t.slots[slot]?.ps).filter(Boolean).map((ps) => {
      const n = seen.get(ps.player_id) || 0; seen.set(ps.player_id, n + 1);
      return { id: n ? `${ps.player_id}#${n}` : ps.player_id, name: playersById.get(ps.player_id)?.name ?? ps.player_id, pos: ps.position || "", mpg: ps.stats?.mpg ?? 20 };
    });
  }
  function planMinutes(t, minutes) { return minutes && Object.values(minutes).some((v) => v > 0) ? minutes : null; }

  // came back within a day (closed the tab, phone killed the page): straight back to where you were
  const recent = !ch && store.get(SAVE_KEY);
  if (ch) startGame();
  else if (recent?.savedAt && Date.now() - Date.parse(recent.savedAt) < 24 * 3600e3 && deserialize(recent)) resume();
  else setup();
}
