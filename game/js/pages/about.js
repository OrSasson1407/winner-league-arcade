// #/about (what this is, where the data comes from) and #/privacy (what is stored and where).
import { CURRENT, PLAYED_SEASONS, db } from "../data.js";
import { html, store } from "../ui.js";
import { icon } from "../lib/icons.js";
import { openFeedback, APP_VERSION } from "../lib/feedback.js";
import { openShortcuts } from "../lib/shortcuts.js";
import { dataUpdated, undoToast } from "../lib/ux.js";

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
        <p>Not affiliated with the league or its clubs. Club names and colours are used to identify the teams; the crests are simple initials drawn by the game, not official logos.</p>
        <ul class="clean about-list">
          <li><span>Version</span><b>${APP_VERSION}</b></li>
          <li><span>Works offline</span><b>Single-player games, once the site has loaded</b></li>
          <li><span>Account</span><b>None needed</b></li>
        </ul>
        <div class="row" style="flex-wrap:wrap;margin-top:12px">
          <a class="btn" href="#/help">${icon("info", { size: 15 })} Help center</a>
          <a class="btn" href="#/privacy">${icon("lock", { size: 15 })} Privacy</a>
          <button class="btn" id="ab-keys">${icon("settings", { size: 15 })} Keyboard shortcuts</button>
          <button class="btn primary" id="ab-fb">${icon("chat", { size: 15 })} Send feedback</button>
        </div>
      </section>
    </div>`;
  root.querySelector("#ab-fb").addEventListener("click", () => openFeedback(), { signal });
  root.querySelector("#ab-keys").addEventListener("click", () => openShortcuts(), { signal });
}

export function renderPrivacy(root, signal) {
  root.innerHTML = html`<div class="game-head"><div><h1>Privacy</h1>
      <p>Short version: no account, no ads, no analytics or tracking. Your progress lives in your browser.</p></div></div>
    <div class="about-grid">
      <section class="card pad"><h2>${icon("lock")} On your device</h2>
        <p>Your settings, progress, scores, achievements, daily-challenge results, saved games and profile (nickname and avatar) are kept in your browser's local storage. They never leave the device, except for the online details below. The app sets no cookies.</p>
        <p>Clearing this site's data in your browser deletes them, or use the button below.</p>
        <button class="btn danger" id="pv-clear">${icon("x", { size: 15 })} Delete my data on this device</button>
      </section>
      <section class="card pad"><h2>${icon("globe")} Sent to this site's server</h2>
        <ul class="clean pv-list">
          <li><b>Online presence.</b> While the arcade is open it connects to its server, so friends can see you online and invite you. It sends your nickname ("Guest" if you haven't set one), avatar, level and a random device ID. Your device ID is not linked to your name, email or phone.</li>
          <li><b>Online 1v1.</b> Ratings and win/loss records are kept on the server and as a signed copy in your browser. The leaderboard shows your nickname, avatar and rating.</li>
          <li><b>Feedback.</b> What you write in "Send feedback", and the technical details if you leave that box ticked.</li>
          <li><b>Hosting.</b> Like any website, the host (Render) keeps standard server logs, which include IP addresses.</li>
        </ul>
      </section>
      <section class="card pad"><h2>${icon("info")} Third parties</h2>
        <p>Fonts load from Google Fonts, so Google's servers see a request from your browser (including your IP address). Nothing else is loaded from other sites.</p>
        <p>Daily reminders are off unless you switch them on. They come from your own browser, not from a server.</p>
      </section>
    </div>`;
  root.querySelector("#pv-clear").addEventListener("click", () => {
    const snap = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("wla:")) snap[k] = localStorage.getItem(k); } } catch {}
    const keys = Object.keys(snap);
    if (!keys.length) return undoToast("Nothing stored on this device", () => {});
    keys.forEach((k) => localStorage.removeItem(k));
    store.set("onboarded", true); // don't greet them with the intro right after
    undoToast(`Deleted ${keys.length} saved item${keys.length === 1 ? "" : "s"}. Reload to start fresh`, () => { for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v); }, { ms: 10000 });
  }, { signal });
}
