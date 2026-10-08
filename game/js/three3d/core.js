// 3D stages for My Career (the locker room, the trophy cabinet, the signing, the court). Three.js loads
// only when a 3D view opens (game/vendor/three/, about 200 KB compressed). Without WebGL, or with
// 3D turned off, every screen keeps its 2D version. Ultra quality renders with WebGPU (about 110 KB more):
// ambient occlusion, reflections in every glossy surface, temporal anti-aliasing and bloom; without WebGPU
// it falls back to High. The loop renders only while the view is on screen
// and the tab is visible; with reduced motion nothing moves on its own (dragging still turns the view).
import { store } from "../ui.js";
import { reducedMotion } from "../lib/settings.js";

let threeP = null, addonsP = null, gpuP = null, gpuAddonsP = null;
export const loadThree = () => (threeP ||= import("../../vendor/three/three.js"));
/** Loaders, post-processing and the reflective floor (game/vendor/three/addons.js). */
export const loadAddons = () => (addonsP ||= import("../../vendor/three/addons.js"));
/** The WebGPU renderer and TSL (Ultra), and Ultra's effects. Same core classes as loadThree(). */
const loadGPU = () => (gpuP ||= import("../../vendor/three/webgpu.js"));
const loadGPUAddons = () => (gpuAddonsP ||= import("../../vendor/three/addons-gpu.js"));

/**
 * Picture quality: "ultra" (WebGPU: ambient occlusion, reflections everywhere, temporal anti-aliasing),
 * "high" (glow, mirror floors, soft shadows), "medium" (shadows), "low" (simple light).
 * Auto: phones and small machines get medium, computers with a graphics card and WebGPU get ultra;
 * the player can choose in Settings.
 */
export function quality() {
  const q = store.get("3d:quality", "auto");
  if (q === "ultra" && !gpuWorks()) return "high";
  if (q !== "auto") return q;
  const coarse = matchMedia?.("(pointer: coarse)").matches;
  if (coarse || (navigator.hardwareConcurrency || 4) <= 4 || integratedGpu()) return "medium";
  return gpuWorks() ? "ultra" : "high";
}
/** WebGPU is there (and didn't fail to start earlier in this visit). */
let gpuFailed = false;
export const gpuWorks = () => !gpuFailed && typeof navigator !== "undefined" && "gpu" in navigator;
/** A started WebGPU renderer, or null (no adapter, or it fell back to WebGL: then High is better). */
async function gpuRenderer() {
  try {
    const W = await loadGPU();
    const r = new W.WebGPURenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    await r.init();
    if (!r.backend?.isWebGPUBackend) { r.dispose(); gpuFailed = true; return null; }
    return { W, renderer: r };
  } catch (e) { console.warn("WebGPU:", e); gpuFailed = true; return null; }
}
let gpuGuess = null;
/** Built-in graphics (Intel, phones): they get medium quality on auto. */
function integratedGpu() {
  if (gpuGuess !== null) return gpuGuess;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gpuGuess = /intel|uhd|iris|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(name);
  } catch { gpuGuess = false; }
  return gpuGuess;
}
export const setQuality = (q) => store.set("3d:quality", q);

