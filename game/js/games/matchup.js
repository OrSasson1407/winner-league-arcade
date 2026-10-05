// Single game (#/matchup): any two real team-seasons, from any years, play a full game through the game
// engine. Each side gets a game plan (pace, defense, offense) and a minutes plan.
import { H, PLAYED_SEASONS, playersById, teamName } from "../data.js";
import { crestSvg, icon } from "../lib/icons.js";
import { clubColors } from "../lib/clubs.js";
import { esc, html, store } from "../ui.js";
import { nameLink } from "../components/playerCard.js";
import { bindGamePlan, gamePlanHtml, readGamePlan } from "../lib/gamePlan.js";
import { ESTIMATE_NOTE, keysFor, openGameView } from "../lib/gameView.js";
import { teamPreview } from "../shared/gameSim.js";
import { realTeamStrength, runGame, simTeam } from "./draft_sim.js";
import { emit } from "../lib/achievements.js";
import { gameKeys, press } from "../lib/shortcuts.js";

function rosterOf(season, tid) {
  const best = new Map();
  for (const ps of H.getPlayersByTeam(tid, season)) {
    if (!ps.stats || !ps.appeared_in_regular_season || ps.stats.games < 5 || !playersById.get(ps.player_id)?.name) continue;
    const cur = best.get(ps.player_id);
    if (!cur || ps.stats.games > cur.stats.games) best.set(ps.player_id, ps);
  }
  return [...best.values()].sort((a, b) => (b.stats.mpg ?? 0) - (a.stats.mpg ?? 0)).slice(0, 10);
}
const strongest = (season) => H.getTeamsBySeason(season).map((t) => ({ id: t.team_id, s: realTeamStrength(season, t.team_id) })).sort((a, b) => b.s - a.s);

