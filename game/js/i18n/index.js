// Interface language. The code is written in English; Hebrew comes from a dictionary (he.js) that is
// applied to the page as it renders: text and visible attributes (aria-label, title, placeholder, alt)
// are swapped as they appear. The data (player and club names, seasons, numbers) is never in the
// dictionary, so it stays as it is. Entries can hold values: "Round {0}/6" -> "סיבוב {0}/6".
// The direction (dir="rtl") and the mirrored stylesheets are set in index.html before the first paint.
export const LANGS = { en: "English", he: "עברית" };

export function getLang() {
  try { return JSON.parse(localStorage.getItem("wla:settings") || "{}").lang === "he" ? "he" : "en"; } catch { return "en"; }
}
export const isRtl = () => document.documentElement.dir === "rtl";

let exact = null; // English text -> Hebrew
let lower = null; // the same, by lower-case English (text the code writes in capitals)
let patterns = []; // entries with values: { re, order, he, needle }
const memo = new Map();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An entry with a value at its start or end ("{0} Watch live") is also used without it: the value is
 *  often an icon or an element of its own, and the text around it then stands alone. */
function variants(en, he) {
  const out = [[en, he]];
  const lead = /^\{(\d+)\}\s*/.exec(en), trail = /\s*\{(\d+)\}$/.exec(en);
  const drop = (h, k) => h.replace(new RegExp(`\\s*\\{${k}\\}\\s*`), " ").trim();
  if (lead) out.push([en.slice(lead[0].length), drop(he, lead[1])]);
  if (trail) out.push([en.slice(0, en.length - trail[0].length), drop(he, trail[1])]);
  if (lead && trail && lead.index + lead[0].length < trail.index) out.push([en.slice(lead[0].length, trail.index), drop(drop(he, lead[1]), trail[1])]);
  return out;
}

function build(dict) {
  exact = new Map();
  lower = new Map();
  patterns = [];
  const all = Object.entries(dict).filter(([, he]) => he).flatMap(([en, he]) => variants(en, he));
  for (const [en, he] of all) {
    if (!/[A-Za-z]/.test(en)) continue;
    if (!/\{\d+\}/.test(en)) { if (!exact.has(en) || dict[en]) exact.set(en, he); if (!lower.has(en.toLowerCase())) lower.set(en.toLowerCase(), he); continue; }
    const parts = en.split(/(\{\d+\})/).filter((p) => p !== "");
    const order = [];
    let re = "^";
    for (const p of parts) {
      const m = /^\{(\d+)\}$/.exec(p);
      if (m) { re += "(.*?)"; order.push(Number(m[1])); } else re += reEsc(p);
    }
    const needle = parts.filter((p) => !/^\{\d+\}$/.test(p)).sort((a, b) => b.length - a.length)[0] || "";
    patterns.push({ re: new RegExp(re + "$", "s"), order, he, needle, weight: needle.length * 10 + en.length });
  }
  patterns.sort((a, b) => b.weight - a.weight); // the most specific entry wins
}

