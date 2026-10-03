// Big card view: press and hold a player card (or press V on a focused card) to see it full size.
// The card tilts with the pointer and flips over (click / Enter) to show its season stats on the back.
import { playersById, psByKey, teamName } from "../data.js";
import { playerCard } from "../components/playerCard.js";
import { reducedMotion } from "./settings.js";
import { esc, fmt1 } from "../ui.js";
import { announce } from "./a11y.js";
import { icon } from "./icons.js";

const HOLD_MS = 450;
let overlay = null, lastFocus = null;

function backHtml(ps) {
  const p = playersById.get(ps.player_id), s = ps.stats || {};
  const row = (l, v) => `<div class="cv-stat"><small>${l}</small><b>${v ?? "–"}</b></div>`;
  return `<div class="cv-back-in">
    <small class="muted">${esc(teamName(ps.team_id))} · ${ps.season}</small>
    <h3>${esc(p.name)}</h3>
    <div class="cv-stats">
      ${row("Games", s.games)}${row("Minutes", fmt1(s.mpg))}${row("Points", fmt1(s.ppg))}${row("Rebounds", fmt1(s.rpg))}
      ${row("Assists", fmt1(s.apg))}${row("Steals", fmt1(s.spg))}${row("Blocks", fmt1(s.bpg))}${row("Efficiency", fmt1(s.valuation_per_game))}
      ${row("FG%", s.fg_pct != null ? fmt1(s.fg_pct) : null)}${row("3P%", s.fg3_pct != null ? fmt1(s.fg3_pct) : null)}${row("FT%", s.ft_pct != null ? fmt1(s.ft_pct) : null)}${row("Rating", ps.rating_mock)}
    </div>
  </div>`;
}

export function openCardView(ps) {
  closeCardView();
  lastFocus = document.activeElement;
  const p = playersById.get(ps.player_id);
  overlay = document.createElement("div");
  overlay.className = "card-view";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${p.name} card`);
  overlay.innerHTML = `<div class="cv-stage">
      <button class="cv-flip" aria-label="Flip the card" aria-pressed="false">
        <span class="cv-inner"><span class="cv-front">${playerCard(ps, { size: "lg", info: false })}</span><span class="cv-back">${backHtml(ps)}</span></span>
      </button>
      <div class="cv-actions"><button class="btn" data-profile="${ps.player_id}">${icon("user", { size: 15 })} Full career</button>
        <span class="cv-hint">Tap the card to flip it · Esc or tap outside to close</span></div>
    </div>
    <button class="icon-btn cv-close" aria-label="Close">${icon("close", { size: 20 })}</button>`;
  document.body.appendChild(overlay);
  const flip = overlay.querySelector(".cv-flip"), inner = overlay.querySelector(".cv-inner");
  flip.addEventListener("click", () => {
    const on = !flip.classList.toggle("flipped") ? false : true;
    flip.setAttribute("aria-pressed", String(on));
    announce(on ? "Showing card back: season stats" : "Showing card front");
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest(".cv-close")) closeCardView(); });
  if (!reducedMotion()) {
    overlay.addEventListener("pointermove", (e) => {
      const r = flip.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / r.width, y = (e.clientY - (r.top + r.height / 2)) / r.height;
      inner.style.setProperty("--rx", `${(-y * 14).toFixed(1)}deg`);
      inner.style.setProperty("--ry", `${(x * 18).toFixed(1)}deg`);
      inner.style.setProperty("--gx", `${50 + x * 60}%`);
      inner.style.setProperty("--gy", `${50 + y * 60}%`);
    });
  }
  setTimeout(() => overlay?.classList.add("in"), 16);
  flip.focus();
  announce(`${p.name}, ${teamName(ps.team_id)} ${ps.season}. Big card view.`);
}

export function closeCardView() {
  if (!overlay) return;
  overlay.remove(); overlay = null;
  lastFocus?.focus?.();
}

/** Long-press on any player card opens the big view (cards carry their key in data-ps). */
export function initCardView() {
  let timer = null, startX = 0, startY = 0, fired = false;
  const cardAt = (t) => t.closest?.(".pc[data-ps]");
  document.addEventListener("pointerdown", (e) => {
    const c = cardAt(e.target);
    if (!c || e.button > 0 || e.target.closest("button:not(.pc)")) return;
    startX = e.clientX; startY = e.clientY; fired = false;
    c.classList.add("pressing");
    timer = setTimeout(() => { fired = true; c.classList.remove("pressing"); const ps = psByKey(c.dataset.ps); if (ps) openCardView(ps); }, HOLD_MS);
  });
  const cancel = () => { clearTimeout(timer); timer = null; document.querySelectorAll(".pc.pressing").forEach((c) => c.classList.remove("pressing")); };
  document.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel(); });
  document.addEventListener("pointerup", cancel);
  document.addEventListener("pointercancel", cancel);
  // the click that ends a long press must not also pick / open
  document.addEventListener("click", (e) => { if (fired && cardAt(e.target)) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  document.addEventListener("contextmenu", (e) => { if (cardAt(e.target)) e.preventDefault(); });
  document.addEventListener("keydown", (e) => {
    if (overlay && e.key === "Escape") { e.preventDefault(); closeCardView(); return; }
    if (overlay && e.key === "Tab") { // keep focus inside the dialog
      const f = [...overlay.querySelectorAll("button")]; const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length]?.focus();
    }
    if (!overlay && (e.key === "v" || e.key === "V") && !e.target.closest?.("input,textarea,select")) {
      const c = document.activeElement?.closest?.(".pc[data-ps]") || document.activeElement?.querySelector?.(".pc[data-ps]");
      if (c) { e.preventDefault(); const ps = psByKey(c.dataset.ps); if (ps) openCardView(ps); }
    }
  });
}
