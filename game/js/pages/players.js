// Players browser: filter all players by name, club, season, position, nationality and height.
import { careerSummary, db, namedPlayers, POSITIONS, teamName } from "../data.js";
import { bestSeason, playerCard } from "../components/playerCard.js";
import { icon } from "../lib/icons.js";
import { copyLink, deferred, esc, html, initials, skeletonCards, store } from "../ui.js";
import { EL_INDEX, EL_SEASONS, elTeamName, loadEuroleague } from "../euroleague.js";
import { clubColors } from "../lib/clubs.js";
import { playersById } from "../data.js";

const STEP = 48;
const SORTS = { rating: "Best rating", name: "Name A–Z", seasons: "Most seasons", ppg: "Career PPG", height: "Tallest" };
const DEFAULTS = { lg: "wl", q: "", club: "", season: "", pos: "", nat: "", hmin: "", hmax: "", sort: "rating" };
const LEAGUES = [["wl", "Winner League"], ["el", "EuroLeague"], ["all", "Both"]];

let rows = null;
function allRows() {
  if (rows) return rows;
  rows = namedPlayers.map((p) => {
    const cs = careerSummary(p.player_id);
    const games = cs.played.reduce((s, r) => s + r.stats.games, 0);
    const ppg = games ? cs.played.reduce((s, r) => s + (r.stats.ppg ?? 0) * r.stats.games, 0) / games : 0;
    return { p, cs, best: bestSeason(cs.records), ppg, nameKey: p.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() };
  });
  return rows;
}

const isIsraeli = (p) => p.nationality === "Israel" || (p.nationalities || []).includes("Israel");

// EuroLeague rows: names, clubs and seasons only (its stats, ratings and most bios are placeholder data)
let elRows = null;
function allElRows(E) {
  if (elRows) return elRows;
  elRows = E.db.players.map((p) => {
    const career = E.careerOf(p.player_id);
    const last = career[career.length - 1];
    return { el: true, id: p.player_id, name: p.name, wl: playersById.get(p.player_id) || null, career, last,
      seasons: new Set(career.map((r) => r.season)).size, teams: [...new Set(career.map((r) => r.team_id))],
      nameKey: p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() };
  });
  return elRows;
}
/** A EuroLeague player card in the same frame as the others, without rating or stats. */
function elCard(r, season, club) {
  const rec = r.career.filter((x) => (!season || x.season === season) && (!club || x.team_id === club)).pop() || r.last;
  const [c1, c2] = clubColors(rec.team_id);
  return `<div class="pc el-card tier-bronze" style="--club:${c1};--club2:${c2}" aria-label="${esc(r.name)}, EuroLeague, ${esc(elTeamName(rec.team_id))} ${rec.season}">
    <div class="pc-top"><span class="pc-rating el-tag">EL</span>${r.wl ? `<span class="wl-chip">WL</span>` : ""}</div>
    <div class="pc-avatar" aria-hidden="true">${esc(initials(r.name))}</div>
    <div class="pc-name">${esc(r.name)}</div>
    <div class="pc-team"><i class="dot" style="background:${c1}"></i><span>${esc(elTeamName(rec.team_id))} · ${rec.season}</span></div>
    <div class="pc-stats"><div><b>${r.seasons}</b><small>EL SEASONS</small></div><div><b>${r.teams.length}</b><small>CLUBS</small></div></div>
  </div>`;
}

