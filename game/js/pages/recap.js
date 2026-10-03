// Monthly recap (#/recap?m=YYYY-MM): what you did in the arcade that month, with a shareable image.
import { careerSummary, playersById } from "../data.js";
import { bestSeason, playerCard } from "../components/playerCard.js";
import { DEFS, GAMES, bannerSvg, unlockedMap } from "../lib/achievements.js";
import { icon } from "../lib/icons.js";
import { getMe } from "../lib/me.js";
import { levelInfo } from "../lib/progress.js";
import { shareOrDownload } from "../games/draft_card.js";
import { esc, html, store, toast } from "../ui.js";

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthName = (key) => new Date(`${key}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export function monthsWithActivity() {
  const set = new Set([monthKey(new Date())]);
  for (const e of store.get("activity:log", [])) set.add(monthKey(new Date(e.t)));
  return [...set].sort().reverse();
}

export function recapFor(key) {
  const log = store.get("activity:log", []);
  const inMonth = log.filter((e) => monthKey(new Date(e.t)) === key);
  const after = log.filter((e) => monthKey(new Date(e.t)) > key);
  const xpOf = (list) => list.reduce((s, e) => s + (e.e === "xp" ? e.xp : e.e === "hl:over" ? e.xpRun || 0 : 0), 0);
  const xp = xpOf(inMonth);
  const xpNow = store.get("xp", 0);
  const xpEnd = xpNow - xpOf(after), xpStart = Math.max(0, xpEnd - xp);
  const ev = (name) => inMonth.filter((e) => e.e === name);
  const guess = ev("guess:end"), draft = ev("draft:finish"), hl = ev("hl:over"), career = ev("career:finish"), seasons = ev("draft:season");
  const views = new Map();
  for (const e of ev("profile:view")) views.set(e.pid, (views.get(e.pid) || 0) + 1);
  const topViewed = [...views.entries()].sort((a, b) => b[1] - a[1])[0];
  const map = unlockedMap();
  const ach = DEFS.filter((d) => map[d.id] && monthKey(new Date(map[d.id])) === key);
  return {
    key, xp, levelStart: levelInfo(xpStart).level, levelEnd: levelInfo(xpEnd).level,
    days: new Set(inMonth.map((e) => new Date(e.t).toDateString())).size,
    games: { draft: draft.length, guess: guess.length, hl: hl.length, career: career.length },
    guessWins: guess.filter((g) => g.won).length,
    bestDraft: draft.length ? Math.max(...draft.map((d) => d.total)) : null,
    titles: seasons.filter((s) => s.champion).length,
    bestHL: hl.length ? Math.max(...hl.map((h) => h.score)) : null,
    bestCareer: career.length ? Math.max(...career.map((c) => c.score)) : null,
    topViewed: topViewed && playersById.get(topViewed[0])?.name ? { pid: topViewed[0], n: topViewed[1] } : null,
    ach,
  };
}

function drawShare(r) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 1080, 1350);
  bg.addColorStop(0, "#0b1220"); bg.addColorStop(1, "#1b2a52");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  const me = getMe();
  g.fillStyle = "#ff7a1a"; g.font = "600 30px Barlow Condensed, Inter, sans-serif"; g.fillText("WINNER LEAGUE ARCADE · MONTHLY RECAP", 70, 100);
  g.fillStyle = "#eef2fa"; g.font = "700 82px Barlow Condensed, Inter, sans-serif"; g.fillText(monthName(r.key).toUpperCase(), 70, 200);
  g.fillStyle = "#93a1bf"; g.font = "500 32px Inter, sans-serif"; g.fillText(`${me.nickname || "Guest"} · Level ${r.levelEnd}`, 70, 252);
  const tiles = [
    ["Games played", Object.values(r.games).reduce((a, b) => a + b, 0)], ["XP earned", r.xp.toLocaleString()], ["Days active", r.days],
    ["Achievements", r.ach.length], ["Best draft", r.bestDraft ?? "–"], ["Guess wins", r.guessWins],
    ["Best Higher/Lower", r.bestHL ?? "–"], ["Best Career Path", r.bestCareer !== null ? `${r.bestCareer}/30` : "–"], ["Titles won", r.titles],
  ];
  tiles.forEach(([label, v], i) => {
    const x = 70 + (i % 3) * 320, y = 320 + Math.floor(i / 3) * 230;
    g.fillStyle = "#16213a"; g.beginPath(); g.roundRect(x, y, 300, 200, 22); g.fill();
    g.fillStyle = "#ff7a1a"; g.font = "800 72px Orbitron, Barlow Condensed, sans-serif"; g.fillText(String(v), x + 26, y + 112);
    g.fillStyle = "#93a1bf"; g.font = "600 26px Inter, sans-serif"; g.fillText(label.toUpperCase(), x + 26, y + 165);
  });
  g.fillStyle = "#eef2fa"; g.font = "600 30px Inter, sans-serif";
  g.fillText(r.levelEnd > r.levelStart ? `Levelled up from ${r.levelStart} to ${r.levelEnd}` : `Level ${r.levelEnd}`, 70, 1060);
  if (r.topViewed) g.fillText(`Most viewed player: ${playersById.get(r.topViewed.pid).name}`, 70, 1110);
  g.fillStyle = "#93a1bf"; g.font = "500 24px Inter, sans-serif"; g.fillText("Real Israeli Premier League data, 2010-11 – 2026-27", 70, 1290);
  return c;
}

export function renderRecap(root, signal, params, query = {}) {
  const months = monthsWithActivity();
  let key = months.includes(query.m) ? query.m : months[0];
  const draw = () => {
    history.replaceState(history.state, "", `#/recap?m=${key}`);
    const r = recapFor(key);
    const total = Object.values(r.games).reduce((a, b) => a + b, 0);
    const tile = (v, label, ic) => `<div class="card recap-tile">${icon(ic, { size: 20 })}<b class="led">${v}</b><span>${label}</span></div>`;
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("calendar", { size: 30 })} Your month in the arcade</h1><p>A recap of everything you played, earned and explored.</p></div>
        <div class="row"><select id="month" class="input" aria-label="Month">${months.map((m) => `<option value="${m}" ${m === key ? "selected" : ""}>${monthName(m)}</option>`).join("")}</select>
          <button class="btn primary" id="share" ${total ? "" : "disabled"}>${icon("camera", { size: 16 })} Share image</button></div></div>
      <div class="card recap-hero">
        <div><small>MONTHLY RECAP</small><h2>${monthName(key)}</h2>
          <p class="muted">${total ? `${total} game${total === 1 ? "" : "s"} over ${r.days} day${r.days === 1 ? "" : "s"}. ${r.levelEnd > r.levelStart ? `You levelled up from <b>${r.levelStart}</b> to <b>${r.levelEnd}</b>!` : `You're level <b>${r.levelEnd}</b>.`}` : "No games played this month yet. Your recap fills up as you play."}</p></div>
        <div class="recap-xp"><b class="led">+${r.xp.toLocaleString()}</b><span>XP earned</span></div>
      </div>
      <div class="recap-grid">
        ${tile(r.games.draft, "Drafts", "trophy")}${tile(r.games.guess, "Guess games", "search")}${tile(r.games.hl, "Higher/Lower games", "chart")}${tile(r.games.career, "Career Path games", "arrowRight")}
        ${tile(r.bestDraft ?? "–", "Best draft score", "star")}${tile(r.guessWins, "Guess wins", "check")}${tile(r.bestHL ?? "–", "Best Higher/Lower", "flame")}${tile(r.bestCareer !== null ? `${r.bestCareer}/30` : "–", "Best Career Path", "medal")}
        ${tile(r.titles, "Simulated titles", "crown")}${tile(r.days, "Days active", "calendar")}
      </div>
      <div class="season-grid" style="margin-top:18px">
        <div class="card pad"><h3>${icon("flag")} Banners raised this month (${r.ach.length})</h3>
          ${r.ach.length ? `<div class="mini-banners">${r.ach.map((d) => bannerSvg(d, { width: 72 })).join("")}</div>` : `<p class="muted">No achievements this month yet.</p>`}
          <p class="muted" style="font-size:12px">${Object.entries(GAMES).filter(([, g]) => !g.soon).map(([k, g]) => `${g.name}: ${r.ach.filter((d) => d.game === k).length}`).join(" · ")}</p></div>
        <div class="card pad"><h3>${icon("eye")} Most viewed player</h3>
          ${r.topViewed ? `<div class="answer-card">${playerCard(bestSeason(careerSummary(r.topViewed.pid).records), { size: "sm" })}<div><b>${esc(playersById.get(r.topViewed.pid).name)}</b><p class="muted">Opened ${r.topViewed.n} time${r.topViewed.n === 1 ? "" : "s"} this month</p></div></div>` : `<p class="muted">Open player profiles to see your favourite here.</p>`}</div>
      </div>`;
    root.querySelector("#month").addEventListener("change", (e) => { key = e.target.value; draw(); }, { signal });
    root.querySelector("#share").addEventListener("click", async () => {
      const how = await shareOrDownload(drawShare(r), `winner-league-arcade-recap-${key}.png`);
      toast(how === "shared" ? "Shared!" : "Recap image downloaded");
    }, { signal });
  };
  draw();
}
