// EuroLeague pages: #/euroleague (seasons, clubs, Israeli clubs), #/euroleague/season/<s>,
// #/euroleague/club/<id>[/<season>], #/euroleague/player/<id>. Names, clubs and seasons come from the
// EuroLeague data; its stats and most bios are placeholder (mock), so these pages show rosters, not numbers.
import { LEAGUE, teamName } from "../data.js";
import { playersById } from "../wl.js"; // "also in the Winner League": the Winner League data, whatever the league choice
import { EL_INDEX, EL_SEASONS, MOCK_NOTE, elTeamName, isWLClub, loadEuroleague } from "../euroleague.js";
import { nameLink } from "../components/playerCard.js";
import { crestSvg, icon } from "../lib/icons.js";
import { clubColors } from "../lib/clubs.js";
import { copyLink, esc, html } from "../ui.js";
import { skeletonHtml } from "../lib/ux.js";

const isWL = (pid) => playersById.has(pid);
// Winner League profiles and club pages exist in the Winner League and the mixed choices
const WL_LINKS = LEAGUE === "wl" || LEAGUE === "all";
const WL_CHIP = `<span class="wl-chip" title="Also played in the Winner League">WL</span>`;
/** A player's name: Winner League players open their full profile; others their EuroLeague page. */
const who = (pid, name) => (isWL(pid) && WL_LINKS ? `${nameLink(pid, name)} ${WL_CHIP}` : isWL(pid) ? `<a class="link-name" href="#/euroleague/player/${esc(pid)}">${esc(name)}</a> ${WL_CHIP}` : `<a class="link-name" href="#/euroleague/player/${esc(pid)}">${esc(name)}</a>`);
const note = `<p class="muted el-note">${icon("info", { size: 14 })}<span>Names, clubs and seasons are from the EuroLeague data. ${MOCK_NOTE} Players marked ${WL_CHIP} also played in the Winner League.</span></p>`;

export async function renderEuroleague(root, signal, params = []) {
  root.innerHTML = skeletonHtml("clubs");
  const E = await loadEuroleague();
  if (signal.aborted) return;
  const [kind, id, extra] = params;
  if (kind === "season") return drawSeason(root, E, id);
  if (kind === "club") return drawClub(root, signal, E, id, extra);
  if (kind === "player") return drawPlayer(root, E, id);
  drawHub(root, signal, E);
}

function drawHub(root, signal, E) {
  const clubs = E.db.teams.map((t) => ({ id: t.team_id, name: t.canonical_name, seasons: E.seasonsOf(t.team_id) }))
    .filter((c) => c.seasons.length).sort((a, b) => b.seasons.length - a.seasons.length || a.name.localeCompare(b.name));
  const israeli = Object.entries(EL_INDEX.israeli).sort((a, b) => a[0].localeCompare(b[0]));
  root.innerHTML = html`
    <div class="game-head"><div><h1>${icon("globe", { size: 30 })} EuroLeague</h1>
      <p>${EL_SEASONS.length} seasons (${EL_SEASONS[0]} to ${EL_SEASONS[EL_SEASONS.length - 1]}), ${clubs.length} clubs. A separate competition from the Winner League pages.</p></div></div>
    ${note}
    <section class="card pad" style="margin-bottom:16px"><h2>${icon("flag")} Israeli clubs in the EuroLeague</h2>
      <div class="el-il">${israeli.map(([s, list]) => `<a class="el-il-season" href="#/euroleague/season/${s}"><b>${s}</b>${list.map((x) => `<span title="${esc(teamName(x.team))}">${crestSvg(x.team, teamName(x.team), 22)}</span>`).join("")}</a>`).join("")}</div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Seasons missing here are missing from the EuroLeague data itself.</p></section>
    <section style="margin-bottom:18px"><h2>${icon("calendar")} Seasons</h2>
      <div class="club-grid compact">${EL_SEASONS.slice().reverse().map((s) => {
        const il = EL_INDEX.israeli[s] || [];
        return `<a class="card club-tile season-tile" href="#/euroleague/season/${s}"><div class="ct-body"><h2>${s}</h2>
          <div class="muted">${(EL_INDEX.seasonTeams[s] || []).length} clubs · ${EL_INDEX.wlCount[s] || 0} Winner League players</div>
          ${il.length ? `<div class="ct-star">${il.map((x) => esc(teamName(x.team))).join(" · ")}</div>` : ""}</div>${icon("arrowRight", { size: 18, cls: "ct-go" })}</a>`;
      }).join("")}</div></section>
    <section><div class="row"><h2 style="margin:0">${icon("shield")} Clubs</h2><span class="spacer"></span><input id="el-q" class="input" style="max-width:260px" placeholder="Filter clubs…" aria-label="Filter clubs"></div>
      <div class="club-grid compact" id="el-clubs" style="margin-top:12px">${clubs.map((c) => `<a class="card club-tile" data-n="${esc(c.name.toLowerCase())}" href="#/euroleague/club/${c.id}" style="--club:${clubColors(c.id)[0]}">
        ${crestSvg(c.id, c.name, 46)}<div class="ct-body"><h2>${esc(c.name)}${isWLClub(c.id) ? ` ${WL_CHIP}` : ""}</h2><div class="muted">${c.seasons.length} season${c.seasons.length === 1 ? "" : "s"} · ${c.seasons[0].slice(0, 4)}–${c.seasons[c.seasons.length - 1].slice(5)}</div></div>${icon("arrowRight", { size: 18, cls: "ct-go" })}</a>`).join("")}</div></section>`;
  root.querySelector("#el-q").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll("#el-clubs [data-n]").forEach((a) => { a.hidden = q && !a.dataset.n.includes(q); });
  }, { signal });
}

