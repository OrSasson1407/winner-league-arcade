// Achievements: the Hall of Banners (#/achievements[?game=draft|guess|hl|career]).
import { DEFS, GAMES, TIERS, bannerSvg, progressOf, retroSync, unlockedMap } from "../lib/achievements.js";
import { icon } from "../lib/icons.js";
import { esc, html } from "../ui.js";

export function renderAchievements(root, signal, params, query = {}) {
  retroSync();
  let game = GAMES[query.game] ? query.game : "draft";
  let filter = "all";

  const draw = () => {
    const map = unlockedMap();
    const done = DEFS.filter((d) => map[d.id]);
    const pct = Math.round((100 * done.length) / DEFS.length);
    const latest = done.sort((a, b) => map[b.id].localeCompare(map[a.id])).slice(0, 7);
    const list = DEFS.filter((d) => d.game === game)
      .filter((d) => filter === "all" || (filter === "done" ? map[d.id] : !map[d.id]));
    const gameDone = DEFS.filter((d) => d.game === game && map[d.id]).length;
    const gameTotal = DEFS.filter((d) => d.game === game).length;
    const tierCount = (t) => done.filter((d) => d.tier === t).length;
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("trophy", { size: 30 })} Hall of Banners</h1>
        <p>Every achievement earns a banner for your rafters. ${DEFS.length} to collect so far, 20 per game.</p></div></div>
      <div class="card rafters-card">
        <div class="rafters-head">
          <div class="ach-ring" style="--p:${pct}"><b class="led">${done.length}</b><small>of ${DEFS.length}</small></div>
          <div class="tier-counts">${Object.entries(TIERS).map(([t, l]) => `<div class="tc tc-${t}"><b>${tierCount(t)}</b><small>${l}</small></div>`).join("")}</div>
        </div>
        <div class="rafters">
          <div class="beam" aria-hidden="true"></div>
          <div class="hanging">${latest.length ? latest.map((d, i) => `<div class="hang" style="animation-delay:${i * -0.7}s" title="${esc(d.title)}">${bannerSvg(d, { width: 92 })}</div>`).join("")
            : `<div class="empty-rafters muted">${icon("flag", { size: 22 })} Your rafters are empty. Win achievements to raise banners here.</div>`}</div>
        </div>
      </div>
      <div class="row ach-tabs" role="tablist">
        ${Object.entries(GAMES).map(([k, g]) => {
          const c = DEFS.filter((d) => d.game === k);
          const got = c.filter((d) => map[d.id]).length;
          return `<button role="tab" aria-selected="${k === game}" class="ach-tab ${k === game ? "on" : ""}" data-game="${k}" style="--gc:${g.color}">
            <span>${g.name}</span><small>${g.soon ? "Coming soon" : `${got}/${c.length}`}</small></button>`;
        }).join("")}
      </div>
      ${GAMES[game].soon ? html`<div class="card center-card"><h2>${icon("clock", { size: 26 })} Coming soon</h2>
        <p class="muted">Career Path achievements and banners are on the way.</p></div>` : html`
      <div class="row" style="margin:14px 0">
        <div class="progress ach-progress" style="flex:1" role="progressbar" aria-valuenow="${gameDone}" aria-valuemax="${gameTotal}" aria-label="${GAMES[game].name} progress"><i style="width:${(100 * gameDone) / gameTotal}%;background:${GAMES[game].color}"></i></div>
        <b>${gameDone}/${gameTotal}</b>
        <div class="seg sm" id="filter" role="radiogroup" aria-label="Show">${[["all", "All"], ["done", "Unlocked"], ["todo", "Locked"]].map(([k, l]) => `<button role="radio" aria-checked="${filter === k}" data-v="${k}" class="${filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
      <div class="ach-grid">${list.map((d) => {
        const got = map[d.id];
        const p = !got && progressOf(d);
        return html`<div class="card ach ${got ? "got" : "locked"} t-${d.tier}">
          <div class="ach-banner">${bannerSvg(d, { locked: !got, width: 96 })}</div>
          <div class="ach-body">
            <span class="pill tier tier-${d.tier}">${TIERS[d.tier]}</span>
            <h3>${esc(d.title)}</h3>
            <p class="muted">${esc(d.desc)}</p>
            ${got ? `<small class="ach-date">${icon("check", { size: 13 })} Unlocked ${new Date(got).toLocaleDateString()}</small>`
              : p ? `<div class="ach-prog"><div class="progress"><i style="width:${(100 * p[0]) / p[1]}%"></i></div><small>${p[0]}/${p[1]}</small></div>` : `<small class="muted">${icon("lock", { size: 13 })} Locked</small>`}
          </div>
        </div>`;
      }).join("") || `<div class="empty-state">${icon("trophy", { size: 28 })}<b>Nothing here yet</b></div>`}</div>`}`;
    root.querySelectorAll(".ach-tab").forEach((b) => b.addEventListener("click", () => {
      game = b.dataset.game;
      history.replaceState(history.state, "", `#/achievements?game=${game}`);
      draw();
    }, { signal }));
    root.querySelector("#filter")?.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { filter = b.dataset.v; draw(); } }, { signal });
  };
  document.addEventListener("achievements-changed", draw, { signal });
  draw();
}
