// 3D stages for My Career (the locker room, the trophy cabinet, the signing, the court). Three.js loads
// only when a 3D view opens (game/vendor/three.min.js, about 190 KB compressed). Without WebGL, or with
// 3D turned off, every screen keeps its 2D version. The loop renders only while the view is on screen
// and the tab is visible; with reduced motion nothing moves on its own (dragging still turns the view).
import { store } from "../ui.js";
import { reducedMotion } from "../lib/settings.js";

let threeP = null;
export const loadThree = () => (threeP ||= import("../../vendor/three.min.js"));

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
  const T = await loadThree();
  const { signal, fov = 35, camera: cam = [0, 1.6, 6], target = [0, 1, 0], drag = true, shadows = false, label = "" } = opts;
  if (signal?.aborted) return null;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = shadows;
  const canvas = renderer.domElement;
  canvas.className = "stage3d";
  canvas.setAttribute("role", "img");
  if (label) canvas.setAttribute("aria-label", label);
  container.appendChild(canvas);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(fov, 1, 0.05, 200);
  camera.position.set(...cam);
  camera.lookAt(...target);
  const pivot = new T.Group();
  scene.add(pivot);

  const size = () => {
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(() => { size(); render(); });
  ro.observe(container);

  const frames = [];
  const still = reducedMotion();
  let raf = 0, last = 0, t0 = 0, visible = true, alive = true;
  const render = () => renderer.render(scene, camera);
  const loop = (now) => {
    raf = 0;
    if (!alive) return;
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
    renderer.dispose();
    canvas.remove();
  };
  signal?.addEventListener("abort", dispose);
  kick();
  return { T, scene, camera, renderer, pivot, canvas, onFrame: (f) => { frames.push(f); kick(); }, render, kick, dispose, still };
}

/** Soft studio light: a sky/ground fill, a key light (with shadows if asked) and a rim light. */
export function studioLights(T, scene, { shadows = false, warm = "#fff4e6", rim = "#9cc7ff" } = {}) {
  scene.add(new T.HemisphereLight("#ffffff", "#3a3f4a", 1.1));
  const key = new T.DirectionalLight(warm, 2.2);
  key.position.set(3, 6, 4);
  if (shadows) { key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 20; key.shadow.bias = -0.0005; }
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
