// Clubs: list of every club (#/clubs) and a page per club (#/club/<id>[/<season>]).
import { H, db, playersById, teamName } from "../data.js";
import { nameLink, playerCard } from "../components/playerCard.js";
import { crestSvg, icon, posPill } from "../lib/icons.js";
import { clubColors } from "../lib/clubs.js";
import { copyLink, deferred, esc, fmt1, html, skeletonCards, skeletonTiles } from "../ui.js";

/** All records of a club, grouped: seasons, best record per player, seasons per player. */
function clubData(teamId) {
  const seasons = db.season_teams.filter((s) => s.team_id === teamId).sort((a, b) => a.season.localeCompare(b.season));
  const recs = seasons.flatMap((s) => H.getPlayersByTeam(teamId, s.season));
  const bestByPlayer = new Map(), seasonsByPlayer = new Map();
  for (const r of recs) {
    if (!playersById.get(r.player_id)?.name) continue;
    if (r.stats && r.appeared_in_regular_season) {
      const cur = bestByPlayer.get(r.player_id);
      if (!cur || r.rating_mock > cur.rating_mock) bestByPlayer.set(r.player_id, r);
      seasonsByPlayer.set(r.player_id, (seasonsByPlayer.get(r.player_id) || new Set()).add(r.season));
    }
  }
  return { seasons, recs, bestByPlayer, seasonsByPlayer, players: new Set(recs.map((r) => r.player_id)).size };
}

