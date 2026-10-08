// Home hub: hero + player search, Player of the Day, personal stats, animated game tiles.
import { careerSummary, db, namedPlayers, seededRng, teamName } from "./data.js";
import { bestSeason, playerCard } from "./components/playerCard.js";
import { openProfile } from "./profile.js";
import { autocomplete, countUp, esc, fmt1, html, localDate, store } from "./ui.js";
import { icon, logoSvg } from "./lib/icons.js";
import { myName } from "./lib/me.js";
import { totals } from "./lib/achievements.js";
import { factOfTheDay } from "./lib/facts.js";
import { DAILY_COUNT, DAILY_GAMES, dailyStreak, todayStatus } from "./lib/daily.js";
import { bornOn } from "./pages/today.js";
import { levelInfo } from "./lib/progress.js";
import { lastStats } from "./online/net.js";
import { reducedMotion } from "./lib/settings.js";
import { missionText, missions } from "./lib/missions.js";
import { coins } from "./lib/wallet.js";
import { LEAGUES, LEAGUE_IDS, activeLeague, gameAvailable, setLeague } from "./leagueChoice.js";

/** Slides for the home page's LED board (each links somewhere). */
function boardSlides(potd, potdSeason) {
  const d = new Date();
  const born = bornOn(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  const done = Object.keys(todayStatus()).length, streak = dailyStreak();
  const lv = levelInfo();
  const fact = factOfTheDay(0);
  const slides = [
    { tag: "PLAYER OF THE DAY", ic: "star", text: `${potd.name}: ${potdSeason.season}, ${teamName(potdSeason.team_id)}, rating ${potdSeason.rating_mock}`, profile: potd.player_id },
    { tag: "DAILY CHALLENGES", ic: "calendar", text: done >= DAILY_COUNT ? `Full house today! All ${DAILY_COUNT} dailies done.` : `${done}/${DAILY_COUNT} done today${streak ? ` · 🔥 ${streak}-day streak` : " · start a streak"}`, href: "#/daily" },
    { tag: "TODAY IN THE LEAGUE", ic: "whistle", text: born.length ? `Happy birthday ${born.slice(0, 2).map((x) => x.p.name).join(" & ")}${born.length > 2 ? ` + ${born.length - 2} more` : ""}` : "Season flashbacks: 5, 10 and 15 years ago", href: "#/today" },
    { tag: "FACT OF THE DAY", ic: "bulb", text: fact.text, href: fact.pid ? null : "#/today", profile: fact.pid },
    { tag: `LEVEL ${lv.level}`, ic: "medal", text: lv.max ? `${lv.title} · max level` : `${lv.title} · ${(lv.need - lv.into).toLocaleString()} XP to level ${lv.level + 1}`, href: "#/me" },
  ];
  if (lastStats?.online) slides.push({ tag: "ONLINE NOW", ic: "globe", text: `${lastStats.online} player${lastStats.online === 1 ? "" : "s"} online${lastStats.playing ? ` · ${lastStats.playing} in a match` : ""}. Find a ranked match`, href: "#/online" });
  return slides;
}

export const GAMES = {
  draft: { href: "#/draft", title: "All-Time Draft", text: "Spin a real team-season, draft one player per round and build the best five in league history. Solo, vs the computer or up to 4 friends.",
    preview: () => {
      const names = ["Maccabi Tel Aviv", "Hapoel Jerusalem", "Hapoel Tel Aviv", "Bnei Herzliya", "Hapoel Holon", "Maccabi Haifa", "Maccabi Tel Aviv"];
      return `<div class="pv-reel"><div>${names.map((n) => `<div>${n}</div>`).join("")}</div></div><span class="pv-caption">SPINNING…</span>`;
    } },
  guess: { href: "#/guess", title: "Guess the Player", text: "A mystery player. Every guess reveals clues about team, position, height, age and nationality. 8 tries.",
    preview: () => `<div class="pv-tiles">${"<i></i>".repeat(12)}</div>` },
  "higher-lower": { href: "#/higher-lower", title: "Higher or Lower", text: "Two real player-seasons. More points? More rebounds? Higher rating? Keep the streak alive.",
    preview: () => `<div class="pv-hl"><span>14.2</span><span class="q">?</span></div><span class="pv-caption">▲ HIGHER · ▼ LOWER</span>` },
  career: { href: "#/career", title: "Career Path", text: "Follow a player's journey club by club, season by season, and name the player. 10 rounds.",
    preview: () => `<div class="pv-path"><i></i><b></b><i></i><b></b><i></i><b></b><i></i></div><span class="pv-caption">WHO IS IT?</span>` },
  connections: { href: "#/connections", title: "Connections", text: "16 players, four hidden groups: a club, a team-season, a stat, a birth year… Find all four with fewer than four mistakes.",
    preview: () => `<div class="pv-conn">${["y", "y", "g", "b", "p", "g", "b", "y", "b", "p", "y", "g", "g", "p", "b", "p"].map((c) => `<i class="${c}"></i>`).join("")}</div>` },
  mycareer: { href: "#/mycareer", title: "My Career", text: "Create a player, grow up in a club academy and play a whole career against the real teams of every season: contracts, awards, the Hall of Fame.",
    preview: () => `<div class="pv-mc"><b>16</b><i></i><b>22</b><i></i><b>30</b><i></i><b>35</b></div><span class="pv-caption">ACADEMY → LEGEND</span>` },
  grid: { href: "#/grid", title: "The Grid", text: "A 3×3 board of clubs and achievements. Name a player for every square who fits both. Rarer answers score more.",
    preview: () => `<div class="pv-grid">${"<i></i>".repeat(9)}</div><span class="pv-caption">3 × 3</span>` },
  matchup: { href: "#/matchup", title: "Single game", text: "Any two real teams from any seasons play a full game, possession by possession. Set the game plan and watch it live.",
    preview: () => `<div class="pv-vs"><b>MTA 2014</b><span>VS</span><b>HJ 2015</b></div><span class="pv-caption">Tip-off</span>` },
};

const GAME_ICONS = { draft: "trophy", guess: "search", "higher-lower": "chart", career: "arrowRight", connections: "link", grid: "games", mycareer: "jersey", matchup: "whistle" };

/** The four game tiles (home page + Games page). */
export function gameTilesHtml() {
  const bestLine = {
    draft: store.get("draft:best") && `Best team ${store.get("draft:best")}`,
    guess: store.get("guess:streak") && `Streak ${store.get("guess:streak")}`,
    "higher-lower": store.get("hl:best:mixed") && `Best streak ${store.get("hl:best:mixed")}`,
    career: store.get("career:best") && `Best ${store.get("career:best")}/30`,
  };
  return `<section class="games">${Object.entries(GAMES).map(([key, g]) => { const off = !gameAvailable(key); return html`<a class="card game-card ${off ? "off" : ""}" href="${g.href}">
      <div class="body"><h2><span class="gc-ic">${icon(GAME_ICONS[key], { size: 20 })}</span>${g.title}</h2><p>${g.text}</p>
        <div class="foot-line"><span class="muted">${off ? `Not in ${LEAGUES[activeLeague()].name} mode` : key === "mycareer" && activeLeague() !== "wl" ? "Winner League career" : bestLine[key] || "Not played yet"}</span><span class="play">Play ${icon("arrowRight", { size: 14 })}</span></div></div>
      <div class="preview" aria-hidden="true">${g.preview()}</div>
    </a>`; }).join("")}</section>`;
}

/** Which league the games play on: four choices, each with a line about what it means. */
export function leaguePickerHtml() {
  const cur = activeLeague();
  return html`<div class="card pad league-pick" role="group" aria-label="League">
    <div class="league-pick-head"><b>${icon("globe", { size: 16 })} <span>Play on</span></b><small class="muted">${esc(LEAGUES[cur].desc)}</small></div>
    <div class="seg league-seg" role="radiogroup">${LEAGUE_IDS.map((l) => `<button role="radio" data-league="${l}" aria-checked="${l === cur}" class="${l === cur ? "on" : ""}">${LEAGUES[l].name}</button>`).join("")}</div>
  </div>`;
}
export function bindLeaguePicker(root, signal) {
  root.querySelector(".league-pick")?.addEventListener("click", (e) => { const b = e.target.closest("[data-league]"); if (b && b.dataset.league !== activeLeague()) setLeague(b.dataset.league); }, { signal });
}

export function renderGames(root, signal) {
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("games", { size: 30 })} Games</h1><p>Seven games built on real basketball data.</p></div><a class="btn primary" href="#/quick">${icon("dice", { size: 15 })} Quick game</a></div>
    ${leaguePickerHtml()}${gameTilesHtml()}
    <a class="card pad ch-banner og-promo" href="#/online">${icon("globe", { size: 22 })}<span><b>Online 1v1</b> · play any of these games against a random opponent or a friend with an invite code.</span><span class="spacer"></span><span class="btn primary">Play online</span></a>`;
  bindLeaguePicker(root, signal);
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

  const slides = boardSlides(potd, potdSeason);
  root.innerHTML = html`
    <section class="led-board" aria-roledescription="carousel" aria-label="Arcade board">
      <span class="lb-live"><i></i>LIVE</span>
      <div class="lb-track" aria-live="off">${slides.map((s, i) => html`<div class="lb-slide ${i === 0 ? "on" : ""}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}" ${i ? 'aria-hidden="true"' : ""}>
        ${s.profile ? `<button class="lb-link" data-profile="${s.profile}" ${i ? 'tabindex="-1"' : ""}>` : `<a class="lb-link" href="${s.href}" ${i ? 'tabindex="-1"' : ""}>`}
          <span class="lb-tag">${icon(s.ic, { size: 14 })} ${esc(s.tag)}</span><span class="lb-text">${esc(s.text)}</span>
        ${s.profile ? "</button>" : "</a>"}</div>`).join("")}</div>
      <div class="lb-ctrl">
        <button class="icon-btn" id="lb-prev" aria-label="Previous">${icon("arrowLeft", { size: 15 })}</button>
        <button class="icon-btn" id="lb-pause" aria-label="Pause the board">${icon("pause", { size: 15 })}</button>
        <button class="icon-btn" id="lb-next" aria-label="Next">${icon("arrowRight", { size: 15 })}</button>
      </div>
    </section>
    <section class="bc-hero">
      <div>
        <p class="bc-kicker"><b>Winner League Arcade</b><span>${db.metadata.season_list.length} seasons · official league records</span></p>
        <h1>${db.metadata.season_list.length} seasons. <br><em>Your</em> move.</h1>
        <p class="bc-sub">Welcome back, <b>${esc(myName("Guest"))}</b>. ${namedPlayers.length.toLocaleString()} players and ${db.teams.length} clubs of ${LEAGUES[activeLeague()].phrase}, every season since 2010-11. Pick a game or look up any player.</p>
        <div class="search guess-input">${icon("search", { size: 18, cls: "search-ic" })}<input id="search" class="input" placeholder="Search any player…" autocomplete="off" aria-label="Search players"></div>
        <div class="row hero-actions">
          ${last && GAMES[last] ? `<a class="btn jump" href="${GAMES[last].href}">${icon("play", { size: 14 })} Jump back into ${GAMES[last].title}</a>` : ""}
          <a class="btn jump" href="#/quick">${icon("dice", { size: 14 })} Quick game</a>
          <a class="btn jump" href="#/online">${icon("globe", { size: 14 })} Play online 1v1</a>
          <a class="btn jump" href="#/challenge">${icon("users", { size: 14 })} Challenge a friend</a>
          ${new Date().getDate() <= 7 ? `<a class="btn jump" href="#/recap">${icon("calendar", { size: 14 })} Your monthly recap</a>` : ""}
        </div>
      </div>
      ${(() => {
        const st = potdSeason.stats || {};
        return html`<button class="lower3" data-profile="${potd.player_id}" aria-label="Player of the day: ${esc(potd.name)}, rating ${potdSeason.rating_mock}. Open the career.">
          <span class="l3-rt"><small>RATING</small><b>${potdSeason.rating_mock}</b></span>
          <span class="l3-main"><span class="l3-kick">Player of the day</span><span class="l3-name">${esc(potd.name)}</span>
            <span class="l3-meta">${esc(potdSeason.position || potd.primary_position || "")} · ${esc(teamName(potdSeason.team_id))} · ${potdSeason.season}</span>
            <span class="l3-stats"><span><b>${fmt1(st.ppg)}</b><small>PPG</small></span><span><b>${fmt1(st.rpg)}</b><small>RPG</small></span><span><b>${fmt1(st.apg)}</b><small>APG</small></span><span><b>${st.games ?? "–"}</b><small>GAMES</small></span></span></span>
          <span class="l3-go">View career ${icon("arrowRight", { size: 14 })}</span>
        </button>`;
      })()}
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
        return html`<a class="card daily-home ${n >= DAILY_COUNT ? "full" : ""}" href="#/daily">
          <span class="dh-flame">${streak ? "🔥" : icon("calendar", { size: 24 })}</span>
          <div><small>DAILY CHALLENGES</small><b>${n}/${DAILY_COUNT} today${streak ? ` · ${streak}-day streak` : ""}</b>
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
      ${(() => {
        const m = missions(), done = m.list.filter((x) => x.done).length;
        return html`<a class="card daily-home" href="#/shop">
          <span class="dh-flame">${icon("flag", { size: 24 })}</span>
          <div><small>WEEKLY MISSIONS · SHOP</small><b>${done}/4 missions done · 🏀 ${coins().toLocaleString("en-US")}</b>
            <span class="dh-dots">${m.list.map((x) => `<i class="${x.done ? "on" : ""}" title="${esc(missionText(x.def))}"></i>`).join("")}</span></div>
          ${icon("arrowRight", { size: 18 })}</a>`;
      })()}
    </section>
    <section class="me-strip" aria-label="Your stats">
      ${stats.map((s, i) => `<div class="card me"><b data-count="${i}">0</b><span>${s.l}</span></div>`).join("")}
      <a class="card me me-ach" href="#/achievements"><b>${ach.done}<small>/${ach.total}</small></b><span>${icon("trophy", { size: 13 })} Achievements</span></a>
    </section>
    ${gameTilesHtml()}`;
  stats.forEach((s, i) => countUp(root.querySelector(`[data-count="${i}"]`), s.v, s.d));
  // LED board: rotates every 6 s, pauses on hover/focus or with the pause button
  {
    const board = root.querySelector(".led-board");
    const items = [...board.querySelectorAll(".lb-slide")];
    let at = 0, paused = reducedMotion(), hold = false;
    const show = (i) => {
      at = (i + items.length) % items.length;
      items.forEach((el, k) => {
        el.classList.toggle("on", k === at);
        el.setAttribute("aria-hidden", String(k !== at));
        el.querySelector(".lb-link").tabIndex = k === at ? 0 : -1;
      });
    };
    const drawPause = () => { const b = board.querySelector("#lb-pause"); b.innerHTML = icon(paused ? "play" : "pause", { size: 15 }); b.setAttribute("aria-label", paused ? "Play the board" : "Pause the board"); };
    drawPause();
    const timer = setInterval(() => { if (!paused && !hold && !document.hidden) show(at + 1); }, 6000);
    signal.addEventListener("abort", () => clearInterval(timer));
    board.addEventListener("mouseenter", () => { hold = true; }, { signal });
    board.addEventListener("mouseleave", () => { hold = false; }, { signal });
    board.addEventListener("focusin", () => { hold = true; }, { signal });
    board.addEventListener("focusout", () => { hold = false; }, { signal });
    board.querySelector("#lb-prev").addEventListener("click", () => show(at - 1), { signal });
    board.querySelector("#lb-next").addEventListener("click", () => show(at + 1), { signal });
    board.querySelector("#lb-pause").addEventListener("click", () => { paused = !paused; drawPause(); }, { signal });
  }
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

