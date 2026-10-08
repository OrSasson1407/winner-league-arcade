// My Career 3D scenes: the locker room (your player), the trophy cabinet and the signing.
// Every function draws into a container and cleans up when `signal` aborts. Returns null when 3D can't run.
import { polishedFloor, stage, studioLights, textTexture, woodTexture } from "./core.js";
import { makeRealPlayer } from "./player.js";
import { basketball, makePlayer, pose } from "./figures.js";

const std = (T, color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, flatShading: true, ...o });

/** The locker room: your player in the club's jersey, dribbling in front of the lockers. Drag to turn him. */
export async function lockerRoom(el, { av, name, num, height, weight, colors = ["#ff7a1a", "#ffffff"], club = "", signal }) {
  const S = await stage(el, { signal, fov: 32, camera: [0, 1.25, 5.2], target: [0, 1.0, 0], shadows: true, label: `${name} in the locker room` });
  if (!S) return null;
  const { T, scene, pivot } = S;
  studioLights(T, scene, { shadows: true });
  const spot = new T.SpotLight("#ffffff", 14, 12, Math.PI / 7, 0.6);
  spot.position.set(0, 5, 2.5); spot.target.position.set(0, 0.8, 0);
  scene.add(spot, spot.target);
  // floor and lockers
  polishedFloor(S, { size: [9, 7], map: woodTexture(T, { base: [150, 98, 58], repeat: 2 }), mirror: 0.18 });
  const [c1, c2] = colors;
  for (let i = -3; i <= 3; i++) {
    const locker = new T.Group();
    const box = new T.Mesh(new T.BoxGeometry(0.78, 2.3, 0.5), std(T, c1, { roughness: 0.55 }));
    box.position.y = 1.15;
    const inside = new T.Mesh(new T.BoxGeometry(0.66, 1.7, 0.05), std(T, "#151515"));
    inside.position.set(0, 1.25, 0.24);
    const shelf = new T.Mesh(new T.BoxGeometry(0.66, 0.04, 0.3), std(T, c2));
    shelf.position.set(0, 1.85, 0.12);
    locker.add(box, inside, shelf);
    locker.position.set(i * 0.82, 0, -1.6 - Math.abs(i) * 0.12);
    locker.rotation.y = -i * 0.08;
    if (i === 0) { // yours: name plate and a jersey hanging inside
      const plate = new T.Mesh(new T.PlaneGeometry(0.66, 0.16), new T.MeshBasicMaterial({ map: textTexture(T, name.toUpperCase().slice(0, 14), { color: c2, w: 512, h: 120, font: "800 80px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif" }), transparent: true }));
      plate.position.set(0, 2.18, 0.26);
      const jersey = new T.Mesh(new T.BoxGeometry(0.42, 0.55, 0.04), std(T, c1));
      jersey.position.set(0, 1.35, 0.28);
      const n = new T.Mesh(new T.PlaneGeometry(0.22, 0.22), new T.MeshBasicMaterial({ map: textTexture(T, num ?? "", { color: c2 }), transparent: true }));
      n.position.set(0, 1.38, 0.305);
      locker.add(plate, jersey, n);
    }
    scene.add(locker);
  }
  if (club) {
    const banner = new T.Mesh(new T.PlaneGeometry(3.4, 0.38), new T.MeshBasicMaterial({ map: textTexture(T, club.toUpperCase(), { color: c2, w: 1024, h: 116, font: "800 84px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif" }), transparent: true }));
    banner.position.set(0, 2.62, -1.5);
    scene.add(banner);
  }
  // the rigged player (the simple one if the model can't load)
  const rp = await makeRealPlayer(T, { av, j1: c1, j2: c2, num, name, height, weight, ball: true });
  if (signal?.aborted) return null;
  const p = rp ? rp.root : makePlayer(T, { av, j1: c1, j2: c2, num, name, height, weight, ball: true });
  pivot.add(p);
  pivot.rotation.y = -0.35;
  rp?.setMode("dribble");
  S.onFrame((t, dt) => {
    if (rp) rp.update(dt, t); else pose(p, t, "dribble");
    if (!pivot.userData.held) pivot.rotation.y += dt * 0.25;
  });
  return S;
}

