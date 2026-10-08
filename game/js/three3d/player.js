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
  const area = new Float32Array(pos.count), rest = new Float32Array(pos.count * 3);
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
    // where it sits on the body in the rest pose (in heights): the shader draws the uniform's patterns from it
    rest[i * 3] = v.x / height; rest[i * 3 + 1] = y; rest[i * 3 + 2] = v.z / height;
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
  g.setAttribute("rest", new T.BufferAttribute(rest, 3));
}

/** Jersey designs (drawn by the shader on the rest-pose body): 0 side panels only, 1 chest band, 2 sash, 3 pinstripes, 4 yoke. */
export const DESIGNS = ["Side panels", "Chest band", "Sash", "Pinstripes", "Yoke"];
/** A club's design: the same for every player of that club. */
export const designOf = (club) => { let h = 0; for (const ch of String(club || "")) h = (h * 31 + ch.charCodeAt(0)) % 997; return h % DESIGNS.length; };

const PATTERN_GLSL = `
  vec3 c = areaColors[ int( vArea + 0.5 ) ];
  int a = int( vArea + 0.5 );
  float x = vRest.x, y = vRest.y;
  if ( a == 1 ) { // jersey
    if ( design == 1 && y > 0.655 && y < 0.695 ) c = areaColors[2];
    else if ( design == 2 && abs( x - ( y - 0.6 ) * 1.1 + 0.02 ) < 0.022 ) c = areaColors[2];
    else if ( design == 3 && fract( x * 48.0 ) < 0.14 ) c = mix( c, areaColors[2], 0.75 );
    else if ( design == 4 && y > 0.735 ) c = areaColors[2];
  } else if ( a == 3 ) { // shorts: a hem band for the striped designs
    if ( ( design == 1 || design == 2 ) && y < 0.345 ) c = areaColors[2];
    else if ( design == 3 && fract( x * 48.0 ) < 0.14 ) c = mix( c, areaColors[2], 0.75 );
  }
  vec4 diffuseColor = vec4( diffuse * c, opacity );`;

/** A material that colours each body area from a uniform array (one material per player), with the club's design. */
function areaMaterial(T, colors, design = 0) {
  const m = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0.02 });
  m.userData.colors = colors.map((c) => new T.Color(c));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.areaColors = { value: m.userData.colors };
    sh.uniforms.design = { value: design };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float area;\nattribute vec3 rest;\nvarying float vArea;\nvarying vec3 vRest;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvArea = area;\nvRest = rest;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 areaColors[8];\nuniform int design;\nvarying float vArea;\nvarying vec3 vRest;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", PATTERN_GLSL);
  };
  m.customProgramCacheKey = () => "area-v2";
  return m;
}

/**
 * A player for a scene. opts: { av (avatar), j1, j2 (club colours), kit ("home": body in the first colour, "away": the second),
 *   design (0-4, see DESIGNS), shoes (colour), num, name, height (cm), weight (kg), muscle (0-1, arms, legs and chest),
 *   grey (0-1, grey hair with age), expression ("neutral" | "focus" | "happy"), ball, low (fewer extras) }
 * Returns { root (add it to the scene), mixer, play(name, fade), update(dt, t), ball, hand, hasModel } or null if the model can't load.
 */
export async function makeRealPlayer(T, opts = {}) {
  let asset;
  try { asset = await loadPlayerAsset(T); } catch { return null; }
  const { gltf, clips, height: h0, A } = asset;
  const av = opts.av || {};
  const skin = SKINS[av.skin ?? 2] || SKINS[2];
  const c1 = opts.j1 || av.j1 || "#ff7a1a", c2 = opts.j2 || av.j2 || "#ffffff";
  const [j1, j2] = opts.kit === "away" ? [c2, c1] : [c1, c2]; // away: the colours swap
  const hairC = greyed(T, HAIR_COLORS[av.hc ?? 0] || HAIR_COLORS[0], opts.grey || 0);
  const colors = [skin, j1, j2, j1, j2, j2, opts.shoes || "#f4f4f4", "#1d1d1d"];
  const model = A.cloneSkinned(gltf.scene);
  const mat = areaMaterial(T, colors, opts.design ?? 0);
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
  // the head is an egg (taller and deeper than wide): the hair is stretched to its shape, the face isn't
  const ry = ((hb.max.y - hb.min.y) / 2) * s, rz = ((hb.max.z - hb.min.z) / 2) * s * w;
  const headGroup = new T.Group(); // origin at the head's centre
  const hairGroup = new T.Group(), faceGroup = new T.Group();
  // the hair dome starts at the brow line (the box's middle is about eye level, its top the crown)
  hairGroup.scale.set(1.05, (ry / r) * 0.72, (rz / r) * 0.99);
  hairGroup.position.y = -(0.06 + r) * hairGroup.scale.y + ry * 0.3; // the pieces are built around y = 0.06 + r
  faceGroup.position.y = -(0.06 + r) + ry * 0.12; // eyes a little above the middle (the box includes the jaw)
  headGroup.add(hairGroup, faceGroup);
  const face = opts.low ? null : makeFace(T, faceGroup, { r, rz, skin, hairC });
  face?.set(opts.expression || "neutral");
  addHair(T, hairGroup, av.hair || "short", "#" + hairC.getHexString(), r, opts.low);
  const faceExtras = new T.Group(); // face pieces sized for a round head: pushed out to this head's depth
  faceExtras.scale.set(1, ry / r, rz / r);
  faceExtras.position.y = (0.06 + r) * (1 - ry / r); // stretched around the face's centre: beards reach the jaw
  faceGroup.add(faceExtras);
  if (!opts.low) addExtra(T, ["glasses", "goggles", "beard", "mustache", "facepaint"].includes(av.x) ? faceExtras : hairGroup, headGroup, av.x || "none", { headR: r, j2, hairC: "#" + hairC.getHexString(), skinC: skin, shoulder: -0.2 });
  if (front < 0) headGroup.rotation.y = Math.PI;
  headGroup.position.copy(headCenter);
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
  const mu = Math.max(0, Math.min(1, opts.muscle ?? 0.3));
  const bulk = [["DEF-upper_arm.L", 0.16], ["DEF-upper_arm.R", 0.16], ["DEF-thigh.L", 0.1], ["DEF-thigh.R", 0.1], ["DEF-spine.003", 0.08]]
    .map(([n, k]) => [bones[n], 1 + k * (mu - 0.3) * 1.6]).filter(([b]) => b);
  const q = new T.Quaternion(), ax = new T.Vector3(1, 0, 0);
  /** Per frame: the clips, then the hand-made parts on top (dribbling, the shooting arms). */
  const update = (dt, t) => {
    mixer.update(dt);
    for (const [b, f] of bulk) { b.scale.x *= f; b.scale.z *= f; } // across the bone, not along it
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
    else if (m === "cheer") { play("Dance_Loop", 0.3); face?.set("happy"); }
    else if (m === "shoot") play("Jump_Start", 0.1, { once: true });
    else play("Idle_Loop", 0.3);
  };
  return { root, mixer, play, update, setMode, ball, hand, hasModel: true, facing: front, setExpression: (e) => face?.set(e) };
}