let glOk = null;
export function webglOk() {
  if (glOk !== null) return glOk;
  try { const c = document.createElement("canvas"); glOk = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { glOk = false; }
  return glOk;
}
/** 3D is on: WebGL works and the player hasn't turned it off. */
export const want3D = () => webglOk() && store.get("mc:3d", true) !== false;
export const set3D = (on) => store.set("mc:3d", !!on);

/**
 * A 3D stage inside a container element.
 * opts: { signal (disposes on abort), fov, camera: [x, y, z], target: [x, y, z], drag (turn `pivot` by dragging),
 *         shadows, label (for screen readers) }
 * Returns { T, scene, camera, renderer, pivot, onFrame(fn(t, dt)), render(), dispose() }.
 */
export async function stage(container, opts = {}) {
  const { signal, fov = 35, camera: cam = [0, 1.6, 6], target = [0, 1, 0], drag = true, label = "", bloom = 0.22, exposure = 0.9 } = opts;
  let Q = quality();
  const gpu = Q === "ultra" ? await gpuRenderer() : null;
  if (Q === "ultra" && !gpu) Q = "high";
  const T = gpu ? gpu.W : await loadThree();
  if (signal?.aborted) { gpu?.renderer.dispose(); return null; }
  const shadows = !!opts.shadows && Q !== "low";
  const renderer = gpu ? gpu.renderer : new T.WebGLRenderer({ antialias: Q !== "high", alpha: true, powerPreference: Q === "high" ? "high-performance" : "low-power" });
  let pr = Math.min(devicePixelRatio || 1, Q === "ultra" || Q === "high" ? 2 : Q === "medium" ? 1.25 : 1);
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; // film-like colour: bright lights roll off instead of clipping
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "stage3d";
  canvas.setAttribute("role", "img");
  if (label) canvas.setAttribute("aria-label", label);
  container.appendChild(canvas);
  const scene = new T.Scene();
  // image-based light: a soft studio room reflected in every surface (built in code, no files)
  const A = await loadAddons();
  if (signal?.aborted) { renderer.dispose(); return null; }
  const pmrem = new T.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(gpu ? arenaEnvironment(T) : new A.RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = gpu ? 0.7 : 0.55;
  pmrem.dispose();
  const camera = new T.PerspectiveCamera(fov, 1, 0.05, 200);
  camera.position.set(...cam);
  camera.lookAt(...target);
  const pivot = new T.Group();
  scene.add(pivot);

  // glow around the brightest parts (lights, metal, white lines): high quality only
  let composer = null, pipeline = null;
  if (gpu) pipeline = await ultraPipeline(T, renderer, scene, camera, bloom);
  else if (Q === "high" && bloom > 0) {
    composer = new A.EffectComposer(renderer);
    composer.addPass(new A.RenderPass(scene, camera));
    composer.addPass(new A.UnrealBloomPass(new T.Vector2(256, 256), bloom, 0.4, 1.15));
    composer.addPass(new A.OutputPass());
  }
  const size = () => {
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(() => { size(); render(); });
  ro.observe(container);

  const frames = [];
  const still = reducedMotion();
  let raf = 0, last = 0, t0 = 0, visible = true, alive = true;
  const render = () => (pipeline ? pipeline.render() : composer ? composer.render() : renderer.render(scene, camera));
  // adaptive resolution: if frames get slow, render fewer pixels (a sharp picture isn't worth a stutter)
  let fpsT = 0, fpsN = 0;
  const adapt = (dtRaw) => {
    fpsT += dtRaw; fpsN++;
    if (fpsT < 2) return;
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (fps < 28 && pr > 0.75) { pr = Math.max(0.75, pr - 0.25); renderer.setPixelRatio(pr); composer?.setPixelRatio(pr); size(); }
  };
  const loop = (now) => {
    raf = 0;
    if (!alive) return;
    if (last) adapt((now - last) / 1000);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    for (const f of frames) f(still ? 0 : t, still ? 0 : dt);
    render();
    if (visible && !document.hidden && !still) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(loop); } };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  io.observe(container);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener("visibilitychange", onVis);

  // drag to turn the pivot (mouse, touch, pen); arrow keys when the canvas has focus
  if (drag) {
    let down = null;
    canvas.style.touchAction = "pan-y";
    canvas.tabIndex = 0;
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, r: pivot.rotation.y }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => { if (!down) return; pivot.rotation.y = down.r + (e.clientX - down.x) * 0.012; pivot.userData.held = true; kick(); if (still) render(); });
    const up = () => { down = null; pivot.userData.held = false; };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); pivot.rotation.y += e.key === "ArrowLeft" ? -0.25 : 0.25; render(); }
    });
  }

  const dispose = () => {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect(); io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); }
    });
    envRT.dispose();
    composer?.dispose?.();
    pipeline?.dispose?.();
    renderer.dispose();
    canvas.remove();
  };
  signal?.addEventListener("abort", dispose);
  kick();
  return { T, A, Q, gpu: !!gpu, pipeline, scene, camera, renderer, pivot, canvas, onFrame: (f) => { frames.push(f); kick(); }, render, kick, dispose, still };
}

