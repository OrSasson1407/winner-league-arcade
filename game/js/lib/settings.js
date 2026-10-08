// Display & accessibility settings: theme, colour-blind palette, text size, motion, sound.
import { store } from "../ui.js";
import { LANGS } from "../i18n/index.js";
import { canVibrate, haptics, sound } from "./fx.js";
import { ILS_PER_USD, getUnits, setUnits } from "./units.js";
import { disableOnlineAlerts, disableReminders, enableOnlineAlerts, enableReminders, onlineAlertStatus, reminderStatus } from "./notify.js";
import { icon } from "./icons.js";
import { applyClubTheme } from "./clubTheme.js";
import { db } from "../data.js";
import { installRowHtml, onInstallChange, promptInstall } from "./install.js";
import { LEAGUES, LEAGUE_IDS, activeLeague, setLeague } from "../leagueChoice.js";
import { set3D, want3D, webglOk } from "../three3d/core.js";

const DEFAULTS = { theme: "dark", cb: false, size: "md", motion: "system", club: "", contrast: "system", lang: "en" };

export function getSettings() {
  return { ...DEFAULTS, ...store.get("settings", {}) };
}

export function applySettings(s = getSettings()) {
  const r = document.documentElement;
  const theme = s.theme === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : s.theme;
  r.dataset.theme = theme;
  if (s.cb) r.dataset.cb = "1"; else delete r.dataset.cb;
  if (s.size !== "md") r.dataset.size = s.size; else delete r.dataset.size;
  if (s.motion !== "system") r.dataset.motion = s.motion; else delete r.dataset.motion;
  const high = s.contrast === "high" || (s.contrast === "system" && matchMedia("(prefers-contrast: more)").matches);
  if (high) r.dataset.contrast = "high"; else delete r.dataset.contrast;
  applyClubTheme(high ? "" : s.club, theme); // high contrast uses its own fixed palette
  // the browser bar / installed app's title bar follows the theme
  requestAnimationFrame(() => document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.body).backgroundColor || "#061532"));
}

function save(patch) {
  const s = { ...getSettings(), ...patch };
  store.set("settings", s);
  applySettings(s);
  document.dispatchEvent(new CustomEvent("settings-changed"));
}

