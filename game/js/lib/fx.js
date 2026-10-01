// Sound effects (synthesised with WebAudio, no audio files) and confetti.
import { store } from "../ui.js";

let ctx = null;
const audio = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

export const sound = {
  get on() { return store.get("sound", true); },
  set on(v) { store.set("sound", !!v); },
  toggle() { this.on = !this.on; return this.on; },
  play(name) {
    if (!this.on) return;
    try {
      const a = audio();
      const seq = SOUNDS[name] || SOUNDS.tick;
      seq.forEach(([freq, start, dur, type = "sine", vol = 0.12]) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, a.currentTime + start);
        g.gain.setValueAtTime(vol, a.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
        o.connect(g).connect(a.destination);
        o.start(a.currentTime + start);
        o.stop(a.currentTime + start + dur + 0.02);
      });
    } catch { /* audio unavailable */ }
  },
};

// [frequency Hz, start s, duration s, wave, volume]
const SOUNDS = {
  tick: [[900, 0, 0.04, "square", 0.05]],
  select: [[520, 0, 0.07], [780, 0.05, 0.09]],
  place: [[440, 0, 0.12, "triangle"], [660, 0.07, 0.16, "triangle"]],
  spin: [[300, 0, 0.05, "square", 0.04], [380, 0.06, 0.05, "square", 0.04], [460, 0.12, 0.05, "square", 0.04], [620, 0.18, 0.12, "square", 0.05]],
  bad: [[220, 0, 0.18, "sawtooth", 0.07], [160, 0.12, 0.22, "sawtooth", 0.07]],
  warn: [[880, 0, 0.08, "square", 0.06]],
  win: [[523, 0, 0.14, "triangle"], [659, 0.12, 0.14, "triangle"], [784, 0.24, 0.14, "triangle"], [1047, 0.36, 0.35, "triangle", 0.14]],
};

export function confetti(durationMs = 2600) {
  const c = document.createElement("canvas");
  c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60";
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext("2d");
  const colors = ["#ff7a1a", "#ffb057", "#22c55e", "#3b82f6", "#eab308", "#ef4444", "#ffffff"];
  const parts = Array.from({ length: 170 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4,
    vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 5,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.col; g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); g.restore();
    }
    if (t - t0 < durationMs) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