/** Soft studio light: a sky/ground fill, a key light (with shadows if asked) and a rim light. */
export function studioLights(T, scene, { shadows = false, warm = "#fff4e6", rim = "#9cc7ff" } = {}) {
  scene.add(new T.HemisphereLight("#ffffff", "#3a3f4a", 0.45));
  const key = new T.DirectionalLight(warm, 2.4);
  key.position.set(3, 6, 4);
  if (shadows) { key.castShadow = true; key.shadow.mapSize.setScalar(T.WebGPURenderer ? 4096 : 2048); key.shadow.camera.near = 1; key.shadow.camera.far = 20; key.shadow.camera.left = key.shadow.camera.bottom = -4; key.shadow.camera.right = key.shadow.camera.top = 4; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4; }
  scene.add(key);
  const back = new T.DirectionalLight(rim, 1.2);
  back.position.set(-4, 3, -5);
  scene.add(back);
  return key;
}

/** Text on a transparent texture (numbers, names, labels). */
export function textTexture(T, text, { size = 256, color = "#ffffff", font = "800 150px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif", stroke = null, w = size, h = size } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
  if (stroke) { g.lineWidth = 10; g.strokeStyle = stroke; g.strokeText(String(text), w / 2, h / 2 + 6); }
  g.fillStyle = color;
  g.fillText(String(text), w / 2, h / 2 + 6);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Any CSS colour as #rrggbb (Three.js doesn't read every CSS colour syntax). */
export function cssHex(c) {
  const x = document.createElement("canvas").getContext("2d");
  x.fillStyle = "#000"; x.fillStyle = c;
  return x.fillStyle;
}

/** Wooden floor boards drawn in code (no image files): planks, grain and a little colour variation. */
export function woodTexture(T, { w = 1024, h = 1024, planks = 16, base = [201, 143, 85], repeat = 1 } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  drawWood(g, w, h, planks, base);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat);
  return t;
}
/** Paint boards into a 2D canvas context (used for plain floors and under the court lines). */
export function drawWood(g, w, h, planks = 16, base = [201, 143, 85]) {
  const ph = h / planks;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < planks; i++) {
    let x = -rnd() * w * 0.5;
    while (x < w) {
      const len = w * (0.35 + rnd() * 0.5), k = 0.86 + rnd() * 0.22;
      g.fillStyle = "rgb(" + base.map((v) => Math.round(v * k)).join(",") + ")";
      g.fillRect(x, i * ph, len, ph);
      for (let j = 0; j < 7; j++) { // grain
        g.strokeStyle = "rgba(80,45,15," + (0.05 + rnd() * 0.08) + ")"; g.lineWidth = 1 + rnd() * 1.5;
        const y = i * ph + rnd() * ph;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 6, x + len * 0.7, y + (rnd() - 0.5) * 6, x + len, y); g.stroke();
      }
      g.fillStyle = "rgba(40,22,8,.35)"; g.fillRect(x + len - 1.5, i * ph, 1.5, ph); // board ends
      x += len;
    }
    g.fillStyle = "rgba(40,22,8,.4)"; g.fillRect(0, (i + 1) * ph - 1, w, 1.5); // seams
  }
}

/**
 * A polished wooden floor: the boards on top, and on high quality a real mirror under them (the players
 * show in the floor, softly). size: [w, d] in metres; map: the floor's texture (boards, or a court).
 */
export function polishedFloor(S, { size = [8, 8], map, roughness = 0.32, mirror = 0.22, reflect = true } = {}) {
  const { T, A, Q, scene } = S;
  const g = new T.Group();
  if (S.gpu) { // ultra: a WebGPU mirror (soft, from its blurred mip levels) under lit boards; glossy surfaces get screen-space reflections too
    const P = T.TSL;
    const R = P.reflector({ resolutionScale: 0.5, generateMipmaps: true, bounces: false });
    R.target.rotateX(-Math.PI / 2);
    g.add(R.target);
    const mat = new T.MeshStandardNodeMaterial({ map, roughness, metalness: 0 });
    mat.color.setScalar(1 - mirror * 0.8);
    mat.emissiveNode = R.bias(1.2).rgb.mul(mirror * (reflect ? 1.15 : 0.7));
    const top = new T.Mesh(new T.PlaneGeometry(...size), mat);
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    g.add(top);
    scene.add(g);
    return g;
  }
  const real = Q === "high" && reflect; // a real mirror renders the scene twice: not on a crowded court
  const top = new T.Mesh(new T.PlaneGeometry(...size), new T.MeshStandardMaterial({ map, roughness, metalness: 0, transparent: real, opacity: real ? 1 - mirror : 1 }));
  top.rotation.x = -Math.PI / 2;
  top.receiveShadow = true;
  g.add(top);
  if (real) {
    const m = new A.Reflector(new T.PlaneGeometry(...size), { textureWidth: 1024, textureHeight: 1024, color: 0x888888 });
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.002;
    g.add(m);
  }
  scene.add(g);
  return g;
}

