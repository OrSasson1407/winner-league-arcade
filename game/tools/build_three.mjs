// Bundles three.js for the browser into game/vendor/three/: three.js (the WebGL renderer), webgpu.js (the
// WebGPU renderer and TSL, for Ultra quality), addons.js (loaders, post-processing, the mirror floor) and
// addons-gpu.js (Ultra's effects). Code splitting puts the shared three.js core in one chunk, so it is
// downloaded once and both renderers use the same classes.
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("game/vendor/three", { recursive: true, force: true });
await build({
  entryPoints: {
    three: "node_modules/three/build/three.module.js",
    webgpu: "game/tools/three_webgpu_entry.js",
    addons: "game/tools/three_addons_entry.js",
    "addons-gpu": "game/tools/three_addons_gpu_entry.js",
  },
  bundle: true, splitting: true, minify: true, format: "esm", outdir: "game/vendor/three", chunkNames: "core-[hash]", logLevel: "warning",
});
console.log("three.js bundled");