function rosterList(E, season, tid) {
  const r = E.roster(season, tid);
  return r.length ? `<ul class="clean el-roster">${r.map((ps) => `<li>${who(ps.player_id, E.name(ps.player_id))}</li>`).join("")}</ul>` : `<p class="muted">No roster in the data.</p>`;
}

function drawSeason(root, E, season) {
  if (!EL_INDEX.seasonTeams[season]) { root.innerHTML = `<h1>Season not found</h1><p><a href="#/euroleague">EuroLeague seasons</a></p>`; return; }
  const teams = E.teamsOf(season).slice().sort((a, b) => Number(isWLClub(b)) - Number(isWLClub(a)) || elTeamName(a).localeCompare(elTeamName(b)));
  const i = EL_SEASONS.indexOf(season);
  root.innerHTML = html`
    <div class="game-head"><div><h1>EuroLeague ${season}</h1>
      <p>${teams.length} clubs · ${EL_INDEX.wlCount[season] || 0} players who also played in the Winner League.</p></div>
      <div class="row">${i > 0 ? `<a class="btn ghost" href="#/euroleague/season/${EL_SEASONS[i - 1]}">← ${EL_SEASONS[i - 1]}</a>` : ""}${i >= 0 && i < EL_SEASONS.length - 1 ? `<a class="btn ghost" href="#/euroleague/season/${EL_SEASONS[i + 1]}">${EL_SEASONS[i + 1]} →</a>` : ""}</div></div>
    ${note}
    <div class="el-season">${teams.map((tid) => {
      const r = E.roster(season, tid), wl = r.filter((ps) => isWL(ps.player_id)).length;
      const open = isWLClub(tid);
      return `<details class="card el-team ${open ? "il" : ""}" ${open ? "open" : ""} style="--club:${clubColors(tid)[0]}">
        <summary>${crestSvg(tid, elTeamName(tid), 34)}<span><b>${esc(E.officialName(season, tid))}</b><small class="muted">${r.length} players${wl ? ` · ${wl} from the Winner League` : ""}</small></span>${icon("arrowRight", { size: 16, cls: "el-chev" })}</summary>
        ${rosterList(E, season, tid)}
        <p class="el-team-link"><a href="#/euroleague/club/${tid}/${season}">${esc(elTeamName(tid))} club page →</a></p></details>`;
    }).join("")}</div>`;
}

