// Shot animation for answers: a correct answer swishes through the net, a wrong one rattles off
// the rim. Short (≈1 s), never blocks input, and skipped when animations are reduced.
import { reducedMotion } from "./settings.js";

const W = 150, H = 130;
const HOOP = { x: 104, y: 46, r: 15 }; // rim centre and half-width

function svg(ok) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <rect x="${HOOP.x - 6}" y="12" width="40" height="30" rx="3" fill="rgba(255,255,255,.92)" stroke="#cfd6e4" stroke-width="2"/>
    <rect x="${HOOP.x + 4}" y="22" width="18" height="13" rx="1.5" fill="none" stroke="#e5484d" stroke-width="2"/>
    <g class="shot-net ${ok ? "swish" : ""}" stroke="rgba(255,255,255,.85)" stroke-width="1.4" fill="none">
      <path d="M${HOOP.x - HOOP.r} ${HOOP.y} L${HOOP.x - 9} ${HOOP.y + 22} M${HOOP.x + HOOP.r} ${HOOP.y} L${HOOP.x + 9} ${HOOP.y + 22}
        M${HOOP.x - 7} ${HOOP.y} L${HOOP.x - 3} ${HOOP.y + 22} M${HOOP.x + 7} ${HOOP.y} L${HOOP.x + 3} ${HOOP.y + 22}
        M${HOOP.x - 12} ${HOOP.y + 8} H${HOOP.x + 12} M${HOOP.x - 10} ${HOOP.y + 16} H${HOOP.x + 10}"/>
    </g>
    <g class="shot-ball"><circle r="9" fill="#ff7a1a" stroke="#3b1d06" stroke-width="1.5"/><path d="M-9 0H9M0 -9V9M-6 -6c3 3 3 9 0 12M6 -6c-3 3-3 9 0 12" stroke="#3b1d06" stroke-width="1.2" fill="none"/></g>
    <rect class="shot-rim" x="${HOOP.x - HOOP.r - 2}" y="${HOOP.y - 2}" width="${HOOP.r * 2 + 4}" height="4" rx="2" fill="#ff5a1f"/>
    <text class="shot-word" x="${W / 2}" y="${H - 6}" text-anchor="middle">${ok ? "SWISH!" : "CLANK"}</text>
  </svg>`;
}

/** Play the shot near an element (or at the top centre of the screen). */
export function shot(ok, anchor = null) {
  if (reducedMotion()) return;
  const el = document.createElement("div");
  el.className = `shot-fx ${ok ? "ok" : "miss"}`;
  el.innerHTML = svg(ok);
  const r = anchor?.getBoundingClientRect?.();
  const x = r ? Math.min(innerWidth - W - 8, Math.max(8, r.left + r.width / 2 - W / 2)) : innerWidth / 2 - W / 2;
  const y = r ? Math.max(70, r.top - H + 10) : 90;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  document.body.appendChild(el);
  const ball = el.querySelector(".shot-ball");
  const start = { x: 16, y: 112 }, dur = 720;
  // swish: through the middle of the rim; miss: hits the front rim, then bounces back and out
  const end = ok ? { x: HOOP.x, y: HOOP.y + 26 } : { x: HOOP.x - HOOP.r + 2, y: HOOP.y - 6 };
  const peak = 2;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    let px, py;
    if (ok || t < 0.72) {
      const u = ok ? t : t / 0.72;
      px = start.x + (end.x - start.x) * u;
      py = start.y + (end.y - start.y) * u - Math.sin(Math.PI * Math.min(1, u * (ok ? 0.92 : 1))) * (start.y - peak);
    } else { // bounce off the rim
      const u = (t - 0.72) / 0.28;
      px = end.x - 30 * u;
      py = end.y - 18 * Math.sin(Math.PI * u) + 40 * u * u;
      if (u > 0.02) el.querySelector(".shot-rim").classList.add("hit");
    }
    ball.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${(t * 540).toFixed(0)})`);
    if (t < 1) requestAnimationFrame(step);
    else { el.classList.add("done"); setTimeout(() => el.remove(), 450); }
  };
  requestAnimationFrame(step);
  setTimeout(() => el.remove(), 2500); // safety net when frames don't run (hidden tab)
}
