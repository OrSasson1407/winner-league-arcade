// Keyboard shortcuts: the list (shown by "?" and on the Help page) and the global handlers.
import { esc } from "../ui.js";
import { icon } from "./icons.js";
import { closeModal, openModal } from "./modal.js";

export const SHORTCUTS = [
  { group: "Everywhere", items: [
    [["Ctrl", "K"], "Search players, clubs, seasons and pages"], [["/"], "Search"],
    [["?"], "Show keyboard shortcuts"], [["Esc"], "Close a window"],
    [["G", "H"], "Go to Home"], [["G", "G"], "Go to Games"], [["G", "P"], "Go to Players"],
    [["G", "C"], "Go to Clubs"], [["G", "S"], "Go to Seasons"], [["G", "M"], "Go to your profile"], [["G", "A"], "Go to Achievements"], [["G", "V"], "Compare players"], [["G", "R"], "Monthly recap"], [["G", "F"], "Challenge a friend"], [["G", "O"], "Online 1v1"], [["G", "Y"], "Daily challenges"], [["G", "T"], "Today in the league"], [["G", "E"], "All-time records"], [["G", "?"], "Go to Help"]] },
  { group: "All-Time Draft", items: [
    [["1–9"], "Pick a player from the roster"], [["1–6"], "Then place them: PG, SG, SF, PF, C, 6th"],
    [["↑", "↓"], "Move through the roster"], [["Enter"], "Pick the highlighted player"],
    [["R"], "Re-spin"], [["Esc"], "Cancel the selected player"]] },
  { group: "Higher or Lower", items: [[["↑"], "Higher"], [["↓"], "Lower"]] },
  { group: "Guess the Player", items: [[["↑", "↓"], "Move through suggestions"], [["Enter"], "Guess the highlighted player"]] },
  { group: "Connections", items: [[["←", "→", "↑", "↓"], "Move between players"], [["Space"], "Select / deselect"], [["Enter"], "Submit four"], [["S"], "Shuffle"], [["Esc"], "Deselect all"]] },
  { group: "The Grid", items: [[["1–9"], "Open a square"], [["←", "→", "↑", "↓"], "Move between squares"], [["Esc"], "Close the search"]] },
  { group: "Career Path", items: [[["H"], "Hint"], [["N"], "Next career"]] },
  { group: "My Career", items: [[["P"], "Play the next game"], [["1–5"], "Switch tabs"], [["←", "→"], "Switch tabs (on the tab bar)"]] },
  { group: "Single game", items: [[["T"], "Tip-off"]] },
  { group: "Game screen", items: [[["L"], "Watch live"], [["F"], "Final score"], [["Space"], "Pause / resume"], [["1", "2", "4"], "Speed"]] },
  { group: "Online 1v1", items: [[["F"], "Find a ranked match"], [["B"], "Play a bot at your level"], [["Esc"], "Cancel the search"]] },
];

const keyHtml = (keys) => keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(" ");

export function shortcutsHtml() {
  return `<div class="sc-grid">${SHORTCUTS.map((g) => `<div class="sc-group"><h3>${esc(g.group)}</h3>
    <dl>${g.items.map(([keys, what]) => `<div><dt>${keyHtml(keys)}</dt><dd>${esc(what)}</dd></div>`).join("")}</dl></div>`).join("")}</div>`;
}

let dialog = null;
export function openShortcuts() {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "profile-modal sc-modal";
    dialog.setAttribute("aria-label", "Keyboard shortcuts");
    dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.closest("[data-close]")) closeModal(dialog); });
    document.body.appendChild(dialog);
  }
  dialog.innerHTML = `<button class="icon-btn profile-close" data-close aria-label="Close">${icon("close", { size: 18 })}</button>
    <div class="profile"><h2>${icon("bulb", { size: 24 })} Keyboard shortcuts</h2>${shortcutsHtml()}</div>`;
  openModal(dialog);
}

const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]");
let gPending = 0; // "g" was just pressed: the next key is a "go to" key, not a game key

/**
 * A game's own keys while its page is open: map { key: fn } (fn returning false lets the key through).
 * Ignored while typing, with a window open, with Ctrl/Alt/Cmd, or right after "g".
 */
export function gameKeys(signal, map) {
  document.addEventListener("keydown", (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]") || Date.now() - gPending < 1200) return;
    const fn = map[e.key] ?? map[e.key.length === 1 ? e.key.toLowerCase() : ""];
    if (fn && fn(e) !== false) e.preventDefault();
  }, { signal });
}
/** Click a button by selector if it's there and enabled (for gameKeys maps). */
export const press = (root, sel) => () => { const b = root.querySelector(sel); if (!b || b.disabled) return false; b.click(); };

/**
 * Arrow keys move the focus between the items of a board laid out `cols` wide (items found by `sel`
 * inside root, numbered by their order). Items that can't take focus are skipped.
 */
export function arrowGrid(root, sel, cols, signal) {
  root.addEventListener("keydown", (e) => {
    const side = document.documentElement.dir === "rtl" ? -1 : 1; // right to left: → moves to the item on the right, which comes earlier
    const step = { ArrowRight: side, ArrowLeft: -side, ArrowDown: cols, ArrowUp: -cols }[e.key];
    const from = step && e.target.closest?.(sel);
    if (!from) return;
    const items = [...root.querySelectorAll(sel)];
    let i = items.indexOf(from);
    for (i += step; i >= 0 && i < items.length; i += step) {
      const t = items[i];
      if (t.matches("button:not([disabled]), a[href], [tabindex]")) { e.preventDefault(); t.focus(); return; }
    }
  }, { signal });
}

/** Global keys: "?" shortcuts, "/" and Ctrl+K search, "g x" navigation. */
export function initShortcuts({ openSearch }) {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    if (e.key === "?") { e.preventDefault(); openShortcuts(); return; }
    if (e.key === "/") { e.preventDefault(); openSearch(); return; }
    const k = e.key.toLowerCase();
    if (Date.now() - gPending < 1200) {
      const to = { h: "#/", g: "#/games", p: "#/players", c: "#/clubs", s: "#/seasons", m: "#/me", a: "#/achievements", v: "#/compare", r: "#/recap", f: "#/challenge", o: "#/online", y: "#/daily", t: "#/today", e: "#/records", "?": "#/help", "/": "#/help" }[k];
      gPending = 0;
      e.stopImmediatePropagation(); // the key after "g" is never also a game key
      if (to) { e.preventDefault(); location.hash = to; }
      return;
    }
    if (k === "g") gPending = Date.now();
  });
}
