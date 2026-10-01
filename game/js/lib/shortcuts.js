// Keyboard shortcuts: the list (shown by "?" and on the Help page) and the global handlers.
import { esc } from "../ui.js";
import { icon } from "./icons.js";
import { closeModal, openModal } from "./modal.js";

export const SHORTCUTS = [
  { group: "Everywhere", items: [
    [["Ctrl", "K"], "Search players, clubs, seasons and pages"], [["/"], "Search"],
    [["?"], "Show keyboard shortcuts"], [["Esc"], "Close a window"],
    [["G", "H"], "Go to Home"], [["G", "G"], "Go to Games"], [["G", "P"], "Go to Players"],
    [["G", "C"], "Go to Clubs"], [["G", "S"], "Go to Seasons"], [["G", "M"], "Go to your profile"], [["G", "A"], "Go to Achievements"], [["G", "V"], "Compare players"], [["G", "R"], "Monthly recap"], [["G", "F"], "Challenge a friend"], [["G", "O"], "Online 1v1"], [["G", "?"], "Go to Help"]] },
  { group: "All-Time Draft", items: [
    [["1–9"], "Pick a player from the roster"], [["1–6"], "Then place them: PG, SG, SF, PF, C, 6th"],
    [["↑", "↓"], "Move through the roster"], [["Enter"], "Pick the highlighted player"],
    [["R"], "Re-spin"], [["Esc"], "Cancel the selected player"]] },
  { group: "Higher or Lower", items: [[["↑"], "Higher"], [["↓"], "Lower"]] },
  { group: "Guess the Player", items: [[["↑", "↓"], "Move through suggestions"], [["Enter"], "Guess the highlighted player"]] },
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

/** Global keys: "?" shortcuts, "/" and Ctrl+K search, "g x" navigation. */
export function initShortcuts({ openSearch }) {
  let gPending = 0;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    if (e.key === "?") { e.preventDefault(); openShortcuts(); return; }
    if (e.key === "/") { e.preventDefault(); openSearch(); return; }
    const k = e.key.toLowerCase();
    if (Date.now() - gPending < 1200) {
      const to = { h: "#/", g: "#/games", p: "#/players", c: "#/clubs", s: "#/seasons", m: "#/me", a: "#/achievements", v: "#/compare", r: "#/recap", f: "#/challenge", o: "#/online", "?": "#/help", "/": "#/help" }[k];
      gPending = 0;
      if (to) { e.preventDefault(); location.hash = to; }
      return;
    }
    if (k === "g") gPending = Date.now();
  });
}
