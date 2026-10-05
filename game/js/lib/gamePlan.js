// "Game plan" controls: pace, defense and offensive focus, plus (optionally) a minutes plan per player.
import { esc } from "../ui.js";
import { DEFAULT_TACTICS, TACTICS } from "../shared/gameSim.js";

const HINT = {
  pace: { slow: "Fewer possessions: good for the weaker team.", normal: "", fast: "More possessions and more turnovers." },
  defense: { man: "", zone: "Protects the paint, gives up threes.", press: "Forces turnovers, speeds the game up." },
  focus: { balanced: "", star: "Your best scorer takes more shots.", paint: "Bigs get the ball near the rim.", threes: "Shooters let it fly from deep." },
};

/**
 * plan: { tactics, minutes } · players: [{ id, name, pos, mpg }] to show minutes sliders (optional).
 * Returns HTML; read it back with readGamePlan(container).
 */
export function gamePlanHtml(plan = {}, players = null) {
  const tac = { ...DEFAULT_TACTICS, ...(plan.tactics || {}) };
  const seg = (key) => `<div class="field gp-field"><label>${{ pace: "Pace", defense: "Defense", focus: "Offense" }[key]}</label>
    <div class="seg sm" role="radiogroup" data-gp="${key}">${Object.entries(TACTICS[key]).map(([v, o]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${tac[key] === v}" class="${tac[key] === v ? "on" : ""}">${esc(o.label)}</button>`).join("")}</div>
    <small class="muted gp-hint">${esc(HINT[key][tac[key]] || "")}</small></div>`;
  const total = players ? players.reduce((s, p) => s + (plan.minutes?.[p.id] ?? Math.round(p.mpg)), 0) : 0;
  return `<div class="gp" data-gp-root>${seg("pace")}${seg("defense")}${seg("focus")}
    ${players ? `<div class="gp-minutes"><b>Minutes plan</b> <small class="muted">(scaled to the 200 minutes of a game; tired players still need rest)</small>
      ${players.map((p) => { const v = plan.minutes?.[p.id] ?? Math.round(p.mpg); return `<label class="gp-min"><span>${esc(p.name)} <small class="muted">${esc(p.pos || "")}</small></span>
        <input type="range" min="0" max="40" step="1" value="${v}" data-min="${esc(p.id)}" aria-label="Minutes for ${esc(p.name)}"><b>${v}</b></label>`; }).join("")}
      <small class="muted gp-total">Total ${total} → ${total ? "scaled to 200" : "default rotation"}</small></div>` : ""}</div>`;
}

/** Wire the controls (radio groups, slider labels) inside a container. */
export function bindGamePlan(box, { signal, onChange } = {}) {
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gp] [data-v]"); if (!b) return;
    const group = b.parentElement;
    group.querySelectorAll("[data-v]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
    const hint = group.parentElement.querySelector(".gp-hint");
    if (hint) hint.textContent = HINT[group.dataset.gp][b.dataset.v] || "";
    onChange?.(readGamePlan(box));
  }, { signal });
  box.addEventListener("input", (e) => {
    const r = e.target.closest("[data-min]"); if (!r) return;
    r.nextElementSibling.textContent = r.value;
    const total = [...box.querySelectorAll("[data-min]")].reduce((s, x) => s + Number(x.value), 0);
    const t = box.querySelector(".gp-total"); if (t) t.textContent = `Total ${total} → ${total ? "scaled to 200" : "default rotation"}`;
    onChange?.(readGamePlan(box));
  }, { signal });
}

export function readGamePlan(box) {
  const tactics = {};
  box.querySelectorAll("[data-gp]").forEach((g) => { tactics[g.dataset.gp] = g.querySelector(".on")?.dataset.v || DEFAULT_TACTICS[g.dataset.gp]; });
  const sliders = [...box.querySelectorAll("[data-min]")];
  const minutes = sliders.length ? Object.fromEntries(sliders.map((x) => [x.dataset.min, Number(x.value)])) : null;
  return { tactics, minutes };
}
