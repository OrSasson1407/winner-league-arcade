// All-time records (#/records?cat=…&il=1&club=…&pos=…): career totals, career averages and
// single-season bests since 2010-11. Regular season only. Totals are per-game averages × games
// played (the data has per-game averages, not game logs), rounded.
import { POSITIONS, db, playersById, teamName } from "../data.js";
import { nameLink } from "../components/playerCard.js";
import { icon, posPill } from "../lib/icons.js";
import { copyLink, deferred, esc, fmt1, html, skeletonCards } from "../ui.js";

const st = (r, k) => r.stats?.[k];
const sumOf = (k) => (rows) => rows.reduce((a, r) => a + (st(r, k) ?? 0) * (st(r, "games") ?? 0), 0);
const avgOf = (k) => (rows) => {
  const g = rows.reduce((a, r) => a + (st(r, k) != null ? st(r, "games") ?? 0 : 0), 0);
  return g ? sumOf(k)(rows) / g : null;
};
const games = (rows) => rows.reduce((a, r) => a + (st(r, "games") ?? 0), 0);

export const CATS = {
  // career totals
  pts: { group: "Career totals", label: "Points", kind: "career", get: sumOf("ppg"), fmt: (v) => Math.round(v).toLocaleString(), est: true },
  reb: { group: "Career totals", label: "Rebounds", kind: "career", get: sumOf("rpg"), fmt: (v) => Math.round(v).toLocaleString(), est: true },
  ast: { group: "Career totals", label: "Assists", kind: "career", get: sumOf("apg"), fmt: (v) => Math.round(v).toLocaleString(), est: true },
  stl: { group: "Career totals", label: "Steals", kind: "career", get: sumOf("spg"), fmt: (v) => Math.round(v).toLocaleString(), est: true },
  blk: { group: "Career totals", label: "Blocks", kind: "career", get: sumOf("bpg"), fmt: (v) => Math.round(v).toLocaleString(), est: true },
  gp: { group: "Career totals", label: "Games played", kind: "career", get: games, fmt: (v) => v.toLocaleString() },
  seasons: { group: "Career totals", label: "Seasons played", kind: "career", get: (rows) => new Set(rows.map((r) => r.season)).size, fmt: String },
  clubs: { group: "Career totals", label: "Clubs played for", kind: "career", get: (rows) => new Set(rows.map((r) => r.team_id)).size, fmt: String },
  // career averages (min 100 games)
  cppg: { group: "Career averages (100+ games)", label: "Points per game", kind: "career", min: 100, get: avgOf("ppg"), fmt: fmt1 },
  crpg: { group: "Career averages (100+ games)", label: "Rebounds per game", kind: "career", min: 100, get: avgOf("rpg"), fmt: fmt1 },
  capg: { group: "Career averages (100+ games)", label: "Assists per game", kind: "career", min: 100, get: avgOf("apg"), fmt: fmt1 },
  cval: { group: "Career averages (100+ games)", label: "Efficiency (VAL) per game", kind: "career", min: 100, get: avgOf("valuation_per_game"), fmt: fmt1 },
  // single season (min 15 games with the team)
  sppg: { group: "Single season (15+ games)", label: "Points per game", kind: "season", get: (r) => st(r, "ppg"), fmt: fmt1 },
  srpg: { group: "Single season (15+ games)", label: "Rebounds per game", kind: "season", get: (r) => st(r, "rpg"), fmt: fmt1 },
  sapg: { group: "Single season (15+ games)", label: "Assists per game", kind: "season", get: (r) => st(r, "apg"), fmt: fmt1 },
  sspg: { group: "Single season (15+ games)", label: "Steals per game", kind: "season", get: (r) => st(r, "spg"), fmt: fmt1 },
  sbpg: { group: "Single season (15+ games)", label: "Blocks per game", kind: "season", get: (r) => st(r, "bpg"), fmt: fmt1 },
  sval: { group: "Single season (15+ games)", label: "Efficiency (VAL) per game", kind: "season", get: (r) => st(r, "valuation_per_game"), fmt: fmt1 },
  sfg: { group: "Single season (15+ games)", label: "Field goal % (8+ PPG)", kind: "season", minPpg: 8, get: (r) => st(r, "fg_pct"), fmt: (v) => fmt1(v) + "%" },
  sft: { group: "Single season (15+ games)", label: "Free throw % (10+ PPG)", kind: "season", minPpg: 10, get: (r) => st(r, "ft_pct"), fmt: (v) => fmt1(v) + "%" },
};
const SEASON_MIN_GAMES = 15;

const isIsraeli = (p) => p?.nationality === "Israel" || (p?.nationalities || []).includes("Israel");

