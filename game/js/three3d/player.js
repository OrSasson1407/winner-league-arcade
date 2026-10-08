// A real rigged player for the 3D views (game/vendor/models/player.glb): the body, face, eyes, eyebrows and
// hairstyles of Quaternius's Universal Base Characters, with the Universal Animation Library's animations
// retargeted onto it (both CC0; built by game/tools/blender/build_player_ubc.py and game/tools/build_player_model.mjs).
// The uniform is painted per body area: every body vertex gets an area from the bone that moves it most (torso =
// jersey, hips and thighs = shorts, lower legs = socks, feet = shoes, the rest = skin), and a small shader colours
// each area with the player's colours over the model's own texture detail, so ten players share one model.
// Name and number decals, and hair styles the pack doesn't have, are attached to bones, so they move with the body.
import { SKINS, HAIR_COLORS } from "../lib/avatarArt.js";
import { loadAddons, textTexture } from "./core.js";
import { addHair, addExtra, basketball } from "./figures.js";

const MODEL_URL = new URL("../../vendor/models/player.glb", import.meta.url).href;
// body areas (index into the colour array the shader reads)
const SKIN = 0, JERSEY = 1, TRIM = 2, SHORTS = 3, STRIPE = 4, SOCK = 5, SHOE = 6, SOLE = 7;
// the avatar's hairstyles -> the pack's (the others are built in code on a buzz cut)
const PACK_HAIR = { short: "Hair_SimpleParted", buzz: "Hair_Buzzed", fade: "Hair_Buzzed", long: "Hair_Long", bun: "Hair_Buns" };
const CODE_HAIR = ["afro", "curly", "mohawk", "dreads", "spiky", "flattop"];

let assetP = null;
// three.js drops dots from node names on load
const clean = (n) => String(n).replace(/[.\s]/g, "");

/** Average brightness of a texture (linear), so the shader can use the texture as detail around 1.0. */
function meanLuminance(tex) {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(tex.image, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 10) continue; const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l > 0.01) { sum += l; n++; } }
    return n ? sum / n : 0.25;
  } catch { return 0.25; }
}

/** Load the model once: the scene, the clips, the body-area attribute, and measurements. */
export function loadPlayerAsset(T) {
  return (assetP ||= (async () => {
    const A = await loadAddons();
    const gltf = await new A.GLTFLoader().loadAsync(MODEL_URL);
    const meshes = [];
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    gltf.scene.updateMatrixWorld(true);
    const body = meshes.find((m) => /superhero/i.test(m.name)) || meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
    const box = new T.Box3().setFromObject(body);
    const height = box.max.y - box.min.y;
    const bone = (n) => body.skeleton.bones.find((b) => clean(b.name) === clean(n));
    const wp = (b) => b.getWorldPosition(new T.Vector3());
    const facing = Math.sign(wp(bone("ball_l")).z - wp(bone("foot_l")).z) || 1; // the toes are in front of the ankles
    const headBox = new T.Box3();
    paintAreas(T, body, { floor: box.min.y, height, headBox });
    const hairTex = meshes.find((m) => /Hair_/.test(m.name))?.material?.map;
    return { gltf, clips: Object.fromEntries(gltf.animations.map((c) => [c.name, c])), height, floor: box.min.y, facing, headBox, A,
      bodyLum: meanLuminance(body.material.map), hairLum: hairTex ? meanLuminance(hairTex) : 0.2 };
  })());
}