export function renderMatchup(root, signal) {
  const last = PLAYED_SEASONS[PLAYED_SEASONS.length - 1];
  const saved = store.get("matchup", null);
  const top = strongest(last);
  const side = Array.isArray(saved?.sides) && saved.sides.length === 2 ? saved.sides : [{ season: last, team: top[0].id, plan: {} }, { season: last, team: top[1]?.id || top[0].id, plan: {} }];
  let venue = saved?.venue || "home";
  let open = saved?.open || null; // a game on screen when the page was closed: { seed, neutral }

  const teamFor = (i) => {
    const s = side[i];
    const roster = rosterOf(s.season, s.team);
    return { id: s.team, name: `${teamName(s.team)} ${s.season}`, strength: realTeamStrength(s.season, s.team), roster, drafted: false, tactics: s.plan.tactics, minutes: s.plan.minutes };
  };

  function draw() {
    store.set("matchup", { sides: side, venue, open });
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("whistle", { size: 30 })} Single game</h1>
        <p>Pick any two real teams, from any seasons, and play a full game possession by possession. Set a game plan for each side.</p></div></div>
      <div class="mu-grid">${[0, 1].map((i) => sideHtml(i)).join(`<div class="mu-vs"><span>VS</span>
        <div class="seg sm" id="venue" role="radiogroup" aria-label="Venue">${[["home", "Left team at home"], ["neutral", "Neutral court"]].map(([v, l]) => `<button role="radio" data-v="${v}" aria-checked="${venue === v}" class="${venue === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <button class="btn primary big-btn" id="go">${icon("play", { size: 16 })} Tip-off</button></div>`)}</div>
      <p class="muted" style="font-size:12px">${esc(ESTIMATE_NOTE)}</p>`;
    root.querySelectorAll("[data-side]").forEach((card) => {
      const i = Number(card.dataset.side);
      card.querySelector(".mu-season").addEventListener("change", (e) => { side[i].season = e.target.value; const ids = H.getTeamsBySeason(side[i].season).map((t) => t.team_id); if (!ids.includes(side[i].team)) side[i].team = strongest(side[i].season)[0].id; side[i].plan = { tactics: side[i].plan.tactics }; draw(); }, { signal });
      card.querySelector(".mu-team").addEventListener("change", (e) => { side[i].team = e.target.value; side[i].plan = { tactics: side[i].plan.tactics }; draw(); }, { signal });
      bindGamePlan(card.querySelector(".gp-wrap"), { signal, onChange: (p) => { side[i].plan = p; store.set("matchup", { sides: side, venue, open }); } });
    });
    root.querySelector("#venue").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { venue = b.dataset.v; draw(); } }, { signal });
    root.querySelector("#go").addEventListener("click", () => play(), { signal });
  }

  function sideHtml(i) {
    const s = side[i];
    const teams = H.getTeamsBySeason(s.season).map((t) => t.team_id).sort((a, b) => teamName(a).localeCompare(teamName(b)));
    const roster = rosterOf(s.season, s.team);
    const t = simTeam({ ...teamFor(i), _sim: null });
    const pv = teamPreview(t);
    const players = t.players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, mpg: p.mpg }));
    return html`<section class="card pad mu-side" data-side="${i}" style="--club:${clubColors(s.team)[0]}">
      <div class="row"><select class="input mu-season" aria-label="Season">${PLAYED_SEASONS.slice().reverse().map((x) => `<option ${x === s.season ? "selected" : ""}>${x}</option>`).join("")}</select>
        <select class="input mu-team" aria-label="Team">${teams.map((id) => `<option value="${id}" ${id === s.team ? "selected" : ""}>${esc(teamName(id))}</option>`).join("")}</select></div>
      <div class="mu-head">${crestSvg(s.team, teamName(s.team), 54)}<div><b>${esc(teamName(s.team))}</b><small class="muted">${s.season} · team rating ${pv.rating}</small></div></div>
      <ul class="clean mu-nums"><li title="The top 8 players' points per game added up"><small>TOP-8 PTS</small><b>${pv.pts}</b></li><li title="The top 8 players' rebounds per game added up"><small>TOP-8 REB</small><b>${pv.reb}</b></li><li title="The top 8 players' assists per game added up"><small>TOP-8 AST</small><b>${pv.ast}</b></li><li><small>3PT SHOTS</small><b>${pv.three}%</b></li></ul>
      <ol class="clean mu-roster">${roster.slice(0, 8).map((ps) => `<li>${nameLink(ps.player_id, playersById.get(ps.player_id).name)} <small class="muted">${esc(ps.position || "")} · ${ps.stats.ppg ?? "–"} PPG</small></li>`).join("")}</ol>
      <details class="gp-box"><summary>${icon("clipboard", { size: 15 })} Game plan</summary><div class="gp-wrap">${gamePlanHtml(s.plan, players)}</div></details>
    </section>`;
  }

  function play(again = null) {
    const a = teamFor(0), b = teamFor(1);
    a._sim = null; b._sim = null;
    const seed = again?.seed ?? Math.floor(Math.random() * 1e9);
    const neutral = again ? again.neutral : venue === "neutral";
    open = { seed, neutral };
    store.set("matchup", { sides: side, venue, open });
    const sim = runGame(a, b, seed, neutral, true);
    const ta = simTeam(a), tb = simTeam(b);
    const pre = { previews: [ta, tb].map(teamPreview), lineups: [ta, tb].map((t) => t.players.slice().sort((x, y) => (t.minutes?.[y.id] ?? y.mpg) - (t.minutes?.[x.id] ?? x.mpg)).slice(0, 5)), tactics: [ta.tactics, tb.tactics] };
    const home = { name: a.name, id: a.id }, away = { name: b.name, id: b.id };
    pre.keys = keysFor(home, away, pre);
    if (!again) emit("matchup:play", {});
    openGameView({ home, away, sim, label: neutral ? "Single game · neutral court" : "Single game", pre, start: "pregame", link: (l) => nameLink(l.id.split("#")[0], l.name),
      onClose: () => { open = null; store.set("matchup", { sides: side, venue, open }); } });
  }

  gameKeys(signal, { t: press(root, "#go") });
  draw();
  if (open) play(open); // the same game (same seed) that was on screen
}