/** Ranked rows for a category with filters { il, club, pos }. */
export function leaders(catKey, { il = false, club = "", pos = "" } = {}, limit = 25) {
  const c = CATS[catKey];
  const played = db.player_seasons.filter((r) => r.appeared_in_regular_season && r.stats && (st(r, "games") ?? 0) > 0);
  const ok = (r) => {
    const p = playersById.get(r.player_id);
    if (!p) return false;
    if (il && !isIsraeli(p)) return false;
    if (club && r.team_id !== club) return false;
    if (pos && (r.position || p.primary_position) !== pos) return false;
    return true;
  };
  let out;
  if (c.kind === "season") {
    out = played.filter((r) => ok(r) && st(r, "games") >= SEASON_MIN_GAMES && (!c.minPpg || (st(r, "ppg") ?? 0) >= c.minPpg) && c.get(r) != null)
      .map((r) => ({ pid: r.player_id, value: c.get(r), sub: `${teamName(r.team_id)} ${r.season} · ${st(r, "games")} GP`, pos: r.position }));
  } else {
    const by = new Map();
    for (const r of played) if (ok(r)) (by.get(r.player_id) || by.set(r.player_id, []).get(r.player_id)).push(r);
    out = [...by.entries()].filter(([, rows]) => !c.min || games(rows) >= c.min).map(([pid, rows]) => {
      const seasons = [...new Set(rows.map((r) => r.season))].sort();
      return { pid, value: c.get(rows), sub: `${seasons[0]}${seasons.length > 1 ? " – " + seasons[seasons.length - 1] : ""} · ${games(rows)} GP`, pos: playersById.get(pid).primary_position };
    }).filter((x) => x.value != null);
  }
  out.sort((a, b) => b.value - a.value);
  return out.slice(0, limit);
}

export function renderRecords(root, signal, params, query = {}) {
  let cat = CATS[query.cat] ? query.cat : "pts";
  let il = query.il === "1", club = query.club || "", pos = POSITIONS.includes(query.pos) ? query.pos : "";
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("trophy", { size: 30 })} All-time records</h1><p>Counting…</p></div></div><div class="card-grid">${skeletonCards(6)}</div>`;
  const clubs = [...db.teams].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
  const sync = () => {
    const q = new URLSearchParams({ cat, ...(il ? { il: "1" } : {}), ...(club ? { club } : {}), ...(pos ? { pos } : {}) });
    history.replaceState(null, "", `#/records?${q}`);
  };
  const draw = () => {
    const c = CATS[cat];
    const rows = leaders(cat, { il, club, pos });
    const groups = [...new Set(Object.values(CATS).map((x) => x.group))];
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/players">← Players</a><h1>${icon("trophy", { size: 30 })} All-time records</h1>
        <p>Winner League regular season since 2010-11. ${club ? `Only games for <b>${esc(teamName(club))}</b>.` : ""}</p></div>
        <button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link</button></div>
      <div class="rec-layout">
        <nav class="card pad rec-cats" aria-label="Record categories">${groups.map((g) => html`<div class="rec-group"><small>${g}</small>
          ${Object.entries(CATS).filter(([, x]) => x.group === g).map(([k, x]) => `<button class="${k === cat ? "on" : ""}" data-cat="${k}" aria-pressed="${k === cat}">${x.label}</button>`).join("")}</div>`).join("")}</nav>
        <div style="display:grid;gap:14px;align-content:start;min-width:0">
          <div class="card pad rec-filters">
            <label class="chk"><input type="checkbox" id="il" ${il ? "checked" : ""}> Israelis only</label>
            <select id="club" class="input" aria-label="Club"><option value="">All clubs</option>${clubs.map((t) => `<option value="${t.team_id}" ${t.team_id === club ? "selected" : ""}>${esc(t.canonical_name)}</option>`).join("")}</select>
            <div class="seg sm" id="pos"><button data-p="" class="${pos ? "" : "on"}">All</button>${POSITIONS.map((p) => `<button data-p="${p}" class="${p === pos ? "on" : ""}">${p}</button>`).join("")}</div>
          </div>
          <div class="card pad">
            <h2 style="margin:0 0 10px">${esc(c.label)} <span class="muted" style="font-size:16px">· ${esc(c.group)}</span></h2>
            ${rows.length ? html`<ol class="rec-list">${rows.map((r, i) => html`<li class="${i < 3 ? "top" : ""}">
              <span class="rec-pos">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
              <span class="rec-who">${nameLink(r.pid, playersById.get(r.pid).name)} ${posPill(r.pos)}<small class="muted">${esc(r.sub)}</small></span>
              <b class="rec-val led">${c.fmt(r.value)}</b>
              <span class="rec-bar" style="--w:${(r.value / rows[0].value) * 100}%"></span></li>`).join("")}</ol>`
              : `<p class="muted">Nobody matches these filters.</p>`}
            <p class="muted" style="font-size:12px;margin:10px 0 0">${c.est ? "Totals are estimated from per-game averages × games played (the league data has per-game averages, not game logs). " : ""}Regular season only, from the official league site. Playoffs and cups aren't included.</p>
          </div>
        </div>
      </div>`;
    root.querySelector(".rec-cats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; sync(); draw(); } }, { signal });
    root.querySelector("#il").addEventListener("change", (e) => { il = e.target.checked; sync(); draw(); }, { signal });
    root.querySelector("#club").addEventListener("change", (e) => { club = e.target.value; sync(); draw(); }, { signal });
    root.querySelector("#pos").addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { pos = b.dataset.p; sync(); draw(); } }, { signal });
    root.querySelector("#share").addEventListener("click", () => copyLink(), { signal });
  };
  deferred(signal, draw);
}
