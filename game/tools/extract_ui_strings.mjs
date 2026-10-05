// Collects every piece of interface text from the game's code, for the Hebrew dictionary
// (game/js/i18n/he.js). Strings and template literals are read with a real JS parser; HTML inside
// templates is split into its text and its visible attributes (aria-label, title, placeholder, alt).
// Interpolations become {0}, {1}… so "Round ${i}/6" is one entry: "Round {0}/6".
//
//   node game/tools/extract_ui_strings.mjs            -> writes game/tools/ui_strings.json
//   node game/tools/extract_ui_strings.mjs --missing  -> lists entries the dictionary doesn't cover yet
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIRS = ["game/js", "server"];
const SKIP = /[\\/](data|i18n)[\\/]|database_helpers/;
const M = "\u0001"; // interpolation marker

function files(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith(".js") && !SKIP.test(p)) out.push(p);
  }
  return out;
}

function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== "string") return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, fn, node));
    else if (v && typeof v.type === "string") walk(v, fn, node);
  }
}

const VISIBLE_ATTRS = /\b(aria-label|title|placeholder|alt|aria-description|data-tip)\s*=\s*"([^"]*)"/g;

/** Split an HTML-ish string into text pieces and visible attribute values. */
function pieces(s) {
  if (!/[<>]/.test(s)) return [s];
  const out = [];
  let i = 0, text = "";
  while (i < s.length) {
    const c = s[i];
    if (c === "<" && /[a-zA-Z/!]/.test(s[i + 1] || "")) {
      // a tag: read to its closing ">" outside quotes
      let j = i + 1, q = null;
      while (j < s.length) {
        const d = s[j];
        if (q) { if (d === q) q = null; } else if (d === '"' || d === "'") q = d; else if (d === ">") break;
        j++;
      }
      out.push(text); text = "";
      const tag = s.slice(i, j + 1);
      for (const m of tag.matchAll(VISIBLE_ATTRS)) out.push(m[2]);
      i = j + 1;
      continue;
    }
    text += c; i++;
  }
  out.push(text);
  return out;
}

// HTML entities in templates show up decoded on screen
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&middot;": "·", "&times;": "×", "&rarr;": "→", "&larr;": "←" };
const decode = (s) => s.replace(/&[a-z#0-9]+;/g, (e) => ENT[e] ?? e);

/** The text as it can appear on screen: with the values at its edges (a number before "-point night")
 *  and without them (an icon before "Watch live" is its own element). */
function variants(raw) {
  const s = decode(raw).replace(/\s+/g, " ").trim();
  const bare = s.replace(new RegExp(`^(?:${M}\\d+${M}\\s*)+`), "").replace(new RegExp(`(?:\\s*${M}\\d+${M})+$`), "").trim();
  return [...new Set([s, bare])].map(normalize).filter(Boolean);
}
function normalize(s) {
  if (!s) return null;
  let n = 0;
  const seen = new Map();
  s = s.replace(new RegExp(`${M}(\\d+)${M}`, "g"), (_, k) => { if (!seen.has(k)) seen.set(k, n++); return `{${seen.get(k)}}`; });
  const letters = s.replace(/\{\d+\}/g, "");
  if (!/[A-Za-z]{2,}/.test(letters)) return null;
  return s;
}

/** Plain string literals: keep the ones that read like text, not code (keys, classes, selectors, URLs). */
function textLike(s) {
  if (/^[a-z0-9_:\-./#[\]=*>+~$@%!?,]+$/.test(s)) return false; // keys, classes, events
  if (/^[#.[]|^https?:|^\/|^data:|=>|^[a-z-]+\(|;\s*$|^[a-z]+(\s+[a-z-]+)+$/.test(s)) return false; // selectors, css, "btn primary"
  if (/^(rgba?|hsla?|var|url|translate|scale)\(/.test(s)) return false;
  if (/^[A-Z_]{2,}$/.test(s) && s.length <= 4) return false; // PG, SF, FG…
  return /\s/.test(s) || /^[A-Z][a-z]/.test(s);
}

const out = new Map(); // text -> Set of "file:line"
function add(text, where) {
  if (!text) return;
  if (!out.has(text)) out.set(text, new Set());
  out.get(text).add(where);
}

for (const dir of DIRS) {
  for (const file of files(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8");
    let ast;
    try { ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true }); }
    catch (e) { console.error("parse failed", file, e.message); continue; }
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    walk(ast, (node, parent) => {
      const where = `${rel}:${node.loc.start.line}`;
      if (node.type === "TemplateLiteral") {
        const full = node.quasis.map((q, i) => (q.value.cooked ?? q.value.raw) + (i < node.expressions.length ? `${M}${i}${M}` : "")).join("");
        for (const p of pieces(full)) variants(p).forEach((v) => add(v, where));
      } else if (node.type === "Literal" && typeof node.value === "string") {
        if (parent?.type === "ImportDeclaration" || parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportAllDeclaration") return;
        if (parent?.type === "Property" && parent.key === node) return; // object keys
        if (parent?.type === "MemberExpression") return;
        const v = node.value;
        if (/[<>]/.test(v)) { for (const p of pieces(v)) variants(p).forEach((x) => add(x, where)); return; }
        const t = v.replace(/\s+/g, " ").trim();
        if (t && textLike(t) && /[A-Za-z]{2,}/.test(t)) add(decode(t), where);
      }
    });
  }
}

// the page shell: header, navigation, footer
{
  const html = readFileSync(join(ROOT, "game/index.html"), "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, " ");
  for (const p of pieces(html)) variants(p).forEach((v) => add(v, "game/index.html:1"));
}

const entries = [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([text, w]) => ({ text, where: [...w].slice(0, 3) }));
if (process.argv.includes("--missing")) {
  const { HE } = await import(new URL("../js/i18n/he.js", import.meta.url));
  const missing = entries.filter((e) => !(e.text in HE));
  for (const e of missing) console.log(JSON.stringify(e.text), "  //", e.where[0]);
  console.error(`${missing.length} of ${entries.length} not translated`);
} else {
  writeFileSync(new URL("./ui_strings.json", import.meta.url), JSON.stringify(entries, null, 1));
  console.log(entries.length, "strings");
}