const PREFIX = /(^|[\s(])([בלמוהשכ])(?=[A-Za-z0-9])/g;
// a value inside a sentence is a name, a number, a short label or a short list ("Bronze · Silver 1100"),
// never a whole sentence, and it never starts or ends with a separator
const fitsValue = (v) => {
  if (/^[\s·:,;]|[\s·:,;]$/.test(v)) return false;
  const words = v.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  return v.includes(" · ") ? v.length <= 120 && words <= 10 : v.length <= 60 && words <= 6;
};

// English words left in a value ("cups aren't included") mean the entry matched the wrong sentence;
// names and labels start with capitals, and interface words in a value get translated themselves
const prose = (v) => /(^|\s)[a-z][a-z']{2,}/.test(v) && !/[֐-׿]/.test(tr(v.trim()));

function byPattern(core, depth) {
  for (const p of patterns) {
    if (!core.includes(p.needle)) continue;
    const r = p.re.exec(core);
    if (!r || !r.slice(1).every(fitsValue) || r.slice(1).some(prose)) continue;
    return p.he.replace(/\{(\d+)\}/g, (_, k) => {
      const i = p.order.indexOf(Number(k));
      const v = i >= 0 ? r[i + 1] : "";
      const t = depth < 3 ? translate(v, depth + 1) : v; // a value can itself be interface text ("Ranked", "Silver 1100")
      // an English name inside a Hebrew sentence is isolated, so its punctuation stays on its side: "(אסיסט Max Heidegger)"
      return /[A-Za-z]/.test(t) && !/[֐-׿]/.test(t) ? `⁨${t}⁩` : t;
    }).replace(PREFIX, "$1$2־").replace(/([בלמוהשכ])⁨/g, "$1־⁨"); // ב/ל/מ… joined to a Latin name or a number takes a maqaf: "ב־Hapoel"
  }
  return null;
}

const SEP = /^([\s·•:|,–\-]*)([\s\S]*?)([\s·•:|,–\-]*)$/;
/** The core lookup: whole text, then the same in other case, then by parts. */
function lookup(core, depth) {
  const hit = exact.get(core) ?? lower.get(core.toLowerCase()) ?? byPattern(core, depth);
  if (hit != null || depth >= 3) return hit;
  // separators at the edges ("· Speed duel", "Career totals:")
  const e = SEP.exec(core);
  if ((e[1] || e[3]) && e[2] && /[A-Za-z]/.test(e[2])) { const h = lookup(e[2], depth + 1); if (h != null) return e[1] + h + e[3]; }
  // two sentences from two places in the code: each on its own
  const sentences = core.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (sentences.length > 1) {
    const done = sentences.map((x) => translate(x, depth + 1));
    if (done.some((x, i) => x !== sentences[i])) return done.join(" ");
  }
  // a list ("Draft: 6 · Guess: 3"): each part on its own
  if (core.includes(" · ")) {
    const parts = core.split(" · ").map((x) => translate(x, depth + 1));
    if (parts.join(" · ") !== core) return parts.join(" · ");
  }
  // a number or date next to a label ("Silver 1100", "Unlocked 1.10.2026", "6 Oct")
  const n = /^(.*?[A-Za-z].*?)(\s*[:#]?\s*[-+−]?\d[\d.,:/%+\-–]*)$/.exec(core) || /^([-+−]?\d[\d.,:/%]*\s+)(.*[A-Za-z].*)$/.exec(core);
  if (n) {
    const numFirst = /\d/.test(n[1].trim()[0] || "");
    const word = lookup((numFirst ? n[2] : n[1]).trim(), depth + 1);
    if (word != null) return numFirst ? n[1] + word : word + n[2];
  }
  return null;
}

function translate(s, depth) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  const core = m[2].replace(/\s+/g, " ");
  if (!core || !/[A-Za-z]/.test(core)) return s;
  const hit = lookup(core, depth);
  return hit == null ? s : m[1] + hit + m[3];
}

/** Format a sentence from a dictionary entry: trf("Born in {0}", year). English when not translated. */
export function trf(key, ...vals) {
  const t = (exact && exact.get(key)) || key;
  return t.replace(/\{(\d+)\}/g, (_, i) => vals[i] ?? "");
}
/** Dates in the interface language. */
export const dateLocale = () => (getLang() === "he" ? "he-IL" : "en-GB");

/** Translate one piece of interface text (unchanged when it isn't in the dictionary, or in English). */
export function tr(s) {
  if (!exact || typeof s !== "string" || !/[A-Za-z]/.test(s)) return s;
  if (memo.has(s)) return memo.get(s);
  const out = translate(s, 0);
  if (memo.size > 30000) memo.clear();
  memo.set(s, out);
  return out;
}

// ------------------------------------------------------------------ the page
const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT"]);
const ATTRS = ["aria-label", "title", "placeholder", "alt", "aria-roledescription"];
const skipped = (el) => !el || SKIP.has(el.tagName) || el.closest("[data-no-tr]");

function text(n) {
  const v = n.nodeValue;
  if (!v || !/[A-Za-z]/.test(v) || skipped(n.parentElement)) return;
  const t = tr(v);
  if (t !== v) n.nodeValue = t;
  // data left in English (a team and its season, "Bnei Herzliya 2025-26") is isolated, so the season
  // stays next to its name inside a right-to-left line
  else if (/\d/.test(v) && !/[֐-׿⁨]/.test(v) && /[A-Za-z]{2}/.test(v)) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(v);
    n.nodeValue = `${m[1]}⁨${m[2]}⁩${m[3]}`;
  }
}
function attrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && /[A-Za-z]/.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
  }
}
function deep(root) {
  if (root.nodeType === 3) return text(root);
  if (root.nodeType !== 1 || skipped(root)) return;
  attrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && SKIP.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) text(n); else if (!n.hasAttribute("data-no-tr")) attrs(n); }
}

/** Start Hebrew: load the dictionary, translate the page, and keep translating what renders next. */
/** Load a dictionary without touching the page (tests, tools). */
export function useDictionary(dict) { build(dict); memo.clear(); }

export async function startHebrew() {
  const { HE } = await import("./he.js");
  useDictionary(HE);
  deep(document.documentElement);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(deep);
      else if (r.type === "characterData") text(r.target);
      else if (r.type === "attributes" && r.target.nodeType === 1) attrs(r.target);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // text drawn on canvases (share cards): translated too, laid out left to right as designed
  const C = CanvasRenderingContext2D.prototype;
  for (const fn of ["fillText", "strokeText", "measureText"]) {
    const orig = C[fn];
    C[fn] = function (t, ...rest) { if (this.direction === "inherit") this.direction = "ltr"; return orig.call(this, tr(String(t)), ...rest); };
  }
}
