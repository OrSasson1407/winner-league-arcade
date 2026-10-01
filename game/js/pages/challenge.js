// Challenge a friend (#/challenge, #/challenge/<code>): create a code or enter one.
import { CH_GAMES, challengeLink, newCode, parseCode } from "../lib/challenge.js";
import { icon } from "../lib/icons.js";
import { copyLink, esc, html, localDate, store, toast } from "../ui.js";
import { DAILY_GAMES, dailyGameOf, markDaily } from "../lib/daily.js";

const GAME_ICON = { D: "trophy", G: "search", H: "chart", C: "arrowRight" };

export function renderChallenge(root, signal, params = []) {
  const fromLink = parseCode(params[0]);
  let created = null;

  const draw = () => {
    const history_ = store.get("challenge:history", []);
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("users", { size: 30 })} Challenge a friend</h1>
        <p>A challenge code gives everyone exactly the same game. Send it, both play, then compare scores.</p></div></div>
      ${fromLink ? html`<div class="card pad ch-incoming">
        <div class="ch-code led">${fromLink.code}</div>
        <div><small class="muted">YOU'VE BEEN CHALLENGED</small><h2>${icon(GAME_ICON[fromLink.letter], { size: 22 })} ${fromLink.game.name}</h2><p class="muted">${fromLink.game.rules}</p></div>
        <a class="btn primary big-btn" href="#/${fromLink.game.route}?challenge=${fromLink.code}">${icon("play", { size: 16 })} Accept challenge</a>
      </div>` : ""}
      <div class="setup-grid">
        <div class="card pad setup">
          <h3>${icon("bolt")} Create a challenge</h3>
          <p class="muted" style="margin:0">Pick a game. You'll get a code to send to a friend.</p>
          <div class="ch-games">${Object.entries(CH_GAMES).map(([l, g]) => `<button class="ch-game ${created?.letter === l ? "on" : ""}" data-l="${l}">${icon(GAME_ICON[l], { size: 22 })}<b>${g.name}</b><small>${g.rules}</small></button>`).join("")}</div>
          ${created ? html`<div class="ch-made pop">
            <small class="muted">YOUR CHALLENGE CODE</small>
            <div class="ch-code led">${created.code}</div>
            <div class="row" style="justify-content:center">
              <button class="btn" id="copy-code">${icon("check", { size: 15 })} Copy code</button>
              <button class="btn" id="copy-link">${icon("link", { size: 15 })} Copy link</button>
              <a class="btn primary" href="#/${created.game.route}?challenge=${created.code}">${icon("play", { size: 15 })} Play it now</a>
            </div>
            <p class="muted" style="font-size:12px;margin:0">Your friend opens the arcade, goes to <b>Challenge a friend</b> and types the code (or opens the link on their own arcade).</p>
          </div>` : ""}
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          <div class="card pad setup">
            <h3>${icon("search")} Enter a code</h3>
            <div class="row"><input id="code-in" class="input ch-input" placeholder="WLA-G3K9F2A" maxlength="14" autocomplete="off" aria-label="Challenge code" style="flex:1">
              <button class="btn primary" id="go">${icon("arrowRight", { size: 16 })} Go</button></div>
            <small class="muted" id="code-msg"></small>
          </div>
          <div class="card pad"><h3>${icon("clock")} Recent challenges</h3>
            ${history_.length ? `<ol class="rank-list">${history_.map((h) => `<li><a href="${challengeLink(h.code)}">${h.code}</a><span class="muted">${esc(CH_GAMES[h.code[4]]?.name || "")}${h.result ? ` · ${esc(h.result)}` : ""}</span></li>`).join("")}</ol>`
              : `<p class="muted">Challenges you create or play show up here with your result.</p>`}</div>
        </div>
      </div>`;
    root.querySelector(".ch-games").addEventListener("click", (e) => {
      const b = e.target.closest("[data-l]"); if (!b) return;
      created = parseCode(newCode(CH_GAMES[b.dataset.l].key));
      draw();
    }, { signal });
    root.querySelector("#copy-code")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(created.code); toast("Code copied"); } catch { toast(created.code); }
    }, { signal });
    root.querySelector("#copy-link")?.addEventListener("click", () => copyLink(challengeLink(created.code)), { signal });
    const go = () => {
      const c = parseCode(root.querySelector("#code-in").value);
      if (!c) { root.querySelector("#code-msg").textContent = "That doesn't look like a challenge code (e.g. WLA-G3K9F2A)."; return; }
      location.hash = `#/${c.game.route}?challenge=${c.code}`;
    };
    root.querySelector("#go").addEventListener("click", go, { signal });
    root.querySelector("#code-in").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); }, { signal });
  };
  draw();
}

/** Remember a challenge and (optionally) your result, for the "Recent challenges" list. */
export function recordChallenge(code, result = "") {
  const daily = dailyGameOf(code);
  if (daily) { markDaily(daily, result); return; } // daily challenges have their own log
  const list = store.get("challenge:history", []).filter((h) => h.code !== code);
  list.unshift({ code, result, at: new Date().toISOString() });
  store.set("challenge:history", list.slice(0, 15));
}

/** Banner shown at the top of a game in challenge mode. */
export function challengeBanner(ch) {
  if (dailyGameOf(ch.code)) return `<div class="card ch-banner daily-banner">${icon("calendar", { size: 18 })}<span>Daily challenge · <b>${localDate()}</b> · ${esc(DAILY_GAMES[dailyGameOf(ch.code)].rules)}</span><span class="spacer"></span><a class="btn ghost" href="#/daily">All dailies</a></div>`;
  return `<div class="card ch-banner">${icon("users", { size: 18 })}<span>Challenge <b class="led">${ch.code}</b> · ${esc(ch.game.rules)}</span><span class="spacer"></span><a class="btn ghost" href="#/${ch.game.route}">Leave challenge</a></div>`;
}

/** Share text for a finished challenge. */
export function challengeShareText(ch, resultLine) {
  return `Winner League Arcade challenge ${ch.code} (${ch.game.name}): ${resultLine}. Can you beat it? Enter the code in "Challenge a friend".`;
}
