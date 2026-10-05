// App-wide UX pieces: Undo toasts, the friendly error banner, breadcrumbs and route skeletons.
import { db, playersById, teamName } from "../data.js";
import { esc } from "../ui.js";
import { icon } from "./icons.js";
import { announce } from "./a11y.js";
import { openFeedback } from "./feedback.js";

// ---------------------------------------------------------------- undo
let undoEl = null, undoTimer = 0;
/** Do something destructive right away, and offer "Undo" for a few seconds instead of asking first. */
export function undoToast(message, onUndo, { ms = 6000 } = {}) {
  undoEl?.remove(); clearTimeout(undoTimer);
  const el = document.createElement("div");
  el.className = "undo-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>${esc(message)}</span><button class="btn sm">${icon("refresh", { size: 14 })} Undo</button><i class="undo-bar" style="--ms:${ms}ms"></i>`;
  document.body.appendChild(el);
  undoEl = el;
  const done = () => { el.classList.add("out"); setTimeout(() => el.remove(), 250); if (undoEl === el) undoEl = null; };
  el.querySelector("button").addEventListener("click", () => { clearTimeout(undoTimer); done(); onUndo(); announce("Undone."); });
  undoTimer = setTimeout(done, ms);
  announce(`${message}. Undo is available for a few seconds.`);
}

// ---------------------------------------------------------------- error banner
let errEl = null, lastErr = 0;
/** Friendly "something went wrong" with Try again / Reload / Report (instead of a silent failure). */
export function showError(detail = "", { retry = null } = {}) {
  if (Date.now() - lastErr < 4000 && errEl?.isConnected) return;
  lastErr = Date.now();
  errEl?.remove();
  const el = document.createElement("div");
  el.className = "err-banner";
  el.setAttribute("role", "alert");
  const offline = !navigator.onLine;
  el.innerHTML = `<span class="err-ic" aria-hidden="true">${icon("x", { size: 18 })}</span>
    <div><b>${offline ? "You're offline" : "Something went wrong"}</b><p>${offline ? "This needs a connection. Single-player games still work." : "That didn't work as it should. Trying again usually fixes it."}</p></div>
    <div class="err-actions">${retry ? `<button class="btn sm primary" data-a="retry">${icon("refresh", { size: 14 })} Try again</button>` : `<button class="btn sm primary" data-a="reload">${icon("refresh", { size: 14 })} Reload</button>`}
      <button class="btn sm" data-a="report">${icon("bug", { size: 14 })} Report</button><button class="icon-btn" data-a="close" aria-label="Dismiss">${icon("close", { size: 16 })}</button></div>`;
  document.body.appendChild(el);
  errEl = el;
  const close = () => el.remove();
  el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "close") close();
    if (a === "reload") location.reload();
    if (a === "retry") { close(); retry(); }
    if (a === "report") { close(); openFeedback({ kind: "bug", detail: String(detail).slice(0, 600) }); }
  });
  setTimeout(() => { if (el.isConnected && !el.matches(":focus-within, :hover")) close(); }, 12000);
}

// ---------------------------------------------------------------- breadcrumbs
const GAME_NAMES = { draft: "All-Time Draft", guess: "Guess the Player", "higher-lower": "Higher or Lower", career: "Career Path", connections: "Connections",
  grid: "The Grid", mycareer: "My Career", daily: "Daily challenges", challenge: "Challenge a friend", matchup: "Single game" };