export function renderClubs(root, signal) {
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("shield", { size: 30 })} Clubs</h1><p>Loading clubs…</p></div></div><div class="club-grid">${skeletonTiles(12)}</div>`;
  deferred(signal, () => drawClubs(root));
}

function drawClubs(root) {
  const clubs = db.teams.map((t) => ({ t, d: clubData(t.team_id) })).filter((x) => x.d.seasons.length)
    .sort((a, b) => b.d.seasons.length - a.d.seasons.length || a.t.canonical_name.localeCompare(b.t.canonical_name));
  root.innerHTML = html`
    <div class="game-head"><div><h1>${icon("shield", { size: 30 })} Clubs</h1>
      <p>${clubs.length} clubs have played in the Premier League since 2010-11.</p></div></div>
    <div class="club-grid">${clubs.map(({ t, d }) => {
      const best = [...d.bestByPlayer.values()].sort((a, b) => b.rating_mock - a.rating_mock)[0];
      const [c1] = clubColors(t.team_id);
      return html`<a class="card club-tile" href="#/club/${t.team_id}" style="--club:${c1}">
        ${crestSvg(t.team_id, t.canonical_name, 58)}
        <div class="ct-body"><h2>${esc(t.canonical_name)}</h2>
          <div class="muted">${d.seasons.length} season${d.seasons.length === 1 ? "" : "s"} · ${d.seasons[0].season.slice(0, 4)}–${d.seasons[d.seasons.length - 1].season.slice(5)} · ${d.players} players</div>
          ${best ? `<div class="ct-star">${icon("star", { size: 14 })} ${esc(playersById.get(best.player_id).name)} <span class="muted">${best.rating_mock} · ${best.season}</span></div>` : ""}
        </div>${icon("arrowRight", { size: 18, cls: "ct-go" })}</a>`;
    }).join("")}</div>`;
}

export function renderClub(root, signal, params = []) {
  root.innerHTML = `<a class="back" href="#/clubs">← Clubs</a><div class="skel skel-hero" aria-hidden="true"></div><div class="card-grid browse" style="margin-top:18px">${skeletonCards(6)}</div>`;
  deferred(signal, () => drawClub(root, signal, params));
}

function drawClub(root, signal, params) {
  const teamId = params[0];
  const team = db.teams.find((t) => t.team_id === teamId);
  if (!team) { root.innerHTML = `<a class="back" href="#/clubs">← Clubs</a><h1>Club not found</h1>`; return; }
  const d = clubData(teamId);
  const season = params[1] && d.seasons.some((s) => s.season === params[1]) ? params[1] : d.seasons[d.seasons.length - 1].season;
  const [c1, c2] = clubColors(teamId);
  const greats = [...d.bestByPlayer.values()].sort((a, b) => b.rating_mock - a.rating_mock).slice(0, 10);
  const loyal = [...d.seasonsByPlayer.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 8);
  const roster = (() => {
    const best = new Map();
    for (const r of H.getPlayersByTeam(teamId, season)) {
      if (!playersById.get(r.player_id)?.name) continue;
      const cur = best.get(r.player_id);
      if (!cur || (r.stats?.games ?? 0) > (cur.stats?.games ?? 0)) best.set(r.player_id, r);
    }
    return [...best.values()].sort((a, b) => (b.stats?.mpg ?? -1) - (a.stats?.mpg ?? -1));
  })();
  const names = [...new Set(d.seasons.map((s) => s.team_name))];
  root.innerHTML = html`
    <div class="row"><a class="back" href="#/clubs">← Clubs</a><span class="spacer"></span><button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link</button></div>
    <div class="card club-hero" style="--club:${c1};--club2:${c2}">
      ${crestSvg(teamId, team.canonical_name, 110)}
      <div><div class="muted" style="font-weight:700;letter-spacing:2px;font-size:12px">CLUB</div><h1>${esc(team.canonical_name)}</h1>
        <div class="facts">
          <div class="fact"><small>Seasons</small><b>${d.seasons.length}</b></div>
          <div class="fact"><small>First / last</small><b>${d.seasons[0].season} / ${d.seasons[d.seasons.length - 1].season}</b></div>
          <div class="fact"><small>Players used</small><b>${d.players}</b></div>
          <div class="fact"><small>Official names</small><b>${names.length}</b></div>
        </div></div>
    </div>
    <div class="card pad" style="margin-top:18px"><h3>${icon("calendar")} Seasons</h3>
      <div class="season-chips">${d.seasons.map((s) => `<a class="chip-link ${s.season === season ? "on" : ""}" href="#/club/${teamId}/${s.season}" title="${esc(s.team_name)}">${s.season}</a>`).join("")}</div>
    </div>
    <div class="card pad" style="margin-top:18px">
      <div class="row"><h3>${esc(d.seasons.find((s) => s.season === season).team_name)} · ${season}</h3><span class="spacer"></span><a class="btn ghost" href="#/season/${season}">${icon("calendar", { size: 16 })} Season ${season}</a></div>
      <div class="card-grid browse">${roster.map((r) => `<div class="pc-cell">${playerCard(r, { hideStats: !r.stats, hideRating: !r.stats })}</div>`).join("") || `<p class="muted">No roster data.</p>`}</div>
    </div>
    <div class="season-grid" style="margin-top:18px">
      <div class="card pad"><h3>${icon("trophy")} All-time best seasons</h3>
        <div class="grid-wrap"><table class="stat-table"><thead><tr><th>Player</th><th>Season</th><th>Pos</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>Rating</th></tr></thead>
        <tbody>${greats.map((r) => `<tr><td>${nameLink(r.player_id)}</td><td>${r.season}</td><td>${posPill(r.position)}</td><td>${r.stats.games}</td><td>${fmt1(r.stats.ppg)}</td><td>${fmt1(r.stats.rpg)}</td><td>${fmt1(r.stats.apg)}</td><td class="rating">${r.rating_mock}</td></tr>`).join("")}</tbody></table></div>
      </div>
      <div style="display:grid;gap:18px;align-content:start">
        <div class="card pad"><h3>${icon("medal")} Most seasons at the club</h3>
          <ol class="rank-list">${loyal.map(([pid, set]) => `<li>${nameLink(pid)}<span class="muted">${set.size} season${set.size === 1 ? "" : "s"}</span></li>`).join("")}</ol></div>
        <div class="card pad"><h3>${icon("info")} Official names</h3>
          <div class="name-list">${d.seasons.map((s) => `<div><span class="muted">${s.season}</span> ${esc(s.team_name)}</div>`).join("")}</div></div>
      </div>
    </div>`;  root.querySelector("#share").addEventListener("click", () => copyLink(`#/club/${teamId}/${season}`), { signal });
}