/** Hair colour going grey with age (0: none, 1: fully grey). */
function greyed(T, hex, k) {
  return new T.Color(hex).lerp(new T.Color("#a7abb2"), Math.max(0, Math.min(1, k)));
}

/**
 * The face, on the head group (built around y = 0.06 + r, facing +z): eye whites and pupils, nose, ears,
 * lips and brows. set("neutral" | "focus" | "happy") moves the brows and changes the mouth.
 */
function makeFace(T, head, { r, rz, skin, hairC }) {
  const cy = 0.06 + r, fz = Math.max(r * 0.7, rz) * 0.93; // the front of the face
  const skinM = new T.MeshStandardMaterial({ color: new T.Color(skin).multiplyScalar(0.93), roughness: 0.7 });
  const white = new T.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.25 });
  const dark = new T.MeshStandardMaterial({ color: "#1b1410", roughness: 0.2 });
  const brows = [], g = new T.Group();
  for (const sd of [-1, 1]) {
    const ew = new T.Mesh(new T.SphereGeometry(r * 0.16, 12, 8), white);
    ew.scale.set(1, 0.72, 0.5);
    ew.position.set(sd * r * 0.33, cy + r * 0.1, fz - r * 0.06);
    const pupil = new T.Mesh(new T.SphereGeometry(r * 0.08, 10, 8), dark);
    pupil.position.set(sd * r * 0.33, cy + r * 0.1, fz + r * 0.005);
    const brow = new T.Mesh(new T.BoxGeometry(r * 0.34, r * 0.07, r * 0.07), new T.MeshStandardMaterial({ color: hairC, roughness: 0.9 }));
    brow.position.set(sd * r * 0.34, cy + r * 0.32, fz - r * 0.02);
    brow.userData.side = sd;
    brows.push(brow);
    const ear = new T.Mesh(new T.SphereGeometry(r * 0.24, 10, 8), skinM);
    ear.scale.set(0.45, 1, 0.8);
    ear.position.set(sd * r * 0.98, cy, -r * 0.05);
    g.add(ew, pupil, brow, ear);
  }
  const nose = new T.Mesh(new T.SphereGeometry(r * 0.15, 10, 8), skinM);
  nose.scale.set(0.85, 1.15, 1.1);
  nose.position.set(0, cy - r * 0.12, fz + r * 0.02);
  const lipM = new T.MeshStandardMaterial({ color: new T.Color(skin).multiplyScalar(0.62).lerp(new T.Color("#8a3b35"), 0.25), roughness: 0.5 });
  const flat = new T.Mesh(new T.CapsuleGeometry(r * 0.04, r * 0.3, 4, 8), lipM);
  flat.rotation.z = Math.PI / 2;
  flat.position.set(0, cy - r * 0.45, fz - r * 0.08);
  const smile = new T.Mesh(new T.TorusGeometry(r * 0.2, r * 0.045, 6, 16, Math.PI), lipM);
  smile.rotation.z = Math.PI;
  smile.position.set(0, cy - r * 0.32, fz - r * 0.1);
  g.add(nose, flat, smile);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  head.add(g);
  return {
    set(e) {
      for (const b of brows) {
        b.rotation.z = e === "focus" ? b.userData.side * 0.28 : e === "happy" ? -b.userData.side * 0.1 : 0; // focus: inner ends down
        b.position.y = cy + r * (e === "happy" ? 0.38 : e === "focus" ? 0.28 : 0.32);
      }
      smile.visible = e === "happy";
      flat.visible = e !== "happy";
    },
  };
}
