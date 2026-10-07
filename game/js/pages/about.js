// #/about: what this is and where the data comes from. The policy pages are in legal.js.
import { CURRENT, PLAYED_SEASONS, db } from "../data.js";
import { html } from "../ui.js";
import { icon } from "../lib/icons.js";
import { openFeedback, APP_VERSION } from "../lib/feedback.js";
import { openShortcuts } from "../lib/shortcuts.js";
import { dataUpdated } from "../lib/ux.js";

export function renderAbout(root, signal) {
  const players = db.players.filter((p) => p.name).length;
  root.innerHTML = html`<div class="game-head"><div><h1>About</h1>
      <p>A fan-made arcade of basketball games built on real Israeli Basketball Premier League data.</p></div></div>
    <div class="about-grid">
      <section class="card pad"><h2>${icon("book")} The data</h2>
        <ul class="clean about-list">
          <li><span>Source</span><b>The official Israeli Basketball Premier League site (bsl.org.il)</b></li>
          <li><span>Seasons with stats</span><b>${PLAYED_SEASONS[0]} to ${PLAYED_SEASONS[PLAYED_SEASONS.length - 1]} (${PLAYED_SEASONS.length} seasons)</b></li>
          <li><span>Current season</span><b>${CURRENT}: rosters only, no games yet</b></li>
          <li><span>Players · clubs</span><b>${players.toLocaleString()} players · ${db.teams.length} clubs</b></li>
          <li><span>Data last updated</span><b>${dataUpdated() || "–"}</b></li>
        </ul>
        <p class="muted">Player ratings are calculated by the game from real stats. They are not official league ratings. In My Career, seasons after ${PLAYED_SEASONS[PLAYED_SEASONS.length - 1]} are simulated from the latest rosters and labelled as such.</p>
      </section>
      <section class="card pad"><h2>${icon("info")} The arcade</h2>
        <p>An independent, non-commercial fan project. Not affiliated with the Israeli Basketball Premier League, its clubs, Winner (the Israel Sports Betting Board) or Euroleague Basketball; their names are trademarks of their owners, used only to describe the real competitions. Club colours identify the teams; the crests are simple initials drawn by the game, not official logos. No betting, money or prizes.</p>
        <ul class="clean about-list">
          <li><span>Version</span><b>${APP_VERSION}</b></li>
          <li><span>Works offline</span><b>Single-player games, once the site has loaded</b></li>
          <li><span>Account</span><b>None needed</b></li>
        </ul>
        <div class="row" style="flex-wrap:wrap;margin-top:12px">
          <a class="btn" href="#/help">${icon("info", { size: 15 })} Help center</a>
          <a class="btn" href="#/privacy">${icon("lock", { size: 15 })} Privacy</a>
          <a class="btn" href="#/terms">${icon("book", { size: 15 })} Terms of use</a>
          <a class="btn" href="#/accessibility">${icon("users", { size: 15 })} Accessibility</a>
          <a class="btn" href="#/licenses">${icon("info", { size: 15 })} Licenses</a>
          <button class="btn" id="ab-keys">${icon("settings", { size: 15 })} Keyboard shortcuts</button>
          <button class="btn primary" id="ab-fb">${icon("chat", { size: 15 })} Send feedback</button>
        </div>
      </section>
    </div>`;
  root.querySelector("#ab-fb").addEventListener("click", () => openFeedback(), { signal });
  root.querySelector("#ab-keys").addEventListener("click", () => openShortcuts(), { signal });
}
