// First visit: three short screens (what this is, the games, make it yours). Skippable; shown once.
import { db } from "../data.js";
import { esc, store } from "../ui.js";
import { icon, logoSvg } from "./icons.js";
import { closeModal, openModal } from "./modal.js";
import { applySettings, getSettings } from "./settings.js";
import { enableReminders, remindersSupported } from "./notify.js";
import { sound } from "./fx.js";
import { announce } from "./a11y.js";

const GAMES = [["trophy", "All-Time Draft", "Build the best five in league history"], ["search", "Guess the Player", "Find the mystery player in 8 tries"],
  ["chart", "Higher or Lower", "Compare real player-seasons"], ["arrowRight", "Career Path", "Name the player from their clubs"],
  ["link", "Connections", "Find the four hidden groups"], ["games", "The Grid", "A player for every square"], ["user", "My Career", "Play a whole career, academy to Hall of Fame"]];

/** Existing players skip it: any saved progress means they already know their way around. */
export function shouldOnboard() {
  if (store.get("onboarded")) return false;
  const skip = new Set(["settings", "clubvars", "units", "haptics", "sound", "onboarded", "remind",
    "online:sid", "online:token", "online:rec"]); // written on every visit, not by playing
  const returning = store.keys().some((k) => !skip.has(k));
  if (returning) { store.set("onboarded", true); return false; }
  return true;
}

export function openOnboarding() {
  let step = 0;
  const d = document.createElement("dialog");
  d.className = "profile-modal ob-modal";
  d.setAttribute("aria-labelledby", "ob-title");
  document.body.appendChild(d);
  const setSetting = (patch) => { const s = { ...getSettings(), ...patch }; store.set("settings", s); applySettings(s); document.dispatchEvent(new CustomEvent("settings-changed")); };
  const steps = [
    () => `<div class="ob-hero">${logoSvg(84)}</div><h2 id="ob-title">Welcome to Winner League Arcade</h2>
      <p>Games built on <b>17 seasons</b> of real Israeli Basketball Premier League data: every player, club and season since 2010-11.</p>
      <ul class="clean ob-points"><li>${icon("calendar", { size: 18 })} New daily challenges every day</li><li>${icon("globe", { size: 18 })} Play online 1v1, no account needed</li><li>${icon("medal", { size: 18 })} Levels, achievements and records</li></ul>`,
    () => `<h2 id="ob-title">Seven ways to play</h2><div class="ob-games">${GAMES.map(([ic, n, t]) => `<div class="ob-game"><span>${icon(ic, { size: 20 })}</span><b>${n}</b><small>${t}</small></div>`).join("")}</div>`,
    () => {
      const s = getSettings();
      return `<h2 id="ob-title">Make it yours</h2>
      <div class="field"><label for="ob-club">Your club (the arcade takes its colours)</label><select id="ob-club" class="input"><option value="">No club (arcade orange)</option>${[...db.teams].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)).map((t) => `<option value="${t.team_id}" ${s.club === t.team_id ? "selected" : ""}>${esc(t.canonical_name)}</option>`).join("")}</select></div>
      <div class="field"><label>Theme</label><div class="seg sm" id="ob-theme" role="radiogroup">${[["dark", "Dark"], ["light", "Light"], ["auto", "Auto"]].map(([v, l]) => `<button role="radio" data-v="${v}" aria-checked="${s.theme === v}" class="${s.theme === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${remindersSupported() ? `<div class="field"><label>Daily reminder</label><button class="btn" id="ob-remind">${icon("bell", { size: 15 })} Remind me in the evening</button><small class="muted">Only if today's challenges aren't done. Turn it off any time in Settings.</small></div>` : ""}`;
    },
  ];
  const draw = () => {
    d.innerHTML = `<button class="btn ghost ob-skip" data-a="done">Skip</button>
      <div class="ob-step" data-step="${step}">${steps[step]()}</div>
      <div class="ob-foot"><div class="ob-dots" aria-hidden="true">${steps.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div><span class="sr-only">Step ${step + 1} of ${steps.length}</span>
        <span class="spacer"></span>${step ? `<button class="btn ghost" data-a="back">Back</button>` : ""}
        <button class="btn primary" data-a="${step === steps.length - 1 ? "play" : "next"}">${step === steps.length - 1 ? `${icon("play", { size: 15 })} Let's play` : `Next ${icon("arrowRight", { size: 15 })}`}</button></div>`;
    d.querySelector("#ob-club")?.addEventListener("change", (e) => setSetting({ club: e.target.value }));
    d.querySelector("#ob-theme")?.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { setSetting({ theme: b.dataset.v }); draw(); d.querySelector(`#ob-theme [data-v="${b.dataset.v}"]`)?.focus(); } });
    d.querySelector("#ob-remind")?.addEventListener("click", async (e) => {
      const st = await enableReminders();
      e.target.closest("button").outerHTML = `<p class="${st === "on" ? "good-text" : "muted"}">${st === "on" ? "Reminders on." : st === "blocked" ? "Notifications are blocked in your browser settings." : "Reminders stay off."}</p>`;
    });
    d.querySelector(".ob-foot .btn.primary").focus();
    announce(`Step ${step + 1} of ${steps.length}`);
  };
  const finish = (go) => { store.set("onboarded", true); closeModal(d); setTimeout(() => d.remove(), 300); if (go) location.hash = "#/games"; };
  d.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "next") { step++; sound.play("select"); draw(); }
    if (a === "back") { step--; draw(); }
    if (a === "done") finish(false);
    if (a === "play") { sound.play("place"); finish(true); }
  });
  d.addEventListener("close", () => store.set("onboarded", true));
  draw();
  openModal(d);
  d.querySelector(".ob-foot .btn.primary").focus();
}
