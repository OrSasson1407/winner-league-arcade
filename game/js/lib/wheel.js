// Spin wheel for the draft: club segments in their colours, a pointer at the top, and a spin that
// lands on the real result. Purely visual (the spin is decided before it starts).
import { clubColors } from "./clubs.js";
import { esc } from "../ui.js";
import { reducedMotion } from "./settings.js";
import { sound } from "./fx.js";

const abbr = (name) => {
  const w = String(name).replace(/[^A-Za-z' ]/g, " ").split(/\s+/).filter((x) => x.length > 1 && !/^(bc|the|tours|eshet)$/i.test(x));
  return (w.length >= 2 ? w[0][0] + w[w.length - 1][0] : (w[0] || "?").slice(0, 3)).toUpperCase();
};

function wheelSvg(segs) {
  const n = segs.length, R = 100, cx = 110, cy = 110;
  const pt = (a, r = R) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  return `<svg viewBox="0 0 220 220" class="wheel-svg" aria-hidden="true">
    <circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="#1b2744" stroke="#f5c542" stroke-width="3"/>
    <g class="wheel-rot">${segs.map((s, i) => {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1), [tx, ty] = pt(am, R * 0.68);
      const [c1, c2] = clubColors(s.id);
      return `<path d="M${cx} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${c1}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${(am * 180 / Math.PI).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="middle"
          font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="13" fill="${c2}" stroke="rgba(0,0,0,.45)" stroke-width=".5" paint-order="stroke">${esc(abbr(s.name))}</text>`;
    }).join("")}
      <circle cx="${cx}" cy="${cy}" r="18" fill="#0f1628" stroke="#f5c542" stroke-width="3"/>
      <path d="M${cx - 9} ${cy}h18M${cx} ${cy - 9}v18" stroke="#ff7a1a" stroke-width="2.5"/></g>
    <path d="M${cx - 10} 2h20l-10 18z" fill="#ff7a1a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

/**
 * Show the wheel over `host`, spin to `final` ({ id, name }) among `others`, then call done().
 * Returns a cancel function.
 */
export function spinWheel(host, { final, others, season }, done = () => {}) {
  if (!host || reducedMotion()) { done(); return () => {}; }
  const n = 12;
  const segs = others.slice(0, n - 1).map((t) => ({ id: t.id, name: t.name }));
  while (segs.length < n - 1) segs.push({ id: final.id, name: final.name });
  const at = Math.floor(Math.random() * n);
  segs.splice(at, 0, final);
  const ov = document.createElement("div");
  ov.className = "wheel-ov";
  ov.innerHTML = `${wheelSvg(segs)}<div class="wheel-label"><small>${esc(season)}</small><b>Spinning…</b></div>`;
  host.appendChild(ov);
  const rot = ov.querySelector(".wheel-rot");
  // land with the chosen segment's middle under the top pointer, after a few full turns
  const segDeg = 360 / n, target = 360 * 5 + (360 - (at + 0.5) * segDeg) + (Math.random() - 0.5) * segDeg * 0.5;
  rot.style.transformOrigin = "110px 110px";
  rot.style.transform = "rotate(0deg)";
  void rot.getBoundingClientRect();
  rot.style.transition = "transform 2.1s cubic-bezier(.12,.72,.18,1)";
  rot.style.transform = `rotate(${target}deg)`;
  let ticks = 0;
  const tick = setInterval(() => { if (++ticks < 16) sound.play("tick"); }, 110);
  const t1 = setTimeout(() => {
    clearInterval(tick);
    ov.querySelector(".wheel-label b").textContent = final.name;
    ov.classList.add("landed");
    sound.play("place");
  }, 2150);
  const t2 = setTimeout(() => { ov.classList.add("out"); }, 2900);
  const t3 = setTimeout(() => { ov.remove(); done(); }, 3250);
  return () => { clearInterval(tick); [t1, t2, t3].forEach(clearTimeout); ov.remove(); };
}
