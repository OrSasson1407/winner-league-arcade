// Online 1v1 (#/online, #/online/join/<CODE>): lobby, random matchmaking, invite codes, and the
// four duels. The server runs the game; this page only shows it and sends the player's moves.
import { skeletonRows, undoToast } from "../lib/ux.js";
import { clueValue } from "../lib/units.js";
import { careerSummary, namedPlayers, playersById, psByKey, teamName } from "../data.js";
import { autocomplete, esc, fmt1, html, store, toast } from "../ui.js";
import { nameLink, playerCard } from "../components/playerCard.js";
import { clubColors } from "../lib/clubs.js";
import { confetti, sound } from "../lib/fx.js";
import { icon, posFamily } from "../lib/icons.js";
import { avatarHtml, getMe, meLabel } from "../lib/me.js";
import { confirmDialog } from "../lib/modal.js";
import { emit } from "../lib/achievements.js";
import { levelInfo } from "../lib/progress.js";
import { SIXTH, slotValue } from "../shared/draftLogic.js";
import { openBoxScore, openLiveGame } from "../games/draft_live.js";
import { RECONNECT_GRACE_MS, wakingUp, connect, deadlineFrom, lastStats, latency, myCode, myRecord, netStatus, onNet, quality, send } from "../online/net.js";
import { GAME_ICONS, GAME_NAMES, addFriend, addHistory, getFriends, getHistory, headToHead, isFriend, refreshFriends, removeFriend, rivals } from "../online/social.js";
import { buzz, countdown } from "../online/feel.js";
import { announce } from "../lib/a11y.js";
import { shot } from "../lib/shot.js";
import { courtHtml } from "../lib/court.js";
import { clueSpeech } from "../shared/guessLogic.js";
import { drawResultCard } from "../online/card.js";
import { shareOrDownload } from "../games/draft_card.js";
import { CHAT, RANKS, cleanCode, rankOf } from "../shared/rating.js";
import { criterionById, facts } from "../shared/leagueFacts.js";
import { crestSvg } from "../lib/icons.js";
import { bindGamePlan, gamePlanHtml, readGamePlan } from "../lib/gamePlan.js";
import { arrowGrid, gameKeys, press } from "../lib/shortcuts.js";
import { dateLocale } from "../i18n/index.js";
import { ITEMS, ownedStickers } from "../lib/shop.js";
import { LEAGUES, activeLeague, gameAvailable, setLeague } from "../leagueChoice.js";
import { equipped } from "../lib/wallet.js";
import { owns } from "../lib/wallet.js";
import { openReplay } from "../online/replay.js";
import { realRoster, teamSeasonSide } from "../games/draft_sim.js";
import { alertOnline } from "../lib/notify.js";
const LEAGUE_COLORS = ["#e4002b", "#ffc629", "#0a3e8c", "#00843d", "#6d28d9", "#0ea5e9", "#ff7a1a", "#e11d48", "#111111"]; // as server/leagues.js
const LEAGUE_ICONS = ["trophy", "crown", "flame", "star", "shield", "rocket", "medal", "ball"];

export const ONLINE_GAMES = {
  hl: { name: "Higher or Lower", route: "higher-lower", ic: "chart", short: "Speed duel",
    rules: "15 rounds, 10 seconds each. A right answer is worth 100 points plus up to 50 for speed." },
  guess: { name: "Guess the Player", route: "guess", ic: "search", short: "Race to the answer",
    rules: "Same mystery player for both of you. 8 tries, 3 minutes. Fewer tries wins; a tie goes to the faster player. You see your opponent's colors, not their guesses." },
  career: { name: "Career Path", route: "career", ic: "arrowRight", short: "Buzzer quiz",
    rules: "10 careers, 20 seconds each. The first correct answer takes 3 points. A wrong answer locks you out of that round." },
  draft: { name: "All-Time Draft", route: "draft", ic: "trophy", short: "Head-to-head draft",
    rules: "Snake draft from shared spins: 6 picks each (PG to C plus a sixth man), 30 seconds per pick. Then your two teams play a simulated game." },
  conn: { name: "Connections", route: "connections", ic: "link", short: "Group race",
    rules: "The same 16 players for both of you. Find the four groups; four mistakes and you're out. 4 minutes. More groups wins, then fewer mistakes, then the faster finish." },
  grid: { name: "The Grid", route: "grid", ic: "games", short: "Rarity duel",
    rules: "The same 3×3 board for both. 9 guesses and 3 minutes each; every right answer scores its rarity (0–100). Highest total wins." },
  coach: { name: "Single game", route: "matchup", ic: "whistle", short: "Coach duel",
    rules: "Four real team-seasons. A coin toss decides who picks first; the second pick plays at home. Both of you set a game plan, then the game engine plays it out: watch it live." },
};
const HL_CATS = {
  ppg: { label: "Points per game", get: (ps) => ps.stats.ppg, dec: 1 },
  rpg: { label: "Rebounds per game", get: (ps) => ps.stats.rpg, dec: 1 },
  apg: { label: "Assists per game", get: (ps) => ps.stats.apg, dec: 1 },
  rating: { label: "Game rating", get: (ps) => ps.rating_mock, dec: 0 },
  val: { label: "Efficiency (VAL) per game", get: (ps) => ps.stats.valuation_per_game, dec: 1 },
};
// broadcast-style stickers (sent by id, so nothing free-form goes between players)
const STICKERS = [["andone", "AND ONE!"], ["swish", "SWISH"], ["defense", "DEFENSE!"], ["buzzer", "BUZZER BEATER"], ["onfire", "ON FIRE"], ["airball", "AIRBALL"], ["timeout", "TIMEOUT"], ["gg", "GG"]];
const SHOP_STICKERS = ITEMS.filter((i) => i.cat === "sticker").map((i) => [i.sticker, i.name]);
const STICKER_TEXT = Object.fromEntries([...STICKERS, ...SHOP_STICKERS]); // you can receive every sticker, and send the ones you own
const getLeagues = () => store.get("online:leagues", []);
const saveLeague = (L) => { const list = getLeagues().filter((x) => x.id !== L.id); list.unshift(L); store.set("online:leagues", list.slice(0, 10)); };
const REASONS = { forfeit: "Your opponent left the match.", disconnect: "Your opponent lost their connection." };
const BOTS = { easy: { name: "Rookie", ic: "whistle" }, normal: { name: "Veteran", ic: "rocket" }, hard: { name: "Legend", ic: "crown" } };
const botFor = (elo) => (elo < 1100 ? "easy" : elo < 1250 ? "normal" : "hard"); // Bronze: Rookie, Silver: Veteran, Gold and up: Legend
const AUTO_BOT_S = 20;
const slotLabel = (s) => (s === SIXTH ? "6th" : s);

/** Online record per game: { hl: { w, l, d }, ... } */
export const onlineRecord = () => store.get("online:record", {});
function addRecord(game, result) {
  const r = onlineRecord();
  const g = r[game] || { w: 0, l: 0, d: 0 };
  g[result === "win" ? "w" : result === "lose" ? "l" : "d"]++;
  r[game] = g;
  store.set("online:record", r);
}