/** Trail for a route, or null for top-level pages. Each item: [label, href|null]. */
export function crumbsFor(key, params = []) {
  const home = ["Home", "#/"];
  if (GAME_NAMES[key]) return [home, ["Games", "#/games"], [GAME_NAMES[key], null]];
  if (key === "player") return [home, ["Players", "#/players"], [playersById.get(params[0])?.name || "Player", null]];
  if (key === "compare") return [home, ["Players", "#/players"], ["Compare", null]];
  if (key === "records") return [home, ["Players", "#/players"], ["Records", null]];
  if (key === "club") return [home, ["Clubs", "#/clubs"], [teamName(params[0]), null]];
  if (key === "season") return [home, ["Seasons", "#/seasons"], [params[0] || "Season", null]];
  if (key === "recap") return [home, ["Me", "#/me"], ["Monthly recap", null]];
  if (key === "u") return [home, ["Online", "#/online"], ["Player card", null]];
  if (key === "today") return [home, ["Today in the league", null]];
  if (key === "help") return [home, ["Help center", null]];
  if (key === "about") return [home, ["About", null]];
  if (key === "privacy") return [home, ["About", "#/about"], ["Privacy", null]];
  if (key === "euroleague") {
    const el = ["EuroLeague", "#/euroleague"];
    if (!params[0]) return [home, ["EuroLeague", null]];
    if (params[0] === "season") return [home, el, [params[1] || "Season", null]];
    if (params[0] === "club") return [home, el, [teamName(params[1]), null]];
    if (params[0] === "player") return [home, el, [playersById.get(params[1])?.name || "Player", null]];
  }
  return null;
}
export function renderCrumbs(el, trail) {
  el.hidden = !trail;
  document.body.classList.toggle("has-crumbs", !!trail);
  if (!trail) { el.innerHTML = ""; return; }
  el.innerHTML = `<ol>${trail.map(([l, h], i) => `<li>${h && i < trail.length - 1 ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`}</li>`).join("")}</ol>`;
}

// ---------------------------------------------------------------- skeletons
/** Placeholder shaped like the page that's loading. */
export function skeletonHtml(key) {
  const line = (w) => `<span class="sk sk-line" style="width:${w}%"></span>`;
  const card = (h = 120) => `<div class="card pad sk-card"><span class="sk sk-title"></span>${line(90)}${line(70)}<span class="sk" style="height:${h}px;margin-top:10px"></span></div>`;
  const head = `<div class="sk-head"><span class="sk sk-h1"></span>${line(60)}</div>`;
  if (["", "games"].includes(key)) return `<div class="sk-wrap" aria-hidden="true">${head}<div class="sk-grid">${Array.from({ length: 6 }, () => card(90)).join("")}</div></div>`;
  if (["players", "clubs", "seasons", "records"].includes(key)) return `<div class="sk-wrap" aria-hidden="true">${head}<div class="card pad">${skeletonRows(8)}</div></div>`;
  // shaped like the page that is coming: a hero band, a board of tiles, a profile with a table
  if (["player", "club", "season", "euroleague", "u"].includes(key)) return `<div class="sk-wrap" aria-hidden="true"><div class="card pad sk-hero"><span class="sk sk-avatar"></span><div class="sk-head" style="flex:1">${line(50)}${line(30)}${line(40)}</div></div><div class="card pad">${skeletonRows(6)}</div></div>`;
  if (key === "mycareer") return `<div class="sk-wrap" aria-hidden="true"><div class="card pad sk-hero"><span class="sk sk-avatar"></span><div class="sk-head" style="flex:1">${line(45)}${line(25)}</div><span class="sk" style="width:120px;height:44px"></span></div><div class="sk-tabs">${Array.from({ length: 5 }, () => `<span class="sk"></span>`).join("")}</div><div class="sk-grid two">${card(160)}${card(160)}</div></div>`;
  if (["connections", "grid"].includes(key)) return `<div class="sk-wrap" aria-hidden="true">${head}<div class="sk-board ${key === "grid" ? "g3" : "g4"}">${Array.from({ length: key === "grid" ? 9 : 16 }, () => `<span class="sk"></span>`).join("")}</div></div>`;
  return `<div class="sk-wrap" aria-hidden="true">${head}<div class="sk-grid two">${card(200)}${card(200)}</div></div>`;
}

/** Placeholder rows for a list or table that is still loading. */
export const skeletonRows = (n = 6) => Array.from({ length: n }, (_, i) => `<div class="sk-row" aria-hidden="true"><span class="sk sk-dot"></span><span class="sk sk-line" style="width:${34 + ((i * 17) % 24)}%"></span><span class="sk sk-line" style="width:14%"></span></div>`).join("");

export const dataUpdated = () => {
  const d = new Date(db.metadata.generated_at);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};