export function renderPlayers(root, signal, params = [], query = {}) {
  // a shared link (#/players?club=…&season=…) wins over the filters remembered on this device
  const fromLink = Object.keys(query).some((k) => k in DEFAULTS);
  const f = fromLink ? { ...DEFAULTS, ...Object.fromEntries(Object.entries(query).filter(([k]) => k in DEFAULTS)) } : { ...DEFAULTS, ...store.get("players:filters", {}) };
  let shown = STEP;
  const clubs = [...db.teams].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
  const heights = Array.from({ length: 13 }, (_, i) => 175 + i * 5);

  root.innerHTML = html`
    <div class="game-head"><div><h1>${icon("players", { size: 30 })} Players</h1>
      <p>Every Winner League player since 2010-11, and EuroLeague players since 2000-01. Click a card for the full career.</p></div>
      <a class="btn" href="#/find">${icon("filter", { size: 15 })} Smart search</a></div>
    <div class="row" style="margin-bottom:12px"><div class="seg" id="f-lg" role="radiogroup" aria-label="Competition">${LEAGUES.map(([v, l]) => `<button role="radio" aria-checked="${f.lg === v}" data-v="${v}" class="${f.lg === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <span class="muted" id="lg-note" style="font-size:13px;flex:1;min-width:220px"></span></div>
    <div class="card pad filters" role="search">
      <div class="guess-input search"><input id="f-q" class="input" placeholder="Search by name…" value="${esc(f.q)}" aria-label="Search by name"></div>
      <select id="f-club" class="input" aria-label="Club"></select>
      <select id="f-season" class="input" aria-label="Season"></select>
      <select id="f-nat" class="input" aria-label="Nationality"><option value="">All nationalities</option><option value="isr" ${f.nat === "isr" ? "selected" : ""}>Israeli</option><option value="foreign" ${f.nat === "foreign" ? "selected" : ""}>Foreign</option></select>
      <div class="row h-range"><select id="f-hmin" class="input" aria-label="Minimum height"><option value="">Min height</option>${heights.map((h) => `<option ${String(h) === f.hmin ? "selected" : ""}>${h}</option>`).join("")}</select>
        <select id="f-hmax" class="input" aria-label="Maximum height"><option value="">Max height</option>${heights.map((h) => `<option ${String(h) === f.hmax ? "selected" : ""}>${h}</option>`).join("")}</select></div>
      <select id="f-sort" class="input" aria-label="Sort by">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${f.sort === k ? "selected" : ""}>Sort: ${l}</option>`).join("")}</select>
      <div class="seg sm pos-seg" id="f-pos" role="radiogroup" aria-label="Position">${["", ...POSITIONS].map((p) => `<button role="radio" aria-checked="${f.pos === p}" data-v="${p}" class="${f.pos === p ? "on" : ""}">${p || "All"}</button>`).join("")}</div>
      <button class="btn ghost" id="f-reset">${icon("refresh", { size: 16 })} Reset</button>
    </div>
    <div class="row" style="margin:14px 0"><b id="count" aria-live="polite">Loading players…</b><span class="spacer"></span>
      <a class="btn ghost" href="#/records">${icon("trophy", { size: 15 })} All-time records</a>
      <a class="btn ghost" href="#/compare">${icon("users", { size: 15 })} Compare players</a>
      <button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link to these results</button></div>
    <div class="card-grid browse" id="grid">${skeletonCards(12)}</div>
    <div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="more">Show more</button></div>`;

  let E = null;
  /** Club and season choices for the chosen competition(s). */
  function fillSelects() {
    const wlClubs = clubs.map((t) => [t.team_id, t.canonical_name]);
    const elClubs = Object.entries(EL_INDEX.teams).sort((a, b) => a[1].localeCompare(b[1]));
    const list = f.lg === "wl" ? wlClubs : f.lg === "el" ? elClubs : [...new Map([...wlClubs, ...elClubs]).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const seasons = f.lg === "wl" ? db.metadata.season_list : f.lg === "el" ? EL_SEASONS : [...new Set([...EL_SEASONS, ...db.metadata.season_list])].sort();
    if (f.club && !list.some(([id]) => id === f.club)) f.club = "";
    if (f.season && !seasons.includes(f.season)) f.season = "";
    root.querySelector("#f-club").innerHTML = `<option value="">All clubs</option>${list.map(([id, n]) => `<option value="${id}" ${f.club === id ? "selected" : ""}>${esc(n)}</option>`).join("")}`;
    root.querySelector("#f-season").innerHTML = `<option value="">All seasons</option>${seasons.slice().reverse().map((s) => `<option ${f.season === s ? "selected" : ""}>${s}</option>`).join("")}`;
    root.querySelector("#lg-note").textContent = f.lg === "wl" ? "" : "EuroLeague cards show clubs and seasons only (its stats are placeholder data). Nationality, height and position filters use Winner League details, so they only include players who also played there.";
  }
  function filteredEl(q, skipWl) {
    const needWlFacts = f.nat || f.hmin || f.hmax || f.pos;
    return allElRows(E).filter((r) => {
      if (skipWl && r.wl) return false; // "Both": Winner League players are already listed (with their EL badge)
      if (q && !r.nameKey.includes(q)) return false;
      if (f.club && !r.teams.includes(f.club)) return false;
      if (f.season && !r.career.some((x) => x.season === f.season && (!f.club || x.team_id === f.club))) return false;
      if (needWlFacts) {
        if (!r.wl) return false;
        if (f.nat === "isr" && !isIsraeli(r.wl)) return false;
        if (f.nat === "foreign" && isIsraeli(r.wl)) return false;
        if (f.hmin && !(r.wl.height_cm >= Number(f.hmin))) return false;
        if (f.hmax && !(r.wl.height_cm <= Number(f.hmax))) return false;
        if (f.pos && r.wl.primary_position !== f.pos) return false;
      }
      return true;
    });
  }
  const bySeasons = (a, b) => b.seasons - a.seasons || a.name.localeCompare(b.name);
  function filtered() {
    const q = f.q.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (f.lg === "el") return filteredEl(q, false).sort(f.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : bySeasons);
    let list = allRows().filter(({ p, cs, nameKey }) => {
      if (q && !nameKey.includes(q)) return false;
      if (f.club && !cs.teams.includes(f.club)) return false;
      if (f.season && !cs.records.some((r) => r.season === f.season && (!f.club || r.team_id === f.club))) return false;
      if (f.nat === "isr" && !isIsraeli(p)) return false;
      if (f.nat === "foreign" && isIsraeli(p)) return false;
      if (f.hmin && !(p.height_cm >= Number(f.hmin))) return false;
      if (f.hmax && !(p.height_cm <= Number(f.hmax))) return false;
      return true;
    }).map((r) => {
      // the card shows the filtered season (and club) when one is chosen, otherwise the best season
      let rec = r.best;
      if (f.season || f.club) {
        const recs = r.cs.records.filter((x) => (!f.season || x.season === f.season) && (!f.club || x.team_id === f.club));
        rec = recs.sort((a, b) => (b.stats ? b.rating_mock : 0) - (a.stats ? a.rating_mock : 0))[0] || r.best;
      }
      return { ...r, rec };
    });
    if (f.pos) list = list.filter((r) => (r.rec.position || r.p.primary_position) === f.pos);
    const by = {
      rating: (a, b) => (b.rec.stats ? b.rec.rating_mock : 0) - (a.rec.stats ? a.rec.rating_mock : 0) || a.p.name.localeCompare(b.p.name),
      name: (a, b) => a.p.name.localeCompare(b.p.name),
      seasons: (a, b) => b.cs.seasonsPlayed - a.cs.seasonsPlayed || b.cs.totalGames - a.cs.totalGames,
      ppg: (a, b) => b.ppg - a.ppg,
      height: (a, b) => (b.p.height_cm || 0) - (a.p.height_cm || 0),
    }[f.sort];
    list.sort(by);
    if (f.lg === "all") {
      // EuroLeague-only players follow (or mix in by name)
      const extra = filteredEl(q, true).sort(f.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : bySeasons);
      list = f.sort === "name" ? [...list, ...extra].sort((a, b) => (a.el ? a.name : a.p.name).localeCompare(b.el ? b.name : b.p.name)) : [...list, ...extra];
    }
    return list;
  }

  function syncUrl() {
    const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && v !== DEFAULTS[k])).toString();
    history.replaceState(history.state, "", "#/players" + (qs ? "?" + qs : "")); // no reload, shareable
  }

  function draw() {
    store.set("players:filters", f);
    syncUrl();
    if (f.lg !== "wl" && !E) {
      root.querySelector("#count").textContent = "Loading the EuroLeague players…";
      loadEuroleague().then((x) => { E = x; if (!signal.aborted) draw(); });
      return;
    }
    const list = filtered();
    const elOnly = list.filter((r) => r.el && !r.wl).length;
    root.querySelector("#count").textContent = `${list.length.toLocaleString()} player${list.length === 1 ? "" : "s"}${f.lg === "all" && elOnly ? ` (${elOnly.toLocaleString()} EuroLeague only)` : ""}`;
    root.querySelector("#grid").innerHTML = list.length ? list.slice(0, shown).map((r) => r.el
      ? (r.wl ? `<div class="pc-cell clickable" data-profile="${r.id}" role="button" tabindex="0" aria-label="Open ${esc(r.name)} profile">${elCard(r, f.season, f.club)}</div>`
        : `<a class="pc-cell clickable" href="#/euroleague/player/${esc(r.id)}" aria-label="Open ${esc(r.name)}, EuroLeague player">${elCard(r, f.season, f.club)}</a>`)
      : `<div class="pc-cell clickable" data-profile="${r.p.player_id}" role="button" tabindex="0" aria-label="Open ${esc(r.p.name)} profile">${playerCard(r.rec, { info: false, hideStats: !r.rec.stats, hideRating: !r.rec.stats })}</div>`).join("")
      : `<div class="empty-state">${icon("search", { size: 34 })}<b>No players match these filters</b><span class="muted">Try removing a filter.</span></div>`;
    root.querySelector("#more").hidden = shown >= list.length;
  }

  root.querySelector("#f-lg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b || b.dataset.v === f.lg) return;
    f.lg = b.dataset.v; shown = STEP;
    if (f.lg === "el" && !["name", "seasons"].includes(f.sort)) f.sort = "seasons";
    root.querySelectorAll("#f-lg button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
    root.querySelector("#f-sort").value = f.sort;
    fillSelects(); draw();
  }, { signal });
  fillSelects();
  const bind = (id, key, ev = "change") => root.querySelector(id).addEventListener(ev, (e) => { f[key] = e.target.value; shown = STEP; draw(); }, { signal });
  bind("#f-club", "club"); bind("#f-season", "season"); bind("#f-nat", "nat"); bind("#f-hmin", "hmin"); bind("#f-hmax", "hmax"); bind("#f-sort", "sort");
  let t;
  root.querySelector("#f-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; shown = STEP; draw(); }, 150); }, { signal });
  root.querySelector("#f-pos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    f.pos = b.dataset.v; shown = STEP;
    root.querySelectorAll("#f-pos button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
    draw();
  }, { signal });
  root.querySelector("#f-reset").addEventListener("click", () => { Object.assign(f, DEFAULTS); store.set("players:filters", f); renderPlayers(root, signal); }, { signal });
  root.querySelector("#more").addEventListener("click", () => { shown += STEP; draw(); }, { signal });
  root.querySelector("#grid").addEventListener("keydown", (e) => {
    const c = e.target.closest("[data-profile]");
    if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); c.click(); }
  }, { signal });
  root.querySelector("#share").addEventListener("click", () => copyLink(location.hash), { signal });
  deferred(signal, draw);
}

