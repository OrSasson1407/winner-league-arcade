// Seasons: list (#/seasons) and a page per season (#/season/<season>) with teams and stat leaders.
import { CURRENT, H, db, isPlayable, playersById } from "../data.js";
import { nameLink } from "../components/playerCard.js";
import { crestSvg, icon, posPill } from "../lib/icons.js";
import { copyLink, deferred, esc, fmt1, html, skeletonTiles } from "../ui.js";

const LEADERS = [
  { key: "ppg", label: "Points per game", get: (r) => r.stats.ppg, dec: 1 },
  { key: "rpg", label: "Rebounds per game", get: (r) => r.stats.rpg, dec: 1 },
  { key: "apg", label: "Assists per game", get: (r) => r.stats.apg, dec: 1 },
  { key: "val", label: "Efficiency (VAL) per game", get: (r) => r.stats.valuation_per_game, dec: 1 },
  { key: "rating", label: "Game rating", get: (r) => r.rating_mock, dec: 0 },
];
const MIN_GAMES = 10;

function seasonRecords(season) {
  return H.getPlayersBySeason(season).filter((r) => isPlayable(r, MIN_GAMES));
}
const topBy = (recs, get) => recs.filter((r) => get(r) !== null && get(r) !== undefined).sort((a, b) => get(b) - get(a));

export function renderSeasons(root, signal) {
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("calendar", { size: 30 })} Seasons</h1><p>Loading seasons…</p></div></div><div class="club-grid">${skeletonTiles(9)}</div>`;
  deferred(signal, () => drawSeasons(root));
}

function drawSeasons(root) {
  const seasons = [...db.seasons].reverse();
  root.innerHTML = html`
    <div class="game-head"><div><h1>${icon("calendar", { size: 30 })} Seasons</h1>
      <p>17 seasons from 2010-11 to today. Regular-season stats, from the official league records.</p></div></div>
    <div class="club-grid">${seasons.map((s) => {
      const recs = seasonRecords(s.season);
      const scorer = topBy(recs, (r) => r.stats.ppg)[0];
      const best = topBy(recs, (r) => r.rating_mock)[0];
      return html`<a class="card club-tile season-tile" href="#/season/${s.season}">
        <div class="st-year led">${s.season}</div>
        <div class="ct-body"><h2>${s.teams.length} teams${s.season === CURRENT ? ' <span class="pill live-pill">In progress</span>' : ""}</h2>
          ${scorer ? `<div class="muted">Top scorer: <b>${esc(playersById.get(scorer.player_id).name)}</b> ${fmt1(scorer.stats.ppg)} PPG</div>` : `<div class="muted">Regular season not started yet</div>`}
          ${best ? `<div class="ct-star">${icon("star", { size: 14 })} ${esc(playersById.get(best.player_id).name)} <span class="muted">rating ${best.rating_mock}</span></div>` : ""}
        </div>${icon("arrowRight", { size: 18, cls: "ct-go" })}</a>`;
    }).join("")}</div>`;
}

export function renderSeason(root, signal, params = []) {
  root.innerHTML = `<a class="back" href="#/seasons">← Seasons</a><div class="club-grid compact" style="margin-top:18px">${skeletonTiles(12)}</div>`;
  deferred(signal, () => drawSeason(root, signal, params));
}

function drawSeason(root, signal, params) {
  const season = params[0];
  const meta = db.seasons.find((s) => s.season === season);
  if (!meta) { root.innerHTML = `<a class="back" href="#/seasons">← Seasons</a><h1>Season not found</h1>`; return; }
  const idx = db.metadata.season_list.indexOf(season);
  const prev = db.metadata.season_list[idx - 1], next = db.metadata.season_list[idx + 1];
  const recs = seasonRecords(season);
  const teams = H.getTeamsBySeason(season).map((t) => {
    const roster = H.getPlayersByTeam(t.team_id, season).filter((r) => playersById.get(r.player_id)?.name);
    const best = roster.filter((r) => r.stats).sort((a, b) => b.rating_mock - a.rating_mock)[0];
    return { t, size: new Set(roster.map((r) => r.player_id)).size, best };
  });
  const board = (L) => {
    const top = topBy(recs, L.get).slice(0, 10);
    const max = top.length ? L.get(top[0]) : 1;
    return html`<div class="card pad leader-card"><h3>${esc(L.label)}</h3>
      <ol class="leaders">${top.map((r) => {
        const v = L.get(r);
        return `<li title="${esc(playersById.get(r.player_id).name)}: ${v.toFixed(L.dec)} ${esc(L.label.toLowerCase())} (${r.stats.games} games)">
          <span class="ld-name">${nameLink(r.player_id)} <small class="muted">${esc(r.team_name)}</small></span>
          <span class="ld-bar"><i style="width:${Math.max(4, (v / max) * 100)}%"></i></span><b class="ld-val">${v.toFixed(L.dec)}</b></li>`;
      }).join("")}</ol></div>`;
  };
  root.innerHTML = html`
    <div class="row"><a class="back" href="#/seasons">← Seasons</a><span class="spacer"></span>
      <button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link</button>
      ${prev ? `<a class="btn ghost" href="#/season/${prev}">${icon("arrowLeft", { size: 16 })} ${prev}</a>` : ""}
      ${next ? `<a class="btn ghost" href="#/season/${next}">${next} ${icon("arrowRight", { size: 16 })}</a>` : ""}</div>
    <div class="game-head"><div><h1>Season <span class="led">${season}</span></h1>
      <p>${teams.length} teams${season === CURRENT ? " · season in progress: rosters only, no stats yet" : ` · leaders need at least ${MIN_GAMES} games`}</p></div></div>
    <div class="club-grid compact">${teams.map(({ t, size, best }) => html`<a class="card club-tile" href="#/club/${t.team_id}/${season}">
      ${crestSvg(t.team_id, t.team_name, 46)}
      <div class="ct-body"><h2>${esc(t.team_name)}</h2><div class="muted">${size} players${best ? ` · best: ${esc(playersById.get(best.player_id).name)} (${best.rating_mock})` : ""}</div></div></a>`).join("")}</div>
    ${recs.length ? html`<h2 style="margin:26px 0 12px">${icon("trophy", { size: 22 })} Season leaders</h2>
      <div class="leaders-grid">${LEADERS.map(board).join("")}</div>
      <div class="card pad" style="margin-top:18px"><h3>Top 15 by game rating</h3>
        <div class="grid-wrap"><table class="stat-table"><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>VAL</th><th>Rating</th></tr></thead>
        <tbody>${topBy(recs, (r) => r.rating_mock).slice(0, 15).map((r) => `<tr><td>${nameLink(r.player_id)}</td><td>${esc(r.team_name)}</td><td>${posPill(r.position)}</td><td>${r.stats.games}</td><td>${fmt1(r.stats.mpg)}</td><td>${fmt1(r.stats.ppg)}</td><td>${fmt1(r.stats.rpg)}</td><td>${fmt1(r.stats.apg)}</td><td>${fmt1(r.stats.valuation_per_game)}</td><td class="rating">${r.rating_mock}</td></tr>`).join("")}</tbody></table></div>
      </div>` : ""}`;
  root.querySelector("#share").addEventListener("click", () => copyLink(`#/season/${season}`), { signal });
}
