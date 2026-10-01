// Match "feel": vibration on phones, a spoken / beeped countdown, and the last-seconds tick.
import { sound } from "../lib/fx.js";
import { reducedMotion } from "../lib/settings.js";

/** Vibrate (phones that support it). */
export function buzz(pattern = 60) {
  try { if (!reducedMotion()) navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/** Say a short word with the browser's voice; falls back to a beep. */
export function say(text, beep = "tick") {
  if (!sound.on) return;
  try {
    const synth = window.speechSynthesis;
    if (synth && window.SpeechSynthesisUtterance) {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 1.1; u.volume = 0.9;
      synth.speak(u);
      return;
    }
  } catch { /* no speech */ }
  sound.play(beep);
}

/** 3-2-1-Go before a match: voice + beeps + a buzz on "Go". Returns a cancel function. */
export function countdown(untilMs) {
  const timers = [];
  for (const [n, word] of [[3, "Three"], [2, "Two"], [1, "One"], [0, "Go!"]]) {
    const at = untilMs - n * 1000 - Date.now();
    if (at < -200) continue;
    timers.push(setTimeout(() => { say(word, n ? "tick" : "warn"); if (!n) buzz(120); }, Math.max(0, at)));
  }
  return () => timers.forEach(clearTimeout);
}
