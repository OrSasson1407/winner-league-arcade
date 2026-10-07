// "How to play" tours: a few steps that point at the real parts of a game screen. Shown by itself the
// first time someone opens a game they've never played, and any time from the "How to play" button.
import { esc, store } from "../ui.js";
import { icon } from "./icons.js";
import { announce } from "./a11y.js";
import { reducedMotion } from "./settings.js";

/** Per game (route key): [selector, title, text]. A step whose element isn't on screen is skipped. */
export const TOURS = {
  "higher-lower": [
    ["#side-left", "The known side", "A real player-season with its number showing: points, rebounds, rating… depending on the round."],
    ["#side-right", "Higher or lower?", "Another real player-season, same stat, number hidden."],
    [".hl-btns", "Make the call", "Higher or Lower (↑ / ↓ on a keyboard). Every right answer grows the streak; one miss ends it."],
    [".hl-controls", "Your way", "Choose the stat, how close the pairs are and the game type."],
  ],
  guess: [
    [".guess-input", "Guess a player", "Type any name from 2010 to today. You have 8 tries."],
    [".grid-wrap", "Read the clues", "Each guess shows club, position, height, age, nationality and more, compared with the mystery player."],
    [".legend", "The colours", "Green is a match, yellow is close, and the arrows say if the answer is higher or lower."],
    [".hint-shop", "Stuck?", "A hint reveals a clue and costs one guess."],
    ["#mode", "Daily or free play", "Daily is the same player for everyone today; free play is as many as you like."],
  ],
  career: [
    [".path", "A real career", "The clubs and seasons of one player, in order."],
    [".choices", "Who is it?", "Pick the player: 3 points, or 2 if you used the hint. 10 careers per game."],
    ["#hint", "The hint", "Shows more about the player, for one point less."],
  ],
  connections: [
    [".cn-board", "16 players, 4 groups", "Each hidden group of four shares something: a club, a team-season, a stat, a birth year…"],
    [".cn-tile", "Select four", "Tap four players you think belong together."],
    ["#submit", "Submit", "Right: the group locks in. Wrong: a mistake. Four mistakes end the game."],
    ["#shuffle", "Shuffle", "Mix the board if you need fresh eyes."],
  ],
  grid: [
    [".gr-board", "Nine squares", "Every square is where a row meets a column: two clubs, or a club and an achievement."],
    [".gr-cell", "Fill a square", "Name a real player who fits both. 9 guesses for the whole board."],
    [".gr-side", "Rarity", "A less obvious right answer scores a higher rarity: go for the deep cuts."],
  ],
  draft: [
    [".setup", "Set up the draft", "Solo, against the computer or with friends on one device; add a pick timer, an era or a club."],
    ["#start", "Start", "You'll spin a real team-season each round and draft one of its players into your five."],
    [".rules", "Then the season", "Your five is rated and plays a simulated season: chemistry and positions matter."],
  ],
};

let active = null;

function place(box, tip, el) {
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(box.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const tw = Math.min(340, innerWidth - 24), th = tip.offsetHeight;
  const below = r.bottom + 14 + th < innerHeight || r.top < th + 24;
  const top = below ? Math.min(r.bottom + 14, innerHeight - th - 12) : r.top - th - 14;
  const left = Math.max(12, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 12));
  Object.assign(tip.style, { width: `${tw}px`, top: `${Math.max(12, top)}px`, left: `${left}px` });
}

/** Run a game's tour now. */
export function startTour(key) {
  active?.end();
  const steps = (TOURS[key] || []).map(([sel, title, text]) => ({ sel, title, text })).filter((s) => document.querySelector(`#view ${s.sel}`));
  if (!steps.length) return;
  let i = 0;
  const back = document.activeElement;
  const wrap = document.createElement("div");
  wrap.className = "tour";
  wrap.innerHTML = `<div class="tour-hole" aria-hidden="true"></div><div class="tour-tip card" role="dialog" aria-modal="true" aria-labelledby="tour-t"></div>`;
  document.body.appendChild(wrap);
  const hole = wrap.querySelector(".tour-hole"), tip = wrap.querySelector(".tour-tip");
  const target = () => document.querySelector(`#view ${steps[i].sel}`);
  const draw = () => {
    const s = steps[i], el = target();
    if (!el) return end();
    tip.innerHTML = `<small class="muted">HOW TO PLAY · ${i + 1}/${steps.length}</small><h3 id="tour-t">${esc(s.title)}</h3><p>${esc(s.text)}</p>
      <div class="row"><button class="btn ghost" data-t="end">Skip</button><span class="spacer"></span>
      ${i ? `<button class="btn" data-t="back">${icon("arrowLeft", { size: 14 })} Back</button>` : ""}
      <button class="btn primary" data-t="next">${i === steps.length - 1 ? `${icon("play", { size: 14 })} Let's play` : `Next ${icon("arrowRight", { size: 14 })}`}</button></div>`;
    el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    requestAnimationFrame(() => place(hole, tip, el));
    setTimeout(() => target() && place(hole, tip, target()), reducedMotion() ? 0 : 350);
    tip.querySelector("[data-t=next]").focus();
    announce(`${s.title}. ${s.text}`);
  };
  const reflow = () => target() && place(hole, tip, target());
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { // "next" follows the reading direction
      const fwd = (e.key === "ArrowRight") !== (document.documentElement.dir === "rtl");
      if (fwd && i < steps.length - 1) { i++; draw(); } else if (!fwd && i) { i--; draw(); }
    } else if (e.key === "Tab") { // keep focus inside the tip
      const f = [...tip.querySelectorAll("button")];
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  function end() {
    store.set(`tour:${key}`, true);
    wrap.remove();
    removeEventListener("resize", reflow); removeEventListener("scroll", reflow, true); removeEventListener("hashchange", end);
    document.removeEventListener("keydown", onKey, true);
    active = null;
    if (back?.isConnected) back.focus();
  }
  wrap.addEventListener("click", (e) => {
    const a = e.target.closest("[data-t]")?.dataset.t;
    if (a === "next") { if (i < steps.length - 1) { i++; draw(); } else end(); }
    else if (a === "back") { i--; draw(); }
    else if (a === "end") end();
  });
  addEventListener("resize", reflow); addEventListener("scroll", reflow, true); addEventListener("hashchange", end);
  document.addEventListener("keydown", onKey, true);
  active = { end };
  draw();
}

/** After a game screen draws: add the "How to play" button, and start the tour for a first-timer. */
export function initTour(key, view) {
  if (!TOURS[key]) return;
  setTimeout(() => {
    if (!view.isConnected || location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] !== key) return;
    const head = view.querySelector(".game-head");
    if (head && !head.querySelector(".tour-btn")) {
      const b = document.createElement("button");
      b.className = "btn ghost tour-btn";
      b.innerHTML = `${icon("info", { size: 15 })} <span class="hide-sm">How to play</span>`;
      b.setAttribute("aria-label", "How to play");
      b.addEventListener("click", () => startTour(key));
      head.appendChild(b);
    }
    const plays = key === "higher-lower" ? store.get("plays:hl", 0) + store.get("plays:higher-lower", 0) : store.get(`plays:${key}`, 0);
    if (!store.get(`tour:${key}`) && !plays && !document.querySelector("dialog[open]")) startTour(key);
  }, 400);
}