/** The body-area attribute ("area") and rest-pose coordinates ("rest") on the body's geometry. */
function paintAreas(T, mesh, { floor, height, headBox }) {
  const g = mesh.geometry;
  if (g.getAttribute("area")) return;
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), J = g.getAttribute("skinIndex"), W = g.getAttribute("skinWeight");
  const names = mesh.skeleton.bones.map((b) => clean(b.name));
  const v = new T.Vector3(), n = new T.Vector3(), tip = new T.Vector3();
  const area = new Float32Array(pos.count), rest = new Float32Array(pos.count * 3);
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (w > bw) { bw = w; best = J.getComponent(i, k); } }
    const name = names[best] || "";
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); // where it is in the rest pose
    n.fromBufferAttribute(nor, i);
    tip.fromBufferAttribute(pos, i).addScaledVector(n, 0.02);
    mesh.applyBoneTransform(i, tip).applyMatrix4(mesh.matrixWorld);
    n.subVectors(tip, v).normalize(); // which way it faces
    const y = (v.y - floor) / height; // 0 at the floor, 1 at the top of the head
    if (name === "Head") headBox.expandByPoint(v);
    rest[i * 3] = v.x / height; rest[i * 3 + 1] = y; rest[i * 3 + 2] = v.z / height; // the uniform's patterns are drawn from it
    let a = SKIN;
    if (/^spine/.test(name)) a = Math.abs(n.x) > 0.8 ? TRIM : JERSEY; // side panels in the second colour
    else if (/^clavicle/.test(name)) { // a tank top: the chest up to the collarbone, straps, bare shoulders
      const ax = Math.abs(v.x) / height;
      a = y > 0.835 || ax > 0.105 ? SKIN : ax > 0.085 ? TRIM : JERSEY;
    }
    else if (/^pelvis/.test(name)) a = y > 0.565 ? JERSEY : SHORTS;
    else if (/^thigh/.test(name)) a = y < 0.33 ? SKIN : Math.abs(n.x) > 0.82 ? STRIPE : SHORTS; // shorts to the knee, a stripe outside
    else if (/^calf/.test(name)) a = y < 0.12 ? SOCK : SKIN;
    else if (/^foot|^ball/.test(name)) a = y < 0.012 ? SOLE : SHOE;
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
// the model's own texture as detail (skin shading, muscle lines): full on skin, faint on the uniform
const DETAIL_GLSL = `
#ifdef USE_MAP
  float lum = dot( texture2D( map, vMapUv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / mapLum;
  diffuseColor.rgb *= mix( 1.0, clamp( lum, 0.6, 1.25 ), int( vArea + 0.5 ) == 0 ? 1.0 : 0.25 );
#endif`;

