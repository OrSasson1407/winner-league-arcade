// Hash router + app chrome (logo, nav, mobile tab bar, settings, pause-animations, profile button).
import { renderGames, renderHome } from "./home.js";
import { renderDraft } from "./games/draft.js";
import { renderGuess } from "./games/guess.js";
import { renderHigherLower } from "./games/higherlower.js";
import { renderCareer } from "./games/career.js";
import { openProfile, renderProfilePage } from "./profile.js";
import { renderPlayers } from "./pages/players.js";
import { renderClub, renderClubs } from "./pages/clubs.js";
import { renderSeason, renderSeasons } from "./pages/seasons.js";
import { renderMe } from "./pages/me.js";
import { renderHelp } from "./pages/help.js";
import { renderAchievements } from "./pages/achievements.js";
import { renderCompare } from "./pages/compare.js";
import { renderRecap } from "./pages/recap.js";
import { renderChallenge } from "./pages/challenge.js";
import { renderOnline } from "./pages/online.js";
import { renderToday } from "./pages/today.js";
import { renderRecords } from "./pages/records.js";
import { renderDaily } from "./pages/daily.js";
import { renderPublicProfile } from "./pages/publicProfile.js";
import { initSocial } from "./online/social.js";
import { initInstall } from "./lib/install.js";
import { retroSync } from "./lib/achievements.js";
import { closeSilently } from "./lib/modal.js";
import { openSearch } from "./lib/search.js";
import { initShortcuts, openShortcuts } from "./lib/shortcuts.js";
import { applySettings, getSettings, initSettingsButton } from "./lib/settings.js";
import { icon, logoSvg } from "./lib/icons.js";
import { avatarHtml, getMe } from "./lib/me.js";
import { levelInfo } from "./lib/progress.js";
import { esc, store, toast } from "./ui.js";

const routes = {
  "": renderHome,
  games: renderGames,
  draft: renderDraft,
  guess: renderGuess,
  "higher-lower": renderHigherLower,
  career: renderCareer,
  player: renderProfilePage,
  players: renderPlayers,
  clubs: renderClubs,
  club: renderClub,
  seasons: renderSeasons,
  season: renderSeason,
  me: renderMe,
  help: renderHelp,
  achievements: renderAchievements,
  compare: renderCompare,
  recap: renderRecap,
  challenge: renderChallenge,
  online: renderOnline,
  today: renderToday,
  records: renderRecords,
  daily: renderDaily,
  u: renderPublicProfile,
};
const GAME_ROUTES = new Set(["draft", "guess", "higher-lower", "career"]);
// which top-level section each route belongs to (for nav highlighting)
const SECTION = { "": "home", games: "games", draft: "games", guess: "games", "higher-lower": "games", career: "games",
  players: "players", player: "players", clubs: "clubs", club: "clubs", seasons: "seasons", season: "seasons", me: "me", help: "help", achievements: "achievements", compare: "players", recap: "me", challenge: "games", online: "online", today: "home", records: "players", daily: "games", u: "me" };

const TABS = [["home", "#/", "home", "Home"], ["games", "#/games", "games", "Games"], ["players", "#/players", "players", "Players"], ["online", "#/online", "globe", "Online"],
  ["clubs", "#/clubs", "shield", "Clubs"], ["me", "#/me", "user", "Me"]];

let controller = null;

/** Friendly error / not-found screen with "Try again". */
function problemScreen(view, { title, message, detail = "" }) {
  view.innerHTML = `<div class="card center-card problem">
    <div class="cf-icon danger">${icon("x", { size: 30 })}</div>
    <h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
    ${detail ? `<details class="muted"><summary>Technical details</summary><code>${esc(detail)}</code></details>` : ""}
    <div class="row" style="justify-content:center"><button class="btn primary" id="retry">${icon("refresh", { size: 16 })} Try again</button><a class="btn ghost" href="#/">${icon("home", { size: 16 })} Home</a></div>
  </div>`;
  view.querySelector("#retry").addEventListener("click", () => route());
}

function route() {
  const [path, qs = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [key = "", ...params] = path.split("/");
  const query = Object.fromEntries(new URLSearchParams(qs));
  const view = document.getElementById("view");
  controller?.abort(); // drop listeners/timers of the previous screen
  controller = new AbortController();
  document.querySelectorAll("dialog[open]").forEach(closeSilently); // page change: don't touch history
  view.innerHTML = "";
  view.classList.remove("enter");
  void view.offsetWidth;
  view.classList.add("enter");
  const render = routes[key];
  try {
    if (!render) problemScreen(view, { title: "Page not found", message: "This link doesn't match any page in the arcade." });
    else render(view, controller.signal, params.map(decodeURIComponent), query);
  } catch (err) {
    console.error(err);
    problemScreen(view, { title: "Something went wrong", message: "This page hit an unexpected error. Trying again usually fixes it.", detail: String(err?.stack || err) });
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

// errors after a page has rendered (clicks, timers): tell the player instead of failing silently
window.addEventListener("error", (e) => { if (e.message) toast("Something went wrong. Try again or reload the page."); });
window.addEventListener("unhandledrejection", () => toast("Something went wrong. Try again or reload the page."));

// ---------- chrome
document.getElementById("logo-slot").innerHTML = logoSvg(40);
document.getElementById("tabbar").innerHTML = TABS.map(([nav, href, ic, label]) =>
  `<a href="${href}" data-nav="${nav}">${icon(ic, { size: 22 })}<span>${label}</span></a>`).join("");
document.getElementById("settings-btn").innerHTML = icon("settings", { size: 20 });
const searchBtn = document.getElementById("search-btn");
searchBtn.innerHTML = icon("search", { size: 20 });
searchBtn.addEventListener("click", openSearch);
const helpBtn = document.getElementById("help-btn");
helpBtn.innerHTML = icon("info", { size: 20 });
initShortcuts({ openSearch });
document.getElementById("shortcuts-link")?.addEventListener("click", (e) => { e.preventDefault(); openShortcuts(); });

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
  openProfile(t.dataset.profile);
}, true);

applySettings();
retroSync(); // unlock achievements already earned by existing records
initSocial(); // online presence + friend invites anywhere in the arcade
initInstall(); // installable app + offline play
initSettingsButton(document.getElementById("settings-btn"));
window.addEventListener("hashchange", route);
route();
