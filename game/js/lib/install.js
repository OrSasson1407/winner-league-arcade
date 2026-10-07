// Installable app: registers the service worker, offers "Install app" where the browser allows it (and once,
// at a good moment: after a few games), tells you when a new version is ready, and keeps the installed
// app ready to play offline.
import { esc, store } from "../ui.js";
import { icon } from "./icons.js";
import { announce } from "./a11y.js";
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const canInstall = () => !!deferred;
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function promptInstall() {
  if (!deferred) return "unavailable";
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome;
}

export function initInstall() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline mode unavailable */ });
  }
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  addEventListener("appinstalled", () => { deferred = null; notify(); store.set("install:asked", true); warmOffline(); });
  // a new version took over while the page was open: offer a refresh (the next page you open is already new)
  if ("serviceWorker" in navigator) {
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!had) { had = true; return; } // first install, nothing to refresh
      banner("A new version of the arcade is ready.", [["Refresh", "refresh", () => location.reload()]], { ms: 20000 });
    });
  }
  if (isInstalled()) (window.requestIdleCallback || setTimeout)(() => warmOffline(), { timeout: 8000 });
}

/** A small bar at the bottom with one or two buttons (reuses the undo toast look). */
function banner(message, actions, { ms = 15000 } = {}) {
  document.querySelector(".app-banner")?.remove();
  const el = document.createElement("div");
  el.className = "undo-toast app-banner";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>${esc(message)}</span>${actions.map(([label, ic], i) => `<button class="btn sm ${i ? "ghost" : "primary"}" data-i="${i}">${ic ? icon(ic, { size: 14 }) : ""} ${esc(label)}</button>`).join("")}`;
  document.body.appendChild(el);
  const done = () => { el.classList.add("out"); setTimeout(() => el.remove(), 250); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { done(); actions[Number(b.dataset.i)][2]?.(); } });
  setTimeout(done, ms);
  announce(message);
}

/** After the third game, once: suggest installing (where the browser can, or how to on iPhone). */
export function maybeSuggestInstall(plays) {
  if (plays < 3 || isInstalled() || store.get("install:asked")) return;
  if (deferred) {
    store.set("install:asked", true);
    banner("Put the arcade on your home screen: opens like an app, plays offline.", [["Install", "check", () => promptInstall()], ["Not now", null]]);
  } else if (isIOS()) {
    store.set("install:asked", true);
    banner("On iPhone: tap Share, then Add to Home Screen, to play it like an app (offline too).", [["Got it", "check"]], { ms: 20000 });
  }
}

/** Fetch every page of the arcade once, so the installed app's single-player games work offline. */
let warming = false;
export async function warmOffline() {
  if (warming || !navigator.onLine) return;
  warming = true;
  try { await Promise.allSettled((window.__wlaRoutes || []).map((load) => load())); } catch { /* best effort */ }
}

/** Settings row: install button, "installed", or how to add on iPhone. */
export function installRowHtml() {
  if (isInstalled()) return `<span class="muted">Installed ✓ Works offline for single-player games.</span>`;
  if (deferred) return `<button class="btn primary" data-install>Install app</button> <small class="muted">Home screen + offline play</small>`;
  if (isIOS()) return `<small class="muted">On iPhone/iPad: tap <b>Share</b> then <b>Add to Home Screen</b>.</small>`;
  return `<small class="muted">Use your browser's menu: <b>Install app</b> / <b>Add to Home screen</b>.</small>`;
}
