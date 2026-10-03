// Global search (Ctrl+K, "/" or the header button): players, clubs, seasons and pages in one box.
import { careerSummary, db, namedPlayers, teamName } from "../data.js";
import { esc } from "../ui.js";
import { crestSvg, icon } from "./icons.js";
import { closeModal, closeSilently, openModal } from "./modal.js";
import { openProfile } from "../profile.js";

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PAGES = [
  { label: "All-Time Draft", sub: "Game", href: "#/draft", ic: "trophy", words: "draft build team five" },
  { label: "Guess the Player", sub: "Game", href: "#/guess", ic: "search", words: "guess wordle mystery" },
  { label: "Higher or Lower", sub: "Game", href: "#/higher-lower", ic: "chart", words: "higher lower streak" },
  { label: "Career Path", sub: "Game", href: "#/career", ic: "arrowRight", words: "career path quiz journey" },
  { label: "Players", sub: "Browse all players", href: "#/players", ic: "players", words: "players browse filter" },
  { label: "Clubs", sub: "Browse all clubs", href: "#/clubs", ic: "shield", words: "clubs teams" },
  { label: "Seasons", sub: "Browse all seasons", href: "#/seasons", ic: "calendar", words: "seasons years leaders" },
  { label: "Compare players", sub: "Two careers side by side", href: "#/compare", ic: "users", words: "compare versus vs head to head" },
  { label: "Monthly recap", sub: "Your month in the arcade", href: "#/recap", ic: "calendar", words: "recap month summary stats wrapped" },
  { label: "Challenge a friend", sub: "Same game, one code", href: "#/challenge", ic: "users", words: "challenge friend code versus duel" },
  { label: "My Career", sub: "Create a player and play a whole career", href: "#/mycareer", ic: "jersey", words: "my career create player academy contract mvp hall of fame mycareer" },
  { label: "Connections", sub: "Four hidden groups of four players", href: "#/connections", ic: "link", words: "connections groups four puzzle" },
  { label: "The Grid", sub: "3×3 board of clubs and achievements", href: "#/grid", ic: "games", words: "grid immaculate 3x3 squares board" },
  { label: "Daily challenges", sub: "Four puzzles a day, keep your streak", href: "#/daily", ic: "calendar", words: "daily challenge streak today puzzle" },
  { label: "Today in the league", sub: "Birthdays and season flashbacks", href: "#/today", ic: "star", words: "today birthday born history flashback on this day" },
  { label: "All-time records", sub: "Career totals and single-season bests", href: "#/records", ic: "trophy", words: "records leaders all time most points career totals best season stats leaderboard" },
  { label: "Online 1v1", sub: "Play a real opponent", href: "#/online", ic: "globe", words: "online multiplayer 1v1 versus vs opponent friend invite duel live" },
  { label: "Achievements", sub: "Hall of Banners", href: "#/achievements", ic: "trophy", words: "achievements banners badges trophies awards" },
  { label: "Help center", sub: "Rules and explanations", href: "#/help", ic: "info", words: "help rules faq how rating chemistry" },
  { label: "Your profile", sub: "Nickname, avatar, records", href: "#/me", ic: "user", words: "me profile nickname avatar" },
  { label: "Home", sub: "Start page", href: "#/", ic: "home", words: "home start" },
];

let index = null;
function buildIndex() {
  if (index) return index;
  const players = namedPlayers.map((p) => {
    const cs = careerSummary(p.player_id);
    return { type: "player", id: p.player_id, label: p.name, key: norm(p.name), sub: `${teamName(cs.lastTeam)} · ${cs.firstSeason === cs.lastSeason ? cs.firstSeason : cs.firstSeason.slice(0, 4) + "–" + cs.lastSeason.slice(5)}`, games: cs.totalGames };
  });
  const clubs = db.teams.map((t) => {
    const names = [...new Set(db.season_teams.filter((s) => s.team_id === t.team_id).map((s) => s.team_name))];
    const seasons = db.season_teams.filter((x) => x.team_id === t.team_id).length;
    return { type: "club", id: t.team_id, label: t.canonical_name, key: norm([t.canonical_name, ...names].join(" | ")), sub: `${seasons} seasons · ${names.length} official name${names.length === 1 ? "" : "s"}`, seasons };
  });
  const seasons = db.metadata.season_list.map((s) => ({ type: "season", id: s, label: `Season ${s}`, key: norm(`${s} ${s.slice(0, 4)} ${"20" + s.slice(5)}`), sub: `${db.seasons.find((x) => x.season === s).teams.length} teams` }));
  const pages = PAGES.map((p) => ({ type: "page", ...p, key: norm(`${p.label} ${p.words}`) }));
  index = { players, clubs, seasons, pages };
  return index;
}