export function renderOnline(root, signal, params = []) {
  // the games that run on this league's data (you're matched with players of the same league)
  const LEAGUE_GAMES = Object.keys(ONLINE_GAMES).filter((k) => gameAvailable(ONLINE_GAMES[k].route));
  let game = LEAGUE_GAMES.includes(store.get("online:game")) ? store.get("online:game") : LEAGUE_GAMES[0];
  let switchTo = null; // an invite or a match in another league: offer to switch
  let phase = "lobby"; // lobby | searching | inviting | match | end
  let invite = null, searchStart = 0, lobbyMsg = "", autoBotSent = false;
  // nobody else searching this game: offer the bot right away; otherwise after a short wait
  const aloneInQueue = () => (lastStats?.waiting?.[game] ?? 0) <= 1;
  const botOfferNow = () => phase === "searching" && (Date.now() - searchStart > 12000 || (aloneInQueue() && Date.now() - searchStart > 2500));
  let M = null; // the current match
  let G = null; // the current game's state
  let tick = null;
  let tab = ["play", "friends", "leagues", "leaders", "history"].includes(store.get("online:tab")) ? store.get("online:tab") : "play";
  let league = null, leagueTables = {}, gridItems = null;
  let friendsInfo = null, leaders = null, leadersGame = "all", leadersPeriod = store.get("online:lbPeriod", "all"), stopCount = null;
  let serverHistory = null; // this device's matches as saved on the server (null until asked)
  const joinCode = params[0] === "join" && params[1] ? String(params[1]).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
  const leagueLink = params[0] === "league" && params[1] ? String(params[1]).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
  if (leagueLink) { tab = "leagues"; league = leagueLink; }
  let joinTried = false;

  connect();
  onNet(onMessage, signal);
  tick = setInterval(updateClocks, 200);
  // friends' online status, refreshed while the Friends tab is open
  const friendPoll = setInterval(() => {
    if (phase === "lobby" && tab === "friends" && getFriends().length) send({ t: "friends", codes: getFriends().map((f) => f.code) });
    if (phase === "lobby" && tab === "leagues" && league) send({ t: "league:table", id: league });
  }, 15000);
  const syncLeagues = () => { const list = getLeagues(); if (list.length) send({ t: "league:sync", leagues: list }); };
  if (netStatus() === "online") syncLeagues();
  signal.addEventListener("abort", () => {
    clearInterval(tick); clearInterval(friendPoll); stopCount?.();
    if (phase === "searching" || phase === "inviting") send({ t: "cancel" });
    if (M?.spectator) send({ t: "unspectate" });
    else if (phase === "match" || phase === "end") send({ t: "leave" }); // leaving the page forfeits a running match
  });

  // ------------------------------------------------------------ server messages
  function onMessage(m) {
    switch (m.t) {
      case "status":
        if (phase === "lobby" || phase === "searching" || phase === "inviting") drawLobby();
        else drawConnBadge();
        if (m.status === "online" && joinCode && !joinTried && phase === "lobby") { joinTried = true; send({ t: "join", code: joinCode }); }
        if (m.status === "online") { syncLeagues(); if (leagueLink && !getLeagues().some((x) => x.id === leagueLink) && !joinTried) { joinTried = true; send({ t: "league:join", id: leagueLink }); } }
        return;
      case "quality":
        drawConnBadge();
        if (m.quality === "poor" && phase === "match" && M && !M.spectator && !M.warnedSlow) { M.warnedSlow = true; toast("Unstable connection: your moves may arrive late"); }
        return;
      case "welcome": case "stats": if (phase === "lobby" || phase === "searching" || phase === "inviting") drawLobbyStats(); return;
      case "queued": phase = "searching"; searchStart = Date.now(); autoBotSent = false; return drawLobby();
      case "invited": phase = "inviting"; invite = m; tab = "play"; return drawLobby();
      case "invite:declined": if (phase === "inviting") { phase = "lobby"; invite = null; lobbyMsg = `${m.name} can't play right now.`; drawLobby(); } return;
      case "record": if (phase === "lobby" && tab === "play") drawLobby(); return;
      case "friends": friendsInfo = m.list; refreshFriends(m.list); if (phase === "lobby" && tab === "friends") drawLobby(); return;
      case "leaders": leaders = m; if (phase === "lobby" && tab === "leaders") drawLobby(); return;
      case "history": serverHistory = m.list || []; if (phase === "lobby" && tab === "history") drawLobby(); return;
      case "replay":
        if (m.missing) return toast("That replay isn't available");
        if ((m.replay?.league || "wl") !== activeLeague()) return toast(`That match was played in ${LEAGUES[m.replay?.league || "wl"].name}. Switch league to watch the replay.`);
        return openReplay({ game: m.game, seat: m.seat, names: [m.players[m.seat]?.name || "You", m.players[1 - m.seat]?.name || "?"], replay: m.replay, scores: m.scores });
      case "whois": {
        if (!m.found) { const el = root.querySelector("#fr-msg"); if (el) el.textContent = "No player with that code. They need to open the arcade online once."; return; }
        addFriend(m); friendsInfo = null; toast(`${m.name} added to friends`);
        if (phase === "lobby" && tab === "friends") drawLobby();
        return;
      }
      case "chat": return showChat(m.i, "opp");
      case "league": {
        saveLeague(m.league);
        if (m.created || m.joined) { league = m.league.id; tab = "leagues"; toast(m.created ? `League created: ${m.league.name}` : `You joined ${m.league.name}`); }
        if (league === m.league.id) send({ t: "league:table", id: league });
        if (phase === "lobby" && tab === "leagues") drawLobby();
        return;
      }
      case "league:left": store.set("online:leagues", getLeagues().filter((x) => x.id !== m.id)); if (league === m.id) league = null; if (phase === "lobby" && tab === "leagues") drawLobby(); return;
      case "league:table": leagueTables[m.league.id] = m; saveLeague(m.league); if (phase === "lobby" && tab === "leagues") drawLobby(); return;
      case "watchers": if (M) { M.watchers = m.n; const w = root.querySelector("#watchers"); if (w) w.textContent = m.n ? `👁 ${m.n} watching` : ""; } return;
      case "spectate:end": if (M?.spectator && phase === "match") { M = null; G = null; phase = "lobby"; toast("The match ended"); drawLobby(); } return;
      case "cancelled": if (phase === "searching" || phase === "inviting") { phase = "lobby"; invite = null; drawLobby(); } return;
      case "error": lobbyMsg = m.msg; switchTo = m.code === "other-league" && LEAGUES[m.league] ? m.league : null; phase = "lobby"; if (joinCode) history.replaceState(null, "", "#/online"); return drawLobby();
      case "match":
        if (m.resumed && M && M.seq === m.seq) { M.seat = m.seat; drawConnBadge(); return; }
        M = { game: m.game, mode: m.mode, rated: m.rated, seat: m.seat, you: m.you, opp: m.opp, seq: m.seq, scores: [0, 0], oppAway: false, oppRematch: false, sentRematch: false,
          startAt: deadlineFrom(3500), maxBehind: 0, oppSolvedFirst: false, spectator: !!m.spectator, watchers: m.watchers || 0 };
        G = null; phase = "match";
        if (joinCode) history.replaceState(null, "", "#/online");
        sound.play("spin"); buzz(150);
        if (m.unrated === "pair" && !m.resumed) toast("Ranked games against the same opponent count 5 times a day: this one won't change your rating");
        if (!M.spectator && !m.resumed) alertOnline(`Match found: ${m.opp.name}`, { body: `${ONLINE_GAMES[m.game].name} starts in 3 seconds.`, tag: "wla-match" });
        if (M.spectator) announce(`Watching ${m.you.name} against ${m.opp.name}, ${ONLINE_GAMES[m.game].name}.`);
        else if (!m.resumed) announce(`Match found: ${m.opp.name}. ${ONLINE_GAMES[m.game].name}, ${m.mode === "ranked" ? "ranked" : m.mode === "bot" ? "against a bot" : "friendly"}. Starting in 3 seconds.`, { assertive: true });
        stopCount?.(); stopCount = m.resumed ? null : countdown(M.startAt);
        return drawMatch();
      case "opp:away": if (M) { M.oppAway = Date.now() + m.ms; drawOppState(); } return;
      case "opp:back": if (M) { M.oppAway = false; drawOppState(); } return;
      case "opp:left": if (M) { M.oppLeft = true; if (phase === "end") drawEnd(); } return;
      case "opp:rematch": if (M) { M.oppRematch = true; if (phase === "end") drawEnd(); toast(`${M.opp.name} wants a rematch`); alertOnline(`${M.opp.name} wants a rematch`, { tag: "wla-match" }); } return;
      case "react": return showReaction(m.e, m.from || "opp");
      case "end": return onEnd(m);
    }
    if (!M || phase !== "match") return;
    if (m.t.startsWith("hl:") || (m.t === "opp:answered" && M.game === "hl")) return hlMessage(m);
    if (m.t.startsWith("car:") || (m.t === "opp:wrong" && M.game === "career")) return careerMessage(m);
    if (m.t.startsWith("guess:")) return guessMessage(m);
    if (m.t.startsWith("draft:")) return draftMessage(m);
    if (m.t.startsWith("coach:")) return coachMessage(m);
    if (m.t.startsWith("conn:")) return connMessage(m);
    if (m.t.startsWith("grid:")) return gridMessage(m);
  }

  // ------------------------------------------------------------ lobby
  function statusText() {
    const s = netStatus();
    return s === "online" ? `Connected · ${Math.round(latency())} ms` : s === "unavailable" ? "Online server not found" : s === "replaced" ? "Opened in another tab"
      : s === "offline" ? "You're offline" : wakingUp() ? "Waking up the server (up to a minute)…" : s === "reconnecting" ? "Reconnecting…" : "Connecting…";
  }
  const QUALITY = { good: "Good connection", fair: "Connection a bit slow", poor: "Unstable connection: moves may arrive late" };
  const connTitle = () => (netStatus() === "online" ? `${QUALITY[quality()]} · ping ${Math.round(latency())} ms` : statusText());
  const connClass = () => `conn ${netStatus()} q-${quality()}`;

  const rankBadge = (elo, { small = false } = {}) => {
    if (elo == null) return "";
    const r = rankOf(elo);
    return `<span class="rank-badge rk-${r.id} ${small ? "sm" : ""}" title="${r.name} · ${elo}"><i></i>${r.name}${small ? "" : ` <b>${elo}</b>`}</span>`;
  };
  const TABS = [["play", "bolt", "Play"], ["friends", "users", "Friends"], ["leagues", "medal", "Leagues"], ["leaders", "trophy", "Leaderboard"], ["history", "clock", "History"]];

  function drawLobby() {
    const s = netStatus();
    const busy = phase === "searching" || phase === "inviting";
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>${icon("globe", { size: 30 })} Online 1v1</h1>
        <p>Ranked matches against players at your level, friendly games with friends, or practice against a bot.</p></div>
        <div class="row"><span class="${connClass()}" id="conn" title="${connTitle()}"><i></i>${statusText()}</span><span class="muted" id="online-count"></span></div>
      </div>
      ${s === "unavailable" ? html`<div class="card pad warn-card">${icon("info", { size: 20 })}<div><b>Online play needs the arcade's Node server.</b>
        <p class="muted" style="margin:4px 0 0">This page is being served without it (for example by the Python server). Start the arcade with <code>start_game.bat</code> after installing Node.js, or run <code>npm install</code> and <code>npm start</code> in the project folder.</p></div></div>` : ""}
      ${s === "replaced" ? html`<div class="card pad warn-card">${icon("info", { size: 20 })}<div><b>Online play is open in another tab.</b> <button class="btn" id="reconnect">Use this tab</button></div></div>` : ""}
      ${lobbyMsg ? `<div class="card pad warn-card">${icon("x", { size: 20 })}<div>${esc(lobbyMsg)}${switchTo ? ` <button class="btn primary" id="switch-league" style="margin-top:8px">Switch to ${esc(LEAGUES[switchTo].name)}</button>` : ""}</div></div>` : ""}
      <div class="seg og-tabs" id="og-tabs" role="tablist">${TABS.map(([k, ic, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? "on" : ""}" data-tab="${k}" ${busy && k !== "play" ? "disabled" : ""}>${icon(ic, { size: 15 })} ${l}</button>`).join("")}</div>
      <div id="og-body"></div>`;
    root.querySelector("#og-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]"); if (!b || b.disabled) return;
      tab = b.dataset.tab; store.set("online:tab", tab); lobbyMsg = ""; drawLobby();
    }, { signal });
    root.querySelector("#reconnect")?.addEventListener("click", () => connect(), { signal });
    root.querySelector("#switch-league")?.addEventListener("click", () => setLeague(switchTo, joinCode ? `#/online/join/${joinCode}` : "#/online"), { signal });
    const body = root.querySelector("#og-body");
    ({ play: drawPlay, friends: drawFriends, leagues: drawLeagues, leaders: drawLeaders, history: drawHistory })[tab](body, s, busy);
    drawLobbyStats();
  }

  function drawPlay(body, s, busy) {
    const rec = myRecord();
    const elo = rec?.elo?.[game] ?? 1000;
    body.innerHTML = html`<div class="online-grid">
        <div class="card pad setup">
          <h3>${icon("games")} Choose a game</h3>
          <p class="muted" style="margin:0 0 8px;font-size:13px">${icon("globe", { size: 13 })} <span>Playing on</span> <b>${esc(LEAGUES[activeLeague()].name)}</b>: <span>you're matched with players in the same league. Change it on the Games page.</span></p>
          <div class="ch-games" id="og-games">${Object.entries(ONLINE_GAMES).filter(([k]) => LEAGUE_GAMES.includes(k)).map(([k, g]) => `<button class="ch-game ${k === game ? "on" : ""}" data-g="${k}" ${busy ? "disabled" : ""} aria-pressed="${k === game}">${icon(g.ic, { size: 22 })}<b>${g.name} <span class="muted og-short">· ${g.short}</span> ${rankBadge(rec?.elo?.[k] ?? 1000, { small: true })}</b><small>${g.rules}</small></button>`).join("")}</div>
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          <div class="card pad og-me ${equipped("card") ? `card-skin-${equipped("card").split(":")[1]}` : ""}">
            ${avatarHtml(getMe(), 48)}
            <div style="min-width:0"><b>${meLabel()}</b><div class="muted">Level ${levelInfo().level}${rec?.streak >= 2 ? ` · <span class="streak-fire">🔥 ${rec.streak} win streak</span>` : ""}</div>
              <div class="og-rankline">${rankBadge(elo)} <span class="muted">in ${ONLINE_GAMES[game].name}</span></div></div>
            <a class="btn ghost" href="#/me">${icon("user", { size: 15 })} Edit</a>
          </div>
          ${phase === "searching" ? html`<div class="card pad og-wait pop">
              <div class="radar"><i></i><i></i>${icon(ONLINE_GAMES[game].ic, { size: 28 })}</div>
              <h3>Looking for an opponent near ${elo}…</h3>
              <p class="muted" style="margin:0">${ONLINE_GAMES[game].name} · Ranked · <span id="search-time">0:00</span></p>
              <small class="muted">The longer you wait, the wider the search. You can keep this tab open in the background.</small>
              <div class="bot-offer" id="bot-offer" ${botOfferNow() ? "" : "hidden"}>
                <b>${aloneInQueue() ? "Nobody else is searching right now." : "Taking a while?"}</b> <span class="muted">Play a bot meanwhile (not ranked):</span>
                <div class="row" style="justify-content:center">${Object.entries(BOTS).map(([k, b]) => `<button class="btn ${k === botFor(elo) ? "primary" : ""}" data-bot="${k}">${icon(b.ic, { size: 15 })} ${b.name}${k === botFor(elo) ? ` <small>(your level)</small>` : ""}</button>`).join("")}</div>
              </div>
              <label class="check og-autobot"><input type="checkbox" id="autobot" ${store.get("online:autobot", false) ? "checked" : ""}> <span>Nobody after ${AUTO_BOT_S} s? Start a bot game at my level</span></label>
              <button class="btn" id="cancel">${icon("close", { size: 15 })} Cancel</button>
            </div>`
          : phase === "inviting" ? html`<div class="card pad og-wait pop">
              ${invite.to ? html`<div class="radar"><i></i><i></i>${icon("users", { size: 28 })}</div>
                <h3>Waiting for ${esc(invite.to)} to accept…</h3>
                <p class="muted" style="margin:0">${ONLINE_GAMES[invite.game].name} · Friendly</p>`
              : html`<small class="muted">YOUR INVITE CODE · ${ONLINE_GAMES[invite.game].name.toUpperCase()}</small>
                <div class="ch-code led og-code">${invite.code}</div>
                <div class="row" style="justify-content:center">
                  <button class="btn" id="copy-code">${icon("check", { size: 15 })} Copy code</button>
                  <button class="btn primary" id="copy-link">${icon("link", { size: 15 })} Copy invite link</button>
                </div>
                <p class="muted" style="margin:0;font-size:13px"><span class="dots">Waiting for your friend to join</span></p>`}
              <button class="btn ghost" id="cancel">${icon("close", { size: 15 })} Cancel invite</button>
            </div>`
          : html`<div class="card pad og-actions">
              <button class="btn primary big-btn" id="find" ${s === "online" ? "" : "disabled"}>${icon("bolt", { size: 18 })} Find a ranked match</button>
              <button class="btn big-btn" id="invite" ${s === "online" ? "" : "disabled"}>${icon("users", { size: 18 })} Invite a friend <span class="muted" style="font-size:13px">(friendly)</span></button>
              <div class="og-join">
                <label for="join-in" class="muted">Got a code?</label>
                <div class="row"><input id="join-in" class="input ch-input" placeholder="K7Q2M" maxlength="8" autocomplete="off" aria-label="Invite code" style="flex:1">
                  <button class="btn" id="join" ${s === "online" ? "" : "disabled"}>${icon("arrowRight", { size: 16 })} Join</button></div>
              </div>
              <div class="og-join"><span class="muted">Practice vs a bot (not ranked)</span>
                <div class="row">${Object.entries(BOTS).map(([k, b]) => `<button class="btn ghost" data-bot="${k}" ${s === "online" ? "" : "disabled"}>${icon(b.ic, { size: 15 })} ${b.name}</button>`).join("")}</div></div>
            </div>`}
          <div class="card pad"><h3>${icon("trophy")} Your ranks</h3>
            <table class="stat-table og-rec"><thead><tr><th>Game</th><th>Rank</th><th>W</th><th>L</th><th>D</th></tr></thead>
            <tbody>${Object.entries(ONLINE_GAMES).map(([k, g]) => `<tr><td>${icon(g.ic, { size: 15 })} ${g.name}</td><td>${rankBadge(rec?.elo?.[k] ?? 1000)}</td><td><b>${rec?.w?.[k] ?? 0}</b></td><td>${rec?.l?.[k] ?? 0}</td><td>${rec?.d?.[k] ?? 0}</td></tr>`).join("")}</tbody></table>
            <p class="muted" style="font-size:12px;margin:8px 0 0">Ranked matches only. Ranks: ${RANKS.map((r) => `${r.name} ${r.min || ""}`).join(" · ")}. Best streak: ${rec?.best ?? 0}.</p>
          </div>
        </div>
      </div>`;
    const $ = (q) => body.querySelector(q);
    $("#og-games").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]"); if (!b || busy) return;
      game = b.dataset.g; store.set("online:game", game); lobbyMsg = ""; switchTo = null; drawLobby();
    }, { signal });
    $("#find")?.addEventListener("click", () => { lobbyMsg = ""; send({ t: "queue", game }); }, { signal });
    $("#invite")?.addEventListener("click", () => { lobbyMsg = ""; send({ t: "invite", game }); }, { signal });
    $("#cancel")?.addEventListener("click", () => send({ t: "cancel" }), { signal });
    $("#autobot")?.addEventListener("change", (e) => store.set("online:autobot", e.target.checked), { signal });
    body.querySelectorAll("[data-bot]").forEach((b) => b.addEventListener("click", () => { lobbyMsg = ""; send({ t: "bot", game, level: b.dataset.bot }); }, { signal }));
    const join = () => {
      const code = $("#join-in").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length < 4) { lobbyMsg = "Invite codes have 5 characters, like K7Q2M."; return drawLobby(); }
      lobbyMsg = ""; send({ t: "join", code });
    };
    $("#join")?.addEventListener("click", join, { signal });
    $("#join-in")?.addEventListener("keydown", (e) => { if (e.key === "Enter") join(); }, { signal });
    $("#copy-code")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(invite.code); toast("Code copied"); } catch { toast(invite.code); } }, { signal });
    $("#copy-link")?.addEventListener("click", async () => {
      const link = `${location.origin}${location.pathname}#/online/join/${invite.code}`;
      const text = `Play me in Winner League Arcade (${ONLINE_GAMES[invite.game].name}): ${link}`;
      try { await navigator.clipboard.writeText(text); toast("Invite link copied: send it to your friend"); } catch { toast(link); }
    }, { signal });
  }

  // ---------------- friends
  function drawFriends(body, s) {
    const friends = getFriends();
    const info = new Map((friendsInfo || []).map((x) => [x.code, x]));
    const code = myCode || myRecord()?.code || "······";
    const sorted = friends.slice().sort((a, b) => (info.get(b.code)?.online ? 1 : 0) - (info.get(a.code)?.online ? 1 : 0));
    body.innerHTML = html`<div class="online-grid">
      <div class="card pad" style="display:grid;gap:12px;align-content:start">
        <h3>${icon("users")} Friends <span class="muted">(${friends.length})</span></h3>
        ${sorted.length ? `<div class="friend-list">${sorted.map((f) => {
          const x = info.get(f.code) || {};
          const st = x.playing ? "playing" : x.online ? "online" : "offline";
          const h2h = headToHead(f.code);
          return html`<div class="friend-row">
            <span class="fr-av">${avatarHtml({ icon: f.icon || "ball", color: f.color || "#64748b", frame: f.frame || "none", style: f.style, av: f.av }, 38)}<i class="dot-st ${st}"></i></span>
            <div class="fr-info"><b>${esc(f.name)}</b><small class="muted">${st === "playing" ? "In a match" : st === "online" ? "Online now" : "Offline"} · ${f.code}${h2h.w + h2h.l + h2h.d ? ` · you ${h2h.w}-${h2h.l}${h2h.d ? `-${h2h.d}` : ""}` : ""}</small></div>
            ${st === "playing" ? `<button class="btn" data-watch="${f.code}" ${s === "online" ? "" : "disabled"}>${icon("play", { size: 14 })} Watch</button>`
              : `<button class="btn ${st === "online" ? "primary" : ""}" data-inv="${f.code}" ${st === "online" && s === "online" ? "" : "disabled"}>${icon("play", { size: 14 })} Invite</button>`}
            <button class="icon-btn" data-rm="${f.code}" aria-label="Remove ${esc(f.name)}">${icon("close", { size: 15 })}</button>
          </div>`;
        }).join("")}</div>
        <p class="muted" style="font-size:12px;margin:0">Invites are for <b>${ONLINE_GAMES[game].name}</b>, the game picked on the Play tab. Your friend gets a pop-up anywhere in the arcade.</p>`
        : `<p class="muted">No friends yet. Share your player code, or add a friend with theirs. You can also add opponents from the end screen of a match.</p>`}
      </div>
      <div style="display:grid;gap:18px;align-content:start">
        <div class="card pad og-wait">
          <small class="muted">YOUR PLAYER CODE</small>
          <div class="ch-code led og-code">${code}</div>
          <button class="btn" id="copy-my">${icon("check", { size: 15 })} Copy code</button>
        </div>
        <div class="card pad" style="display:grid;gap:8px">
          <h3>${icon("search")} Add a friend</h3>
          <div class="row"><input id="fr-in" class="input ch-input" placeholder="ABC234" maxlength="8" autocomplete="off" aria-label="Friend's player code" style="flex:1">
            <button class="btn primary" id="fr-add" ${s === "online" ? "" : "disabled"}>${icon("check", { size: 15 })} Add</button></div>
          <small class="muted" id="fr-msg">They find their code on the Friends tab.</small>
        </div>
      </div>
    </div>`;
    const $ = (q) => body.querySelector(q);
    $("#copy-my").addEventListener("click", async () => { try { await navigator.clipboard.writeText(code); toast("Player code copied"); } catch { toast(code); } }, { signal });
    const add = () => {
      const c = cleanCode($("#fr-in").value);
      if (c.length !== 6) { $("#fr-msg").textContent = "Player codes have 6 characters."; return; }
      if (c === code) { $("#fr-msg").textContent = "That's your own code."; return; }
      $("#fr-msg").textContent = "Looking…";
      send({ t: "whois", code: c });
    };
    $("#fr-add").addEventListener("click", add, { signal });
    $("#fr-in").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); }, { signal });
    body.querySelectorAll("[data-inv]").forEach((b) => b.addEventListener("click", () => { lobbyMsg = ""; send({ t: "invite:friend", code: b.dataset.inv, game }); }, { signal }));
    body.querySelectorAll("[data-watch]").forEach((b) => b.addEventListener("click", () => { lobbyMsg = ""; send({ t: "spectate", code: b.dataset.watch }); }, { signal }));
    body.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => {
      const f = friends.find((x) => x.code === b.dataset.rm);
      const before = getFriends();
      removeFriend(b.dataset.rm); drawLobby();
      undoToast(`${f?.name || "Friend"} removed`, () => { store.set("online:friends", before); drawLobby(); });
    }, { signal }));
    if (friends.length && !friendsInfo) send({ t: "friends", codes: friends.map((f) => f.code) });
  }

  // ---------------- leagues: a private group with a weekly table
  function drawLeagues(body, s) {
    const mineList = getLeagues();
    if (!league && mineList.length) league = mineList[0].id;
    const T = league ? leagueTables[league] : null;
    const L = T?.league || mineList.find((x) => x.id === league);
    const myCodeNow = myCode || myRecord()?.code;
    body.innerHTML = html`<div class="online-grid">
      <div style="display:grid;gap:16px;align-content:start;min-width:0">
        ${L ? html`<div class="card pad lg-card">
          <div class="row"><div><small class="muted">LEAGUE · WEEK ${esc(T?.week?.split("-W")[1] || "")}</small><h2 style="margin:2px 0 0" class="lg-name" ${L.style?.color ? `style="--lg:${esc(L.style.color)}"` : ""}>${L.style?.icon ? icon(L.style.icon, { size: 22 }) + " " : ""}${esc(L.name)}</h2></div><span class="spacer"></span>
            <button class="btn" id="lg-copy">${icon("link", { size: 15 })} Invite link</button></div>
          ${T ? html`<div class="grid-wrap"><table class="stat-table lg-table"><thead><tr><th>#</th><th>Player</th><th>W</th><th>D</th><th>L</th><th>Pts</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${T.rows.map((r, i) => html`<tr class="${r.me ? "me-row" : ""}"><td>${i + 1}</td>
              <td><span class="lg-who">${avatarHtml({ icon: r.icon || "ball", color: r.color || "#64748b", frame: r.frame || "none", style: r.style, av: r.av }, 28)}<span><b>${esc(r.name)}${r.me ? " (you)" : ""}</b><small class="muted">${r.playing ? "In a match" : r.online ? "Online" : "Offline"} · ${r.code}</small></span></span></td>
              <td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td><b class="led">${r.pts}</b></td>
              <td>${r.me ? "" : r.playing ? `<button class="btn sm" data-watch="${r.code}">Watch</button>` : r.online ? `<button class="btn sm" data-inv="${r.code}">Invite</button>` : ""}</td></tr>`).join("")}
            </tbody></table></div>
            <p class="muted" style="font-size:12px;margin:8px 0 0">Points from online matches against people this week (not bots): win 3, draw 1. A new week starts on Monday (UTC). Up to ${T.max} players.</p>`
            : `<div aria-busy="true"><span class="sr-only">Loading the table…</span>${skeletonRows(5)}</div>`}
          ${L.owner === myCodeNow ? (owns("league:style") ? html`<details class="lg-style"><summary>${icon("star", { size: 14 })} League colours</summary>
            <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px" role="group" aria-label="League colour">${LEAGUE_COLORS.map((c) => `<button class="sw ${L.style?.color === c ? "on" : ""}" data-lgc="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${L.style?.color === c}"></button>`).join("")}</div>
            <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px" role="group" aria-label="League icon">${LEAGUE_ICONS.map((ic) => `<button class="icon-btn ${L.style?.icon === ic ? "on" : ""}" data-lgi="${ic}" aria-label="Icon ${ic}" aria-pressed="${L.style?.icon === ic}">${icon(ic, { size: 18 })}</button>`).join("")}</div></details>`
            : `<a class="muted sh-more" href="#/shop/league">${icon("coin", { size: 14 })} League colours are in the shop</a>`) : ""}
          <div class="row" style="margin-top:10px"><span class="muted" style="font-size:13px">League code <b class="led">${esc(L.id)}</b></span><span class="spacer"></span><button class="btn ghost" id="lg-leave">${icon("x", { size: 14 })} Leave league</button></div>
        </div>` : html`<div class="card pad"><h3>${icon("medal")} Friend leagues</h3><p class="muted">Start a private league with your friends: everyone's online results this week go into one table. Share the code, and the table resets every Monday.</p></div>`}
      </div>
      <div style="display:grid;gap:16px;align-content:start">
        ${mineList.length ? `<div class="card pad"><h3>${icon("users")} Your leagues</h3><div class="lg-list">${mineList.map((x) => `<button class="lg-pick ${x.id === league ? "on" : ""}" data-lg="${x.id}"><b class="lg-name" ${x.style?.color ? `style="--lg:${esc(x.style.color)}"` : ""}>${x.style?.icon ? icon(x.style.icon, { size: 14 }) + " " : ""}${esc(x.name)}</b><small class="muted">${(x.members || []).length} player${(x.members || []).length === 1 ? "" : "s"} · ${x.id}</small></button>`).join("")}</div></div>` : ""}
        <div class="card pad" style="display:grid;gap:8px"><h3>${icon("star")} New league</h3>
          <div class="row"><input id="lg-name" class="input" maxlength="32" placeholder="League name" aria-label="League name" style="flex:1"><button class="btn primary" id="lg-create" ${s === "online" ? "" : "disabled"}>Create</button></div></div>
        <div class="card pad" style="display:grid;gap:8px"><h3>${icon("search")} Join a league</h3>
          <div class="row"><input id="lg-code" class="input ch-input" maxlength="7" placeholder="LABC234" aria-label="League code" style="flex:1"><button class="btn" id="lg-join" ${s === "online" ? "" : "disabled"}>Join</button></div></div>
      </div>
    </div>`;
    const $ = (q) => body.querySelector(q);
    $("#lg-create").addEventListener("click", () => { const n = $("#lg-name").value.trim(); if (!n) return $("#lg-name").focus(); send({ t: "league:create", name: n }); }, { signal });
    $("#lg-join").addEventListener("click", () => { const c = cleanCode($("#lg-code").value); if (c.length < 6) return $("#lg-code").focus(); lobbyMsg = ""; send({ t: "league:join", id: c }); }, { signal });
    body.querySelectorAll("[data-lg]").forEach((b) => b.addEventListener("click", () => { league = b.dataset.lg; send({ t: "league:table", id: league }); drawLobby(); }, { signal }));
    body.querySelectorAll("[data-inv]").forEach((b) => b.addEventListener("click", () => { lobbyMsg = ""; send({ t: "invite:friend", code: b.dataset.inv, game }); }, { signal }));
    body.querySelectorAll("[data-watch]").forEach((b) => b.addEventListener("click", () => { lobbyMsg = ""; send({ t: "spectate", code: b.dataset.watch }); }, { signal }));
    // the owner's league colours (bought in the shop)
    const restyle = (patch) => { if (L) send({ t: "league:style", id: L.id, style: { ...(L.style || {}), ...patch } }); };
    body.querySelectorAll("[data-lgc]").forEach((b) => b.addEventListener("click", () => restyle({ color: L.style?.color === b.dataset.lgc ? null : b.dataset.lgc }), { signal }));
    body.querySelectorAll("[data-lgi]").forEach((b) => b.addEventListener("click", () => restyle({ icon: L.style?.icon === b.dataset.lgi ? null : b.dataset.lgi }), { signal }));
    $("#lg-copy")?.addEventListener("click", async () => {
      const link = `${location.origin}${location.pathname}#/online/league/${L.id}`;
      try { await navigator.clipboard.writeText(`Join my league "${L.name}" in Winner League Arcade: ${link}`); toast("Invite link copied"); } catch { toast(link); }
    }, { signal });
    $("#lg-leave")?.addEventListener("click", () => {
      const keep = L;
      send({ t: "league:leave", id: L.id });
      undoToast(`You left ${L.name}`, () => send({ t: "league:join", id: keep.id }));
    }, { signal });
    if (league && !T && s === "online") send({ t: "league:table", id: league });
    void myCodeNow;
  }

  // ---------------- leaderboard
  function drawLeaders(body) {
    const L = leaders?.game === leadersGame && (leaders.period || "all") === leadersPeriod ? leaders : null;
    const timed = leadersPeriod !== "all"; // this week / this month: points from ranked results
    const row = (r) => html`<tr class="${r.me ? "me-row" : ""}"><td class="pos">${r.pos <= 3 ? ["🥇", "🥈", "🥉"][r.pos - 1] : r.pos}</td>
      <td><span class="lb-name">${avatarHtml({ icon: r.icon, color: r.color, frame: r.frame, style: r.style, av: r.av }, 30)}<span>${r.code ? `<a href="#/op/${esc(r.code)}"><b>${esc(r.name)}</b></a>` : `<b>${esc(r.name)}</b>`}<small class="muted">Lv ${r.level}${r.streak >= 3 ? ` · 🔥${r.streak}` : ""}</small></span>${!r.me && r.code && r.name !== "Player" ? `<button class="icon-btn lb-report" data-report="${esc(r.code)}" data-name="${esc(r.name)}" aria-label="Report the nickname ${esc(r.name)}" title="Report nickname">${icon("flag", { size: 13 })}</button>` : ""}</span></td>
      <td>${rankBadge(r.elo, { small: true })}</td>${timed ? `<td><b>${r.pts}</b></td><td class="muted">${r.w}-${r.d}-${r.l}</td>`
        : `<td><b>${leadersGame === "all" ? r.w : r.elo}</b></td><td class="muted">${r.w}-${r.l}</td>`}</tr>`;
    const since = timed && L?.since ? new Date(L.since).toLocaleDateString(dateLocale(), { day: "numeric", month: "long" }) : "";
    body.innerHTML = html`<div class="card pad">
      <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px"><h3 style="margin:0">${icon("trophy")} Leaderboard</h3><span class="spacer"></span>
        <div class="seg sm" id="lb-period" role="radiogroup" aria-label="Period">${[["all", "All time"], ["month", "This month"], ["week", "This week"]].map(([k, l]) => `<button role="radio" aria-checked="${k === leadersPeriod}" class="${k === leadersPeriod ? "on" : ""}" data-lp="${k}">${l}</button>`).join("")}</div>
        <div class="seg sm" id="lb-game">${[["all", "All games"], ...Object.entries(ONLINE_GAMES).map(([k, g]) => [k, g.name])].map(([k, l]) => `<button class="${k === leadersGame ? "on" : ""}" data-lg="${k}">${l}</button>`).join("")}</div></div>
      ${!L ? `<div aria-busy="true"><span class="sr-only">Loading…</span>${skeletonRows(8)}</div>` : L.rows.length ? html`<div class="grid-wrap"><table class="stat-table lb-table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>${timed ? "Pts" : leadersGame === "all" ? "Wins" : "Rating"}</th><th>${timed ? "W-D-L" : "W-L"}</th></tr></thead>
        <tbody>${L.rows.map(row).join("")}${L.me ? `<tr class="gap"><td colspan="5">⋯</td></tr>${row(L.me)}` : ""}</tbody></table></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">${timed ? `Ranked matches since ${since}: win 3, draw 1. ${L.total} player${L.total === 1 ? "" : "s"}.` : `Ranked matches only. ${L.total} ranked player${L.total === 1 ? "" : "s"}.`}</p>`
        : `<p class="muted">${L.error ? "The leaderboard couldn't load. Try again in a moment." : timed ? `No ranked matches ${leadersPeriod === "week" ? "this week" : "this month"} yet${leadersGame === "all" ? "" : " in this game"}. Win one to take the top spot!` : `No ranked matches yet${leadersGame === "all" ? "" : " in this game"}. Win one to take the top spot!`}</p>`}
    </div>`;
    const ask = () => send({ t: "leaders", game: leadersGame, period: leadersPeriod });
    body.querySelectorAll("[data-report]").forEach((b) => b.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Report this nickname?", message: `"${b.dataset.name}" will be sent for review. Offensive nicknames are replaced with "Player".`, ok: "Report", cancel: "Cancel" });
      if (ok) { send({ t: "report", code: b.dataset.report }); toast("Thanks: the nickname was reported"); }
    }, { signal }));
    body.querySelector("#lb-game").addEventListener("click", (e) => {
      const b = e.target.closest("[data-lg]"); if (!b) return;
      leadersGame = b.dataset.lg; ask(); drawLobby();
    }, { signal });
    body.querySelector("#lb-period").addEventListener("click", (e) => {
      const b = e.target.closest("[data-lp]"); if (!b) return;
      leadersPeriod = b.dataset.lp; store.set("online:lbPeriod", leadersPeriod); ask(); drawLobby();
    }, { signal });
    if (!L) ask();
  }

  // ---------------- history
  function drawHistory(body, s) {
    // the server's copy (kept in the database) when it has one, else what this browser saved
    if (serverHistory === null && s === "online") { serverHistory = undefined; send({ t: "history" }); }
    const list = serverHistory?.length ? serverHistory : getHistory();
    const top = rivals(5, list);
    const modeChip = (m) => `<span class="mode-chip ${m}">${m === "ranked" ? "Ranked" : m === "bot" ? "Bot" : "Friendly"}</span>`;
    body.innerHTML = html`<div class="online-grid">
      <div class="card pad" style="min-width:0">
        <h3>${icon("clock")} Recent matches</h3>
        ${list.length ? `<div class="hist-list">${list.map((h, i) => html`<div class="hist-row ${h.result}">
          <span class="hist-res">${h.result === "win" ? "W" : h.result === "lose" ? "L" : "D"}</span>
          ${avatarHtml({ icon: h.opp?.icon || "ball", color: h.opp?.color || "#64748b", frame: h.opp?.frame || "none", style: h.opp?.style, av: h.opp?.av }, 34)}
          <div class="hist-info">${h.oppCode && h.mode !== "bot" ? `<a href="#/op/${esc(h.oppCode)}"><b>${esc(h.opp?.name || "?")}</b></a>` : `<b>${esc(h.opp?.name || "?")}</b>`}<small class="muted">${icon(GAME_ICONS[h.game], { size: 12 })} ${GAME_NAMES[h.game]} · ${esc(h.score || "")} · ${new Date(h.at).toLocaleDateString()}</small></div>
          ${h.replay && h.id ? `<button class="btn ghost" data-rp="${esc(h.id)}" ${s === "online" ? "" : "disabled"} title="Watch the match again" aria-label="Replay">${icon("clock", { size: 14 })}<span class="hide-sm"> Replay</span></button>` : ""}
          ${modeChip(h.mode)}${h.mode === "ranked" && h.delta != null ? `<span class="elo-d ${h.delta >= 0 ? "up" : "down"}">${h.delta >= 0 ? "+" : ""}${h.delta}</span>` : ""}
          ${h.oppCode && h.mode !== "bot" ? `<button class="btn ghost" data-again="${i}" ${s === "online" ? "" : "disabled"} title="Invite to a rematch">${icon("refresh", { size: 14 })}<span class="hide-sm"> Challenge</span></button>` : ""}
        </div>`).join("")}</div>` : `<p class="muted">Your online matches show up here.</p>`}
      </div>
      <div class="card pad" style="align-content:start;display:grid;gap:10px">
        <h3>${icon("flame")} Rivals</h3>
        ${top.length ? top.map((r) => html`<div class="friend-row">
          ${avatarHtml({ icon: r.opp?.icon || "ball", color: r.opp?.color || "#64748b", frame: r.opp?.frame || "none", style: r.opp?.style, av: r.opp?.av }, 34)}
          <div class="fr-info"><b>${esc(r.opp?.name || r.code)}</b><small class="muted">${r.n} match${r.n === 1 ? "" : "es"}</small></div>
          <b class="h2h ${r.w > r.l ? "up" : r.w < r.l ? "down" : ""}">${r.w}-${r.l}${r.d ? `-${r.d}` : ""}</b>
          ${isFriend(r.code) ? "" : `<button class="btn ghost" data-addr="${r.code}" title="Add friend">${icon("users", { size: 14 })}</button>`}
        </div>`).join("") : `<p class="muted">Play real opponents to build up rivalries.</p>`}
      </div>
    </div>`;
    body.querySelectorAll("[data-rp]").forEach((b) => b.addEventListener("click", () => send({ t: "replay", id: b.dataset.rp }), { signal }));
    body.querySelectorAll("[data-again]").forEach((b) => b.addEventListener("click", () => {
      const h = list[Number(b.dataset.again)];
      lobbyMsg = ""; send({ t: "invite:friend", code: h.oppCode, game: h.game });
    }, { signal }));
    body.querySelectorAll("[data-addr]").forEach((b) => b.addEventListener("click", () => {
      const r = top.find((x) => x.code === b.dataset.addr);
      addFriend({ code: r.code, ...r.opp }); toast(`${r.opp?.name || "Player"} added to friends`); drawLobby();
    }, { signal }));
  }

  function drawLobbyStats() {
    const el = root.querySelector("#online-count");
    if (!el || !lastStats || netStatus() !== "online") { if (el) el.textContent = ""; return; }
    el.textContent = `${lastStats.online} online${lastStats.playing ? ` · ${lastStats.playing} playing` : ""}`;
  }

  function drawConnBadge() {
    const el = root.querySelector("#conn");
    if (el) {
      el.className = connClass(); el.title = connTitle();
      if (el.closest(".duel-bar")) el.setAttribute("aria-label", connTitle()); else el.innerHTML = `<i></i>${statusText()}`;
    }
    drawReconnect();
  }
  // your own connection dropped during a match: say so, and how long the server keeps your seat
  let droppedAt = 0;
  function drawReconnect() {
    const inMatch = (phase === "match" || phase === "end") && M && !M.spectator;
    const down = inMatch && netStatus() !== "online";
    let el = root.querySelector("#og-reconn");
    if (!down) { droppedAt = 0; el?.remove(); return; }
    droppedAt ||= Date.now();
    if (!el) {
      el = document.createElement("div");
      el.id = "og-reconn"; el.className = "og-reconn";
      root.querySelector(".duel-bar")?.after(el);
      if (!el.isConnected) root.prepend(el);
      announce("Connection lost. Reconnecting.");
    }
    const left = Math.max(0, Math.ceil((droppedAt + RECONNECT_GRACE_MS - Date.now()) / 1000));
    const html1 = `<span class="spin-dot" aria-hidden="true"></span><div><b>${netStatus() === "offline" ? "You're offline" : "Connection lost: reconnecting…"}</b>
      <small>${left ? `Your seat in the match is held for <b>${left}</b> more seconds. Moves you make now are sent when you're back.` : "Still trying. If the match ended, you'll see the result when you're back."}</small></div>`;
    if (el.innerHTML !== html1) el.innerHTML = html1;
  }

  // ------------------------------------------------------------ match shell
  const opp = () => 1 - M.seat;
  const mine = (arr) => arr[M.seat];
  const theirs = (arr) => arr[opp()];

  // Single game: the bar shows each side's team rating once picked, then the final score
  const coachScore = (i) => (G?.t === "coach" && G.picks?.[i] != null ? G.choices[G.picks[i]].s : M.scores?.[i] || "–");
  function duelBar() {
    const g = ONLINE_GAMES[M.game];
    const score = (i) => (M.game === "guess" ? `${G?.tries?.[i] ?? 0}/8` : M.game === "draft" ? `${G?.picked?.[i] ?? 0}/6` : M.game === "conn" ? `${M.scores[i] ?? 0}/4` : M.game === "coach" ? coachScore(i) : M.scores[i]);
    return html`<div class="card duel-bar">
      <div class="duel-p p-me">${avatarHtml(M.you, 40)}<div><b>${esc(M.you.name)}</b><small class="muted">${M.spectator ? "" : "You · "}${M.rated ? rankBadge(M.you.elo, { small: true }) : `Lv ${M.you.level}`}</small></div><span class="duel-score led" id="score-me">${score(M.seat)}</span><span class="chat-bubble me" id="chat-me" hidden></span></div>
      <div class="duel-mid"><span class="muted">${icon(g.ic, { size: 16 })} ${g.name}</span><b id="duel-round"></b>
        <span class="row" style="gap:6px;justify-content:center"><span class="mode-chip ${M.mode}">${M.mode === "ranked" ? "Ranked" : M.mode === "bot" ? "vs Bot" : "Friendly"}</span><span class="muted" id="watchers" style="font-size:12px">${M.watchers ? `👁 ${M.watchers} watching` : ""}</span><span class="${connClass()}" id="conn" role="img" title="${connTitle()}" aria-label="${connTitle()}"><i></i></span></span></div>
      <div class="duel-p p-them"><span class="chat-bubble opp" id="chat-opp" hidden></span><span class="duel-score led" id="score-opp">${score(opp())}</span><div style="text-align:right"><b>${esc(M.opp.name)}</b><small class="muted" id="opp-state"></small></div>${avatarHtml(M.opp, 40)}</div>
    </div>`;
  }

  function drawMatch() {
    if (!M) return;
    root.innerHTML = html`
      <h1 class="sr-only">Online ${esc(ONLINE_GAMES[M.game].name)}: ${esc(M.you.name)} vs ${esc(M.opp.name)}</h1>
      ${duelBar()}
      ${M.spectator ? html`<div class="card pad og-watch"><span class="bc-strap">Live</span><span>Watching <b>${esc(M.you.name)}</b> vs <b>${esc(M.opp.name)}</b>. You see ${esc(M.you.name)}'s screen.</span><span class="spacer"></span><button class="btn" id="stop-watch">${icon("arrowLeft", { size: 15 })} Stop watching</button></div>` : ""}
      <div id="arena" class="duel-arena ${M.spectator ? "spectating" : ""}"></div>
      ${M.spectator ? "" : html`<div class="react-bar" role="group" aria-label="Send a sticker">${[...STICKERS, ...ownedStickers()].map(([id, text]) => `<button class="sticker-btn st-${id}" data-e="${id}">${text}</button>`).join("")}
        <button class="btn ghost" id="chat-toggle" aria-expanded="false">${icon("users", { size: 15 })} Say…</button>
        <span class="spacer"></span><button class="btn ghost" id="forfeit">${icon("flag", { size: 15 })} Leave match</button></div>
      <div class="chat-menu" id="chat-menu" hidden>${CHAT.map((c, i) => `<button class="btn" data-chat="${i}">${esc(c)}</button>`).join("")}</div>`}
      <div class="react-layer" aria-hidden="true"></div>`;
    root.querySelector("#stop-watch")?.addEventListener("click", () => { send({ t: "unspectate" }); M = null; G = null; phase = "lobby"; drawLobby(); }, { signal });
    if (M.spectator) { if (!G) drawCountdown(); else drawArena(); drawOppState(); return; }
    root.querySelector(".react-bar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-e]"); if (!b) return;
      send({ t: "react", e: b.dataset.e }); showReaction(b.dataset.e, "me");
    }, { signal });
    root.querySelector("#chat-toggle").addEventListener("click", (e) => {
      const menu = root.querySelector("#chat-menu");
      menu.hidden = !menu.hidden; e.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
    }, { signal });
    root.querySelector("#chat-menu").addEventListener("click", (e) => {
      const b = e.target.closest("[data-chat]"); if (!b) return;
      const i = Number(b.dataset.chat);
      send({ t: "chat", i }); showChat(i, "me");
      root.querySelector("#chat-menu").hidden = true;
    }, { signal });
    root.querySelector("#forfeit").addEventListener("click", async () => {
      if (phase !== "match") return;
      if (await confirmDialog({ title: "Leave this match?", message: "Leaving now counts as a loss.", ok: "Leave match", danger: true })) { M.leaving = true; send({ t: "leave" }); }
    }, { signal });
    if (!G) drawCountdown(); else drawArena();
    drawOppState();
    // a chat line still on screen survives the redraw between rounds
    for (const [who, c] of Object.entries(M.chat || {})) if (c.until > Date.now()) showChat(c.i, who, c.until - Date.now());
  }

  // the match intro: the tale of the tape, broadcast style
  function drawCountdown() {
    const a = root.querySelector("#arena");
    const h2h = M.opp.code && !M.spectator ? headToHead(M.opp.code) : null;
    const side = (p, cls) => html`<div class="tt-side ${cls}">
      ${avatarHtml(p, 92)}
      <b class="tt-name">${esc(p.name)}</b>
      <small class="muted">${p.bot ? `Bot · ${esc(BOTS[p.botLevel]?.name || "")}` : `Level ${p.level}`}</small>
      ${M.rated && p.elo != null ? `<span>${rankBadge(p.elo)}</span>` : ""}
      <ul class="clean tt-stats">
        ${p.wl ? `<li><small>RECORD</small><b>${p.wl[0]}-${p.wl[1]}</b></li>` : ""}
        ${p.streak >= 2 ? `<li><small>STREAK</small><b>🔥 ${p.streak}</b></li>` : ""}
      </ul></div>`;
    a.innerHTML = html`<div class="card og-vs og-tape pop">
      <div class="tt-top"><span class="bc-strap">${M.mode === "ranked" ? "Ranked" : M.mode === "bot" ? "vs Bot" : "Friendly"}</span>
        <small>${icon(ONLINE_GAMES[M.game].ic, { size: 14 })} ${esc(ONLINE_GAMES[M.game].name)}</small></div>
      <div class="tt-row">${side(M.you, "tt-me")}
        <div class="tt-mid"><b class="led tt-vs">VS</b><div class="og-count led" data-until="${M.startAt}">3</div>
          ${h2h && h2h.w + h2h.l + h2h.d ? `<small class="tt-h2h">Head to head <b>${h2h.w}-${h2h.l}${h2h.d ? `-${h2h.d}` : ""}</b></small>` : `<small class="tt-h2h">First meeting</small>`}</div>
        ${side(M.opp, "tt-them")}</div>
      <p class="muted tt-rules">${ONLINE_GAMES[M.game].rules}</p>
    </div>`;
  }

  function drawArena() {
    const a = root.querySelector("#arena");
    if (!a || !G) return;
    ({ hl: drawHL, career: drawCareer, guess: drawGuess, draft: drawDraft, conn: drawConn, grid: drawGridDuel, coach: drawCoach })[M.game](a);
    updateScores();
  }

  function updateScores() {
    const me = root.querySelector("#score-me"), them = root.querySelector("#score-opp");
    if (!me || !M) return;
    if (M.game === "guess") { me.textContent = `${G?.tries?.[M.seat] ?? 0}/8`; them.textContent = `${G?.tries?.[opp()] ?? 0}/8`; }
    else if (M.game === "draft") { me.textContent = `${G?.picked?.[M.seat] ?? 0}/6`; them.textContent = `${G?.picked?.[opp()] ?? 0}/6`; }
    else if (M.game === "coach") { me.textContent = coachScore(M.seat); them.textContent = coachScore(opp()); }
    else if (M.game === "conn") { me.textContent = `${mine(M.scores) ?? 0}/4`; them.textContent = `${theirs(M.scores) ?? 0}/4`; }
    else { me.textContent = mine(M.scores); them.textContent = theirs(M.scores); }
    const r = root.querySelector("#duel-round");
    if (r && G?.roundLabel) r.textContent = G.roundLabel;
  }

  function drawOppState() {
    const el = root.querySelector("#opp-state");
    if (!el || !M) return;
    if (M.oppAway) { el.innerHTML = `<span class="bad-text" data-until-away="${M.oppAway}">Reconnecting…</span>`; }
    else el.innerHTML = (G?.oppNote ? esc(G.oppNote) + " · " : "") + (M.rated && M.opp.elo != null ? rankBadge(M.opp.elo, { small: true }) : M.opp.bot ? "Bot" : `Lv ${M.opp.level}`);
  }

  function showChat(i, who, keep = 3500) {
    if (M && keep === 3500) (M.chat ??= {})[who] = { i, until: Date.now() + 3500 };
    const el = root.querySelector(`#chat-${who}`);
    if (!el || CHAT[i] === undefined) return;
    el.textContent = CHAT[i];
    el.hidden = false;
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    if (who === "opp" && keep === 3500) { sound.play("select"); announce(`${M?.opp.name} says: ${CHAT[i]}`); }
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, keep);
  }

  function setOppNote(note) { if (G) G.oppNote = note; drawOppState(); }

  function showReaction(e, who) {
    const layer = root.querySelector(".react-layer");
    if (!layer) return;
    const el = document.createElement("span");
    const sticker = STICKER_TEXT[e];
    el.className = `react-pop ${who} ${sticker ? `sticker st-${e}` : ""}`;
    el.textContent = sticker || e;
    if (sticker && who !== "me") announce(`${who === "opp" ? M?.opp.name : M?.you.name}: ${sticker}`);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // timers: elements carry the moment they run out
  let lastBadge = 0;
  function updateClocks() {
    if (droppedAt) drawReconnect();
    if (netStatus() !== "online" && Date.now() - lastBadge > 1000) { lastBadge = Date.now(); drawConnBadge(); }
    if (phase === "searching") {
      const el = root.querySelector("#search-time");
      if (el) { const s = Math.floor((Date.now() - searchStart) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
    }
    root.querySelectorAll("[data-until]").forEach((el) => {
      const left = Math.max(0, Number(el.dataset.until) - Date.now());
      el.textContent = Math.ceil(left / 1000);
    });
    root.querySelectorAll("[data-deadline]").forEach((el) => {
      const end = Number(el.dataset.deadline), total = Number(el.dataset.total);
      const left = Math.max(0, end - Date.now());
      const bar = el.querySelector("i"), txt = el.querySelector("b");
      if (bar) bar.style.width = `${(left / total) * 100}%`;
      el.classList.toggle("low", left < Math.min(5000, total * 0.25));
      if (txt) { const s = Math.ceil(left / 1000); txt.textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`; }
      // last seconds: tick + buzz once per second while you still have to act
      const sec = Math.ceil(left / 1000);
      if (el.dataset.urgent === "1" && left > 0 && sec <= 5 && el.dataset.ticked !== String(sec)) {
        el.dataset.ticked = String(sec);
        sound.play(sec <= 2 ? "warn" : "tick");
        if (sec <= 3) buzz(40);
      }
    });
    if (phase === "searching") {
      const offer = root.querySelector("#bot-offer");
      if (offer && offer.hidden && botOfferNow()) offer.hidden = false;
      // opted in: nobody came, so play the bot at your level
      if (store.get("online:autobot", false) && Date.now() - searchStart > AUTO_BOT_S * 1000 && !autoBotSent) {
        autoBotSent = true;
        toast("Nobody around: starting a bot game at your level");
        send({ t: "bot", game, level: botFor(myRecord()?.elo?.[game] ?? 1000) });
      }
    }
  }
  const timerBar = (deadline, total, urgent = false) => `<div class="duel-timer" role="timer" aria-label="Time left" data-deadline="${deadline}" data-total="${total}" data-urgent="${urgent ? 1 : 0}"><i aria-hidden="true"></i><b></b></div>`;
  const youThem = (seat) => (seat === M.seat ? (M.spectator ? esc(M.you.name) : "You") : esc(M.opp.name));

  // ------------------------------------------------------------ Higher or Lower
  function hlMessage(m) {
    if (m.t === "hl:round") {
      M.scores = m.scores;
      G = { t: "hl", i: m.i, n: m.n, cat: m.cat, a: psByKey(m.a), b: psByKey(m.b), ms: m.ms, deadline: deadlineFrom(m.ms), total: 10000, mine: null, oppDone: false, reveal: null, roundLabel: `Round ${m.i + 1}/${m.n}` };
      return drawMatch();
    }
    if (!G || G.t !== "hl") return;
    if (m.t === "opp:answered" && m.i === G.i) { G.oppDone = true; setOppNote("Answered"); return drawArena(); }
    if (m.t === "hl:reveal" && m.i === G.i) {
      G.reveal = m; M.scores = m.scores; G.oppNote = "";
      M.maxBehind = Math.max(M.maxBehind, theirs(m.scores) - mine(m.scores));
      const me = mine(m.answers);
      sound.play(me.ok ? "place" : "bad");
      const c = HL_CATS[G.cat];
      if (me.c) setTimeout(() => shot(me.ok, root.querySelector(".hl-side:last-of-type")), 30);
      announce(`${me.ok ? `Correct, plus ${me.pts}` : me.c ? "Wrong" : "No answer"}. ${playersById.get(G.b.player_id)?.name} had ${c.get(G.b).toFixed(c.dec)}. Score: you ${mine(m.scores)}, ${M.opp.name} ${theirs(m.scores)}.`);
      drawArena(); drawOppState();
    }
  }

  function drawHL(a) {
    const c = HL_CATS[G.cat], r = G.reveal;
    const val = (ps) => c.get(ps).toFixed(c.dec);
    const ans = (seat) => {
      const x = r.answers[seat];
      return `<div class="hl-ans ${x.ok ? "ok" : "bad"}">${icon(x.ok ? "check" : "x", { size: 16 })} <b>${youThem(seat)}</b> ${x.c ? (x.c === "higher" ? "▲ Higher" : "▼ Lower") : "no answer"}${x.pts ? ` <span class="led">+${x.pts}</span>` : ""}</div>`;
    };
    a.innerHTML = html`
      ${r ? "" : timerBar(G.deadline, G.total, !G.mine && !G.wrong)}
      <div class="hl">
        <div class="card hl-side">${playerCard(G.a, { size: "lg" })}<div class="hl-val"><div class="val">${val(G.a)}</div><div class="cat">${c.label}</div></div></div>
        <div class="vs">VS</div>
        <div class="card hl-side ${r ? (mine(r.answers).ok ? "ok" : "bad") : ""}">
          ${playerCard(G.b, { size: "lg", hideRating: !r, hideStats: !r, info: !!r })}
          <div class="hl-val">
            ${r ? `<div class="val flip-in">${val(G.b)}</div><div class="cat">${c.label}</div>`
              : G.mine ? `<div class="cat">${c.label}</div><p class="muted">You said <b>${G.mine === "higher" ? "▲ Higher" : "▼ Lower"}</b>. ${G.oppDone ? "Revealing…" : `Waiting for ${esc(M.opp.name)}…`}</p>`
              : `<div class="cat">${c.label}</div><div class="hl-btns"><button class="btn primary" data-dir="higher">▲ Higher <kbd>↑</kbd></button><button class="btn" data-dir="lower">▼ Lower <kbd>↓</kbd></button></div>
                ${G.oppDone ? `<small class="muted">${esc(M.opp.name)} already answered</small>` : ""}`}
          </div>
        </div>
      </div>
      ${r ? `<div class="hl-answers pop">${ans(M.seat)}${ans(opp())}</div>` : ""}`;
    a.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("click", () => hlAnswer(b.dataset.dir)));
  }
  function hlAnswer(dir) {
    if (!G || G.t !== "hl" || G.mine || G.reveal) return;
    G.mine = dir;
    send({ t: "hl:answer", i: G.i, c: dir });
    drawArena();
  }

  // ------------------------------------------------------------ Career Path
  function careerMessage(m) {
    if (m.t === "car:round") {
      M.scores = m.scores;
      G = { t: "career", i: m.i, n: m.n, path: m.path, options: m.options, ms: m.ms, deadline: deadlineFrom(m.ms), total: 20000, wrong: mine(m.locked) || null, oppWrong: !!theirs(m.locked), reveal: null, roundLabel: `Career ${m.i + 1}/${m.n}` };
      return drawMatch();
    }
    if (!G || G.t !== "career") return;
    if (m.t === "car:wrong" && m.i === G.i) { G.wrong = m.pid; sound.play("bad"); return drawArena(); }
    if (m.t === "opp:wrong" && m.i === G.i) { G.oppWrong = true; setOppNote("Missed"); return drawArena(); }
    if (m.t === "car:reveal" && m.i === G.i) {
      G.reveal = m; M.scores = m.scores; G.oppNote = "";
      M.maxBehind = Math.max(M.maxBehind, theirs(m.scores) - mine(m.scores));
      sound.play(m.winner === M.seat ? "place" : "bad");
      if (m.winner === M.seat || G.wrong) setTimeout(() => shot(m.winner === M.seat, root.querySelector(".choices")), 30);
      const who = m.winner === null ? "Nobody got it" : m.winner === M.seat ? "You got it, plus 3" : `${M.opp.name} got it first`;
      announce(`${who}. It was ${playersById.get(m.answer)?.name}. Score: you ${mine(m.scores)}, ${M.opp.name} ${theirs(m.scores)}.`);
      drawArena(); drawOppState();
    }
  }

  function drawCareer(a) {
    const r = G.reveal;
    const target = r && playersById.get(r.answer);
    a.innerHTML = html`
      ${r ? "" : timerBar(G.deadline, G.total, !G.mine && !G.wrong)}
      <div class="career-layout">
        <div class="card pad" style="display:grid;gap:14px">
          <h3>Whose career is this?</h3>
          <div class="path">${G.path.map((s, i) => html`
            <div class="stop" style="--club:${clubColors(s.team_id)[0]};animation-delay:${i * 0.05}s"><span class="season">${s.season}</span><span class="team">${esc(teamName(s.team_id))}</span>
              <span class="line">${s.games !== null ? `${s.games} GP · ${fmt1(s.ppg)} PPG` : "no games"}${s.age ? ` · age ${s.age}` : ""}</span></div>`).join("")}
          </div>
        </div>
        <div class="card pad" style="display:grid;gap:16px;align-content:start">
          <h3>First to buzz in wins 3 points</h3>
          <div class="choices">${G.options.map((pid) => {
            let cls = "";
            if (r) cls = pid === r.answer ? "right" : r.picks.includes(pid) ? "wrong" : "";
            else if (pid === G.wrong) cls = "wrong";
            return `<button class="choice ${cls}" data-id="${pid}" ${r || G.wrong ? "disabled" : ""}>${esc(playersById.get(pid).name)}</button>`;
          }).join("")}</div>
          ${!r && G.wrong ? `<p class="muted">${icon("lock", { size: 15 })} Wrong: you're locked out of this round. ${G.oppWrong ? "" : `${esc(M.opp.name)} can still answer.`}</p>` : ""}
          ${!r && !G.wrong && G.oppWrong ? `<p class="muted">${esc(M.opp.name)} guessed wrong. It's all yours!</p>` : ""}
          ${r ? html`<div class="answer-card pop">
            <div style="display:grid;gap:8px"><b style="font-size:18px">${r.winner === null ? `Nobody got it: it was ${esc(target.name)}` : r.winner === M.seat ? `${icon("check", { size: 18, cls: "ic-good" })} You got it! +3` : `${esc(M.opp.name)} got it first: ${esc(target.name)}`}</b>
            <span class="muted">Next career in a moment…</span></div></div>` : ""}
        </div>
      </div>`;
    a.querySelectorAll(".choice:not([disabled])").forEach((b) => b.addEventListener("click", () => {
      if (G.wrong || G.reveal) return;
      send({ t: "car:answer", i: G.i, pid: b.dataset.id });
      a.querySelectorAll(".choice").forEach((x) => { x.disabled = true; });
    }));
  }

  // ------------------------------------------------------------ Guess the Player
  let guessItems = null;
  function guessMessage(m) {
    if (m.t === "guess:state") {
      G = { t: "guess", cols: m.cols, rows: m.rows, solved: m.solved, ms: m.ms, deadline: deadlineFrom(m.ms), opp: m.opp, max: m.max,
        tries: [], roundLabel: "Same mystery player" };
      G.tries[M.seat] = m.rows.length; G.tries[opp()] = m.opp.colors.length;
      return drawMatch();
    }
    if (!G || G.t !== "guess") return;
    if (m.t === "guess:row") {
      G.rows.push(m.row); G.solved = m.solved; G.tries[M.seat] = m.tries;
      announce(m.solved ? `Correct! Solved in ${m.tries}.` : `Guess ${m.tries}, ${playersById.get(m.row.pid)?.name}. ${clueSpeech(m.row.cells, G.cols)}.`);
      sound.play(m.solved ? "win" : "place");
      if (m.solved) setTimeout(() => shot(true, root.querySelector(".gtable")), 30);
      if (m.solved) confetti(1500);
      return drawArena();
    }
    if (m.t === "guess:opp") {
      G.opp.colors.push(m.colors); G.opp.solved = m.solved; G.tries[opp()] = m.tries;
      if (m.solved && !G.solved) M.oppSolvedFirst = true;
      setOppNote(m.solved ? "Solved it!" : `${m.tries} ${m.tries === 1 ? "try" : "tries"}`);
      if (m.solved) announce(`${M.opp.name} solved it in ${m.tries}.`);
      updateScores();
      // only the opponent's board changes, so a half-typed guess isn't lost
      const board = root.querySelector(".opp-board");
      if (board) board.outerHTML = oppBoardHtml(); else drawArena();
      return;
    }
  }

  function oppBoardHtml() {
    return html`<div class="card pad opp-board">
          <h3>${avatarHtml(M.opp, 26)} ${esc(M.opp.name)}</h3>
          <div class="mini-grid">${Array.from({ length: G.max }, (_, i) => {
            const row = G.opp.colors[i];
            return `<div class="mini-row">${G.cols.map((_, j) => `<i class="${row ? row[j] : "e"}"></i>`).join("")}</div>`;
          }).join("")}</div>
          <small class="muted">${G.opp.solved ? "Solved it!" : `${G.opp.colors.length}/${G.max} tries`}. You see their colors, not their guesses.</small></div>`;
  }

  function drawGuess(a) {
    guessItems ??= namedPlayers.map((p) => {
      const s = careerSummary(p.player_id);
      return { id: p.player_id, label: p.name, sub: `${teamName(s.lastTeam)} · ${s.firstSeason === s.lastSeason ? s.firstSeason : s.firstSeason.slice(0, 4) + "–" + s.lastSeason.slice(5)}` };
    });
    const done = G.solved || G.rows.length >= G.max;
    const left = G.max - G.rows.length;
    a.innerHTML = html`
      ${timerBar(G.deadline, 180000, !done)}
      <div class="guess-duel">
        <div class="card pad" style="display:grid;gap:12px;min-width:0">
          ${done ? `<p class="og-done">${G.solved ? `${icon("check", { size: 18, cls: "ic-good" })} Solved in ${G.rows.length}! ` : `${icon("x", { size: 18, cls: "ic-bad" })} Out of tries. `}<span class="muted">Waiting for ${esc(M.opp.name)}…</span></p>`
            : `<div class="search guess-search"><input id="g-in" class="input" placeholder="Type a player's name… (${left} ${left === 1 ? "try" : "tries"} left)" autocomplete="off" aria-label="Guess a player"></div>`}
          <div class="grid-wrap"><table class="gtable wide"><thead><tr><th><span class="sr-only">Player</span></th>${G.cols.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead>
            <tbody>${G.rows.slice().reverse().map((row) => `<tr><td class="name"><b>${nameLink(row.pid, playersById.get(row.pid)?.name ?? row.pid)}</b></td>${G.cols.map(([k]) => `<td class="${row.cells[k].c}">${esc(clueValue(k, row.cells[k]))}${row.cells[k].arrow || ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
          ${G.rows.length ? "" : `<p class="muted" style="margin:0">Green = match, yellow = close, arrows point toward the answer. * First season in this league.</p>`}
        </div>
        ${oppBoardHtml()}
      </div>`;
    const inp = a.querySelector("#g-in");
    if (inp) {
      autocomplete(inp, guessItems, (it) => { send({ t: "guess:guess", pid: it.id }); inp.disabled = true; }, { signal, exclude: (it) => G.rows.some((r) => r.pid === it.id) });
      inp.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------ Connections race
  function connMessage(m) {
    if (m.t === "conn:start") return;
    if (m.t === "conn:state") {
      const first = !G;
      G = { t: "conn", order: m.order, solved: m.solved, mistakes: m.mistakes, max: m.max, opp: m.opp, deadline: deadlineFrom(m.ms), selected: G?.selected || [], msg: "", roundLabel: "Find the four groups" };
      M.scores[M.seat] = m.solved.length; M.scores[opp()] = m.opp.solved;
      setOppNote(`${m.opp.solved}/4 groups · ${m.opp.mistakes} mistake${m.opp.mistakes === 1 ? "" : "s"}`);
      return first ? drawMatch() : drawArena();
    }
    if (!G || G.t !== "conn") return;
    if (m.t === "conn:right") {
      G.solved.push(m.group); G.selected = []; G.msg = "";
      M.scores[M.seat] = G.solved.length;
      sound.play("place"); announce(`Correct: ${m.group.label}.`);
    }
    if (m.t === "conn:wrong") {
      G.mistakes = m.mistakes; G.msg = m.oneAway ? "One away…" : "Not a group";
      sound.play("bad"); announce(`${G.msg} ${G.max - G.mistakes} mistakes left.`);
      setTimeout(() => root.querySelector(".cn-board")?.classList.add("shake"), 0);
    }
    if (m.t === "conn:opp") {
      G.opp = { solved: m.solved, mistakes: m.mistakes, done: m.done };
      M.scores[opp()] = m.solved;
      if (theirs(M.scores) > mine(M.scores)) M.maxBehind = Math.max(M.maxBehind, theirs(M.scores) - mine(M.scores));
      setOppNote(`${m.solved}/4 groups · ${m.mistakes} mistake${m.mistakes === 1 ? "" : "s"}`);
    }
    drawArena();
  }
  function drawConn(a) {
    const name = (pid) => playersById.get(pid)?.name ?? pid;
    const solvedPids = new Set(G.solved.flatMap((g) => g.players));
    const left = G.order.filter((p) => !solvedPids.has(p));
    const done = G.solved.length === 4 || G.mistakes >= G.max;
    a.innerHTML = html`${timerBar(G.deadline, 240000, !done)}
      <div class="cn-wrap og-conn">
        <div class="cn-solved">${G.solved.slice().sort((x, y) => x.level - y.level).map((g) => `<div class="cn-group lv${g.level}" role="group" aria-label="${esc(g.label)}"><b>${esc(g.label)}</b><span>${g.players.map((p) => esc(name(p))).join(", ")}</span></div>`).join("")}</div>
        ${done ? `<p class="og-done">${G.solved.length === 4 ? `${icon("check", { size: 18, cls: "ic-good" })} All four groups! ` : `${icon("x", { size: 18, cls: "ic-bad" })} Out of mistakes. `}<span class="muted">Waiting for ${esc(M.opp.name)}…</span></p>`
          : html`<div class="cn-board" role="group" aria-label="Players">${left.map((p) => `<button class="cn-tile ${G.selected.includes(p) ? "on" : ""}" data-p="${p}" aria-pressed="${G.selected.includes(p)}">${esc(name(p))}</button>`).join("")}</div>
          <div class="row cn-bar" style="justify-content:center">
            <span class="cn-mistakes" role="img" aria-label="${G.max - G.mistakes} mistakes left">Mistakes left ${Array.from({ length: G.max }, (_, i) => `<i class="${i < G.max - G.mistakes ? "" : "used"}"></i>`).join("")}</span>
            <button class="btn" id="cn-clear" ${G.selected.length ? "" : "disabled"}>Deselect</button>
            <button class="btn primary" id="cn-go" ${G.selected.length === 4 ? "" : "disabled"}>Submit</button></div>
          ${G.msg ? `<p class="muted" style="text-align:center;margin:0">${esc(G.msg)}</p>` : ""}`}
        <p class="muted" style="text-align:center;margin:6px 0 0">${esc(M.opp.name)}: ${G.opp.solved}/4 groups · ${G.opp.mistakes} mistake${G.opp.mistakes === 1 ? "" : "s"}${G.opp.done ? " · finished" : ""}</p>
      </div>`;
    a.querySelector(".cn-board")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-p]"); if (!b || M.spectator) return;
      const p = b.dataset.p;
      G.selected = G.selected.includes(p) ? G.selected.filter((x) => x !== p) : G.selected.length < 4 ? [...G.selected, p] : G.selected;
      G.msg = ""; drawArena();
    });
    a.querySelector("#cn-clear")?.addEventListener("click", () => { G.selected = []; drawArena(); });
    a.querySelector("#cn-go")?.addEventListener("click", () => { if (G.selected.length === 4 && !M.spectator) send({ t: "conn:guess", pids: G.selected }); });
  }

  // ------------------------------------------------------------ The Grid duel
  function gridMessage(m) {
    if (m.t === "grid:state") {
      const first = !G;
      G = { t: "grid", rows: m.rows, cols: m.cols, cells: m.cells, left: m.left, score: m.score, opp: m.opp, deadline: deadlineFrom(m.ms), active: null, msg: "", roundLabel: "Fill the board" };
      M.scores = m.scores;
      return first ? drawMatch() : drawArena();
    }
    if (!G || G.t !== "grid") return;
    if (m.t === "grid:result") {
      if (m.right) G.cells[m.cell] = { pid: m.pid, rarity: m.rarity };
      G.left = m.left; G.score = m.score; G.active = null;
      G.msg = m.right ? `${playersById.get(m.pid)?.name}: rarity ${m.rarity}` : `${playersById.get(m.pid)?.name} doesn't fit that square.`;
      sound.play(m.right ? "place" : "bad"); announce(G.msg);
    }
    if (m.t === "grid:opp") { G.opp = { filled: m.filled, left: m.left, score: m.score, done: m.done }; setOppNote(`${m.filled.filter(Boolean).length}/9 · ${m.left} left`); }
    if (m.t === "grid:scores") { M.scores = m.scores; if (theirs(M.scores) > mine(M.scores)) M.maxBehind = Math.max(M.maxBehind, theirs(M.scores) - mine(M.scores)); return updateScores(); }
    drawArena();
  }
  function drawGridDuel(a) {
    gridItems ??= namedPlayers.filter((p) => facts().has(p.player_id)).map((p) => {
      const s = careerSummary(p.player_id);
      return { id: p.player_id, label: p.name, sub: `${teamName(s.lastTeam)} · ${s.firstSeason === s.lastSeason ? s.firstSeason : s.firstSeason.slice(0, 4) + "–" + s.lastSeason.slice(5)}` };
    });
    const head = (id) => { const cr = criterionById(id); return cr.club ? `<span class="gh-crest">${crestSvg(cr.club, teamName(cr.club), 28)}</span><b>${esc(cr.label)}</b>` : `<b>${esc(cr.label)}</b>`; };
    const done = G.left <= 0 || G.cells.every(Boolean);
    a.innerHTML = html`${timerBar(G.deadline, 180000, !done)}
      <div class="og-grid">
        <div class="gr-board" role="group" aria-label="The Grid: rows × columns">
          <div class="gr-corner"><b class="led">${G.left}</b><small>guesses left</small></div>
          ${[0, 1, 2].map((c) => `<div class="gr-head col">${head(G.cols[c])}</div>`).join("")}
          ${[0, 1, 2].map((r) => `<div class="gr-head row">${head(G.rows[r])}</div>${[0, 1, 2].map((c) => {
            const i = r * 3 + c, cell = G.cells[i];
            const label = `${criterionById(G.rows[r]).label} and ${criterionById(G.cols[c]).label}`;
            if (cell) return `<div class="gr-cell done" aria-label="${esc(label)}: ${esc(playersById.get(cell.pid)?.name)}"><b>${esc(playersById.get(cell.pid)?.name)}</b><small>Rarity ${cell.rarity}</small></div>`;
            return `<button class="gr-cell ${G.active === i ? "on" : ""}" data-cell="${i}" ${done ? "disabled" : ""} aria-label="${esc(label)}: choose a player">${G.active === i ? "…" : "+"}</button>`;
          }).join("")}`).join("")}
        </div>
        <div class="card pad og-grid-side">
          ${done ? `<p class="og-done">${icon("check", { size: 18, cls: "ic-good" })} Board finished. <span class="muted">Waiting for ${esc(M.opp.name)}…</span></p>`
            : G.active !== null ? html`<small class="muted">${esc(criterionById(G.rows[Math.floor(G.active / 3)]).label)} × ${esc(criterionById(G.cols[G.active % 3]).label)}</small>
              <div class="search guess-search"><input id="gr-in" class="input" placeholder="Type a player's name…" autocomplete="off" aria-label="Player for this square"></div>`
            : `<p class="muted" style="margin:0">Pick a square, then name a player who fits both its row and its column. Each player once.</p>`}
          ${G.msg ? `<p style="margin:0">${esc(G.msg)}</p>` : ""}
          <div class="og-mini" aria-label="${esc(M.opp.name)}'s board"><small class="muted">${esc(M.opp.name)} · ${G.opp.score} pts</small>
            <div class="og-mini-grid">${G.opp.filled.map((f) => `<i class="${f ? "on" : ""}"></i>`).join("")}</div></div>
        </div>
      </div>`;
    a.querySelector(".gr-board").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cell]"); if (!b || M.spectator) return;
      G.active = Number(b.dataset.cell); G.msg = ""; drawArena();
    });
    const inp = a.querySelector("#gr-in");
    if (inp) {
      const used = new Set(G.cells.filter(Boolean).map((c) => c.pid));
      autocomplete(inp, gridItems, (it) => { send({ t: "grid:guess", cell: G.active, pid: it.id }); inp.disabled = true; }, { signal, exclude: (it) => used.has(it.id) });
      inp.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------ All-Time Draft
  function draftMessage(m) {
    if (m.t === "draft:last") { if (G?.t === "draft") lastPickToast(m.last); return; }
    if (m.t === "draft:plan") { // the draft is over: pick a game plan before the teams play
      G = { t: "plan", teams: m.teams, deadline: deadlineFrom(m.ms), done: !!m.done, oppDone: false, picked: [6, 6], roundLabel: "Game plan" };
      sound.play("spin");
      announce("Draft complete. Choose a game plan: pace, defense and offense. 15 seconds.");
      return drawMatch();
    }
    if (m.t === "draft:plan:opp") { if (G?.t === "plan") { G.oppDone = true; setOppNote("Plan locked"); drawArena(); } return; }
    if (m.t !== "draft:state") return;
    const prevSpin = G?.t === "draft" ? `${G.spin.season}|${G.spin.team_id}` : null;
    G = { t: "draft", ...m, roster: m.spin.keys.map(psByKey).filter(Boolean), used: new Set(m.used), selected: null, deadline: deadlineFrom(m.ms),
      picked: m.teams.map((t) => Object.keys(t.slots).length), roundLabel: `Pick round ${Math.min(m.round + 1, m.rounds)}/${m.rounds}`, oppNote: m.turn === opp() ? "Picking…" : "" };
    if (m.last) lastPickToast(m.last);
    if (prevSpin !== `${m.spin.season}|${m.spin.team_id}`) sound.play("spin");
    if (m.turn === M.seat && m.last?.seat !== M.seat) { sound.play("place"); buzz([80, 40, 80]); }
    if (m.turn === M.seat) announce(`Your pick. ${m.spin.team_name} ${m.spin.season}, ${G.roster.filter((ps) => !G.used.has(ps.player_id)).length} players available. 30 seconds.`);
    drawMatch();
  }
  function lastPickToast(last) {
    const ps = psByKey(last.key);
    if (!ps) return;
    const who = last.seat === M.seat ? "You" : M.opp.name;
    toast(`${who}${last.auto ? " (auto-pick)" : ""}: ${playersById.get(ps.player_id).name} at ${slotLabel(last.slot)}`);
  }

  function slotsHtml(seat, targetable) {
    const t = G.teams[seat];
    return courtHtml(G.slots.map((s) => {
      const k = t.slots[s], ps = k && psByKey(k);
      const can = targetable && G.selected && !k;
      return { slot: s, label: slotLabel(s), can, preview: can ? slotValue(G.selected, s) : null,
        filled: ps && { name: playersById.get(ps.player_id).name, pid: ps.player_id, value: slotValue(ps, s), color: clubColors(ps.team_id)[0], sub: `${teamName(ps.team_id)} ${ps.season}` } };
    }), { compact: true });
  }


  function drawPlan(a) {
    a.innerHTML = html`${timerBar(G.deadline, 15000, !G.done)}
      <div class="card pad og-plan"><span class="bc-strap">Game plan</span>
        <h2 style="margin:8px 0 4px">Set up your team</h2>
        <p class="muted" style="margin:0 0 10px">Both teams are drafted. Choose how you play, then the two teams play a full simulated game.${G.oppDone ? ` <b>${esc(M.opp.name)} has locked in.</b>` : ""}</p>
        ${G.done ? `<p class="og-done">${icon("check", { size: 18, cls: "ic-good" })} Plan locked. <span class="muted">Waiting for ${esc(M.opp.name)}…</span></p>`
          : html`<div id="plan-box">${gamePlanHtml({})}</div><div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" id="plan-go">${icon("check", { size: 15 })} Lock in the plan</button></div>`}
      </div>`;
    const box = a.querySelector("#plan-box");
    if (box) {
      bindGamePlan(box, { signal });
      a.querySelector("#plan-go").addEventListener("click", () => { if (M.spectator) return; send({ t: "draft:tactics", tactics: readGamePlan(box).tactics }); G.done = true; drawArena(); });
    }
  }
  function drawDraft(a) {
    if (G.t === "plan") return drawPlan(a);
    const myTurn = G.turn === M.seat;
    const [c1, c2] = clubColors(G.spin.team_id);
    a.innerHTML = html`
      <div class="row draft-turn ${myTurn ? "mine" : ""}">
        <b>${myTurn ? `${icon("bolt", { size: 18 })} Your pick` : `${esc(M.opp.name)} is picking…`}</b>
        <span class="spacer"></span>
        ${myTurn && G.teams[M.seat].respins ? `<button class="btn" id="respin">${icon("refresh", { size: 15 })} Re-spin (${G.teams[M.seat].respins})</button>` : ""}
      </div>
      ${timerBar(G.deadline, 30000, myTurn)}
      <div class="draft-duel">
        <div class="card pad"><h3>${avatarHtml(M.you, 24)} Your team</h3>${slotsHtml(M.seat, myTurn)}</div>
        <div class="card pad" style="min-width:0">
          <div class="spin-wrap card" style="--club1:${c1};--club2:${c2}"><div class="spin-card"><div style="min-width:0"><div class="muted">${G.spin.season}</div><div class="reel"><div class="reel-strip"><div>${esc(G.spin.team_name)}</div></div></div></div></div></div>
          <p class="muted" style="margin:8px 0">Shared spin: both of you pick from this roster this round.${myTurn ? " Pick a player, then a slot." : ""}</p>
          <div class="card-grid og-pool" id="pool">${G.roster.map((ps, i) => {
            const taken = G.used.has(ps.player_id);
            // a div, not a button: the card itself contains a button (profile info)
            const off = taken || !myTurn;
            return `<div class="pool-pick ${G.selected === ps ? "sel" : ""} ${off ? "off" : ""}" data-i="${i}">${playerCard(ps, { size: "sm", classes: taken ? "taken" : "", badge: taken ? "Taken" : "", attrs: off ? 'role="button" aria-disabled="true" tabindex="-1"' : `role="button" tabindex="0" aria-pressed="${G.selected === ps}"` })}</div>`;
          }).join("")}</div>
        </div>
        <div class="card pad"><h3>${avatarHtml(M.opp, 24)} ${esc(M.opp.name)}</h3>${slotsHtml(opp(), false)}</div>
      </div>
      ${myTurn && G.selected ? html`<div class="place-bar pop" role="group" aria-label="Choose a slot">
        <span>Place <b>${esc(playersById.get(G.selected.player_id).name)}</b> at</span>
        ${G.slots.filter((s) => !G.teams[M.seat].slots[s]).map((s) => `<button class="btn" data-slot="${s}"><b class="pos-${posFamily(s)}">${slotLabel(s)}</b> ${slotValue(G.selected, s)}</button>`).join("")}
        <button class="icon-btn" id="unselect" aria-label="Cancel">${icon("close", { size: 16 })}</button>
      </div>` : ""}`;
    const choose = (e) => {
      if (e.target.closest("button")) return; // the card's own info button opens the profile
      const b = e.target.closest("[data-i]"); if (!b || b.classList.contains("off")) return;
      const ps = G.roster[Number(b.dataset.i)];
      G.selected = G.selected === ps ? null : ps;
      drawArena();
    };
    a.querySelector("#pool").addEventListener("click", choose);
    a.querySelector("#pool").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(e); } });
    a.querySelector("#unselect")?.addEventListener("click", () => { G.selected = null; drawArena(); });
    a.querySelectorAll("[data-slot]").forEach((el) => {
      const go = () => { if (!G.selected) return; send({ t: "draft:pick", key: `${G.selected.player_id}|${G.selected.season}|${G.selected.team_id}`, slot: el.dataset.slot }); G.selected = null; a.querySelectorAll("[data-slot]").forEach((x) => x.classList.remove("target")); };
      el.addEventListener("click", go);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    a.querySelector("#respin")?.addEventListener("click", () => send({ t: "draft:respin" }));
  }

  // ------------------------------------------------------------ end of match
  function onEnd(m) {
    if (!M) return;
    phase = "end";
    M.end = m; M.oppRematch = false; M.sentRematch = false;
    if (M.spectator) { // watching: no records, history, ratings or achievements
      if (m.scores && M.game !== "guess" && M.game !== "draft") M.scores = m.scores;
      sound.play("place");
      announce(`Final: ${m.winner === null ? "a draw" : `${m.winner === 0 ? M.you.name : M.opp.name} wins`}.`);
      return drawEnd();
    }
    if (m.scores && M.game !== "guess" && M.game !== "draft") M.scores = m.scores;
    if (M.game === "draft" && G?.t === "draft" && m.reason === "done") G.picked = [6, 6];
    addRecord(M.game, m.result);
    M.comeback = m.result === "win" && m.reason === "done" && (M.maxBehind > 0 || (M.game === "guess" && M.oppSolvedFirst));
    const sc = scoreLine(m);
    serverHistory = null; // the server has a new match: fetch the list again next time
    addHistory({ game: M.game, mode: M.mode, result: m.result, opp: { name: M.opp.name, icon: M.opp.icon, color: M.opp.color, frame: M.opp.frame, style: M.opp.style, av: M.opp.av },
      oppCode: M.opp.code, score: sc.text, delta: m.rated ? m.delta : null });
    const rec = myRecord();
    const bestElo = Math.max(m.elo ?? 0, ...Object.values(rec?.elo || {}));
    emit("online:finish", { game: M.game, result: m.result, reason: m.reason, mode: M.mode, rated: m.rated, streak: m.streak ?? 0,
      bestElo: m.rated ? bestElo : rec ? Math.max(...Object.values(rec.elo)) : 0, comeback: M.comeback, botLevel: M.opp.botLevel });
    if (M.leaving) { M = null; G = null; phase = "lobby"; toast("You left the match. It counts as a loss."); return drawLobby(); }
    announce(`${m.result === "win" ? "Victory! You win" : m.result === "lose" ? `Defeat. ${M.opp.name} wins` : "Draw"}${sc.text ? `, ${sc.text}` : ""}.${m.rated && m.delta != null ? ` Rating ${m.delta >= 0 ? "up" : "down"} ${Math.abs(m.delta)}.` : ""}`, { assertive: true });
    if (m.result === "win") { confetti(M.comeback ? 4200 : 2600); sound.play("victory"); buzz([100, 50, 100, 50, 220]); }
    else sound.play(m.result === "draw" ? "place" : "defeat");
    drawEnd();
  }

  // ------------------------------------------------------------ Single game (coach duel)
  function coachMessage(m) {
    if (m.t === "coach:opp") { if (G?.t === "coach") { G.oppDone = true; drawArena(); } return; }
    if (m.t !== "coach:state") return;
    const fresh = G?.t !== "coach";
    const mine = G?.t === "coach" && G.done ? G.done : null;
    G = { ...m, t: "coach", deadline: deadlineFrom(m.ms), total: 20000, oppDone: m.done?.[opp()] || G?.oppDone || false, sentPlan: mine?.[M.seat] || G?.sentPlan || m.done?.[M.seat] || false,
      roundLabel: m.phase === "pick" ? "Pick a team" : "Game plan" };
    if (m.last && m.last.seat !== M.seat && !M.spectator) { const c = m.choices[m.last.i]; toast(`${M.opp.name} took ${teamName(c.team_id)} ${c.season}${m.last.auto ? " (time ran out)" : ""}`); }
    if (m.phase === "plan" && fresh === false && !G.sentPlan) announce("Both teams are picked. Choose a game plan: 20 seconds.");
    if (fresh) return drawMatch();
    drawArena(); updateScores();
  }
  const coachTop = (c, n = 3) => realRoster(c.season, c.team_id).slice(0, n);
  function coachCard(c, i, { pickable, owner }) {
    return html`<button class="card og-coach ${owner !== null ? "taken" : ""} ${pickable ? "pickable" : ""}" data-ci="${i}" ${pickable ? "" : "disabled"} style="--club:${clubColors(c.team_id)[0]}"
      aria-label="${esc(teamName(c.team_id))} ${esc(c.season)}, team rating ${c.s}${owner !== null ? `, taken by ${esc(owner)}` : ""}">
      <span class="oc-head">${crestSvg(c.team_id, teamName(c.team_id), 40)}<span><b>${esc(teamName(c.team_id))}</b><small class="muted">${esc(c.season)} · rating ${c.s}</small></span></span>
      <ol class="clean oc-top">${coachTop(c).map((ps) => `<li>${esc(playersById.get(ps.player_id)?.name || ps.player_id)} <small class="muted">${esc(ps.position || "")} · ${ps.stats.ppg ?? "–"} PPG</small></li>`).join("")}</ol>
      ${owner !== null ? `<span class="oc-owner">${esc(owner)}</span>` : ""}</button>`;
  }
  function drawCoach(a) {
    const g = G, me = M.seat;
    const ownerOf = (i) => (g.picks[me] === i ? (M.spectator ? M.you.name : "You") : g.picks[opp()] === i ? M.opp.name : null);
    if (g.phase === "pick") {
      const myTurn = g.turn === me && !M.spectator;
      a.innerHTML = html`${timerBar(g.deadline, 20000, myTurn)}
        <div class="card pad og-plan"><span class="bc-strap">${myTurn ? "Your pick" : `${esc(M.opp.name)} is picking…`}</span>
          <p class="muted" style="margin:8px 0 12px">${g.first === me ? "You won the coin toss and pick first." : `${esc(M.opp.name)} picks first.`} The second pick plays at home. Team rating comes from each club's real players that season.</p>
          <div class="oc-grid">${g.choices.map((c, i) => coachCard(c, i, { pickable: myTurn && !g.picks.includes(i), owner: ownerOf(i) })).join("")}</div></div>`;
      a.querySelectorAll("[data-ci]:not([disabled])").forEach((b) => b.addEventListener("click", () => { send({ t: "coach:pick", i: Number(b.dataset.ci) }); sound.play("select"); }, { signal }));
      return;
    }
    const side = (seat) => { const c = g.choices[g.picks[seat]]; return html`<div class="oc-side">${crestSvg(c.team_id, teamName(c.team_id), 48)}<b>${esc(teamName(c.team_id))} ${esc(c.season)}</b>
      <small class="muted">${seat === me ? (M.spectator ? esc(M.you.name) : "You") : esc(M.opp.name)} · rating ${c.s}${g.home === seat ? " · home" : ""}</small></div>`; };
    a.innerHTML = html`${timerBar(g.deadline, 20000, !g.sentPlan && !M.spectator)}
      <div class="card pad og-plan"><span class="bc-strap">Game plan</span>
        <div class="oc-vs">${side(me)}<b class="led tt-vs">VS</b>${side(opp())}</div>
        ${M.spectator ? "" : g.sentPlan ? `<p class="og-done">${icon("check", { size: 18, cls: "ic-good" })} Plan locked. <span class="muted">${g.oppDone ? "Tip-off!" : `Waiting for ${esc(M.opp.name)}…`}</span></p>`
          : html`<div id="plan-box">${gamePlanHtml({})}</div><div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" id="plan-go">${icon("check", { size: 15 })} Lock in the plan</button></div>`}
        ${g.oppDone && !g.sentPlan ? `<p class="muted" style="text-align:center">${esc(M.opp.name)} has locked in.</p>` : ""}
      </div>`;
    const box = a.querySelector("#plan-box");
    if (box) {
      bindGamePlan(box, { signal });
      a.querySelector("#plan-go").addEventListener("click", () => { send({ t: "coach:tactics", tactics: readGamePlan(box).tactics }); g.sentPlan = true; drawArena(); });
    }
  }
  /** The single game, rebuilt in the browser from its seed (the same game the server played). */
  function coachGame(d) {
    const sides = d.teams.map((t, seat) => teamSeasonSide(t.season, t.team_id, t.name, d.game.tactics?.[seat]));
    const home = d.game.home, away = 1 - home;
    return { seed: d.game.seed, home: sides[home], away: sides[away], hs: d.game.hs, as: d.game.as, neutral: false, winner: d.game.hs > d.game.as ? sides[home] : sides[away], label: "Online single game" };
  }

  function draftGame(d) {
    const sides = d.teams.map((t, seat) => ({ name: t.name, strength: t.total, drafted: true, id: "online-" + seat, roster: G_SLOTS.map((s) => psByKey(t.slots[s])).filter(Boolean), tactics: d.game.tactics?.[seat] }));
    return { seed: d.game.seed, home: sides[0], away: sides[1], hs: d.game.hs, as: d.game.as, neutral: true, winner: sides[d.game.winner], label: "Online final" };
  }
  const G_SLOTS = ["PG", "SG", "SF", "PF", "C", SIXTH];

  /** Score summary for the end screen, history and share card. */
  function scoreLine(m) {
    if (!m.scores) return { me: "", them: "", text: REASONS[m.reason] ? (m.result === "win" ? "opponent left" : "left") : "" };
    if (M.game === "guess") {
      const d = m.detail, t = (seat) => (d.solved[seat] ? `${d.tries[seat]}/8` : "X/8");
      return { me: t(M.seat), them: t(opp()), text: `${t(M.seat)} vs ${t(opp())}` };
    }
    return { me: mine(m.scores), them: theirs(m.scores), text: `${mine(m.scores)}-${theirs(m.scores)}` };
  }

  function endDetail(m) {
    const d = m.detail;
    if (m.reason !== "done") return `<p class="muted">${REASONS[m.reason] || ""}</p>`;
    if (M.game === "hl" || M.game === "career") {
      return `<div class="og-final"><div><small class="muted">YOU</small><b class="led">${mine(m.scores)}</b></div><span class="muted">–</span><div><small class="muted">${esc(M.opp.name).toUpperCase()}</small><b class="led">${theirs(m.scores)}</b></div></div>`;
    }
    if (M.game === "guess") {
      const p = playersById.get(d.target);
      const best = careerSummary(d.target).records.filter((r) => r.stats).sort((a, b) => b.rating_mock - a.rating_mock)[0];
      const line = (seat) => `<li><b>${youThem(seat)}</b>: ${d.solved[seat] ? `solved in ${d.tries[seat]} ${d.tries[seat] === 1 ? "try" : "tries"} (${Math.round(d.ms[seat] / 1000)}s)` : `not solved (${d.tries[seat]} tries)`}</li>`;
      return html`<div class="og-guess-end">${best ? playerCard(best, { size: "sm" }) : ""}<div style="text-align:left"><small class="muted">THE PLAYER WAS</small><h3>${nameLink(d.target, p.name)}</h3><ul class="clean">${line(M.seat)}${line(opp())}</ul></div></div>`;
    }
    if (M.game === "conn") {
      const name = (pid) => playersById.get(pid)?.name ?? pid;
      return html`<div class="og-final"><div><small class="muted">${M.spectator ? esc(M.you.name).toUpperCase() : "YOU"}</small><b class="led">${mine(m.scores)}/4</b></div><span class="muted">–</span><div><small class="muted">${esc(M.opp.name).toUpperCase()}</small><b class="led">${theirs(m.scores)}/4</b></div></div>
        <p class="muted" style="margin:0">Mistakes: ${youThem(M.seat)} ${d.mistakes[M.seat]} · ${esc(M.opp.name)} ${d.mistakes[opp()]}${d.timeUp ? " · time ran out" : ""}</p>
        <div class="cn-solved og-conn-end">${d.groups.map((g) => `<div class="cn-group lv${g.level}"><b>${esc(g.label)}</b><span>${g.players.map((p) => esc(name(p))).join(", ")}</span></div>`).join("")}</div>`;
    }
    if (M.game === "grid") {
      const name = (pid) => playersById.get(pid)?.name ?? pid;
      const board = (seat) => html`<div class="card pad og-team"><b>${seat === M.seat && !M.spectator ? "Your board" : esc(seat === M.seat ? M.you.name : M.opp.name)}</b>
        <div class="og-mini-grid big">${d.cells[seat].map((c) => `<i class="${c ? "on" : ""}" title="${c ? esc(name(c.pid)) + " · " + c.rarity : "empty"}">${c ? `<small>${esc(name(c.pid))}</small><b>${c.rarity}</b>` : ""}</i>`).join("")}</div></div>`;
      return html`<div class="og-final"><div><small class="muted">${M.spectator ? esc(M.you.name).toUpperCase() : "YOU"}</small><b class="led">${mine(m.scores)}</b></div><span class="muted">–</span><div><small class="muted">${esc(M.opp.name).toUpperCase()}</small><b class="led">${theirs(m.scores)}</b></div></div>
        <div class="og-teams">${board(M.seat)}${board(opp())}</div>`;
    }
    if (M.game === "coach") {
      const team = (seat) => { const t = d.teams[seat]; return html`<div class="card pad og-team" style="--club:${clubColors(t.team_id)[0]}"><div class="row">${crestSvg(t.team_id, teamName(t.team_id), 36)}<b>${seat === M.seat && !M.spectator ? "Your team" : esc(t.name)}</b></div>
        <div class="muted" style="font-size:13px">${esc(teamName(t.team_id))} ${esc(t.season)} · rating ${t.s}${d.game.home === seat ? " · home" : ""}</div>
        <ol class="clean og-lineup">${coachTop(t, 5).map((ps) => `<li>${nameLink(ps.player_id, playersById.get(ps.player_id)?.name || ps.player_id)} <span class="muted">${esc(ps.position || "")}</span></li>`).join("")}</ol></div>`; };
      return html`<div class="og-final"><div><small class="muted">YOU</small><b class="led">${m.scores[M.seat]}</b></div><span class="muted">–</span><div><small class="muted">${esc(M.opp.name).toUpperCase()}</small><b class="led">${m.scores[opp()]}</b></div></div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="watch">${icon("play", { size: 15 })} Watch the game</button><button class="btn" id="box">${icon("chart", { size: 15 })} Box score</button></div>
        <div class="og-teams">${team(M.seat)}${team(opp())}</div>`;
    }
    if (M.game === "draft") {
      const team = (seat) => {
        const t = d.teams[seat];
        return html`<div class="card pad og-team"><div class="row"><b>${seat === M.seat ? "Your team" : esc(t.name)}</b><span class="spacer"></span><span class="grade g-${t.grade}">${t.grade}</span></div>
          <div class="muted" style="font-size:13px">Team ${fmt1(t.total)} (avg ${fmt1(t.avg)} + chemistry ${fmt1(t.chem)}) · ${t.label}</div>
          <ol class="clean og-lineup">${G_SLOTS.map((s) => { const ps = psByKey(t.slots[s]); return ps ? `<li><span class="lbl pos-${posFamily(s)}">${slotLabel(s)}</span> ${nameLink(ps.player_id, playersById.get(ps.player_id).name)} <span class="muted">${ps.season}</span></li>` : ""; }).join("")}</ol></div>`;
      };
      return html`<div class="og-final"><div><small class="muted">YOU</small><b class="led">${m.scores[M.seat]}</b></div><span class="muted">–</span><div><small class="muted">${esc(M.opp.name).toUpperCase()}</small><b class="led">${m.scores[opp()]}</b></div></div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="watch">${icon("play", { size: 15 })} Watch the game</button><button class="btn" id="box">${icon("chart", { size: 15 })} Box score</button></div>
        <div class="og-teams">${team(M.seat)}${team(opp())}</div>`;
    }
    return "";
  }

  function drawEnd() {
    const m = M.end;
    const word = M.spectator ? "FINAL" : m.result === "win" ? "VICTORY" : m.result === "lose" ? "DEFEAT" : "DRAW";
    const sub = M.spectator ? (m.winner === null ? "A draw" : `${esc(m.winner === 0 ? M.you.name : M.opp.name)} wins`) : m.result === "win" ? "You win!" : m.result === "lose" ? `${esc(M.opp.name)} wins` : "Nobody blinked";
    const a = root.querySelector("#arena");
    if (!a) { drawMatch(); return; }
    root.querySelector("#forfeit")?.remove();
    const before = m.rated && m.elo != null ? m.elo - m.delta : null;
    const promoted = before != null && rankOf(m.elo).min > rankOf(before).min;
    const demoted = before != null && rankOf(m.elo).min < rankOf(before).min;
    const canFriend = M.opp.code && !M.opp.bot && !isFriend(M.opp.code);
    const h2h = M.opp.code && !M.opp.bot ? headToHead(M.opp.code) : null;
    a.innerHTML = html`<div class="card center-card og-end ${m.result} pop">
      <span class="bc-strap">Final</span><small class="muted">${ONLINE_GAMES[M.game].name.toUpperCase()} · ${M.mode === "ranked" ? "RANKED" : M.mode === "bot" ? "VS BOT" : "FRIENDLY"}</small>
      <div class="og-word ${m.result}" aria-hidden="true">${word.split("").map((ch, i) => `<span style="animation-delay:${i * 0.06}s">${ch}</span>`).join("")}</div>
      <h2 class="og-result">${m.result === "win" ? icon("trophy", { size: 30 }) : ""} ${sub}</h2>
      ${M.comeback ? `<div class="comeback pop">${icon("refresh", { size: 16 })} COMEBACK WIN!</div>` : ""}
      ${endDetail(m)}
      ${m.rated && m.elo != null ? html`<div class="elo-change ${m.delta >= 0 ? "up" : "down"}">
          ${rankBadge(m.elo)} <b class="led">${m.delta >= 0 ? "+" : ""}${m.delta}</b>
          ${promoted ? `<span class="promo pop">${icon("star", { size: 15 })} Promoted to ${rankOf(m.elo).name}!</span>` : demoted ? `<span class="muted">Down to ${rankOf(m.elo).name}</span>` : ""}
          ${m.streak >= 2 ? `<span class="streak-fire">🔥 ${m.streak} in a row</span>` : ""}
        </div>` : ""}
      ${m.voided === "speed" ? `<p class="muted" style="margin:0">${icon("shield", { size: 14 })} This match wasn't rated: answers came in faster than a person can play.</p>` : ""}
      ${h2h && h2h.w + h2h.l + h2h.d > 1 ? `<small class="muted">You vs ${esc(M.opp.name)}: ${h2h.w}-${h2h.l}${h2h.d ? `-${h2h.d}` : ""}</small>` : ""}
      <div class="row" style="justify-content:center;margin-top:8px">
        ${M.spectator ? "" : M.oppLeft ? `<span class="muted">${esc(M.opp.name)} left the room.</span>`
          : `<button class="btn primary" id="rematch" ${M.sentRematch ? "disabled" : ""}>${icon("refresh", { size: 15 })} ${M.sentRematch ? "Waiting for opponent…" : M.oppRematch ? "Accept rematch" : "Rematch"}</button>`}
        ${M.spectator ? "" : `<button class="btn" id="share">${icon("camera", { size: 15 })} Share result</button>`}
        ${m.replay ? `<button class="btn" id="replay">${icon("clock", { size: 15 })} Replay</button>` : ""}
        ${canFriend && !M.spectator ? `<button class="btn" id="add-friend">${icon("users", { size: 15 })} Add friend</button>` : ""}
        <button class="btn ghost" id="lobby">${icon("arrowLeft", { size: 15 })} Back to lobby</button>
      </div>
      ${M.oppRematch && !M.sentRematch && !M.oppLeft ? `<p class="muted pop" style="margin:0">${esc(M.opp.name)} wants a rematch!</p>` : ""}
    </div>`;
    updateScores();
    a.querySelector("#rematch")?.addEventListener("click", () => { M.sentRematch = true; send({ t: "rematch" }); drawEnd(); });
    a.querySelector("#replay")?.addEventListener("click", () => openReplay({ game: M.game, seat: M.seat, names: [M.you.name, M.opp.name], replay: m.replay, scores: m.scores }));
    a.querySelector("#add-friend")?.addEventListener("click", () => {
      addFriend({ code: M.opp.code, name: M.opp.name, icon: M.opp.icon, color: M.opp.color, frame: M.opp.frame, style: M.opp.style, av: M.opp.av });
      toast(`${M.opp.name} added to friends`); drawEnd();
    });
    a.querySelector("#share")?.addEventListener("click", async () => {
      const sc = scoreLine(m);
      const line = M.comeback ? "Comeback win!" : m.reason !== "done" ? (REASONS[m.reason] || "") : M.game === "guess" && m.detail ? `The player was ${playersById.get(m.detail.target)?.name}` : "";
      const canvas = drawResultCard({ game: M.game, mode: M.mode, result: m.result, you: M.you, opp: M.opp, myScore: sc.me, oppScore: sc.them, delta: m.delta, elo: m.elo, streak: m.streak, line });
      const how = await shareOrDownload(canvas, `winner-league-online-${M.game}.png`, "My Winner League Arcade result");
      toast(how === "shared" ? "Shared!" : "Image saved: post it anywhere");
    });
    a.querySelector("#lobby").addEventListener("click", () => { send({ t: M.spectator ? "unspectate" : "leave" }); M = null; G = null; phase = "lobby"; drawLobby(); });
    if ((M.game === "draft" || M.game === "coach") && m.reason === "done") {
      const g = M.game === "coach" ? coachGame(m.detail) : draftGame(m.detail);
      a.querySelector("#watch").addEventListener("click", () => openLiveGame(g, { celebrate: (x) => x.winner === (M.seat === 0 ? x.home : x.away) }));
      a.querySelector("#box").addEventListener("click", () => openBoxScore(g));
    }
  }

  arrowGrid(root, ".cn-tile", 4, signal);
  arrowGrid(root, ".gr-cell", 3, signal);
  gameKeys(signal, {
    f: () => (phase === "lobby" ? press(root, "#find")() : false),
    b: () => (phase === "lobby" || phase === "searching" ? press(root, `[data-bot="${botFor(myRecord()?.elo?.[game] ?? 1000)}"]`)() : false),
    Escape: () => (phase === "searching" || phase === "inviting" ? press(root, "#cancel")() : false),
  });
  // keyboard: ↑/↓ in Higher or Lower
  document.addEventListener("keydown", (e) => {
    if (phase !== "match" || G?.t !== "hl" || e.target.closest?.("input,select,textarea") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowUp") { e.preventDefault(); hlAnswer("higher"); }
    if (e.key === "ArrowDown") { e.preventDefault(); hlAnswer("lower"); }
  }, { signal });

  drawLobby();
  if (joinCode && netStatus() === "online") { joinTried = true; send({ t: "join", code: joinCode }); }
}