// ---------------------------------------------------------------- trophies
const TROPHY_LOOK = {
  title: { color: "#e2b33c", kind: "cup", h: 0.62 }, nba: { color: "#e8c25a", kind: "ball", h: 0.66 }, euroleague: { color: "#d7dde4", kind: "cup", h: 0.7 },
  cup: { color: "#c9a14a", kind: "small", h: 0.46 }, allstar: { color: "#e2b33c", kind: "star", h: 0.42 }, nbaallstar: { color: "#d7dde4", kind: "star", h: 0.44 },
  award: { color: "#b98c3a", kind: "plaque", h: 0.36 },
};
function trophyMesh(T, look) {
  const g = new T.Group();
  const metal = std(T, look.color, { metalness: 0.85, roughness: 0.28, flatShading: false });
  const base = new T.Mesh(new T.CylinderGeometry(0.12, 0.14, 0.08, 20), std(T, "#2a2a2e", { roughness: 0.4 }));
  base.position.y = 0.04;
  g.add(base);
  if (look.kind === "cup" || look.kind === "small") {
    const s = look.kind === "small" ? 0.75 : 1;
    const pts = [[0, 0], [0.05, 0], [0.04, 0.05], [0.025, 0.12], [0.03, 0.2], [0.09, 0.28], [0.12, 0.4], [0.13, 0.48], [0.12, 0.49]].map(([x, y]) => new T.Vector2(x * s, y * s));
    const cup = new T.Mesh(new T.LatheGeometry(pts, 24), metal);
    cup.position.y = 0.08;
    g.add(cup);
    for (const side of [-1, 1]) {
      const handle = new T.Mesh(new T.TorusGeometry(0.06 * s, 0.012 * s, 6, 16, Math.PI), metal);
      handle.position.set(side * 0.12 * s, 0.08 + 0.36 * s, 0); handle.rotation.z = side * Math.PI / 2;
      g.add(handle);
    }
  } else if (look.kind === "ball") { // a tall trophy with a ball on top
    const stem = new T.Mesh(new T.CylinderGeometry(0.03, 0.06, 0.34, 16), metal);
    stem.position.y = 0.25;
    const net = new T.Mesh(new T.CylinderGeometry(0.075, 0.05, 0.1, 12, 1, true), metal);
    net.position.y = 0.45;
    const ball = new T.Mesh(new T.SphereGeometry(0.075, 18, 14), metal);
    ball.position.set(0.02, 0.56, 0);
    g.add(stem, net, ball);
  } else if (look.kind === "star") {
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.06 : 0.14, a = (i / 10) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * r, y = -Math.sin(a) * r; if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
    const star = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), metal);
    star.position.set(0, 0.3, -0.015);
    const stem = new T.Mesh(new T.CylinderGeometry(0.015, 0.02, 0.16, 8), metal);
    stem.position.y = 0.14;
    g.add(star, stem);
  } else { // a plaque for an individual award
    const p = new T.Mesh(new T.BoxGeometry(0.22, 0.28, 0.03), std(T, "#5a3b22"));
    p.position.y = 0.22;
    const plate = new T.Mesh(new T.BoxGeometry(0.16, 0.18, 0.01), metal);
    plate.position.set(0, 0.23, 0.02);
    g.add(p, plate);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/**
 * The trophy cabinet: glass shelves with every trophy and award, a season label under each.
 * items: [{ type: "title" | "nba" | "euroleague" | "cup" | "allstar" | "nbaallstar" | "award", label, season }]
 */
export async function trophyCabinet(el, { items, colors = ["#ff7a1a", "#ffffff"], signal }) {
  // a narrow box gets fewer trophies per shelf (and more shelves)
  const aspect = (el.clientWidth || 600) / (el.clientHeight || 300), fov = 30, tv = Math.tan((fov * Math.PI) / 360);
  const perRow = aspect < 1.5 ? 3 : aspect < 2.2 ? 4 : 6, rows = Math.max(1, Math.min(3, Math.ceil(items.length / perRow)));
  const cols = Math.min(perRow, Math.max(1, items.length)), slot = 0.95, SC = 1.35, rowH = 1.05;
  const W = Math.max(2.6, cols * slot + 0.5), Hc = rows * rowH + 0.35;
  // camera far enough to fit the whole cabinet in the box
  const dist = Math.max(Hc / 2 / tv, W / 2 / (tv * aspect)) * 1.12 + 0.6;
  const S = await stage(el, { signal, fov, camera: [0, Hc / 2 + 0.35, dist], target: [0, Hc / 2 - 0.05, 0], shadows: true, label: `Trophy cabinet: ${items.length} trophies and awards` });
  if (!S) return null;
  const { T, scene, pivot } = S;
  studioLights(T, scene, { shadows: true, warm: "#fff1d6" });
  const wood = new T.MeshStandardMaterial({ map: woodTexture(T, { base: [110, 72, 44], planks: 8 }), roughness: 0.4 });
  const back = new T.Mesh(new T.BoxGeometry(W, Hc, 0.06), std(T, colors[0], { roughness: 0.8 }));
  back.position.set(0, Hc / 2, -0.42);
  back.receiveShadow = true;
  pivot.add(back);
  for (let r = 0; r <= rows; r++) {
    const shelf = new T.Mesh(new T.BoxGeometry(W, 0.05, 0.8), r ? new T.MeshStandardMaterial({ color: "#cfe8ff", transparent: true, opacity: 0.35, roughness: 0.1 }) : wood);
    shelf.position.set(0, r * rowH, 0);
    shelf.receiveShadow = true;
    pivot.add(shelf);
  }
  for (const x of [-W / 2, W / 2]) { const side = new T.Mesh(new T.BoxGeometry(0.06, Hc, 0.8), wood); side.position.set(x, Hc / 2, 0); pivot.add(side); }
  const shown = items.slice(0, perRow * rows);
  shown.forEach((it, i) => {
    const r = Math.floor(i / perRow), c = i % perRow;
    const n = Math.min(perRow, shown.length - r * perRow);
    const tr = trophyMesh(T, TROPHY_LOOK[it.type] || TROPHY_LOOK.award);
    tr.scale.setScalar(SC);
    const y = (rows - 1 - r) * rowH + 0.03;
    tr.position.set((c - (n - 1) / 2) * slot, y, 0.02);
    tr.userData.spin = i * 0.7;
    tr.userData.trophy = true;
    // the label stands on the shelf's front edge, facing you
    const lab = new T.Mesh(new T.PlaneGeometry(slot * 0.92, 0.17), new T.MeshBasicMaterial({ map: labelTexture(T, it.label, it.season), transparent: true }));
    lab.position.set(tr.position.x, y + (r === rows - 1 ? 0.0 : -0.11) + 0.09, 0.41);
    pivot.add(tr, lab);
  });
  S.onFrame((t) => {
    for (const o of pivot.children) if (o.userData.trophy) o.rotation.y = Math.sin(t * 0.8 + o.userData.spin) * 0.6;
    if (!pivot.userData.held) pivot.rotation.y += (Math.sin(t * 0.25) * 0.12 - pivot.rotation.y) * 0.02;
  });
  return S;
}
/** Two lines on a little dark plate: what it is, and the season. */
function labelTexture(T, label, season) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,12,16,.82)"; g.beginPath(); g.roundRect?.(4, 4, 504, 88, 14); if (!g.roundRect) g.rect(4, 4, 504, 88); g.fill();
  g.textAlign = "center"; g.fillStyle = "#ffd36b";
  g.font = "800 38px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif";
  g.fillText(String(label).toUpperCase().slice(0, 24), 256, 42);
  g.fillStyle = "#ffffff"; g.font = "600 28px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif";
  g.fillText(String(season || ""), 256, 78);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- signing
