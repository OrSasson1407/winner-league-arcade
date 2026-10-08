// Hash router + app chrome (logo, nav, mobile tab bar, settings, pause-animations, profile button).
import { openProfile } from "./profile.js";
import { initSocial } from "./online/social.js";
import { initInstall, maybeSuggestInstall } from "./lib/install.js";
import { initA11y, pageChanged } from "./lib/a11y.js";
import { closeCardView, initCardView } from "./lib/cardView.js";
import { retroSync } from "./lib/achievements.js";
import { closeSilently } from "./lib/modal.js";
import { openSearch } from "./lib/search.js";
import { initShortcuts, openShortcuts } from "./lib/shortcuts.js";
import { applySettings, getSettings, initSettingsButton, reducedMotion } from "./lib/settings.js";
import { icon, logoSvg, crestsReady } from "./lib/icons.js";
import { avatarHtml, getMe } from "./lib/me.js";
import { levelInfo } from "./lib/progress.js";
import { esc, store, storeReady, toast } from "./ui.js";
import { crumbsFor, renderCrumbs, showError, skeletonHtml, undoToast } from "./lib/ux.js";
import { openFeedback } from "./lib/feedback.js";
import { openOnboarding, shouldOnboard } from "./lib/onboarding.js";
import { initReminders } from "./lib/notify.js";
import { initTour } from "./lib/tutorial.js";
import { getLang, startHebrew } from "./i18n/index.js";
import { coins, equipped } from "./lib/wallet.js";
import { LEAGUES, activeLeague, gameAvailable, setLeague } from "./leagueChoice.js";

// Hebrew: the dictionary is in before the first screen draws (the page direction is set in index.html)
const langReady = getLang() === "he" ? startHebrew().catch((e) => console.error("Hebrew", e)) : Promise.resolve();

