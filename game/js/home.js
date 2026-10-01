// Home hub: hero + player search, Player of the Day, personal stats, animated game tiles.
import { careerSummary, db, namedPlayers, seededRng, teamName } from "./data.js";
import { bestSeason, playerCard } from "./components/playerCard.js";
import { openProfile } from "./profile.js";
import { autocomplete, countUp, esc, html, localDate, store } from "./ui.js";
import { icon, logoSvg } from "./lib/icons.js";
import { myName } from "./lib/me.js";
import { totals } from "./lib/achievements.js";
import { factOfTheDay } from "./lib/facts.js";
import { DAILY_GAMES, dailyStreak, todayStatus } from "./lib/daily.js";
import { bornOn } from "./pages/today.js";

export const GAMES = {
  draft: { href: "#/draft", title: "All-Time Draft", text: "Spin a real team-season, draft one player per round and build the best five in league history. Solo, vs the computer or up to 4 friends.",
    preview: () => {
      const names = ["Maccabi Tel Aviv", "Hapoel Jerusalem", "Hapoel Tel Aviv", "Bnei Herzliya", "Hapoel Holon", "Maccabi Haifa", "Maccabi Tel Aviv"];
      return `<div class="pv-reel"><div>${names.map((n) => `<div>${n}</div>`).join("")}</div></div><span class="pv-caption">SPINNING…</span>`;
    } },
  guess: { href: "#/guess", title: "Guess the Player", text: "A mystery player from 2010 to today. Every guess reveals clues about team, position, height, age and nationality. 8 tries.",
    preview: () => `<div class="pv-tiles">${"<i></i>".repeat(12)}</div>` },
  "higher-lower": { href: "#/higher-lower", title: "Higher or Lower", text: "Two real player-seasons. More points? More rebounds? Higher rating? Keep the streak alive.",
    preview: () => `<div class="pv-hl"><span>14.2</span><span class="q">?</span></div><span class="pv-caption">▲ HIGHER · ▼ LOWER</span>` },
  career: { href: "#/career", title: "Career Path", text: "Follow a player's journey club by club, season by season, and name the player. 10 rounds.",
    preview: () => `<div class="pv-path"><i></i><b></b><i></i><b></b><i></i><b></b><i></i></div><span class="pv-caption">WHO IS IT?</span>` },
};

const GAME_ICONS = { draft: "trophy", guess: "search", "higher-lower": "chart", career: "arrowRight" };

/** The four game tiles (home page + Games page). */
export function gameTilesHtml() {
  const bestLine = {
    draft: store.get("draft:best") && `Best team ${store.get("draft:best")}`,
    guess: store.get("guess:streak") && `Streak ${store.get("guess:streak")}`,
    "higher-lower": store.get("hl:best:mixed") && `Best streak ${store.get("hl:best:mixed")}`,
    career: store.get("career:best") && `Best ${store.get("career:best")}/30`,
  };
  return `<section class="games">${Object.entries(GAMES).map(([key, g]) => html`<a class="card game-card" href="${g.href}">
      <div class="body"><h2><span class="gc-ic">${icon(GAME_ICONS[key], { size: 20 })}</span>${g.title}</h2><p>${g.text}</p>
        <div class="foot-line"><span class="muted">${bestLine[key] || "Not played yet"}</span><span class="play">Play ${icon("arrowRight", { size: 14 })}</span></div></div>
      <div class="preview" aria-hidden="true">${g.preview()}</div>
    </a>`).join("")}</section>`;
}

