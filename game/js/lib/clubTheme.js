// Club colours as the app's accent ("Theme: your club"). The club's main colour is adjusted so
// accent text stays readable (contrast ≥ 4.5:1 against the background) in dark and light themes.
import { clubColors } from "./clubs.js";

const toRgb = (color) => {
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = "#000"; c.fillStyle = color;
  const hex = c.fillStyle; // normalised to #rrggbb
  return hex.startsWith("#") ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [255, 122, 26];
};
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Lighten (dark theme) or darken (light theme) until the colour reads well on the background. */
function readable(rgb, bg, dark) {
  const target = dark ? [255, 255, 255] : [0, 0, 0];
  let c = rgb;
  for (let t = 0; t <= 1 && contrast(c, bg) < 4.5; t += 0.05) c = mix(rgb, target, t);
  return c;
}

/** CSS variables for a club theme, or null for the default orange. */
export function clubThemeVars(teamId, theme) {
  if (!teamId) return null;
  const dark = theme !== "light";
  const bg = dark ? [10, 15, 28] : [243, 237, 228];
  let [c1, c2] = clubColors(teamId).map(toRgb);
  // white/black second colours make poor accents: use the main colour for both
  if (Math.min(...c1) > 225 || Math.max(...c1) < 40) [c1, c2] = [c2, c1];
  const accent = readable(c1, bg, dark);
  const accent2 = readable(mix(accent, dark ? [255, 255, 255] : [255, 255, 255], 0.25), bg, dark);
  const ink = contrast(accent, [255, 255, 255]) >= contrast(accent, [10, 10, 10]) ? "#ffffff" : "#111111";
  return {
    "--accent": hex(accent), "--accent2": hex(accent2), "--accent-ink": ink, "--sel-line": hex(accent),
    "--sel": `color-mix(in srgb, ${hex(accent)} ${dark ? 22 : 18}%, var(--card))`,
  };
}

const KEYS = ["--accent", "--accent2", "--accent-ink", "--sel-line", "--sel"];
export function applyClubTheme(teamId, theme) {
  const r = document.documentElement;
  KEYS.forEach((k) => r.style.removeProperty(k));
  const vars = clubThemeVars(teamId, theme);
  if (vars) for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, v);
  try { localStorage.setItem("wla:clubvars", JSON.stringify({ club: teamId || "", theme, vars: vars || {} })); } catch { /* storage off */ }
  r.dataset.club = teamId || "";
}