// Each page's code loads when it's first needed (and ahead of time when you point at a link to it).
const lazy = (load, name) => () => load().then((m) => m[name]);
const routes = {
  "": lazy(() => import("./home.js"), "renderHome"),
  games: lazy(() => import("./home.js"), "renderGames"),
  draft: lazy(() => import("./games/draft.js"), "renderDraft"),
  guess: lazy(() => import("./games/guess.js"), "renderGuess"),
  "higher-lower": lazy(() => import("./games/higherlower.js"), "renderHigherLower"),
  career: lazy(() => import("./games/career.js"), "renderCareer"),
  player: lazy(() => import("./profile.js"), "renderProfilePage"),
  players: lazy(() => import("./pages/players.js"), "renderPlayers"),
  clubs: lazy(() => import("./pages/clubs.js"), "renderClubs"),
  club: lazy(() => import("./pages/clubs.js"), "renderClub"),
  seasons: lazy(() => import("./pages/seasons.js"), "renderSeasons"),
  season: lazy(() => import("./pages/seasons.js"), "renderSeason"),
  me: lazy(() => import("./pages/me.js"), "renderMe"),
  help: lazy(() => import("./pages/help.js"), "renderHelp"),
  achievements: lazy(() => import("./pages/achievements.js"), "renderAchievements"),
  compare: lazy(() => import("./pages/compare.js"), "renderCompare"),
  recap: lazy(() => import("./pages/recap.js"), "renderRecap"),
  challenge: lazy(() => import("./pages/challenge.js"), "renderChallenge"),
  online: lazy(() => import("./pages/online.js"), "renderOnline"),
  today: lazy(() => import("./pages/today.js"), "renderToday"),
  connections: lazy(() => import("./games/connections.js"), "renderConnections"),
  grid: lazy(() => import("./games/grid.js"), "renderGrid"),
  mycareer: lazy(() => import("./pages/mycareer.js"), "renderMyCareer"),
  records: lazy(() => import("./pages/records.js"), "renderRecords"),
  daily: lazy(() => import("./pages/daily.js"), "renderDaily"),
  u: lazy(() => import("./pages/publicProfile.js"), "renderPublicProfile"),
  about: lazy(() => import("./pages/about.js"), "renderAbout"),
  privacy: lazy(() => import("./pages/legal.js"), "renderPrivacy"),
  terms: lazy(() => import("./pages/legal.js"), "renderTerms"),
  accessibility: lazy(() => import("./pages/legal.js"), "renderAccessibility"),
  licenses: lazy(() => import("./pages/legal.js"), "renderLicenses"),
  euroleague: lazy(() => import("./pages/euroleague.js"), "renderEuroleague"),
  matchup: lazy(() => import("./games/matchup.js"), "renderMatchup"),
  shop: lazy(() => import("./pages/shop.js"), "renderShop"),
  op: lazy(() => import("./pages/onlineProfile.js"), "renderOnlineProfile"),
  find: lazy(() => import("./pages/find.js"), "renderFind"),
  nt: lazy(() => import("./pages/national.js"), "renderNational"),
  quick: lazy(() => import("./pages/quick.js"), "renderQuick"),
};
const loaded = new Map(); // key -> render function, once its module is in
function loadRoute(key) {
  if (!routes[key]) return Promise.resolve(null);
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  return routes[key]().then((fn) => { loaded.set(key, fn); return fn; });
}
const keyOf = (hash) => (hash.replace(/^#\/?/, "").split("?")[0].split("/")[0] || "");
/** Warm up a page's code before the click: on hover, focus or touch of a link to it. */
function prefetch(e) {
  const a = e.target.closest?.("a[href^='#/']");
  if (a) loadRoute(keyOf(a.getAttribute("href"))).catch(() => {});
}
for (const ev of ["pointerover", "focusin", "touchstart"]) document.addEventListener(ev, prefetch, { passive: true });
const GAME_ROUTES = new Set(["draft", "guess", "higher-lower", "career", "connections", "grid", "mycareer", "matchup"]);
// which top-level section each route belongs to (for nav highlighting)
const SECTION = { "": "home", games: "games", draft: "games", guess: "games", "higher-lower": "games", career: "games",
  players: "players", player: "players", clubs: "clubs", club: "clubs", seasons: "seasons", season: "seasons", me: "me", help: "help", achievements: "achievements", compare: "players", recap: "me", challenge: "games", online: "online", today: "home", connections: "games", grid: "games", mycareer: "games", records: "players", daily: "games", u: "me", about: "home", privacy: "home", terms: "home", accessibility: "home", licenses: "home", shop: "me", op: "online", find: "players", quick: "games", nt: "clubs", euroleague: "clubs", matchup: "games" };

const TABS = [["home", "#/", "home", "Home"], ["games", "#/games", "games", "Games"], ["players", "#/players", "players", "Players"], ["online", "#/online", "globe", "Online"],
  ["clubs", "#/clubs", "shield", "Clubs"], ["me", "#/me", "user", "Me"]];

let controller = null;

// The saved game behind each screen: if a save is what breaks a screen, it can be set aside (and brought back).
const ROUTE_SAVES = { draft: ["draft:save"], mycareer: ["mc:save"], career: ["career:save"], "higher-lower": ["hl:save"], connections: ["conn:free"],
  grid: ["grid:free"], guess: ["guess:free"], matchup: ["matchup"] };
const savesOf = (key) => (ROUTE_SAVES[key] || []).filter((k) => store.get(k) !== null);
function setAside(keys) {
  const kept = Object.fromEntries(keys.map((k) => [k, store.get(k)]));
  keys.forEach((k) => { store.set("trash:" + k, kept[k]); store.remove(k); });
  return () => { for (const [k, v] of Object.entries(kept)) { store.set(k, v); store.remove("trash:" + k); } };
}

/** Friendly error / not-found screen with "Try again" (and, when a saved game may be the cause, "Start fresh"). */
function problemScreen(view, { title, message, detail = "", key = null }) {
  const saves = key === null ? [] : savesOf(key);
  view.innerHTML = `<div class="card center-card problem">
    <div class="cf-icon danger">${icon("x", { size: 30 })}</div>
    <h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
    ${saves.length ? `<p class="muted" style="font-size:13px">Still broken after trying again? Your saved game on this screen may be the cause. "Start fresh" puts it aside (you can bring it back).</p>` : ""}
    ${detail ? `<details class="muted"><summary>Technical details</summary><code>${esc(detail)}</code></details>` : ""}
    <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" id="retry">${icon("refresh", { size: 16 })} Try again</button>
      ${saves.length ? `<button class="btn" id="fresh">${icon("play", { size: 16 })} Start fresh</button>` : ""}<a class="btn ghost" href="#/">${icon("home", { size: 16 })} Home</a>
      <button class="btn ghost" id="report">${icon("bug", { size: 16 })} Report this</button></div>
  </div>`;
  view.querySelector("#retry").addEventListener("click", () => route());
  view.querySelector("#fresh")?.addEventListener("click", () => {
    const undo = setAside(saves);
    route();
    undoToast("Saved game put aside", () => { undo(); route(); }, { ms: 10000 });
  });
  view.querySelector("#report").addEventListener("click", () => openFeedback({ kind: "bug", detail: `${title}: ${detail}`.slice(0, 600) }));
}

// Page transitions (View Transitions API where available): pages cross-fade, and the title of the
// tile you clicked flies into the next page's heading.
let morphFrom = null, firstPaint = true, vtActive = false;
const MORPH_LINKS = ".game-card, .daily-card, .daily-home, .club-tile, .season-tile, .ch-game, .lb-link";
document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[href^='#/']");
  morphFrom = a && a.matches(MORPH_LINKS) ? a.querySelector("h1, h2, h3, b") || a : null;
}, true);

