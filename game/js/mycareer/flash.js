// "Breaking news" banners in the style of a sports channel, and the cinematic opening of a new career.
import { icon } from "../lib/icons.js";
import { announce } from "../lib/a11y.js";
import { reducedMotion } from "../lib/settings.js";
import { sound } from "../lib/fx.js";
import { esc } from "../ui.js";

let stack = null;
/** Show a banner. tone: "breaking" (red), "good" (gold), "info" (blue). Auto-hides; hover/focus pauses it. */
export function newsFlash({ kicker = "BREAKING NEWS", title, text = "", tone = "breaking", ic = "whistle", ms = 7000 }) {
  if (!stack || !stack.isConnected) {
    stack = document.createElement("div");
    stack.className = "nf-stack";
    document.body.appendChild(stack);
  }
  while (stack.children.length >= 3) stack.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `nf nf-${tone}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="nf-kicker"><span class="nf-live"></span>${esc(kicker)}</div>
    <div class="nf-body"><span class="nf-ic" aria-hidden="true">${icon(ic, { size: 20 })}</span><div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}</div>
    <button class="icon-btn nf-x" aria-label="Dismiss">${icon("close", { size: 15 })}</button></div>
    <div class="nf-ticker" aria-hidden="true"><span>${esc(`${title} · ${text} · `.repeat(3))}</span></div>`;
  stack.appendChild(el);
  let left = ms, started = performance.now(), timer = 0;
  const hide = () => { clearTimeout(timer); el.classList.add("out"); setTimeout(() => el.remove(), reducedMotion() ? 0 : 320); };
  const run = () => { started = performance.now(); timer = setTimeout(hide, left); };
  const hold = () => { clearTimeout(timer); left -= performance.now() - started; };
  el.addEventListener("mouseenter", hold); el.addEventListener("mouseleave", run);
  el.addEventListener("focusin", hold); el.addEventListener("focusout", run);
  el.querySelector(".nf-x").addEventListener("click", hide);
  run();
  if (tone === "breaking") sound.play("warn");
  announce(`${kicker}: ${title}. ${text}`);
  return el;
}
/** Remove any banners (leaving the page). */
export function clearFlashes() { stack?.remove(); stack = null; }

/** Cinematic opening: arena lights, the academy crest, your player walking into the spotlight. */
export function careerIntro({ name, sub, year, club, crest, avatar, onDone }) {
  const d = document.createElement("dialog");
  d.className = "mc-intro";
  d.setAttribute("aria-label", `${name}: the story begins`);
  const rm = reducedMotion();
  d.innerHTML = `<div class="in-stage ${rm ? "still" : ""}">
      <div class="in-beam l"></div><div class="in-beam r"></div><div class="in-spot"></div>
      <div class="in-floor"></div>
      <small class="in-year">${esc(year)}</small>
      <div class="in-crest">${crest}<span>${esc(club)} academy</span></div>
      <div class="in-player">${avatar}</div>
      <h2 class="in-name" style="--n:${[...name].length}"><span>${esc(name)}</span></h2>
      <p class="in-sub">${esc(sub)}</p>
      <p class="in-tag">Your story begins.</p>
      <button class="btn primary in-go">${icon("play", { size: 16 })} Enter the academy</button>
    </div>
    <button class="btn ghost in-skip">Skip ${icon("skip", { size: 14 })}</button>`;
  document.body.appendChild(d);
  let closed = false;
  const close = () => { if (closed) return; closed = true; if (d.open) d.close(); d.remove(); onDone?.(); };
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  d.querySelector(".in-go").addEventListener("click", close);
  d.querySelector(".in-skip").addEventListener("click", close);
  d.showModal();
  d.querySelector(rm ? ".in-go" : ".in-skip").focus();
  if (!rm) { sound.play("spin"); setTimeout(() => { if (!closed) { sound.play("victory"); d.querySelector(".in-go").focus(); } }, 4600); }
}
