// #/stats: your stats hub. Success per game (all time, this week, the last two weeks day by day), your knowledge
// map (the clubs and seasons you know best and least, from every answer in the knowledge games), the players who
// fool you most, your personal bests, and practice on your weak spots. Per league, on this device.
import { LEAGUE, playersById, teamName } from "../data.js";
import { LEAGUES } from "../leagueChoice.js";
import { confusing, knowledge, ranked, totals, trend, weakSpots } from "../lib/knowledge.js";
import { crestSvg, icon } from "../lib/icons.js";
import { nameLink } from "../components/playerCard.js";
import { esc, html, store } from "../ui.js";

const GAMES = [["career", "Career Path", "#/career"], ["guess", "Guess the Player", "#/guess"], ["hl", "Higher or Lower", "#/higher-lower"], ["grid", "The Grid", "#/grid"], ["conn", "Connections", "#/connections"]];

/** Best of the Higher or Lower records (one per mode) in this league. */
function hlBest() {
  try {
    const suffix = LEAGUE === "wl" ? "" : "@" + LEAGUE;
    return Math.max(0, ...Object.keys(localStorage).filter((k) => k.startsWith("wla:hl:best:") && (suffix ? k.endsWith(suffix) : !k.includes("@"))).map((k) => Number(JSON.parse(localStorage.getItem(k))) || 0));
  } catch { return 0; }
}

export function renderStats(root) {
  const K = knowledge();
  const clubs = ranked(K.clubs, 3), seasons = ranked(K.seasons, 3), fooled = confusing(K.players, 8);
  const w = weakSpots();
  const anything = GAMES.some(([g]) => totals(g).n);
  const bar = (pct) => `<span class="ks-bar"><i style="width:${pct}%"></i></span>`;
  const clubRow = (x) => `<li>${crestSvg(x.id, teamName(x.id), 22)}<span>${esc(teamName(x.id))}</span>${bar(x.pct)}<b>${x.pct}%</b><small class="muted">${x.n}</small></li>`;
  const seasonRow = (x) => `<li><span class="ks-season">${esc(x.id)}</span>${bar(x.pct)}<b>${x.pct}%</b><small class="muted">${x.n}</small></li>`;
  const g = store.get("guess:stats", {}), c = store.get("conn:stats", {}), gr = store.get("grid:stats", {});
  const bests = [
    ["Career Path", store.get("career:best", 0) ? `${store.get("career:best", 0)}/30` : "–"],
    ["Higher or Lower", hlBest() || "–"],
    ["All-Time Draft", store.get("draft:best", 0) || "–"],
    ["Guess the Player", g.played ? `${g.wins}/${g.played} solved · best streak ${g.maxStreak || 0}` : "–"],
    ["Connections", c.played ? `${c.wins}/${c.played} solved · ${c.perfect || 0} perfect` : "–"],
    ["The Grid", gr.played ? `best rarity ${gr.bestScore} · ${gr.full} full boards` : "–"],
  ];
  root.innerHTML = html`<div class="game-head"><div><a class="back" href="#/me">← Profile</a><h1>${icon("chart", { size: 30 })} My stats</h1>
      <p>What you know, from every answer in the knowledge games${LEAGUE !== "wl" ? ` (${esc(LEAGUES[LEAGUE].name)})` : ""}. Kept on this device.</p></div>
      ${w.enough ? `<a class="btn primary" href="#/career?practice=1">${icon("bolt", { size: 15 })} Practice my weak spots</a>` : ""}</div>
    ${!anything ? `<div class="card pad empty-state">${icon("chart", { size: 30 })}<b>No answers yet</b><p class="muted">Play Career Path, Guess the Player, Higher or Lower, The Grid or Connections: your stats build up from every answer.</p></div>` : html`
    <div class="ks-games">${GAMES.map(([id, name, href]) => {
      const t = totals(id), days = trend(id, 14), max = Math.max(1, ...days.map((d) => d.n));
      return html`<a class="card pad ks-game" href="${href}"><small class="muted">${esc(name.toUpperCase())}</small>
        <b class="led">${t.pct == null ? "–" : t.pct + "%"}</b><span class="muted" style="font-size:12px">${t.n ? `${t.ok} of ${t.n} right` : "Not played yet"}${t.week.pct != null ? ` · this week ${t.week.pct}%` : ""}</span>
        <span class="ks-spark" aria-hidden="true">${days.map((d) => `<i style="height:${Math.round((d.n / max) * 100)}%;--ok:${d.n ? Math.round((d.ok / d.n) * 100) : 0}%" title="${d.day}: ${d.ok}/${d.n}"></i>`).join("")}</span></a>`;
    }).join("")}</div>
    <div class="ks-grid">
      <div class="card pad"><h3>${icon("shield")} Clubs you know best</h3>${clubs.length ? `<ol class="clean ks-list">${clubs.slice(0, 6).map(clubRow).join("")}</ol>` : `<p class="muted">Answer at least three questions about a club to see it here.</p>`}</div>
      <div class="card pad"><h3>${icon("shield")} Clubs to work on</h3>${clubs.length > 6 ? `<ol class="clean ks-list">${clubs.slice(-6).reverse().map(clubRow).join("")}</ol>` : `<p class="muted">Not enough answers yet.</p>`}</div>
      <div class="card pad"><h3>${icon("calendar")} Seasons</h3>${seasons.length ? `<ol class="clean ks-list">${[...seasons.slice(0, 3), ...seasons.slice(3).slice(-3)].map(seasonRow).join("")}</ol><p class="muted" style="font-size:12px">Your best three, then the three you know least.</p>` : `<p class="muted">Not enough answers yet.</p>`}</div>
      <div class="card pad"><h3>${icon("users")} Players who fool you</h3>${fooled.length ? `<ol class="clean ks-list">${fooled.map((x) => `<li><span>${playersById.has(x.id) ? nameLink(x.id, playersById.get(x.id).name) : esc(x.id)}</span><b class="bad-text">${x.miss} missed</b><small class="muted">of ${x.n}</small></li>`).join("")}</ol>` : `<p class="muted">Nobody yet: players you get wrong twice show up here.</p>`}</div>
    </div>`}
    <div class="card pad"><h3>${icon("trophy")} Personal bests</h3>
      <ul class="clean about-list">${bests.map(([n, v]) => `<li><span>${esc(n)}</span><b>${esc(String(v))}</b></li>`).join("")}</ul></div>`;
}