/** The signing: your player in the new jersey at the club's press backdrop, cameras flashing. */
export async function signingScene(el, { av, name, num, height, weight, colors = ["#ff7a1a", "#ffffff"], club = "", nba = false, signal }) {
  const S = await stage(el, { signal, fov: 30, camera: [0, 1.3, 6.4], target: [0, 1.05, 0], label: `${name} signs with ${club}` });
  if (!S) return null;
  const { T, scene, pivot, camera } = S;
  studioLights(T, scene);
  const [c1, c2] = colors;
  // backdrop: club colours and the club's name repeated, like a press wall
  const tex = (() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = c1; g.fillRect(0, 0, 1024, 512);
    g.font = "800 46px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif"; g.fillStyle = c2; g.globalAlpha = 0.85; g.textAlign = "center";
    for (let y = 0; y < 6; y++) for (let x = 0; x < 3; x++) g.fillText(club.toUpperCase().slice(0, 18), 170 + x * 340 + (y % 2) * 170, 70 + y * 85);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  const wall = new T.Mesh(new T.PlaneGeometry(7, 3.5), new T.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  wall.position.set(0, 1.75, -1.4);
  polishedFloor(S, { size: [9, 6], map: woodTexture(T, { base: [70, 52, 40], repeat: 2 }), mirror: 0.25 });
  const table = new T.Mesh(new T.BoxGeometry(2.2, 0.06, 0.7), std(T, "#f4f4f4"));
  table.position.set(0, 0.78, 0.9);
  const skirt = new T.Mesh(new T.BoxGeometry(2.2, 0.72, 0.04), std(T, c1));
  skirt.position.set(0, 0.4, 1.24);
  const mic = new T.Mesh(new T.CylinderGeometry(0.02, 0.03, 0.22, 8), std(T, "#222"));
  mic.position.set(0.35, 0.92, 0.95); mic.rotation.x = -0.4;
  scene.add(wall, table, skirt, mic);
  if (nba) { const b = basketball(T, 0.11); b.position.set(-0.6, 0.92, 0.9); scene.add(b); }
  const rp = await makeRealPlayer(T, { av, j1: c1, j2: c2, num, name, height, weight });
  if (signal?.aborted) return null;
  const p = rp ? rp.root : makePlayer(T, { av, j1: c1, j2: c2, num, name, height, weight });
  p.position.z = 0.1;
  pivot.add(p);
  let cheering = false;
  // camera flashes: a few white lights that pop at random
  const flashes = Array.from({ length: 4 }, (_, i) => { const l = new T.PointLight("#ffffff", 0, 6); l.position.set(-2.5 + i * 1.7, 1.2 + (i % 2) * 0.5, 3); scene.add(l); return l; });
  let next = 0;
  S.onFrame((t, dt) => {
    if (rp) { if (!cheering && t > 1.2) { cheering = true; rp.setMode("cheer"); } rp.update(dt, t); } else pose(p, t, t < 1.2 ? "idle" : "cheer");
    camera.position.z = Math.max(4.6, 6.4 - t * 0.6);
    camera.lookAt(0, 1.05, 0);
    if (t > next) { const l = flashes[Math.floor(Math.random() * flashes.length)]; l.intensity = 40; next = t + 0.15 + Math.random() * 0.45; }
    for (const l of flashes) l.intensity = Math.max(0, l.intensity - dt * 220);
  });
  return S;
}
