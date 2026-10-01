// Players browser: filter all players by name, club, season, position, nationality and height.
import { careerSummary, db, namedPlayers, POSITIONS, teamName } from "../data.js";
import { bestSeason, playerCard } from "../components/playerCard.js";
import { icon } from "../lib/icons.js";
import { copyLink, deferred, esc, html, skeletonCards, store } from "../ui.js";

const STEP = 48;
const SORTS = { rating: "Best rating", name: "Name A–Z", seasons: "Most seasons", ppg: "Career PPG", height: "Tallest" };
const DEFAULTS = { q: "", club: "", season: "", pos: "", nat: "", hmin: "", hmax: "", sort: "rating" };

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

export function renderPlayers(root, signal, params = [], query = {}) {
  // a shared link (#/players?club=…&season=…) wins over the filters remembered on this device
  const fromLink = Object.keys(query).some((k) => k in DEFAULTS);
  const f = fromLink ? { ...DEFAULTS, ...Object.fromEntries(Object.entries(query).filter(([k]) => k in DEFAULTS)) } : { ...DEFAULTS, ...store.get("players:filters", {}) };
  let shown = STEP;
  const clubs = [...db.teams].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
  const heights = Array.from({ length: 13 }, (_, i) => 175 + i * 5);

  root.innerHTML = html`
    <div class="game-head"><div><h1>${icon("players", { size: 30 })} Players</h1>
      <p>Every player in the database since 2010-11. Click a card for the full career.</p></div></div>
    <div class="card pad filters" role="search">
      <div class="guess-input search"><input id="f-q" class="input" placeholder="Search by name…" value="${esc(f.q)}" aria-label="Search by name"></div>
      <select id="f-club" class="input" aria-label="Club"><option value="">All clubs</option>${clubs.map((t) => `<option value="${t.team_id}" ${f.club === t.team_id ? "selected" : ""}>${esc(t.canonical_name)}</option>`).join("")}</select>
      <select id="f-season" class="input" aria-label="Season"><option value="">All seasons</option>${db.metadata.season_list.map((s) => `<option ${f.season === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select id="f-nat" class="input" aria-label="Nationality"><option value="">All nationalities</option><option value="isr" ${f.nat === "isr" ? "selected" : ""}>Israeli</option><option value="foreign" ${f.nat === "foreign" ? "selected" : ""}>Foreign</option></select>
      <div class="row h-range"><select id="f-hmin" class="input" aria-label="Minimum height"><option value="">Min height</option>${heights.map((h) => `<option ${String(h) === f.hmin ? "selected" : ""}>${h}</option>`).join("")}</select>
        <select id="f-hmax" class="input" aria-label="Maximum height"><option value="">Max height</option>${heights.map((h) => `<option ${String(h) === f.hmax ? "selected" : ""}>${h}</option>`).join("")}</select></div>
      <select id="f-sort" class="input" aria-label="Sort by">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${f.sort === k ? "selected" : ""}>Sort: ${l}</option>`).join("")}</select>
      <div class="seg sm pos-seg" id="f-pos" role="radiogroup" aria-label="Position">${["", ...POSITIONS].map((p) => `<button role="radio" aria-checked="${f.pos === p}" data-v="${p}" class="${f.pos === p ? "on" : ""}">${p || "All"}</button>`).join("")}</div>
      <button class="btn ghost" id="f-reset">${icon("refresh", { size: 16 })} Reset</button>
    </div>
    <div class="row" style="margin:14px 0"><b id="count" aria-live="polite">Loading players…</b><span class="spacer"></span>
      <a class="btn ghost" href="#/compare">${icon("users", { size: 15 })} Compare players</a>
      <button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link to these results</button></div>
    <div class="card-grid browse" id="grid">${skeletonCards(12)}</div>
    <div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="more">Show more</button></div>`;

  function filtered() {
    const q = f.q.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
    return list.sort(by);
  }

  function syncUrl() {
    const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && v !== DEFAULTS[k])).toString();
    history.replaceState(history.state, "", "#/players" + (qs ? "?" + qs : "")); // no reload, shareable
  }

  function draw() {
    store.set("players:filters", f);
    syncUrl();
    const list = filtered();
    root.querySelector("#count").textContent = `${list.length.toLocaleString()} player${list.length === 1 ? "" : "s"}`;
    root.querySelector("#grid").innerHTML = list.length ? list.slice(0, shown).map(({ p, rec }) =>
      `<div class="pc-cell clickable" data-profile="${p.player_id}" role="button" tabindex="0" aria-label="Open ${esc(p.name)} profile">${playerCard(rec, { info: false, hideStats: !rec.stats, hideRating: !rec.stats })}</div>`).join("")
      : `<div class="empty-state">${icon("search", { size: 34 })}<b>No players match these filters</b><span class="muted">Try removing a filter.</span></div>`;
    root.querySelector("#more").hidden = shown >= list.length;
  }

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

