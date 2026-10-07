// Daily reminder notifications (opt-in). No server push: the installed app's service worker checks once in
// a while (Periodic Background Sync, Chrome/Edge with the app installed), and an open tab in the background
// reminds you in the evening. The reminder only fires if today's daily challenges aren't done yet.
import { localDate, store } from "../ui.js";
import { DAILY_COUNT, dailyStreak, todayStatus } from "./daily.js";

const TAG = "wla-daily";
const STATE_URL = "./__wla/remind.json"; // a small cache entry the service worker can read
export const REMIND_HOUR = 18;

export const remindersSupported = () => "Notification" in window && "serviceWorker" in navigator;
export function reminderStatus() {
  if (!remindersSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return store.get("remind", false) && Notification.permission === "granted" ? "on" : "off";
}

async function writeState() {
  try {
    const c = await caches.open("wla-meta");
    const st = { on: reminderStatus() === "on", date: localDate(), done: Object.keys(todayStatus()).length, total: DAILY_COUNT, streak: dailyStreak(), hour: REMIND_HOUR };
    await c.put(STATE_URL, new Response(JSON.stringify(st), { headers: { "Content-Type": "application/json" } }));
    // installed app with reminders on: the icon shows how many daily challenges are left today
    if (navigator.setAppBadge) { if (st.on && st.done < st.total) navigator.setAppBadge(st.total - st.done).catch(() => {}); else navigator.clearAppBadge?.().catch(() => {}); }
  } catch { /* cache unavailable */ }
}

/** Ask for permission and switch reminders on. Returns the new status. */
export async function enableReminders() {
  if (!remindersSupported()) return "unsupported";
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p !== "granted") { store.set("remind", false); await writeState(); return p === "denied" ? "blocked" : "off"; }
  store.set("remind", true);
  await writeState();
  try {
    const reg = await navigator.serviceWorker.ready;
    if ("periodicSync" in reg) {
      const perm = await navigator.permissions.query({ name: "periodic-background-sync" }).catch(() => null);
      if (!perm || perm.state === "granted") await reg.periodicSync.register(TAG, { minInterval: 6 * 3600 * 1000 });
    }
  } catch { /* not available: the open-tab reminder still works */ }
  return "on";
}
export async function disableReminders() {
  store.set("remind", false);
  await writeState();
  try { const reg = await navigator.serviceWorker.ready; await reg.periodicSync?.unregister(TAG); } catch {}
  return "off";
}

/** Keep the service worker's copy of today's status fresh, and remind from an open background tab. */
export function initReminders() {
  if (!remindersSupported()) return;
  writeState();
  document.addEventListener("daily-changed", writeState);
  document.addEventListener("visibilitychange", () => { if (document.hidden) writeState(); });
  setInterval(async () => {
    if (reminderStatus() !== "on" || !document.hidden || new Date().getHours() < REMIND_HOUR) return;
    const today = localDate();
    if (store.get("remind:last") === today || Object.keys(todayStatus()).length >= DAILY_COUNT) return;
    store.set("remind:last", today);
    try {
      const reg = await navigator.serviceWorker.ready;
      const streak = dailyStreak();
      reg.showNotification("Your daily challenges are waiting", {
        body: streak ? `Keep your ${streak}-day streak going: ${DAILY_COUNT - Object.keys(todayStatus()).length} left today.` : `${DAILY_COUNT} new puzzles today. Start a streak!`,
        icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: TAG, data: { url: "./#/daily" } });
    } catch {}
  }, 10 * 60 * 1000);
}

// ---------------------------------------------------------------- online alerts (opt-in)
// A friend's invite, or a match found while the arcade is in a background tab. Shown only while the
// tab is open but hidden: nothing is sent through a push server.
export function onlineAlertStatus() {
  if (!remindersSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return store.get("notify:online", false) && Notification.permission === "granted" ? "on" : "off";
}
export async function enableOnlineAlerts() {
  if (!remindersSupported()) return "unsupported";
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  store.set("notify:online", p === "granted");
  return p === "granted" ? "on" : p === "denied" ? "blocked" : "off";
}
export function disableOnlineAlerts() { store.set("notify:online", false); return "off"; }
/** Show an online alert if they're switched on and the tab isn't being looked at. */
export async function alertOnline(title, { body = "", url = "./#/online", tag = "wla-online" } = {}) {
  if (onlineAlertStatus() !== "on" || !document.hidden) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag, renotify: true, data: { url } });
  } catch { /* no service worker: nothing to show */ }
}