/** The body's material: area colours with the club's design, over the model's texture detail. */
function areaMaterial(T, base, colors, design, mapLum) {
  if (T.TSL) return areaNodeMaterial(T, base, colors, design, mapLum);
  const m = new T.MeshStandardMaterial({ color: "#ffffff", map: base.map, normalMap: base.normalMap, roughness: 0.62, metalness: 0.02 });
  m.userData.colors = colors.map((c) => new T.Color(c));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.areaColors = { value: m.userData.colors };
    sh.uniforms.design = { value: design };
    sh.uniforms.mapLum = { value: mapLum };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float area;\nattribute vec3 rest;\nvarying float vArea;\nvarying vec3 vRest;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvArea = area;\nvRest = rest;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 areaColors[8];\nuniform int design;\nuniform float mapLum;\nvarying float vArea;\nvarying vec3 vRest;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", PATTERN_GLSL)
      .replace("#include <map_fragment>", DETAIL_GLSL);
  };
  m.customProgramCacheKey = () => "area-v3";
  return m;
}
/** Hair and eyebrows: the avatar's hair colour over the hair texture's detail. */
function hairMaterial(T, base, color, mapLum) {
  if (T.TSL) return hairNodeMaterial(T, base, color, mapLum);
  const m = new T.MeshStandardMaterial({ color, map: base.map, normalMap: base.normalMap, roughness: 0.75, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.mapLum = { value: mapLum };
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float mapLum;")
      .replace("#include <map_fragment>", "#ifdef USE_MAP\n  diffuseColor.rgb *= clamp( dot( texture2D( map, vMapUv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / mapLum, 0.35, 1.8 );\n#endif");
  };
  m.customProgramCacheKey = () => "hair-v1";
  return m;
}

// The same two materials for the WebGPU renderer (Ultra), written in TSL: the same areas, designs and detail.
function areaNodeMaterial(T, base, colors, design, mapLum) {
  const { attribute, uniformArray, texture, uv, vec3, vec4, float, int, fract, abs, mix, clamp, dot, select } = T.TSL;
  const m = new T.MeshStandardNodeMaterial({ normalMap: base.normalMap, roughness: 0.62, metalness: 0.02 });
  const cols = uniformArray(colors.map((c) => new T.Color(c)), "color");
  m.userData.colors = cols.array;
  const area = attribute("area", "float"), rest = attribute("rest", "vec3");
  const a = int(area.add(0.5)), x = rest.x, y = rest.y;
  const trim = vec3(cols.element(int(2))), isJ = a.equal(1), isS = a.equal(3);
  let c = vec3(cols.element(a));
  // the club's design: jersey (area 1) and the shorts' hem (area 3)
  if (design === 1) c = select(isJ.and(y.greaterThan(0.655)).and(y.lessThan(0.695)).or(isS.and(y.lessThan(0.345))), trim, c);
  else if (design === 2) c = select(isJ.and(abs(x.sub(y.sub(0.6).mul(1.1)).add(0.02)).lessThan(0.022)).or(isS.and(y.lessThan(0.345))), trim, c);
  else if (design === 3) c = select(isJ.or(isS).and(fract(x.mul(48)).lessThan(0.14)), mix(c, trim, 0.75), c);
  else if (design === 4) c = select(isJ.and(y.greaterThan(0.735)), trim, c);
  if (base.map) { // the model's own texture as detail: full on skin, faint on the uniform
    const lum = dot(texture(base.map, uv()).rgb, vec3(0.2126, 0.7152, 0.0722)).div(mapLum);
    c = c.mul(mix(float(1), clamp(lum, 0.6, 1.25), select(a.equal(0), float(1), float(0.25))));
  }
  m.colorNode = vec4(c, 1);
  return m;
}
function hairNodeMaterial(T, base, color, mapLum) {
  const { texture, uv, vec3, vec4, clamp, dot, color: col } = T.TSL;
  const m = new T.MeshStandardNodeMaterial({ normalMap: base.normalMap, roughness: 0.75, metalness: 0 });
  const tint = col(new T.Color(color));
  m.colorNode = base.map ? vec4(tint.mul(clamp(dot(texture(base.map, uv()).rgb, vec3(0.2126, 0.7152, 0.0722)).div(mapLum), 0.35, 1.8)), 1) : vec4(tint, 1);
  return m;
}

/**
 * A player for a scene. opts: { av (avatar), j1, j2 (club colours), kit ("home": body in the first colour, "away": the second),
 *   design (0-4, see DESIGNS), shoes (colour), num, name, height (cm), weight (kg), muscle (0-1, arms, legs and chest),
 *   grey (0-1, grey hair with age), ball, low (fewer extras) }
 * Returns { root (add it to the scene), mixer, play(name, fade), update(dt, t), setMode, ball, hand } or null if the model can't load.
 */
export async function makeRealPlayer(T, opts = {}) {
  let asset;
  try { asset = await loadPlayerAsset(T); } catch (e) { console.warn("3D player model:", e); return null; }
  const { gltf, clips, height: h0, A } = asset;
  const av = opts.av || {};
  const skin = SKINS[av.skin ?? 2] || SKINS[2];
  const c1 = opts.j1 || av.j1 || "#ff7a1a", c2 = opts.j2 || av.j2 || "#ffffff";
  const [j1, j2] = opts.kit === "away" ? [c2, c1] : [c1, c2]; // away: the colours swap
  const hairC = greyed(T, HAIR_COLORS[av.hc ?? 0] || HAIR_COLORS[0], opts.grey || 0);
  const colors = [skin, j1, j2, j1, j2, j2, opts.shoes || "#f4f4f4", "#1d1d1d"];
  const model = A.cloneSkinned(gltf.scene);
  const style = av.hair || "short";
  const packHair = PACK_HAIR[style] || (CODE_HAIR.includes(style) ? "Hair_Buzzed" : null); // bald: none
  const meshes = [];
  let bodyMat = null, hairMat = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    meshes.push(o);
    if (/superhero/i.test(o.name)) o.material = bodyMat ||= areaMaterial(T, o.material, colors, opts.design ?? 0, asset.bodyLum);
    else if (/^Hair_|Eyebrows/.test(o.name)) {
      o.material = hairMat ||= hairMaterial(T, o.material, hairC, asset.hairLum);
      o.visible = /Eyebrows/.test(o.name) || o.name === packHair || (o.name === "Hair_Beard" && av.x === "beard");
      if (opts.low && !/Eyebrows/.test(o.name) && o.name !== packHair) o.visible = false;
    }
  });
  const body = meshes.find((m) => /superhero/i.test(m.name)) || meshes[0];
  const byName = Object.fromEntries(body.skeleton.bones.map((b) => [clean(b.name), b]));
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

  // number and name decals, placed at the rest pose and then attached to the chest bone
  const wpos = (b) => b.getWorldPosition(new T.Vector3());
  const front = asset.facing; // +1: the model faces +z
  const chest = bones.spine_03, head = bones.Head;
  const depth = 0.15 * w; // chest half-depth
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
  // hairstyles the pack doesn't have, and extras (headband, glasses, cap...): built in code, sized to the head
  const hb = asset.headBox, hcen = hb.getCenter(new T.Vector3());
  const r = ((hb.max.x - hb.min.x) / 2) * s * w;
  const ry = ((hb.max.y - hb.min.y) / 2) * s, rz = ((hb.max.z - hb.min.z) / 2) * s * w;
  const headGroup = new T.Group(); // origin at the head's centre
  const hairGroup = new T.Group(), faceGroup = new T.Group();
  hairGroup.scale.set(1.05, (ry / r) * 0.72, (rz / r) * 0.99);
  hairGroup.position.y = -(0.06 + r) * hairGroup.scale.y + ry * 0.3; // pieces are built around y = 0.06 + r
  const faceExtras = new T.Group();
  faceExtras.scale.set(1, ry / r, rz / r);
  faceExtras.position.y = -(0.06 + r) * (ry / r) + ry * 0.12;
  headGroup.add(hairGroup, faceGroup, faceExtras);
  if (CODE_HAIR.includes(style)) addHair(T, hairGroup, style, "#" + hairC.getHexString(), r, opts.low);
  if (!opts.low && av.x && av.x !== "none" && av.x !== "beard") addExtra(T, ["glasses", "goggles", "mustache", "facepaint"].includes(av.x) ? faceExtras : hairGroup, headGroup, av.x, { headR: r, j2, hairC: "#" + hairC.getHexString(), skinC: skin, shoulder: -0.2 });
  if (front < 0) headGroup.rotation.y = Math.PI;
  headGroup.position.set(hcen.x * s * w, (hcen.y - asset.floor) * s, hcen.z * s * w);
  headGroup.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(headGroup);
  head.attach(headGroup);

  // animation: the clips, crossfaded
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

  // the ball and the hand that dribbles it; muscle on the arms, thighs and chest
  let ball = null;
  const hand = bones.hand_r;
  if (opts.ball) { ball = basketball(T, 0.12); root.add(ball); }
  const tmp = new T.Vector3();
  let mode = "idle";
  const forearmR = bones.lowerarm_r, upperR = bones.upperarm_r, upperL = bones.upperarm_l, forearmL = bones.lowerarm_l;
  const mu = Math.max(0, Math.min(1, opts.muscle ?? 0.3));
  const bulk = [["upperarm_l", 0.16], ["upperarm_r", 0.16], ["lowerarm_l", 0.08], ["lowerarm_r", 0.08], ["thigh_l", 0.1], ["thigh_r", 0.1], ["spine_03", 0.07]]
    .map(([n, k]) => [bones[n], 1 + k * (mu - 0.3) * 1.6]).filter(([b]) => b)
    .map(([b, f]) => [b, f, b.scale.clone()]); // the rest scale: set absolutely each frame (clips may not touch scale)
  const q = new T.Quaternion(), ax = new T.Vector3(1, 0, 0), az = new T.Vector3(0, 0, 1);
  /** Per frame: the clips, then the hand-made parts on top (dribbling, the shooting arms). */
  const update = (dt, t) => {
    mixer.update(dt);
    for (const [b, f, s0] of bulk) b.scale.set(s0.x * f, s0.y, s0.z * f); // across the bone, not along it
    if (mode === "dribble" && ball) {
      const k = Math.abs(Math.sin(t * 4.4)); // 1: in the hand, 0: on the floor
      q.setFromAxisAngle(az, -(1 - k) * 0.5); forearmR.quaternion.multiply(q);
      root.updateMatrixWorld(true);
      hand.getWorldPosition(tmp);
      root.worldToLocal(tmp);
      ball.position.set(tmp.x + 0.02, 0.12 + (tmp.y - 0.12) * k, tmp.z + front * 0.12);
    } else if (mode === "shoot") {
      for (const [u, f, sd] of [[upperR, forearmR, 1], [upperL, forearmL, -1]]) { q.setFromAxisAngle(ax, -2.2); u.quaternion.multiply(q); q.setFromAxisAngle(az, sd * 0.8); f.quaternion.multiply(q); }
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
  return { root, mixer, play, update, setMode, ball, hand, hasModel: true, facing: front, setExpression: () => {} };
}

/** Hair colour going grey with age (0: none, 1: fully grey). */
function greyed(T, hex, k) {
  return new T.Color(hex).lerp(new T.Color("#a7abb2"), Math.max(0, Math.min(1, k)));
}