/**
 * Ultra's picture (WebGPU, TSL): a pre-pass for depth, normals, velocity and how glossy each pixel is; ambient
 * occlusion (GTAO, half resolution) darkening only the ambient light in the creases; screen-space reflections
 * in every glossy surface (the polished floor, metal, trophies); bloom; temporal anti-aliasing for clean edges.
 */
async function ultraPipeline(T, renderer, scene, camera, bloomStrength) {
  const P = T.TSL, G = await loadGPUAddons();
  const pipe = new T.RenderPipeline(renderer);
  const pre = P.pass(scene, camera);
  pre.transparent = false;
  pre.setMRT(P.mrt({ output: P.packNormalToRGB(P.normalView), metalrough: P.vec2(P.metalness, P.roughness), velocity: P.velocity }));
  pre.getTexture("output").type = T.UnsignedByteType;
  pre.getTexture("metalrough").type = T.UnsignedByteType;
  const preNormal = pre.getTextureNode(), depth = pre.getTextureNode("depth"), vel = pre.getTextureNode("velocity"), mr = pre.getTextureNode("metalrough");
  const normal = P.sample((uv) => P.unpackRGBToNormal(preNormal.sample(uv)));
  const aoPass = G.ao(depth, normal, camera);
  aoPass.resolutionScale = 0.5;
  const beauty = P.pass(scene, camera);
  beauty.contextNode = P.builtinAOContext(aoPass.getTextureNode().sample(P.screenUV).r);
  const color = beauty.getTextureNode("output");
  const refl = G.ssr(color, depth, normal, { metalnessNode: mr.r, roughnessNode: mr.g, reflectNonMetals: true, camera });
  refl.intensity.value = 0.9;
  refl.thickness.value = 0.02;
  refl.maxDistance.value = 6;
  let out = color.add(refl.rgb);
  if (bloomStrength > 0) out = out.add(G.bloom(out, bloomStrength, 0.4, 1.0));
  pipe.outputNode = G.traa(out, depth, vel, camera);
  pipe.nodes = { color, refl, aoPass, out, depth, vel, normal, mr }; // for tuning in the console
  return pipe;
}

/**
 * An indoor arena for reflections and soft light (built in code, no files): a dark hall, rows of bright light
 * panels across the roof, warm boards along the sides and a glow from the court below.
 */
function arenaEnvironment(T) {
  const env = new T.Scene();
  const hall = new T.Mesh(new T.BoxGeometry(40, 16, 40), new T.MeshBasicMaterial({ color: "#1a1d24", side: T.BackSide }));
  hall.position.y = 6;
  env.add(hall);
  const glow = (color, k) => new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k) });
  const panel = new T.BoxGeometry(1, 1, 1);
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { // the roof lights
    const m = new T.Mesh(panel, glow("#fff6e8", 14));
    m.scale.set(4.5, 0.2, 1.2); m.position.set(i * 6.5, 13.6, j * 7);
    env.add(m);
  }
  for (const side of [-1, 1]) { // ribbon boards along the stands
    const b = new T.Mesh(panel, glow("#ff9a4a", 2.2));
    b.scale.set(30, 0.8, 0.2); b.position.set(0, 4.5, side * 19.5);
    env.add(b);
    const w = new T.Mesh(panel, glow("#cfe2ff", 3));
    w.scale.set(0.2, 4, 14); w.position.set(side * 19.5, 7, 0);
    env.add(w);
  }
  const floor = new T.Mesh(new T.PlaneGeometry(26, 15), glow("#c98f55", 0.6));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.9;
  env.add(floor);
  return env;
}