function score(item, q) {
  if (!q) return 0;
  if (item.key.startsWith(q)) return 3;
  if (item.key.split(/[\s|]+/).some((w) => w.startsWith(q))) return 2;
  return item.key.includes(q) ? 1 : 0;
}

function results(q) {
  const ix = buildIndex();
  const nq = norm(q.trim());
  if (!nq) return [{ title: "Go to", items: ix.pages.slice(0, 7) }];
  const pick = (list, n, tiebreak) => list.map((it) => [score(it, nq), it]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || (tiebreak ? tiebreak(a[1], b[1]) : 0)).slice(0, n).map(([, it]) => it);
  return [
    { title: "Players", items: pick(ix.players, 7, (a, b) => b.games - a.games) },
    { title: "Clubs", items: pick(ix.clubs, 6, (a, b) => b.seasons - a.seasons) },
    { title: "Seasons", items: pick(ix.seasons, 3) },
    { title: "Pages", items: pick(ix.pages, 4) },
  ].filter((g) => g.items.length);
}

function itemIcon(it) {
  if (it.type === "club") return crestSvg(it.id, it.label, 28);
  if (it.type === "player") return `<span class="sr-ic">${icon("user", { size: 16 })}</span>`;
  if (it.type === "season") return `<span class="sr-ic">${icon("calendar", { size: 16 })}</span>`;
  return `<span class="sr-ic">${icon(it.ic, { size: 16 })}</span>`;
}

let dialog = null;
export function openSearch() {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "search-modal";
    dialog.setAttribute("aria-label", "Search");
    dialog.innerHTML = `<div class="sm-head">${icon("search", { size: 20 })}
        <input id="gs-input" type="search" placeholder="Search players, clubs, seasons, pages…" autocomplete="off" aria-label="Search" aria-controls="gs-results" aria-autocomplete="list">
        <kbd>Esc</kbd></div>
      <div id="gs-results" class="sm-results" role="listbox" aria-label="Search results" tabindex="0"></div>
      <div class="sm-foot muted"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> anywhere</span></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (e) => { if (e.target === dialog) closeModal(dialog); });
    const input = dialog.querySelector("#gs-input");
    const box = dialog.querySelector("#gs-results");
    let flat = [], active = 0;
    const render = () => {
      const groups = results(input.value);
      flat = groups.flatMap((g) => g.items);
      active = Math.min(active, Math.max(0, flat.length - 1));
      let i = 0;
      box.innerHTML = flat.length ? groups.map((g) => `<div class="sr-group">${esc(g.title)}</div>${g.items.map((it) => {
        const idx = i++;
        return `<div class="sr-item ${idx === active ? "on" : ""}" role="option" aria-selected="${idx === active}" data-i="${idx}">${itemIcon(it)}<span class="sr-main"><b>${esc(it.label)}</b><small>${esc(it.sub || "")}</small></span>${icon("arrowRight", { size: 14, cls: "sr-go" })}</div>`;
      }).join("")}`).join("") : `<div class="empty-state">${icon("search", { size: 28 })}<b>No results for “${esc(input.value)}”</b></div>`;
      box.querySelector(".sr-item.on")?.scrollIntoView({ block: "nearest" });
    };
    const go = (it) => {
      if (!it) return;
      // leave the dialog without stepping history back, then reuse its history entry
      closeSilently(dialog);
      if (it.type === "player") { openProfile(it.id, { reuseEntry: true }); return; }
      const hash = it.type === "club" ? `#/club/${it.id}` : it.type === "season" ? `#/season/${it.id}` : it.href;
      location.replace(hash);
    };
    input.addEventListener("input", () => { active = 0; render(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { active = Math.min(flat.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === "Enter") { go(flat[active]); e.preventDefault(); }
    });
    box.addEventListener("click", (e) => { const el = e.target.closest("[data-i]"); if (el) go(flat[Number(el.dataset.i)]); });
    dialog._render = render;
  }
  const input = dialog.querySelector("#gs-input");
  input.value = "";
  dialog._render();
  openModal(dialog);
  input.focus();
}

