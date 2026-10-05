// Small UI helpers shared by all games.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? vals[i] : ""), "");
}

export function mount(root, markup) {
  root.innerHTML = markup;
  return (sel) => root.querySelector(sel);
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

import { store, storeReady } from "./lib/storage.js";
export { store, storeReady };

export function ratingClass(r) {
  return r >= 92 ? "r-elite" : r >= 82 ? "r-good" : r >= 70 ? "r-mid" : "r-low";
}

export function initials(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export const fmt1 = (v) => (v === null || v === undefined ? "–" : Number(v).toFixed(1));

/**
 * Autocomplete over a list of players.
 * items: [{ id, label, sub }]; onSelect(item). Keyboard: ↑ ↓ Enter Esc.
 */
export function autocomplete(input, items, onSelect, { signal, exclude = () => false } = {}) {
  const box = document.createElement("div");
  box.className = "suggest";
  box.hidden = true;
  input.parentElement.appendChild(box);
  let matches = [];
  let active = 0;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const render = () => {
    box.innerHTML = matches.map((m, i) => `<div data-i="${i}" class="${i === active ? "on" : ""}"><span>${esc(m.label)}</span><small>${esc(m.sub || "")}</small></div>`).join("");
    box.hidden = matches.length === 0;
  };
  const choose = (i) => {
    const m = matches[i];
    if (!m) return;
    input.value = "";
    matches = [];
    render();
    onSelect(m);
  };
  input.addEventListener("input", () => {
    const q = norm(input.value.trim());
    active = 0;
    if (q.length < 2) { matches = []; render(); return; }
    const starts = [], contains = [];
    for (const it of items) {
      if (exclude(it)) continue;
      const n = norm(it.label);
      if (n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q))) starts.push(it);
      else if (n.includes(q)) contains.push(it);
      if (starts.length >= 12) break;
    }
    matches = starts.concat(contains).slice(0, 12);
    render();
  }, { signal });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { active = Math.min(active + 1, matches.length - 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
    else if (e.key === "Enter") { choose(active); e.preventDefault(); }
    else if (e.key === "Escape") { matches = []; render(); }
  }, { signal });
  box.addEventListener("mousedown", (e) => {
    const d = e.target.closest("[data-i]");
    if (d) { e.preventDefault(); choose(Number(d.dataset.i)); }
  }, { signal });
  input.addEventListener("blur", () => setTimeout(() => { box.hidden = true; }, 120), { signal });
  input.addEventListener("focus", () => { box.hidden = matches.length === 0; }, { signal });
}

/** Today's date in the player's own time zone, as YYYY-MM-DD. */
export const localDate = () => new Date().toLocaleDateString("en-CA");

/** Counts a number up inside an element (skipped when animations are reduced). */
export function countUp(el, to, decimals = 0, ms = 650) {
  if (!el) return;
  const reduced = document.documentElement.dataset.motion === "reduced" ||
    (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (reduced) { el.textContent = Number(to).toFixed(decimals); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = (to * (1 - Math.pow(1 - k, 3))).toFixed(decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Counts plays per game for the home-page stats strip. */
export function track(game) {
  store.set(`plays:${game}`, store.get(`plays:${game}`, 0) + 1);
}

/** Re-runs a CSS animation class on an element. */
export function animate(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Copies an in-app link (hash route) as a full URL. */
export async function copyLink(hash = location.hash) {
  const url = location.href.split("#")[0] + (hash.startsWith("#") ? hash : "#" + hash);
  try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url); }
}

/** Loading placeholders (shimmering shapes) while a page computes its content. */
export const skeletonCards = (n = 12) => Array.from({ length: n }, () => `<div class="skel skel-card" aria-hidden="true"><i class="skel-circle"></i><i class="skel-line w70"></i><i class="skel-line w50"></i><i class="skel-line w90"></i></div>`).join("");
export const skeletonTiles = (n = 9) => Array.from({ length: n }, () => `<div class="skel skel-tile" aria-hidden="true"><i class="skel-shield"></i><span><i class="skel-line w70"></i><i class="skel-line w90"></i></span></div>`).join("");

/** Shows placeholders, then runs the (heavier) render on the next frame unless the page changed. */
export function deferred(signal, fn) {
  // a short timer (not requestAnimationFrame, which never fires in background tabs) lets the placeholders paint first
  setTimeout(() => { if (!signal?.aborted) fn(); }, 30);
}
