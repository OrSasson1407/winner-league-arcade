// Builds the right-to-left (Hebrew) copies of the stylesheets: css/style.rtl.css and css/broadcast.rtl.css.
// Left and right are swapped everywhere (margins, padding, positions, borders, corners, alignment).
// Run after changing either stylesheet:   node game/tools/build_rtl.mjs
// A rule that must not be mirrored can carry /*rtl:ignore*/ (see the rtlcss documentation).
import { readFileSync, writeFileSync } from "node:fs";
import rtlcss from "rtlcss";

for (const name of ["style", "broadcast"]) {
  const src = new URL(`../css/${name}.css`, import.meta.url);
  const css = readFileSync(src, "utf8");
  const out = rtlcss.process(css);
  writeFileSync(new URL(`../css/${name}.rtl.css`, import.meta.url), `/* Generated from ${name}.css by game/tools/build_rtl.mjs: do not edit by hand */\n${out}`);
  console.log(`${name}.rtl.css`, out.length);
}