export function renderGames(root) {
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("games", { size: 30 })} Games</h1><p>Four games built on 17 seasons of real league data.</p></div></div>${gameTilesHtml()}
    <a class="card pad ch-banner og-promo" href="#/online">${icon("globe", { size: 22 })}<span><b>Online 1v1</b> · play any of these games against a random opponent or a friend with an invite code.</span><span class="spacer"></span><span class="btn primary">Play online</span></a>`;
}

function playerOfTheDay() {
  const pool = namedPlayers.filter((p) => { const s = careerSummary(p.player_id); return s.seasonsPlayed >= 3 && s.bestRating >= 90; });
  return pool[Math.floor(seededRng("potd-" + localDate())() * pool.length)];
}

export function renderHome(root, signal) {
  const potd = playerOfTheDay();
  const potdSeason = bestSeason(careerSummary(potd.player_id).records);
  const last = store.get("last:route");
  const plays = Object.keys(GAMES).reduce((s, k) => s + store.get(`plays:${k}`, 0), 0);
  const stats = [
    { v: store.get("draft:best", 0), d: 1, l: "Best draft" },
    { v: store.get("guess:streak", 0), d: 0, l: "Guess streak" },
    { v: store.get("hl:best:mixed", 0), d: 0, l: "Higher/Lower best" },
    { v: store.get("career:best", 0), d: 0, l: "Career Path best" },
    { v: plays, d: 0, l: "Games played" },
  ];
  const ach = totals();

  root.innerHTML = html`
    <section class="hero">
      <div>
        <div class="hero-logo">${logoSvg(84)}</div>
        <h1>Winner League <span>Arcade</span></h1>
        <p class="hello">Welcome back, <b>${esc(myName("Guest"))}</b></p>
        <p>${namedPlayers.length.toLocaleString()} players, ${db.teams.length} clubs and ${db.metadata.season_list.length} seasons of the Israeli Premier League,
          straight from the official league records. Pick a game or look up any player.</p>
        <div class="search guess-input">${icon("search", { size: 18, cls: "search-ic" })}<input id="search" class="input" placeholder="Search any player…" autocomplete="off" aria-label="Search players"></div>
        <div class="row hero-actions">
          ${last && GAMES[last] ? `<a class="btn jump" href="${GAMES[last].href}">${icon("play", { size: 14 })} Jump back into ${GAMES[last].title}</a>` : ""}
          <a class="btn jump" href="#/online">${icon("globe", { size: 14 })} Play online 1v1</a>
          <a class="btn jump" href="#/challenge">${icon("users", { size: 14 })} Challenge a friend</a>
          ${new Date().getDate() <= 7 ? `<a class="btn jump" href="#/recap">${icon("calendar", { size: 14 })} Your monthly recap</a>` : ""}
        </div>
      </div>
      <div class="potd">
        <span class="potd-label">${icon("star", { size: 14 })} Player of the day</span>
        ${playerCard(potdSeason, { size: "lg", classes: "flip-in" })}
        <button class="btn" data-profile="${potd.player_id}">View career ${icon("arrowRight", { size: 14 })}</button>
      </div>
    </section>
    <section class="card fact-card" aria-label="Fact of the day">
      <span class="fact-ic">${icon("bulb", { size: 22 })}</span>
      <div class="fact-body"><small>FROM THE ARCHIVES · FACT OF THE DAY</small><p id="fact-text"></p></div>
      <button class="btn ghost" id="fact-player">${icon("user", { size: 15 })} Player</button>
      <button class="btn ghost" id="fact-next" aria-label="Show another fact">${icon("refresh", { size: 15 })} Another</button>
    </section>
    <section class="home-duo">
      ${(() => {
        const done = todayStatus(), n = Object.keys(done).length, streak = dailyStreak();
        return html`<a class="card daily-home ${n >= 4 ? "full" : ""}" href="#/daily">
          <span class="dh-flame">${streak ? "🔥" : icon("calendar", { size: 24 })}</span>
          <div><small>DAILY CHALLENGES</small><b>${n}/4 today${streak ? ` · ${streak}-day streak` : ""}</b>
            <span class="dh-dots">${Object.keys(DAILY_GAMES).map((k) => `<i class="${done[k] ? "on" : ""}" title="${DAILY_GAMES[k].name}"></i>`).join("")}</span></div>
          ${icon("arrowRight", { size: 18 })}</a>`;
      })()}
      ${(() => {
        const d = new Date();
        const born = bornOn(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        return html`<a class="card daily-home" href="#/today">
          <span class="dh-flame">${icon("star", { size: 24 })}</span>
          <div><small>TODAY IN THE LEAGUE</small><b>${born.length ? `${esc(born[0].p.name)}${born.length > 1 ? ` + ${born.length - 1} more` : ""} born today` : "Birthdays & flashbacks"}</b>
            <span class="muted" style="font-size:12px">Season flashbacks: 5, 10 and 15 years ago</span></div>
          ${icon("arrowRight", { size: 18 })}</a>`;
      })()}
    </section>
    <section class="me-strip" aria-label="Your stats">
      ${stats.map((s, i) => `<div class="card me"><b data-count="${i}">0</b><span>${s.l}</span></div>`).join("")}
      <a class="card me me-ach" href="#/achievements"><b>${ach.done}<small>/${ach.total}</small></b><span>${icon("trophy", { size: 13 })} Achievements</span></a>
    </section>
    ${gameTilesHtml()}`;
  stats.forEach((s, i) => countUp(root.querySelector(`[data-count="${i}"]`), s.v, s.d));
  let factOffset = 0;
  const showFact = () => {
    const f = factOfTheDay(factOffset);
    root.querySelector("#fact-text").textContent = f.text;
    root.querySelector("#fact-player").dataset.profile = f.pid;
  };
  root.querySelector("#fact-next").addEventListener("click", () => { factOffset++; showFact(); }, { signal });
  showFact();
  const items = namedPlayers.map((p) => {
    const cs = careerSummary(p.player_id);
    return { id: p.player_id, label: p.name, sub: `${teamName(cs.lastTeam)} · ${cs.firstSeason === cs.lastSeason ? cs.firstSeason : cs.firstSeason.slice(0, 4) + "–" + cs.lastSeason.slice(5)}` };
  });
  autocomplete(root.querySelector("#search"), items, (it) => openProfile(it.id), { signal });
}

