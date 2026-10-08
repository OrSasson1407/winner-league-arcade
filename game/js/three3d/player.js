// A real rigged player for the 3D views: the mannequin from Quaternius's Universal Animation Library (CC0,
// game/vendor/models/player.glb, built by game/tools/build_player_model.mjs) with its own animations.
// The uniform is painted per body area without textures: every vertex gets an area from the bone that moves
// it most (torso = jersey, hips and thighs = shorts, lower shins = socks, feet = shoes, the rest = skin), and
// a small shader colours each area with the player's colours, so ten players share one model.
// Name and number decals, hair and the face are attached to bones, so they move with the body.
import { SKINS, HAIR_COLORS } from "../lib/avatarArt.js";
import { loadAddons, textTexture } from "./core.js";
import { addHair, addExtra, basketball } from "./figures.js";

const MODEL_URL = new URL("../../vendor/models/player.glb", import.meta.url).href;
// body areas (index into the colour array the shader reads)
const SKIN = 0, JERSEY = 1, TRIM = 2, SHORTS = 3, STRIPE = 4, SOCK = 5, SHOE = 6, SOLE = 7;

let assetP = null;
// three.js drops the dots from node names on load ("DEF-toe.L" becomes "DEF-toeL")
const clean = (n) => String(n).replace(/[.\s]/g, "");
/** Load the model once: the scene, the animation clips, and the body-area attribute for every vertex. */
export function loadPlayerAsset(T) {
  return (assetP ||= (async () => {
    const A = await loadAddons();
    const gltf = await new A.GLTFLoader().loadAsync(MODEL_URL);
    const meshes = [];
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    gltf.scene.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    // which way the model faces: the toes are in front of the ankles
    const bone = (n) => meshes[0].skeleton.bones.find((b) => clean(b.name) === clean(n));
    const wp = (b) => b.getWorldPosition(new T.Vector3());
    const facing = Math.sign(wp(bone("DEF-toe.L")).z - wp(bone("DEF-foot.L")).z) || 1;
    const headBox = new T.Box3();
    for (const m of meshes) paintAreas(T, m, { floor: box.min.y, height, facing, headBox });
    return { gltf, clips: Object.fromEntries(gltf.animations.map((c) => [c.name, c])), height, floor: box.min.y, facing, headBox, A };
  })());
}

/** The body-area attribute ("area") on a skinned mesh's geometry, from its skin weights and shape. */
function paintAreas(T, mesh, { floor, height, headBox }) {
  const g = mesh.geometry;
  if (g.getAttribute("area")) return;
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), J = g.getAttribute("skinIndex"), W = g.getAttribute("skinWeight");
  const names = mesh.skeleton.bones.map((b) => b.name);
  const v = new T.Vector3(), n = new T.Vector3(), tip = new T.Vector3();
  const area = new Float32Array(pos.count);
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (w > bw) { bw = w; best = J.getComponent(i, k); } }
    const name = names[best] || "";
    // where the vertex really is in the rest pose (after the skeleton), and which way it faces
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(nor, i);
    tip.fromBufferAttribute(pos, i).addScaledVector(n, 0.02);
    mesh.applyBoneTransform(i, tip).applyMatrix4(mesh.matrixWorld);
    n.subVectors(tip, v).normalize();
    const y = (v.y - floor) / height; // 0 at the floor, 1 at the top of the head
    if (clean(name) === "DEF-head") headBox.expandByPoint(v);
    let a = SKIN;
    if (/spine/.test(name)) a = Math.abs(n.x) > 0.8 ? TRIM : JERSEY; // side panels in the second colour
    else if (/shoulder/.test(name)) a = y > 0.79 ? SKIN : TRIM; // the jersey's straps
    else if (/hips/.test(name)) a = y > 0.56 ? JERSEY : SHORTS;
    else if (/thigh/.test(name)) a = y < 0.33 ? SKIN : Math.abs(n.x) > 0.82 ? STRIPE : SHORTS; // shorts to the knee, stripe on the outside
    else if (/shin/.test(name)) a = y < 0.12 ? SOCK : SKIN;
    else if (/foot|toe/.test(name)) a = y < 0.012 ? SOLE : SHOE;
    area[i] = a;
  }
  g.setAttribute("area", new T.BufferAttribute(area, 1));
}

