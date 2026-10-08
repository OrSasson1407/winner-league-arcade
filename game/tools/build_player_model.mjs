// Builds game/vendor/models/player.glb from Quaternius's Universal Animation Library (CC0), glTF version:
// the mannequin and only the animations the arcade uses, with quantized vertices (smaller download).
//   node game/tools/build_player_model.mjs <path to AnimationLibrary_Godot_Standard.gltf>
import { NodeIO } from "@gltf-transform/core";
import { prune, quantize, dedup, resample } from "@gltf-transform/functions";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const KEEP = ["Idle_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Walk_Loop", "Jump_Start", "Jump_Loop", "Jump_Land", "Dance_Loop", "Spell_Simple_Shoot"];
const src = process.argv[2];
if (!src) { console.error("usage: node game/tools/build_player_model.mjs <AnimationLibrary_Godot_Standard.gltf>"); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const a of doc.getRoot().listAnimations()) {
  if (!KEEP.includes(a.getName())) { a.dispose(); continue; }
  // the fingers barely move from a distance: their channels are most of the file
  for (const c of a.listChannels()) if (/f_(index|middle|ring|pinky)|thumb/.test(c.getTargetNode()?.getName() || "")) { c.getSampler()?.dispose(); c.dispose(); }
}
await doc.transform(resample(), dedup(), prune(), quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }), prune()); // prune again: quantizing leaves the old data behind
await io.write("game/vendor/models/player.glb", doc);
// read it back and drop the accessors nothing uses any more (some survive the first write)
const back = await io.read("game/vendor/models/player.glb");
let dropped = 0;
for (const acc of back.getRoot().listAccessors()) if (acc.listParents().every((p) => p.propertyType === "Root" || p.propertyType === "Buffer")) { acc.dispose(); dropped++; }
await io.write("game/vendor/models/player.glb", back);
console.log("unused accessors dropped:", dropped);
console.log("animations:", doc.getRoot().listAnimations().map((a) => a.getName()).join(", "));
