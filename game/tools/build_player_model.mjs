// Compresses the 3D player for the web: game/vendor/models/player.glb.
//   node game/tools/build_player_model.mjs <input .glb or .gltf>
// The input: the Blender build (game/tools/blender/build_player_ubc.py: Quaternius's Universal Base Characters
// body, eyes, eyebrows and hairstyles, with the Universal Animation Library retargeted onto it; both CC0; and
// basketball moves from CMU's motion capture database).
// Here: only the animations the arcade uses, no finger animation (it can't be seen), smaller WebP textures
// (body 1024 px, hair and eyes 512 px; no roughness map), quantized vertices, and nothing left unused.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const KEEP = ["Idle_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Walk_Loop", "Jump_Start", "Jump_Loop", "Jump_Land", "Dance_Loop", "Spell_Simple_Shoot",
  "Dribble_Loop", "Dribble_Walk", "Shot_Jump", "Shot_Set"]; // the last four: CMU motion capture (see build_player_ubc.py)
const OUT = "game/vendor/models/player.glb";
const src = process.argv[2];
if (!src) { console.error("usage: node game/tools/build_player_model.mjs <input .glb/.gltf>"); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ sharp });
const doc = await io.read(src);
const root = doc.getRoot();
for (const a of root.listAnimations()) {
  if (!KEEP.includes(a.getName())) { a.dispose(); continue; }
  for (const c of a.listChannels()) if (/index|middle|ring|pinky|thumb|f_|leaf/i.test(c.getTargetNode()?.getName() || "")) { c.getSampler()?.dispose(); c.dispose(); }
}
for (const m of root.listMaterials()) { m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.6); m.setMetallicFactor(0); }
await doc.transform(
  resample(), dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], pattern: /Superhero/i, quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], pattern: /Hair|Eye/i, quality: 80 }),
  quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }), prune(),
);
await io.write(OUT, doc);
// read it back and drop the accessors nothing uses any more (some survive the first write)
const back = await io.read(OUT);
let dropped = 0;
for (const acc of back.getRoot().listAccessors()) if (acc.listParents().every((p) => p.propertyType === "Root" || p.propertyType === "Buffer")) { acc.dispose(); dropped++; }
await io.write(OUT, back);
console.log("unused accessors dropped:", dropped);
console.log("animations:", back.getRoot().listAnimations().map((a) => a.getName()).join(", "));
console.log("textures:", back.getRoot().listTextures().map((t) => `${t.getName()} ${t.getMimeType()} ${Math.round(t.getImage().byteLength / 1024)}KB`).join(", "));