/** A material that colours each body area from a uniform array (one material per player). */
function areaMaterial(T, colors) {
  const m = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0.02 });
  m.userData.colors = colors.map((c) => new T.Color(c));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.areaColors = { value: m.userData.colors };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float area;\nvarying float vArea;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvArea = area;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 areaColors[8];\nvarying float vArea;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse * areaColors[ int( vArea + 0.5 ) ], opacity );");
  };
  m.customProgramCacheKey = () => "area-v1";
  return m;
}

/**
 * A player for a scene. opts: { av (avatar), j1, j2 (jersey colours), num, name, height (cm), weight (kg), ball, low (fewer extras) }
 * Returns { root (add it to the scene), mixer, play(name, fade), update(dt, t), ball, hand, hasModel } or null if the model can't load.
 */
export async function makeRealPlayer(T, opts = {}) {
  let asset;
  try { asset = await loadPlayerAsset(T); } catch { return null; }
  const { gltf, clips, height: h0, A } = asset;
  const av = opts.av || {};
  const skin = SKINS[av.skin ?? 2] || SKINS[2], hairC = HAIR_COLORS[av.hc ?? 0] || HAIR_COLORS[0];
  const j1 = opts.j1 || av.j1 || "#ff7a1a", j2 = opts.j2 || av.j2 || "#ffffff";
  const colors = [skin, j1, j2, j1, j2, j2, "#f4f4f4", "#1d1d1d"];
  const model = A.cloneSkinned(gltf.scene);
  const mat = areaMaterial(T, colors);
  const meshes = [];
  model.traverse((o) => { if (o.isSkinnedMesh) { o.material = mat; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; meshes.push(o); } });
  const byName = Object.fromEntries(meshes[0].skeleton.bones.map((b) => [clean(b.name), b]));
  const bones = new Proxy(byName, { get: (o, k) => o[clean(k)] });

  // body: height scales everything; weight makes it wider, not taller
  const H = Math.max(1.7, Math.min(2.3, (opts.height || 198) / 100));
  const ideal = ((opts.height || 198) - 100) * 0.92;
  const w = Math.max(0.88, Math.min(1.2, (opts.weight || ideal) / ideal));
  const root = new T.Group();
  const s = H / h0;
  model.scale.set(s * w, s, s * w);
  model.position.y = -asset.floor * s; // feet on the floor
  root.add(model);
  root.updateMatrixWorld(true);

  // decals and head pieces, placed at the rest pose and then attached to their bones
  const wpos = (b) => b.getWorldPosition(new T.Vector3());
  const front = asset.facing; // +1: the model faces +z
  const chest = bones["DEF-spine.003"], head = bones["DEF-head"], neck = bones["DEF-neck"];
  // the head, measured on the model (scaled like the body)
  const hb = asset.headBox, hcen = hb.getCenter(new T.Vector3());
  const r = ((hb.max.x - hb.min.x) / 2) * s * w * 1.0; // head radius
  const headCenter = new T.Vector3(hcen.x * s * w, (hcen.y - asset.floor) * s, hcen.z * s * w);
  const depth = 0.15 * w; // chest half-depth (from the model's proportions)
  if (opts.num != null || av.num != null) {
    const n = String(opts.num ?? av.num);
    const numTex = textTexture(T, n, { color: j2, stroke: "rgba(0,0,0,.55)" });
    const numMat = new T.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
    const cy = wpos(chest).y - 0.06;
    const f = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), numMat);
    f.position.set(0, cy, front * (depth + 0.012));
    if (front < 0) f.rotation.y = Math.PI;
    const b = new T.Mesh(new T.PlaneGeometry(0.27, 0.27), numMat);
    b.position.set(0, cy - 0.02, -front * (depth + 0.016));
    if (front > 0) b.rotation.y = Math.PI;
    root.add(f, b);
    chest.attach(f); chest.attach(b);
    if (opts.name && !opts.low) {
      const nameTex = textTexture(T, String(opts.name).toUpperCase().slice(0, 14), { color: j2, w: 512, h: 96, font: "800 64px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif" });
      const p = new T.Mesh(new T.PlaneGeometry(0.4, 0.075), new T.MeshStandardMaterial({ map: nameTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -4 }));
      p.position.set(0, cy + 0.17, -front * (depth + 0.014));
      if (front > 0) p.rotation.y = Math.PI;
      root.add(p); chest.attach(p);
    }
  }
  // hair, eyes and extras from the avatar, sized to the head (the avatar pieces are built around y = 0.06 + r)
  const headGroup = new T.Group();
  if (!opts.low) {
    for (const sd of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(r * 0.11, 8, 6), new T.MeshStandardMaterial({ color: "#151515", roughness: 0.3 }));
      eye.position.set(sd * r * 0.34, 0.06 + r * 1.02, front * r * 0.86);
      const brow = new T.Mesh(new T.BoxGeometry(r * 0.32, r * 0.06, r * 0.06), new T.MeshStandardMaterial({ color: hairC }));
      brow.position.set(sd * r * 0.34, 0.06 + r * 1.22, front * r * 0.88);
      headGroup.add(eye, brow);
    }
  }
  addHair(T, headGroup, av.hair || "short", hairC, r, opts.low);
  if (!opts.low) addExtra(T, headGroup, headGroup, av.x || "none", { headR: r, j2, hairC, skinC: skin, shoulder: -0.2 });
  if (front < 0) headGroup.rotation.y = Math.PI;
  headGroup.position.set(headCenter.x, headCenter.y - (0.06 + r), headCenter.z); // the pieces are built around y = 0.06 + r
  headGroup.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(headGroup);
  head.attach(headGroup);

  // animation: clips from the pack, crossfaded
  const mixer = new T.AnimationMixer(model);
  const actions = {};
  let current = null;
  const play = (name, fade = 0.25, { once = false } = {}) => {
    const clip = clips[name];
    if (!clip) return;
    const a = (actions[name] ||= mixer.clipAction(clip));
    if (current === a && !once) return;
    a.reset();
    a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.fadeIn(fade).play();
    if (current && current !== a) current.fadeOut(fade);
    current = a;
  };
  play("Idle_Loop", 0);

  // the ball and the hand that dribbles it
  let ball = null;
  const hand = bones["DEF-hand.R"];
  if (opts.ball) { ball = basketball(T, 0.12); root.add(ball); }
  const tmp = new T.Vector3();
  let mode = "idle";
  const forearmR = bones["DEF-forearm.R"], upperR = bones["DEF-upper_arm.R"], upperL = bones["DEF-upper_arm.L"], forearmL = bones["DEF-forearm.L"];
  const q = new T.Quaternion(), ax = new T.Vector3(1, 0, 0);
  /** Per frame: the clips, then the hand-made parts on top (dribbling, the shooting arms). */
  const update = (dt, t) => {
    mixer.update(dt);
    if (mode === "dribble" && ball) {
      const k = Math.abs(Math.sin(t * 4.4)); // 1: in the hand, 0: on the floor
      q.setFromAxisAngle(ax, (1 - k) * 0.55); forearmR.quaternion.multiply(q);
      q.setFromAxisAngle(ax, 0.35); upperR.quaternion.multiply(q);
      root.updateMatrixWorld(true);
      hand.getWorldPosition(tmp);
      root.worldToLocal(tmp);
      ball.position.set(tmp.x + 0.02, 0.12 + (tmp.y - 0.12) * k, tmp.z + front * 0.12);
    } else if (mode === "shoot") {
      for (const [u, f] of [[upperR, forearmR], [upperL, forearmL]]) { q.setFromAxisAngle(ax, -2.4); u.quaternion.multiply(q); q.setFromAxisAngle(ax, -0.9); f.quaternion.multiply(q); }
    } else if (ball) {
      hand.getWorldPosition(tmp); root.worldToLocal(tmp);
      ball.position.set(tmp.x, tmp.y - 0.06, tmp.z + front * 0.1);
    }
  };
  const setMode = (m) => {
    mode = m;
    if (m === "run") play("Jog_Fwd_Loop", 0.2);
    else if (m === "sprint") play("Sprint_Loop", 0.2);
    else if (m === "cheer") play("Dance_Loop", 0.3);
    else if (m === "shoot") play("Jump_Start", 0.1, { once: true });
    else play("Idle_Loop", 0.3);
  };
  return { root, mixer, play, update, setMode, ball, hand, hasModel: true, facing: front };
}
