// Quick game (#/quick, the dice button, "Q"): a short roll, then straight into a random game.
// Free-play modes only, so it never uses up today's daily puzzles; never the same game twice in a row.
import { store } from "../ui.js";
import { icon } from "../lib/icons.js";
import { announce } from "../lib/a11y.js";
import { reducedMotion } from "../lib/settings.js";

export const QUICK = [
  ["higher-lower", "Higher or Lower", "chart"], ["guess?mode=free", "Guess the Player", "search"], ["career", "Career Path", "arrowRight"],
  ["connections?mode=free", "Connections", "link"], ["grid?mode=free", "The Grid", "games"],
];

export function renderQuick(root, signal) {
  const last = store.get("quick:last", "");
  const pool = QUICK.filter(([r]) => r !== last);
  const [route, name, ic] = pool[Math.floor(Math.random() * pool.length)];
  store.set("quick:last", route);
  const go = () => { if (!signal.aborted) location.replace(`#/${route}`); };
  if (reducedMotion()) { announce(`Quick game: ${name}`); return go(); }
  root.innerHTML = `<div class="quick-roll" aria-live="assertive"><span class="quick-dice">${icon("dice", { size: 56 })}</span>
    <small class="muted">QUICK GAME</small><div class="quick-reel"><b id="quick-name"></b></div></div>`;
  const el = root.querySelector("#quick-name");
  let n = 0;
  const spin = setInterval(() => { el.textContent = QUICK[n++ % QUICK.length][1]; }, 90);
  setTimeout(() => { clearInterval(spin); el.textContent = name; el.parentElement.classList.add("done"); }, 900);
  setTimeout(go, 1500);
  signal.addEventListener("abort", () => clearInterval(spin));
}