function route() {
  const motionOk = !firstPaint && document.startViewTransition && !reducedMotion() && !document.hidden;
  firstPaint = false;
  if (!motionOk) { morphFrom = null; return void renderRoute(); }
  const from = morphFrom && document.contains(morphFrom) ? morphFrom : null;
  morphFrom = null;
  if (from) from.style.viewTransitionName = "page-title";
  const t = document.startViewTransition(async () => {
    if (from) from.style.viewTransitionName = "";
    vtActive = true;
    try { await renderRoute(); } finally { vtActive = false; }
    const h1 = document.querySelector("#view h1");
    if (from && h1) h1.style.viewTransitionName = "page-title";
  });
  // a skipped transition (tab hidden, another navigation) rejects these promises: that's fine
  t.ready.catch(() => {});
  t.updateCallbackDone.catch((err) => console.error(err));
  t.finished.catch(() => {}).finally(() => { const h1 = document.querySelector("#view h1"); if (h1) h1.style.viewTransitionName = ""; });
}

let navSeq = 0, navAt = 0, navKey = "";
async function renderRoute() {
  const [path, qs = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [key = "", ...params] = path.split("/");
  const query = Object.fromEntries(new URLSearchParams(qs));
  // the EuroLeague choice: its numbers and most personal details are placeholders, so the stats pages lead
  // to the EuroLeague pages (rosters, clubs and seasons). Players and records handle it themselves.
  const elPage = activeLeague() === "el" && { clubs: "euroleague", seasons: "euroleague", today: "euroleague", compare: "euroleague", find: "players",
    club: params[0] ? `euroleague/club/${params[0]}` : "euroleague", season: params[0] ? `euroleague/season/${params[0]}` : "euroleague" }[key];
  if (elPage) return void location.replace(`#/${elPage}`);
  const view = document.getElementById("view");
  const seq = ++navSeq;
  navAt = Date.now(); navKey = key;
  controller?.abort(); // drop listeners/timers of the previous screen
  controller = new AbortController();
  document.querySelectorAll("dialog[open]").forEach(closeSilently); // page change: don't touch history
  renderCrumbs(document.getElementById("crumbs"), crumbsFor(key, params.map(decodeURIComponent)));
  let render = loaded.get(key);
  if (!render && routes[key]) {
    // first visit to this page: a skeleton shaped like it while its code arrives
    const slow = setTimeout(() => { if (seq === navSeq) { view.innerHTML = skeletonHtml(key); view.setAttribute("aria-busy", "true"); } }, 120);
    try { render = await loadRoute(key); } catch (err) {
      clearTimeout(slow);
      if (seq !== navSeq) return;
      view.removeAttribute("aria-busy");
      console.error(err);
      problemScreen(view, navigator.onLine
        ? { title: "This page didn't load", message: "Part of the arcade failed to download. Check your connection and try again.", detail: String(err?.message || err) }
        : { title: "You're offline", message: "This page hasn't been saved for offline play yet. Connect and try again.", detail: "" });
      return;
    }
    clearTimeout(slow);
    if (seq !== navSeq) return; // you already moved on
    view.removeAttribute("aria-busy");
  }
  view.innerHTML = "";
  view.classList.remove("enter");
  if (!vtActive) { void view.offsetWidth; view.classList.add("enter"); } // the view transition animates instead
  try {
    if (!render) problemScreen(view, { title: "Page not found", message: "This link doesn't match any page in the arcade." });
    else if (!gameAvailable(key)) leagueBlocked(view, key); // e.g. a stats game while the arcade is set to the EuroLeague
    else render(view, controller.signal, params.map(decodeURIComponent), query);
    pageChanged(view);
    initTour(key, view);
  } catch (err) {
    console.error(err);
    problemScreen(view, { title: "Something went wrong", message: "This page hit an unexpected error. Trying again usually fixes it.", detail: String(err?.stack || err), key });
  }
  if (GAME_ROUTES.has(key)) store.set("last:route", key);
  const section = SECTION[key] ?? "";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === section;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

/** A game that needs real stats, while the arcade is set to a league without them (the EuroLeague). */
function leagueBlocked(view, key) {
  const ok = Object.keys(LEAGUES).filter((l) => gameAvailable(key, l));
  view.innerHTML = `<div class="card pad empty-state league-blocked">${icon("chart", { size: 30 })}
    <b>This game isn't available in ${esc(LEAGUES[activeLeague()].name)} mode</b>
    <p class="muted">It's built on statistics, and the EuroLeague numbers in the arcade aren't real yet. Career Path, Connections and The Grid work on EuroLeague clubs and careers.</p>
    <div class="row" style="justify-content:center;flex-wrap:wrap">${ok.map((l) => `<button class="btn ${l === "wl" ? "primary" : ""}" data-league="${l}">Play it in ${esc(LEAGUES[l].name)}</button>`).join("")}
      <a class="btn ghost" href="#/games">${icon("games", { size: 15 })} Other games</a></div></div>`;
  view.querySelectorAll("[data-league]").forEach((b) => b.addEventListener("click", () => setLeague(b.dataset.league)));
}

// errors after a page has rendered (clicks, timers): tell the player instead of failing silently.
// Only the broken screen is affected: if it never finished drawing, it shows its own error screen;
// otherwise a banner offers to redraw just this screen (games keep their progress in their saves).
const IGNORE = /ResizeObserver loop|Script error\.?$|Transition was skipped|AbortError/;
function screenError(detail) {
  const view = document.getElementById("view");
  const blank = view.getAttribute("aria-busy") === "true" || !view.querySelector("button, a[href], input, select"); // nothing to use: empty or placeholders
  if (blank && Date.now() - navAt < 15000) {
    view.removeAttribute("aria-busy");
    return problemScreen(view, { title: "This screen didn't load", message: "It hit an unexpected error while drawing. Trying again usually fixes it.", detail, key: navKey });
  }
  showError(detail, { retry: () => route() });
}
window.addEventListener("error", (e) => { if (e.message && !IGNORE.test(e.message)) screenError(`${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`); });
window.addEventListener("unhandledrejection", (e) => { const m = String(e.reason?.message || e.reason || ""); if (!IGNORE.test(m) && e.reason?.name !== "AbortError") screenError(m); });
document.addEventListener("storage-full", () => toast("This device's storage is full: free up some space so your progress keeps saving"));

// ---------- chrome
document.getElementById("logo-slot").innerHTML = logoSvg(40);
document.getElementById("tabbar").innerHTML = TABS.map(([nav, href, ic, label]) =>
  `<a href="${href}" data-nav="${nav}">${icon(ic, { size: 22 })}<span>${label}</span></a>`).join("");
document.getElementById("settings-btn").innerHTML = icon("settings", { size: 20 });
const searchBtn = document.getElementById("search-btn");
searchBtn.innerHTML = icon("search", { size: 20 });
searchBtn.addEventListener("click", openSearch);
window.__wlaRoutes = Object.values(routes); // for the installed app's offline warm-up
document.addEventListener("game-played", () => maybeSuggestInstall(store.keys().filter((k) => k.startsWith("plays:")).reduce((a, k) => a + store.get(k, 0), 0)));
const quickBtn = document.getElementById("quick-btn");
quickBtn.innerHTML = icon("dice", { size: 20 });
const helpBtn = document.getElementById("help-btn");
helpBtn.innerHTML = icon("info", { size: 20 });
initShortcuts({ openSearch });
document.getElementById("shortcuts-link")?.addEventListener("click", (e) => { e.preventDefault(); openShortcuts(); });

// Buckets in the header: the balance, and a short "+12" when you earn some
const coinPill = document.getElementById("coin-pill");
const drawCoins = () => { coinPill.innerHTML = `<span aria-hidden="true">🏀</span><b>${coins().toLocaleString("en-US")}</b>`; coinPill.setAttribute("aria-label", `Shop: ${coins()} Buckets`); };
document.addEventListener("wallet-changed", drawCoins);
document.addEventListener("coins-earned", (e) => {
  const fly = document.createElement("span");
  fly.className = "coin-fly"; fly.setAttribute("aria-hidden", "true");
  fly.textContent = `+${e.detail.amount}`;
  coinPill.appendChild(fly);
  setTimeout(() => fly.remove(), 1400);
});
drawCoins();
// the court style bought in the shop, for every live game
const drawCourt = () => { const c = equipped("court"); if (c) document.documentElement.dataset.court = c.split(":")[1]; else delete document.documentElement.dataset.court; };
document.addEventListener("wallet-changed", drawCourt);
drawCourt();

const meBtn = document.getElementById("me-btn");
const drawMe = () => {
  const me = getMe(), lv = levelInfo();
  meBtn.innerHTML = `${avatarHtml(me, 34)}<span class="lv-chip" aria-hidden="true">${lv.level}</span><span class="lv-ring" style="--p:${Math.round(lv.pct * 100)}"></span>`;
  meBtn.title = `${me.nickname || "Your profile"} · Level ${lv.level} ${lv.title} (${lv.into}/${lv.need} XP)`;
  meBtn.setAttribute("aria-label", `Your profile, level ${lv.level}`);
};
document.addEventListener("me-changed", drawMe);
document.addEventListener("xp-changed", drawMe);
drawMe();

// one tap to pause / resume every animation (stored as the "Animations" setting)
const motionBtn = document.getElementById("motion-btn");
const drawMotion = () => {
  const paused = getSettings().motion === "reduced";
  motionBtn.innerHTML = icon(paused ? "motionOn" : "motionOff", { size: 20 });
  motionBtn.setAttribute("aria-pressed", String(paused));
  motionBtn.setAttribute("aria-label", paused ? "Resume animations" : "Pause all animations");
  motionBtn.title = paused ? "Animations paused: click to resume" : "Pause all animations";
};
motionBtn.addEventListener("click", () => {
  const paused = getSettings().motion === "reduced";
  const s = { ...getSettings(), motion: paused ? (store.get("motion:prev") || "system") : "reduced" };
  if (!paused) store.set("motion:prev", getSettings().motion);
  store.set("settings", s);
  applySettings(s);
  drawMotion();
  toast(paused ? "Animations on" : "All animations paused");
});
document.addEventListener("settings-changed", drawMotion);
drawMotion();

// Any element with data-profile opens that player's profile (without leaving the current page).
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-profile]");
  if (!t) return;
  e.preventDefault();
  e.stopPropagation();
  closeCardView();
  openProfile(t.dataset.profile);
}, true);