function drawClub(root, signal, E, tid, wanted) {
  const seasons = E.seasonsOf(tid);
  if (!seasons.length) { root.innerHTML = `<h1>Club not found</h1><p><a href="#/euroleague">EuroLeague clubs</a></p>`; return; }
  const season = seasons.includes(wanted) ? wanted : seasons[seasons.length - 1];
  const [c1, c2] = clubColors(tid);
  const names = [...new Set(seasons.map((s) => E.officialName(s, tid)))];
  const allPlayers = new Set(seasons.flatMap((s) => E.roster(s, tid).map((r) => r.player_id)));
  const wlPlayers = [...allPlayers].filter(isWL);
  root.innerHTML = html`
    <div class="row"><span class="spacer"></span>${isWLClub(tid) && WL_LINKS ? `<a class="btn" href="#/club/${tid}">${icon("shield", { size: 15 })} Winner League page</a>` : ""}<button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link</button></div>
    <div class="card club-hero" style="--club:${c1};--club2:${c2}">
      ${crestSvg(tid, elTeamName(tid), 100)}
      <div><div class="muted" style="font-weight:700;letter-spacing:2px;font-size:12px">EUROLEAGUE CLUB</div><h1>${esc(elTeamName(tid))}</h1>
        <div class="facts">
          <div class="fact"><small>Seasons</small><b>${seasons.length}</b></div>
          <div class="fact"><small>First / last</small><b>${seasons[0]} / ${seasons[seasons.length - 1]}</b></div>
          <div class="fact"><small>Players</small><b>${allPlayers.size}</b></div>
          <div class="fact"><small>From the Winner League</small><b>${wlPlayers.length}</b></div>
        </div>
        ${names.length > 1 ? `<p class="muted" style="font-size:13px;margin:8px 0 0">Also known as: ${names.filter((n) => n !== elTeamName(tid)).map(esc).join(" · ")}</p>` : ""}</div>
    </div>
    ${note}
    <div class="card pad" style="margin-top:16px">
      <div class="row"><h2 style="margin:0">Roster ${season}</h2><span class="spacer"></span>
        <select id="el-season" class="input" style="max-width:160px" aria-label="Season">${seasons.slice().reverse().map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      ${rosterList(E, season, tid)}
      <p style="margin:10px 0 0"><a href="#/euroleague/season/${season}">All clubs in ${season} →</a></p>
    </div>
    ${wlPlayers.length ? `<div class="card pad" style="margin-top:16px"><h2>${icon("users")} Winner League players at ${esc(elTeamName(tid))}</h2>
      <ul class="clean el-roster">${wlPlayers.map((pid) => `<li>${who(pid, playersById.get(pid).name)} <small class="muted">${seasons.filter((s) => E.roster(s, tid).some((r) => r.player_id === pid)).join(", ")}</small></li>`).join("")}</ul></div>` : ""}`;
  root.querySelector("#el-season").addEventListener("change", (e) => { location.hash = `#/euroleague/club/${tid}/${e.target.value}`; }, { signal });
  root.querySelector("#share").addEventListener("click", () => copyLink(), { signal });
}

function drawPlayer(root, E, pid) {
  const p = E.players.get(pid);
  if (!p) { root.innerHTML = `<h1>Player not found</h1><p><a href="#/euroleague">EuroLeague</a></p>`; return; }
  const rows = E.careerOf(pid);
  const clubs = [...new Set(rows.map((r) => r.team_id))];
  const crumb = document.querySelector("#crumbs [aria-current]");
  if (crumb) crumb.textContent = p.name;
  root.innerHTML = html`
    <div class="game-head"><div><div class="muted" style="font-weight:700;letter-spacing:2px;font-size:12px">EUROLEAGUE PLAYER</div><h1>${esc(p.name)}</h1>
      <p>${rows.length} EuroLeague season${rows.length === 1 ? "" : "s"} · ${clubs.length} club${clubs.length === 1 ? "" : "s"}</p></div>
      ${isWL(pid) && WL_LINKS ? `<button class="btn primary" data-profile="${esc(pid)}">${icon("user", { size: 15 })} Winner League profile</button>` : ""}</div>
    ${note}
    <div class="card pad"><h2>${icon("clock")} EuroLeague career</h2>
      <table class="stat-table"><thead><tr><th>Season</th><th>Club</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a href="#/euroleague/season/${r.season}">${r.season}</a></td><td><span class="tm">${crestSvg(r.team_id, elTeamName(r.team_id), 20)} <a href="#/euroleague/club/${r.team_id}/${r.season}">${esc(E.officialName(r.season, r.team_id))}</a></span></td></tr>`).join("")}
      </tbody></table>
      <p class="muted" style="font-size:12px;margin:10px 0 0">${isWL(pid) ? "Birth date, nationality and height are on the Winner League profile." : "Personal details aren't shown: in the EuroLeague data they are placeholder values."}</p></div>`;
}
