// Online 1v1 (#/online, #/online/join/<CODE>): lobby, random matchmaking, invite codes, and the
// four duels. The server runs the game; this page only shows it and sends the player's moves.
import { undoToast } from "../lib/ux.js";
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
import { connect, deadlineFrom, lastStats, latency, myCode, myRecord, netStatus, onNet, send } from "../online/net.js";
import { GAME_ICONS, GAME_NAMES, addFriend, addHistory, getFriends, getHistory, headToHead, isFriend, refreshFriends, removeFriend, rivals } from "../online/social.js";
import { buzz, countdown } from "../online/feel.js";
import { announce } from "../lib/a11y.js";
import { shot } from "../lib/shot.js";
import { courtHtml } from "../lib/court.js";
import { clueSpeech } from "../shared/guessLogic.js";
import { drawResultCard } from "../online/card.js";
import { shareOrDownload } from "../games/draft_card.js";
import { CHAT, RANKS, cleanCode, rankOf } from "../shared/rating.js";

export const ONLINE_GAMES = {
  hl: { name: "Higher or Lower", ic: "chart", short: "Speed duel",
    rules: "15 rounds, 10 seconds each. A right answer is worth 100 points plus up to 50 for speed." },
  guess: { name: "Guess the Player", ic: "search", short: "Race to the answer",
    rules: "Same mystery player for both of you. 8 tries, 3 minutes. Fewer tries wins; a tie goes to the faster player. You see your opponent's colors, not their guesses." },
  career: { name: "Career Path", ic: "arrowRight", short: "Buzzer quiz",
    rules: "10 careers, 20 seconds each. The first correct answer takes 3 points. A wrong answer locks you out of that round." },
  draft: { name: "All-Time Draft", ic: "trophy", short: "Head-to-head draft",
    rules: "Snake draft from shared spins: 6 picks each (PG to C plus a sixth man), 30 seconds per pick. Then your two teams play a simulated game." },
};
const HL_CATS = {
  ppg: { label: "Points per game", get: (ps) => ps.stats.ppg, dec: 1 },
  rpg: { label: "Rebounds per game", get: (ps) => ps.stats.rpg, dec: 1 },
  apg: { label: "Assists per game", get: (ps) => ps.stats.apg, dec: 1 },
  rating: { label: "Game rating", get: (ps) => ps.rating_mock, dec: 0 },
  val: { label: "Efficiency (VAL) per game", get: (ps) => ps.stats.valuation_per_game, dec: 1 },
};
const REACTIONS = ["👏", "🔥", "😅", "😮", "💪", "🏀"];
const REASONS = { forfeit: "Your opponent left the match.", disconnect: "Your opponent lost their connection." };
const BOTS = { easy: { name: "Rookie", ic: "whistle" }, normal: { name: "Veteran", ic: "rocket" }, hard: { name: "Legend", ic: "crown" } };
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
  let game = ONLINE_GAMES[store.get("online:game")] ? store.get("online:game") : "hl";
  let phase = "lobby"; // lobby | searching | inviting | match | end
  let invite = null, searchStart = 0, lobbyMsg = "";
  let M = null; // the current match
  let G = null; // the current game's state
  let tick = null;
  let tab = ["play", "friends", "leaders", "history"].includes(store.get("online:tab")) ? store.get("online:tab") : "play";
  let friendsInfo = null, leaders = null, leadersGame = "all", stopCount = null;
  const joinCode = params[0] === "join" && params[1] ? String(params[1]).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
  let joinTried = false;

  connect();
  onNet(onMessage, signal);
  tick = setInterval(updateClocks, 200);
  // friends' online status, refreshed while the Friends tab is open
  const friendPoll = setInterval(() => { if (phase === "lobby" && tab === "friends" && getFriends().length) send({ t: "friends", codes: getFriends().map((f) => f.code) }); }, 15000);
  signal.addEventListener("abort", () => {
    clearInterval(tick); clearInterval(friendPoll); stopCount?.();
    if (phase === "searching" || phase === "inviting") send({ t: "cancel" });
    if (phase === "match" || phase === "end") send({ t: "leave" }); // leaving the page forfeits a running match
  });

  // ------------------------------------------------------------ server messages
  function onMessage(m) {
    switch (m.t) {
      case "status":
        if (phase === "lobby" || phase === "searching" || phase === "inviting") drawLobby();
        else drawConnBadge();
        if (m.status === "online" && joinCode && !joinTried && phase === "lobby") { joinTried = true; send({ t: "join", code: joinCode }); }
        return;
      case "welcome": case "stats": if (phase === "lobby" || phase === "searching" || phase === "inviting") drawLobbyStats(); return;
      case "queued": phase = "searching"; searchStart = Date.now(); return drawLobby();
      case "invited": phase = "inviting"; invite = m; tab = "play"; return drawLobby();
      case "invite:declined": if (phase === "inviting") { phase = "lobby"; invite = null; lobbyMsg = `${m.name} can't play right now.`; drawLobby(); } return;
      case "record": if (phase === "lobby" && tab === "play") drawLobby(); return;
      case "friends": friendsInfo = m.list; refreshFriends(m.list); if (phase === "lobby" && tab === "friends") drawLobby(); return;
      case "leaders": leaders = m; if (phase === "lobby" && tab === "leaders") drawLobby(); return;
      case "whois": {
        if (!m.found) { const el = root.querySelector("#fr-msg"); if (el) el.textContent = "No player with that code. They need to open the arcade online once."; return; }
        addFriend(m); friendsInfo = null; toast(`${m.name} added to friends`);
        if (phase === "lobby" && tab === "friends") drawLobby();
        return;
      }
      case "chat": return showChat(m.i, "opp");
      case "cancelled": if (phase === "searching" || phase === "inviting") { phase = "lobby"; invite = null; drawLobby(); } return;
      case "error": lobbyMsg = m.msg; phase = "lobby"; if (joinCode) history.replaceState(null, "", "#/online"); return drawLobby();
      case "match":
        if (m.resumed && M && M.seq === m.seq) { M.seat = m.seat; drawConnBadge(); return; }
        M = { game: m.game, mode: m.mode, rated: m.rated, seat: m.seat, you: m.you, opp: m.opp, seq: m.seq, scores: [0, 0], oppAway: false, oppRematch: false, sentRematch: false,
          startAt: deadlineFrom(3500), maxBehind: 0, oppSolvedFirst: false };
        G = null; phase = "match";
        if (joinCode) history.replaceState(null, "", "#/online");
        sound.play("spin"); buzz(150);
        if (!m.resumed) announce(`Match found: ${m.opp.name}. ${ONLINE_GAMES[m.game].name}, ${m.mode === "ranked" ? "ranked" : m.mode === "bot" ? "against a bot" : "friendly"}. Starting in 3 seconds.`, { assertive: true });
        stopCount?.(); stopCount = m.resumed ? null : countdown(M.startAt);
        return drawMatch();
      case "opp:away": if (M) { M.oppAway = Date.now() + m.ms; drawOppState(); } return;
      case "opp:back": if (M) { M.oppAway = false; drawOppState(); } return;
      case "opp:left": if (M) { M.oppLeft = true; if (phase === "end") drawEnd(); } return;
      case "opp:rematch": if (M) { M.oppRematch = true; if (phase === "end") drawEnd(); toast(`${M.opp.name} wants a rematch`); } return;
      case "react": return showReaction(m.e, "opp");
      case "end": return onEnd(m);
    }
    if (!M || phase !== "match") return;
    if (m.t.startsWith("hl:") || (m.t === "opp:answered" && M.game === "hl")) return hlMessage(m);
    if (m.t.startsWith("car:") || (m.t === "opp:wrong" && M.game === "career")) return careerMessage(m);
    if (m.t.startsWith("guess:")) return guessMessage(m);
    if (m.t.startsWith("draft:")) return draftMessage(m);
  }

  // ------------------------------------------------------------ lobby
  function statusText() {
    const s = netStatus();
    return s === "online" ? "Connected" : s === "unavailable" ? "Online server not found" : s === "replaced" ? "Opened in another tab" : "Connecting…";
  }

  const rankBadge = (elo, { small = false } = {}) => {
    if (elo == null) return "";
    const r = rankOf(elo);
    return `<span class="rank-badge rk-${r.id} ${small ? "sm" : ""}" title="${r.name} · ${elo}"><i></i>${r.name}${small ? "" : ` <b>${elo}</b>`}</span>`;
  };
  const TABS = [["play", "bolt", "Play"], ["friends", "users", "Friends"], ["leaders", "trophy", "Leaderboard"], ["history", "clock", "History"]];

  function drawLobby() {
    const s = netStatus();
    const busy = phase === "searching" || phase === "inviting";
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>${icon("globe", { size: 30 })} Online 1v1</h1>
        <p>Ranked matches against players at your level, friendly games with friends, or practice against a bot.</p></div>
        <div class="row"><span class="conn ${s}" id="conn"><i></i>${statusText()}</span><span class="muted" id="online-count"></span></div>
      </div>
      ${s === "unavailable" ? html`<div class="card pad warn-card">${icon("info", { size: 20 })}<div><b>Online play needs the arcade's Node server.</b>
        <p class="muted" style="margin:4px 0 0">This page is being served without it (for example by the Python server). Start the arcade with <code>start_game.bat</code> after installing Node.js, or run <code>npm install</code> and <code>npm start</code> in the project folder.</p></div></div>` : ""}
      ${s === "replaced" ? html`<div class="card pad warn-card">${icon("info", { size: 20 })}<div><b>Online play is open in another tab.</b> <button class="btn" id="reconnect">Use this tab</button></div></div>` : ""}
      ${lobbyMsg ? `<div class="card pad warn-card">${icon("x", { size: 20 })}<div>${esc(lobbyMsg)}</div></div>` : ""}
      <div class="seg og-tabs" id="og-tabs" role="tablist">${TABS.map(([k, ic, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? "on" : ""}" data-tab="${k}" ${busy && k !== "play" ? "disabled" : ""}>${icon(ic, { size: 15 })} ${l}</button>`).join("")}</div>
      <div id="og-body"></div>`;
    root.querySelector("#og-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]"); if (!b || b.disabled) return;
      tab = b.dataset.tab; store.set("online:tab", tab); lobbyMsg = ""; drawLobby();
    }, { signal });
    root.querySelector("#reconnect")?.addEventListener("click", () => connect(), { signal });
    const body = root.querySelector("#og-body");
    ({ play: drawPlay, friends: drawFriends, leaders: drawLeaders, history: drawHistory })[tab](body, s, busy);
    drawLobbyStats();
  }

  function drawPlay(body, s, busy) {
    const rec = myRecord();
    const elo = rec?.elo?.[game] ?? 1000;
    body.innerHTML = html`<div class="online-grid">
        <div class="card pad setup">
          <h3>${icon("games")} Choose a game</h3>
          <div class="ch-games" id="og-games">${Object.entries(ONLINE_GAMES).map(([k, g]) => `<button class="ch-game ${k === game ? "on" : ""}" data-g="${k}" ${busy ? "disabled" : ""} aria-pressed="${k === game}">${icon(g.ic, { size: 22 })}<b>${g.name} <span class="muted og-short">· ${g.short}</span> ${rankBadge(rec?.elo?.[k] ?? 1000, { small: true })}</b><small>${g.rules}</small></button>`).join("")}</div>
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          <div class="card pad og-me">
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
              <div class="bot-offer" id="bot-offer" hidden>
                <b>Nobody around right now?</b> <span class="muted">Play a bot meanwhile (not ranked):</span>
                <div class="row" style="justify-content:center">${Object.entries(BOTS).map(([k, b]) => `<button class="btn" data-bot="${k}">${icon(b.ic, { size: 15 })} ${b.name}</button>`).join("")}</div>
              </div>
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
      game = b.dataset.g; store.set("online:game", game); lobbyMsg = ""; drawLobby();
    }, { signal });
    $("#find")?.addEventListener("click", () => { lobbyMsg = ""; send({ t: "queue", game }); }, { signal });
    $("#invite")?.addEventListener("click", () => { lobbyMsg = ""; send({ t: "invite", game }); }, { signal });
    $("#cancel")?.addEventListener("click", () => send({ t: "cancel" }), { signal });
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
            <button class="btn ${st === "online" ? "primary" : ""}" data-inv="${f.code}" ${st === "online" && s === "online" ? "" : "disabled"}>${icon("play", { size: 14 })} Invite</button>
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
    body.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => {
      const f = friends.find((x) => x.code === b.dataset.rm);
      const before = getFriends();
      removeFriend(b.dataset.rm); drawLobby();
      undoToast(`${f?.name || "Friend"} removed`, () => { store.set("online:friends", before); drawLobby(); });
    }, { signal }));
    if (friends.length && !friendsInfo) send({ t: "friends", codes: friends.map((f) => f.code) });
  }

  // ---------------- leaderboard
  function drawLeaders(body) {
    const L = leaders?.game === leadersGame ? leaders : null;
    const row = (r) => html`<tr class="${r.me ? "me-row" : ""}"><td class="pos">${r.pos <= 3 ? ["🥇", "🥈", "🥉"][r.pos - 1] : r.pos}</td>
      <td><span class="lb-name">${avatarHtml({ icon: r.icon, color: r.color, frame: r.frame, style: r.style, av: r.av }, 30)}<span><b>${esc(r.name)}</b><small class="muted">Lv ${r.level}${r.streak >= 3 ? ` · 🔥${r.streak}` : ""}</small></span></span></td>
      <td>${rankBadge(r.elo, { small: true })}</td><td><b>${leadersGame === "all" ? r.w : r.elo}</b></td><td class="muted">${r.w}-${r.l}</td></tr>`;
    body.innerHTML = html`<div class="card pad">
      <div class="row" style="margin-bottom:10px"><h3 style="margin:0">${icon("trophy")} Leaderboard</h3><span class="spacer"></span>
        <div class="seg sm" id="lb-game">${[["all", "All games"], ...Object.entries(ONLINE_GAMES).map(([k, g]) => [k, g.name])].map(([k, l]) => `<button class="${k === leadersGame ? "on" : ""}" data-lg="${k}">${l}</button>`).join("")}</div></div>
      ${!L ? `<p class="muted">Loading…</p>` : L.rows.length ? html`<div class="grid-wrap"><table class="stat-table lb-table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>${leadersGame === "all" ? "Wins" : "Rating"}</th><th>W-L</th></tr></thead>
        <tbody>${L.rows.map(row).join("")}${L.me ? `<tr class="gap"><td colspan="5">⋯</td></tr>${row(L.me)}` : ""}</tbody></table></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">Ranked matches only. ${L.total} ranked player${L.total === 1 ? "" : "s"}. The board refills as players come back online after a server restart.</p>`
        : `<p class="muted">No ranked matches yet${leadersGame === "all" ? "" : " in this game"}. Win one to take the top spot!</p>`}
    </div>`;
    body.querySelector("#lb-game").addEventListener("click", (e) => {
      const b = e.target.closest("[data-lg]"); if (!b) return;
      leadersGame = b.dataset.lg; send({ t: "leaders", game: leadersGame }); drawLobby();
    }, { signal });
    if (!L) send({ t: "leaders", game: leadersGame });
  }

  // ---------------- history
  function drawHistory(body, s) {
    const list = getHistory();
    const top = rivals();
    const modeChip = (m) => `<span class="mode-chip ${m}">${m === "ranked" ? "Ranked" : m === "bot" ? "Bot" : "Friendly"}</span>`;
    body.innerHTML = html`<div class="online-grid">
      <div class="card pad" style="min-width:0">
        <h3>${icon("clock")} Recent matches</h3>
        ${list.length ? `<div class="hist-list">${list.map((h, i) => html`<div class="hist-row ${h.result}">
          <span class="hist-res">${h.result === "win" ? "W" : h.result === "lose" ? "L" : "D"}</span>
          ${avatarHtml({ icon: h.opp?.icon || "ball", color: h.opp?.color || "#64748b", frame: h.opp?.frame || "none", style: h.opp?.style, av: h.opp?.av }, 34)}
          <div class="hist-info"><b>${esc(h.opp?.name || "?")}</b><small class="muted">${icon(GAME_ICONS[h.game], { size: 12 })} ${GAME_NAMES[h.game]} · ${esc(h.score || "")} · ${new Date(h.at).toLocaleDateString()}</small></div>
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
    if (el) { el.className = `conn ${netStatus()}`; el.innerHTML = `<i></i>${statusText()}`; }
  }

  // ------------------------------------------------------------ match shell
  const opp = () => 1 - M.seat;
  const mine = (arr) => arr[M.seat];
  const theirs = (arr) => arr[opp()];

  function duelBar() {
    const g = ONLINE_GAMES[M.game];
    const score = (i) => (M.game === "guess" ? `${G?.tries?.[i] ?? 0}/8` : M.game === "draft" ? `${G?.picked?.[i] ?? 0}/6` : M.scores[i]);
    return html`<div class="card duel-bar">
      <div class="duel-p p-me">${avatarHtml(M.you, 40)}<div><b>${esc(M.you.name)}</b><small class="muted">You · ${M.rated ? rankBadge(M.you.elo, { small: true }) : `Lv ${M.you.level}`}</small></div><span class="duel-score led" id="score-me">${score(M.seat)}</span><span class="chat-bubble me" id="chat-me" hidden></span></div>
      <div class="duel-mid"><span class="muted">${icon(g.ic, { size: 16 })} ${g.name}</span><b id="duel-round"></b>
        <span class="row" style="gap:6px;justify-content:center"><span class="mode-chip ${M.mode}">${M.mode === "ranked" ? "Ranked" : M.mode === "bot" ? "vs Bot" : "Friendly"}</span><span class="conn ${netStatus()}" id="conn" title="Ping ${Math.round(latency())} ms"><i></i></span></span></div>
      <div class="duel-p p-them"><span class="chat-bubble opp" id="chat-opp" hidden></span><span class="duel-score led" id="score-opp">${score(opp())}</span><div style="text-align:right"><b>${esc(M.opp.name)}</b><small class="muted" id="opp-state"></small></div>${avatarHtml(M.opp, 40)}</div>
    </div>`;
  }

  function drawMatch() {
    if (!M) return;
    root.innerHTML = html`
      <h1 class="sr-only">Online ${esc(ONLINE_GAMES[M.game].name)}: ${esc(M.you.name)} vs ${esc(M.opp.name)}</h1>
      ${duelBar()}
      <div id="arena" class="duel-arena"></div>
      <div class="react-bar" role="group" aria-label="Send a reaction">${REACTIONS.map((e) => `<button class="react-btn" data-e="${e}" aria-label="React ${e}">${e}</button>`).join("")}
        <button class="btn ghost" id="chat-toggle" aria-expanded="false">${icon("users", { size: 15 })} Say…</button>
        <span class="spacer"></span><button class="btn ghost" id="forfeit">${icon("flag", { size: 15 })} Leave match</button></div>
      <div class="chat-menu" id="chat-menu" hidden>${CHAT.map((c, i) => `<button class="btn" data-chat="${i}">${esc(c)}</button>`).join("")}</div>
      <div class="react-layer" aria-hidden="true"></div>`;
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

  function drawCountdown() {
    const a = root.querySelector("#arena");
    a.innerHTML = html`<div class="card center-card og-vs pop">
      <small class="muted">MATCH FOUND</small>
      <div class="og-vs-row">${avatarHtml(M.you, 64)}<b class="led">VS</b>${avatarHtml(M.opp, 64)}</div>
      <h2>${esc(M.you.name)} <span class="muted">vs</span> ${esc(M.opp.name)}</h2>
      <p class="muted" style="max-width:520px">${ONLINE_GAMES[M.game].rules}</p>
      <div class="og-count led" data-until="${M.startAt}">3</div>
    </div>`;
  }

  function drawArena() {
    const a = root.querySelector("#arena");
    if (!a || !G) return;
    ({ hl: drawHL, career: drawCareer, guess: drawGuess, draft: drawDraft })[M.game](a);
    updateScores();
  }

  function updateScores() {
    const me = root.querySelector("#score-me"), them = root.querySelector("#score-opp");
    if (!me || !M) return;
    if (M.game === "guess") { me.textContent = `${G?.tries?.[M.seat] ?? 0}/8`; them.textContent = `${G?.tries?.[opp()] ?? 0}/8`; }
    else if (M.game === "draft") { me.textContent = `${G?.picked?.[M.seat] ?? 0}/6`; them.textContent = `${G?.picked?.[opp()] ?? 0}/6`; }
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
    el.className = `react-pop ${who}`;
    el.textContent = e;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // timers: elements carry the moment they run out
  function updateClocks() {
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
    if (phase === "searching") { const offer = root.querySelector("#bot-offer"); if (offer && offer.hidden && Date.now() - searchStart > 30000) offer.hidden = false; }
  }
  const timerBar = (deadline, total, urgent = false) => `<div class="duel-timer" role="timer" aria-label="Time left" data-deadline="${deadline}" data-total="${total}" data-urgent="${urgent ? 1 : 0}"><i aria-hidden="true"></i><b></b></div>`;
  const youThem = (seat) => (seat === M.seat ? "You" : esc(M.opp.name));

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

  // ------------------------------------------------------------ All-Time Draft
  function draftMessage(m) {
    if (m.t === "draft:last") { if (G?.t === "draft") lastPickToast(m.last); return; }
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


  function drawDraft(a) {
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
    if (m.scores && M.game !== "guess" && M.game !== "draft") M.scores = m.scores;
    if (M.game === "draft" && G?.t === "draft" && m.reason === "done") G.picked = [6, 6];
    addRecord(M.game, m.result);
    M.comeback = m.result === "win" && m.reason === "done" && (M.maxBehind > 0 || (M.game === "guess" && M.oppSolvedFirst));
    const sc = scoreLine(m);
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

  function draftGame(d) {
    const sides = d.teams.map((t, seat) => ({ name: t.name, strength: t.total, drafted: true, id: "online-" + seat, roster: G_SLOTS.map((s) => psByKey(t.slots[s])).filter(Boolean) }));
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
    const word = m.result === "win" ? "VICTORY" : m.result === "lose" ? "DEFEAT" : "DRAW";
    const sub = m.result === "win" ? "You win!" : m.result === "lose" ? `${esc(M.opp.name)} wins` : "Nobody blinked";
    const a = root.querySelector("#arena");
    if (!a) { drawMatch(); return; }
    root.querySelector("#forfeit")?.remove();
    const before = m.rated && m.elo != null ? m.elo - m.delta : null;
    const promoted = before != null && rankOf(m.elo).min > rankOf(before).min;
    const demoted = before != null && rankOf(m.elo).min < rankOf(before).min;
    const canFriend = M.opp.code && !M.opp.bot && !isFriend(M.opp.code);
    const h2h = M.opp.code && !M.opp.bot ? headToHead(M.opp.code) : null;
    a.innerHTML = html`<div class="card center-card og-end ${m.result} pop">
      <small class="muted">${ONLINE_GAMES[M.game].name.toUpperCase()} · ${M.mode === "ranked" ? "RANKED" : M.mode === "bot" ? "VS BOT" : "FRIENDLY"}</small>
      <div class="og-word ${m.result}" aria-hidden="true">${word.split("").map((ch, i) => `<span style="animation-delay:${i * 0.06}s">${ch}</span>`).join("")}</div>
      <h2 class="og-result">${m.result === "win" ? icon("trophy", { size: 30 }) : ""} ${sub}</h2>
      ${M.comeback ? `<div class="comeback pop">${icon("refresh", { size: 16 })} COMEBACK WIN!</div>` : ""}
      ${endDetail(m)}
      ${m.rated && m.elo != null ? html`<div class="elo-change ${m.delta >= 0 ? "up" : "down"}">
          ${rankBadge(m.elo)} <b class="led">${m.delta >= 0 ? "+" : ""}${m.delta}</b>
          ${promoted ? `<span class="promo pop">${icon("star", { size: 15 })} Promoted to ${rankOf(m.elo).name}!</span>` : demoted ? `<span class="muted">Down to ${rankOf(m.elo).name}</span>` : ""}
          ${m.streak >= 2 ? `<span class="streak-fire">🔥 ${m.streak} in a row</span>` : ""}
        </div>` : ""}
      ${h2h && h2h.w + h2h.l + h2h.d > 1 ? `<small class="muted">You vs ${esc(M.opp.name)}: ${h2h.w}-${h2h.l}${h2h.d ? `-${h2h.d}` : ""}</small>` : ""}
      <div class="row" style="justify-content:center;margin-top:8px">
        ${M.oppLeft ? `<span class="muted">${esc(M.opp.name)} left the room.</span>`
          : `<button class="btn primary" id="rematch" ${M.sentRematch ? "disabled" : ""}>${icon("refresh", { size: 15 })} ${M.sentRematch ? "Waiting for opponent…" : M.oppRematch ? "Accept rematch" : "Rematch"}</button>`}
        <button class="btn" id="share">${icon("camera", { size: 15 })} Share result</button>
        ${canFriend ? `<button class="btn" id="add-friend">${icon("users", { size: 15 })} Add friend</button>` : ""}
        <button class="btn ghost" id="lobby">${icon("arrowLeft", { size: 15 })} Back to lobby</button>
      </div>
      ${M.oppRematch && !M.sentRematch && !M.oppLeft ? `<p class="muted pop" style="margin:0">${esc(M.opp.name)} wants a rematch!</p>` : ""}
    </div>`;
    updateScores();
    a.querySelector("#rematch")?.addEventListener("click", () => { M.sentRematch = true; send({ t: "rematch" }); drawEnd(); });
    a.querySelector("#add-friend")?.addEventListener("click", () => {
      addFriend({ code: M.opp.code, name: M.opp.name, icon: M.opp.icon, color: M.opp.color, frame: M.opp.frame, style: M.opp.style, av: M.opp.av });
      toast(`${M.opp.name} added to friends`); drawEnd();
    });
    a.querySelector("#share").addEventListener("click", async () => {
      const sc = scoreLine(m);
      const line = M.comeback ? "Comeback win!" : m.reason !== "done" ? (REASONS[m.reason] || "") : M.game === "guess" && m.detail ? `The player was ${playersById.get(m.detail.target)?.name}` : "";
      const canvas = drawResultCard({ game: M.game, mode: M.mode, result: m.result, you: M.you, opp: M.opp, myScore: sc.me, oppScore: sc.them, delta: m.delta, elo: m.elo, streak: m.streak, line });
      const how = await shareOrDownload(canvas, `winner-league-online-${M.game}.png`, "My Winner League Arcade result");
      toast(how === "shared" ? "Shared!" : "Image saved: post it anywhere");
    });
    a.querySelector("#lobby").addEventListener("click", () => { send({ t: "leave" }); M = null; G = null; phase = "lobby"; drawLobby(); });
    if (M.game === "draft" && m.reason === "done") {
      const g = draftGame(m.detail);
      a.querySelector("#watch").addEventListener("click", () => openLiveGame(g, { celebrate: (x) => x.winner === (M.seat === 0 ? x.home : x.away) }));
      a.querySelector("#box").addEventListener("click", () => openBoxScore(g));
    }
  }

  // keyboard: ↑/↓ in Higher or Lower
  document.addEventListener("keydown", (e) => {
    if (phase !== "match" || G?.t !== "hl" || e.target.closest?.("input,select,textarea") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowUp") { e.preventDefault(); hlAnswer("higher"); }
    if (e.key === "ArrowDown") { e.preventDefault(); hlAnswer("lower"); }
  }, { signal });

  drawLobby();
  if (joinCode && netStatus() === "online") { joinTried = true; send({ t: "join", code: joinCode }); }
}