applySettings();
retroSync(); // unlock achievements already earned by existing records
initSocial(); // online presence + friend invites anywhere in the arcade
initInstall(); // installable app + offline play
initA11y(); // screen reader announcements, heading order, keyboard access
initCardView(); // press and hold a player card for the big view
initSettingsButton(document.getElementById("settings-btn"));
initReminders(); // opt-in daily reminder
// new units: redraw pages that show them (not a game in progress, which would lose its state)
document.addEventListener("units-changed", () => { const k = keyOf(location.hash); if (!GAME_ROUTES.has(k) || k === "mycareer") renderRoute(); });
// saved games in IndexedDB are read before the first screen draws
Promise.allSettled([storeReady, langReady, crestsReady]).then(() => { window.addEventListener("hashchange", route); route(); });
document.getElementById("fb-link")?.addEventListener("click", (e) => { e.preventDefault(); openFeedback(); });
// installed app: the splash screen fades once the first page is up
const splash = document.getElementById("splash");
if (splash) setTimeout(() => { splash.classList.add("out"); setTimeout(() => splash.remove(), 500); }, Math.max(0, 900 - performance.now()));
// first visit: a short welcome (only from the home or games page, never over a shared link)
storeReady.finally(() => { if (shouldOnboard() && ["", "games"].includes(keyOf(location.hash))) setTimeout(openOnboarding, 700); });
// after the first page, fetch the other pages' code in the background so they open instantly (and offline)
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
setTimeout(() => idle(() => Object.keys(routes).forEach((k) => loadRoute(k).catch(() => {}))), 2500);
