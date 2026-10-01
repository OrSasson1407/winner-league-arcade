// Installable app: registers the service worker and offers "Install app" where the browser allows it.
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
  addEventListener("appinstalled", () => { deferred = null; notify(); });
}

/** Settings row: install button, "installed", or how to add on iPhone. */
export function installRowHtml() {
  if (isInstalled()) return `<span class="muted">Installed ✓ Works offline for single-player games.</span>`;
  if (deferred) return `<button class="btn primary" data-install>Install app</button> <small class="muted">Home screen + offline play</small>`;
  if (isIOS()) return `<small class="muted">On iPhone/iPad: tap <b>Share</b> then <b>Add to Home Screen</b>.</small>`;
  return `<small class="muted">Use your browser's menu: <b>Install app</b> / <b>Add to Home screen</b>.</small>`;
}
