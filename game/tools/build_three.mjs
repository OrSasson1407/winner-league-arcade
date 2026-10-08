// Bundles three.js for the browser: game/vendor/three.min.js (the core) and game/vendor/three-addons.min.js
// (loaders, post-processing...; it imports the core from ./three.min.js so the core is downloaded once).
import { build } from "esbuild";

await build({ entryPoints: ["node_modules/three/build/three.module.js"], bundle: true, minify: true, format: "esm", outfile: "game/vendor/three.min.js", logLevel: "warning" });
await build({
  entryPoints: ["game/tools/three_addons_entry.js"], bundle: true, minify: true, format: "esm", outfile: "game/vendor/three-addons.min.js", logLevel: "warning",
  plugins: [{ name: "three-core", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "./three.min.js", external: true })); } }],
});
console.log("three.js bundled");
