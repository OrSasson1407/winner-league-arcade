// Display & accessibility settings: theme, colour-blind palette, text size, motion, sound.
import { store } from "../ui.js";
import { sound } from "./fx.js";
import { icon } from "./icons.js";
import { applyClubTheme } from "./clubTheme.js";
import { db } from "../data.js";
import { installRowHtml, onInstallChange, promptInstall } from "./install.js";

const DEFAULTS = { theme: "dark", cb: false, size: "md", motion: "system", club: "" };

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
  applyClubTheme(s.club, theme);
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
      <div class="field"><label>Theme</label>${seg("theme", [["dark", `${icon("moon", { size: 14 })} Dark`], ["light", `${icon("sun", { size: 14 })} Light`], ["auto", "Auto"]], s.theme)}</div>
      <div class="field"><label for="club-theme">Accent colour</label>
        <div class="club-pick"><span class="club-sw" style="background:var(--accent)"></span>
        <select id="club-theme" class="input"><option value="">Arcade orange (default)</option>${[...db.teams].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)).map((t) => `<option value="${t.team_id}" ${s.club === t.team_id ? "selected" : ""}>${t.canonical_name}</option>`).join("")}</select></div></div>
      <div class="field"><label>Colours</label>${seg("cb", [[false, "Standard"], [true, "Colour-blind safe"]], s.cb)}</div>
      <div class="field"><label>Text size</label>${seg("size", [["sm", "S"], ["md", "M"], ["lg", "L"], ["xl", "XL"]], s.size)}</div>
      <div class="field"><label>Animations</label>${seg("motion", [["system", "System"], ["full", "Full"], ["reduced", "Reduced"]], s.motion)}</div>
      <div class="field"><label>Sound</label>${seg("sound", [[true, `${icon("soundOn", { size: 14 })} On`], [false, `${icon("soundOff", { size: 14 })} Off`]], sound.on)}</div>
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
      if (key === "sound") sound.on = val; else save({ [key]: val });
      sound.play("tick");
      render();
    });
  });
  document.addEventListener("click", () => close());
  onInstallChange(() => { if (pop) render(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop) { close(); btn.focus(); } });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (getSettings().theme === "auto") applySettings(); });
}