/** True when animations should be skipped (system preference or in-app setting). */
export function reducedMotion() {
  const m = getSettings().motion;
  if (m === "reduced") return true;
  if (m === "full") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function initSettingsButton(btn) {
  let pop = null;
  const close = () => { pop?.remove(); pop = null; btn.setAttribute("aria-expanded", "false"); };
  const seg = (key, opts, cur) => `<div class="seg sm" data-key="${key}" role="radiogroup">${opts.map(([v, l]) =>
    `<button role="radio" aria-checked="${String(cur) === String(v)}" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const render = () => {
    const s = getSettings();
    pop.innerHTML = `
      <div class="row"><h3>Settings</h3><span class="spacer"></span><button class="icon-btn" data-close aria-label="Close settings">${icon("close", { size: 18 })}</button></div>
      <div class="field"><label>Language · שפה</label><div data-no-tr>${seg("lang", Object.entries(LANGS), s.lang)}</div></div>
      <div class="field"><label>League <small class="muted">(games and pages; My Career stays in the Winner League)</small></label>${seg("league", LEAGUE_IDS.map((l) => [l, LEAGUES[l].short]), activeLeague())}</div>
      <div class="field"><label>Theme</label>${seg("theme", [["dark", `${icon("moon", { size: 14 })} Dark`], ["light", `${icon("sun", { size: 14 })} Light`], ["auto", "Auto"]], s.theme)}</div>
      <div class="field"><label for="club-theme">Accent colour</label>
        <div class="club-pick"><span class="club-sw" style="background:var(--accent)"></span>
        <select id="club-theme" class="input"><option value="">Arcade orange (default)</option>${[...db.teams].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)).map((t) => `<option value="${t.team_id}" ${s.club === t.team_id ? "selected" : ""}>${t.canonical_name}</option>`).join("")}</select></div></div>
      <div class="field"><label>Contrast</label>${seg("contrast", [["system", "System"], ["standard", "Standard"], ["high", "High"]], s.contrast)}</div>
      <div class="field"><label>Colours</label>${seg("cb", [[false, "Standard"], [true, "Colour-blind safe"]], s.cb)}</div>
      <div class="field"><label>Text size</label>${seg("size", [["sm", "S"], ["md", "M"], ["lg", "L"], ["xl", "XL"]], s.size)}</div>
      <div class="field"><label>Animations</label>${seg("motion", [["system", "System"], ["full", "Full"], ["reduced", "Reduced"]], s.motion)}</div>
      ${webglOk() ? `<div class="field"><label>3D views <small class="muted">(My Career and the live court)</small></label>${seg("3d", [[true, "On"], [false, "Off"]], want3D())}</div>` : ""}
      <div class="field"><label>Sound</label>${seg("sound", [[true, `${icon("soundOn", { size: 14 })} On`], [false, `${icon("soundOff", { size: 14 })} Off`]], sound.on)}</div>
      ${canVibrate() ? `<div class="field"><label>Vibration</label>${seg("haptics", [[true, "On"], [false, "Off"]], haptics.on)}</div>` : ""}
      <div class="field"><label>Height</label>${seg("u-height", [["m", "Metres"], ["ft", "Feet & inches"]], getUnits().height)}</div>
      <div class="field"><label>Money <small class="muted">(₪ at about ${ILS_PER_USD} per $)</small></label>${seg("u-money", [["usd", "$ Dollars"], ["ils", "₪ Shekels"]], getUnits().money)}</div>
      <div class="field"><label>Daily reminder</label>${(() => { const r = reminderStatus();
        if (r === "unsupported") return `<small class="muted">Not supported in this browser.</small>`;
        if (r === "blocked") return `<small class="muted">Notifications are blocked for this site in your browser settings.</small>`;
        return seg("remind", [[true, `${icon("bell", { size: 14 })} On`], [false, "Off"]], r === "on"); })()}</div>
      ${onlineAlertStatus() === "unsupported" || onlineAlertStatus() === "blocked" ? "" : `<div class="field"><label>Online alerts <small class="muted">(friend invites, match found)</small></label>${seg("notify-online", [[true, `${icon("bell", { size: 14 })} On`], [false, "Off"]], onlineAlertStatus() === "on")}</div>`}
      <div class="field"><label>App</label><div class="install-row">${installRowHtml()}</div></div>`;
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pop) return close();
    pop = document.createElement("div");
    pop.className = "settings-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Settings");
    document.body.appendChild(pop);
    btn.setAttribute("aria-expanded", "true");
    render();
    pop.querySelector("button")?.focus();
    pop.addEventListener("change", (ev) => {
      if (ev.target.id !== "club-theme") return;
      save({ club: ev.target.value });
      sound.play("tick");
      render();
      pop.querySelector("#club-theme")?.focus();
    });
    pop.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (ev.target.closest("[data-close]")) return close();
      if (ev.target.closest("[data-install]")) { promptInstall().then(() => pop && render()); return; }
      const b = ev.target.closest("[data-v]");
      if (!b) return;
      const key = b.parentElement.dataset.key;
      const raw = b.dataset.v;
      const val = raw === "true" ? true : raw === "false" ? false : raw;
      if (key === "notify-online") { (val ? enableOnlineAlerts() : Promise.resolve(disableOnlineAlerts())).then(() => pop && render()); return; }
      if (key === "league") { if (val !== activeLeague()) setLeague(val); return; } // the whole arcade reloads on the new data
      if (key === "remind") { (val ? enableReminders() : disableReminders()).then(() => pop && render()); return; }
      if (key === "3d") set3D(val);
      else if (key === "sound") sound.on = val;
      else if (key === "haptics") { haptics.on = val; if (val) navigator.vibrate?.(15); }
      else if (key === "u-height" || key === "u-money") setUnits({ [key.slice(2)]: val });
      else if (key === "lang") { if (val !== getSettings().lang) { save({ lang: val }); location.reload(); } return; } // the whole page is redrawn in the new language
      else save({ [key]: val });
      sound.play("tick");
      render();
    });
  });
  document.addEventListener("click", () => close());
  onInstallChange(() => { if (pop) render(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop) { close(); btn.focus(); } });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (getSettings().theme === "auto") applySettings(); });
  matchMedia("(prefers-contrast: more)").addEventListener("change", () => { if (getSettings().contrast === "system") applySettings(); });
}
