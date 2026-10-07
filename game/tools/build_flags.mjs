// Copies the national flags the arcade needs (the 70 ranked national teams) from the flag-icons package
// (MIT license, https://github.com/lipis/flag-icons) into game/flags/, so they're served from this site.
// Run: npm run build:flags
import fs from "node:fs";
import { createRequire } from "node:module";
import { nationalIndex } from "../data/national_index.js";
import { FIBA_TO_ISO } from "../js/national.js";


const require = createRequire(import.meta.url);
const SRC = require.resolve("flag-icons/package.json").replace(/package\.json$/, "flags/4x3/");
const OUT = new URL("../flags/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const missing = [];
for (const [, , code] of nationalIndex.teams) {
  const iso = FIBA_TO_ISO[code];
  if (!iso || !fs.existsSync(SRC + iso + ".svg")) { missing.push(code); continue; }
  fs.copyFileSync(SRC + iso + ".svg", new URL(iso + ".svg", OUT));
}
fs.writeFileSync(new URL("LICENSE.txt", OUT), fs.readFileSync(SRC + "../../LICENSE"));
if (missing.length) { console.error("No flag for:", missing.join(", ")); process.exit(1); }
console.log(`${nationalIndex.teams.length} flags copied to game/flags/`);
