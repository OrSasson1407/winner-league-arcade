// A stylized 3D basketball player built from simple shapes (no model files): the avatar's skin, hair,
// hair colour and extras, jersey colours and number, and body proportions from height and weight.
// Units are metres; the figure stands on y = 0 and faces +z.
import { SKINS, HAIR_COLORS } from "../lib/avatarArt.js";
import { textTexture } from "./core.js";

const mat = (T, color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });

/**
 * opts: { av (avatar: skin, hair, hc, j1, j2, num, x), j1, j2 (jersey colours, win over the avatar's), num, name (on the back),
 *         height (cm), weight (kg), ball (true: holds a ball), low (true: fewer details, for ten players on a court) }
 * Returns a Group; parts for animation are in group.userData: armL, armR, legL, legR, torso, head, ball.
 */
export function makePlayer(T, opts = {}) {
  const av = opts.av || {};
  const skinC = SKINS[av.skin ?? 2] || SKINS[2], hairC = HAIR_COLORS[av.hc ?? 0] || HAIR_COLORS[0];
  const j1 = opts.j1 || av.j1 || "#ff7a1a", j2 = opts.j2 || av.j2 || "#ffffff";
  const H = clamp((opts.height || 198) / 100, 1.7, 2.3);
  const ideal = ((opts.height || 198) - 100) * 0.92;
  const w = clamp((opts.weight || ideal) / ideal, 0.85, 1.25); // build: thin to heavy
  const seg = opts.low ? 6 : 12;
  const skin = mat(T, skinC), jersey = mat(T, j1), trim = mat(T, j2), shoe = mat(T, "#f2f2f2"), sole = mat(T, "#202020");

  const g = new T.Group();
  const legLen = H * 0.47, torsoLen = H * 0.3, headR = H * 0.062;
  const hip = legLen, shoulder = hip + torsoLen;

  // legs: a pivot at the hip, the leg hangs down
  const leg = (side) => {
    const p = new T.Group();
    p.position.set(side * 0.12 * w, hip, 0);
    const thigh = new T.Mesh(new T.CylinderGeometry(0.098 * w, 0.075 * w, legLen * 0.52, seg), skin);
    thigh.position.y = -legLen * 0.26;
    const shin = new T.Mesh(new T.CylinderGeometry(0.072 * w, 0.052, legLen * 0.46, seg), skin);
    shin.position.y = -legLen * 0.73;
    const sock = new T.Mesh(new T.CylinderGeometry(0.056, 0.054, legLen * 0.1, seg), trim);
    sock.position.y = -legLen * 0.92;
    const s = new T.Mesh(new T.BoxGeometry(0.14, 0.08, 0.3), shoe);
    s.position.set(0, -legLen + 0.035, 0.04);
    const so = new T.Mesh(new T.BoxGeometry(0.145, 0.02, 0.31), sole);
    so.position.set(0, -legLen + 0.01, 0.04);
    p.add(thigh, shin, sock, s, so);
    g.add(p);
    return p;
  };
  const legL = leg(-1), legR = leg(1);

  // shorts and jersey
  const shorts = new T.Mesh(new T.CylinderGeometry(0.235 * w, 0.27 * w, legLen * 0.32, seg), jersey);
  shorts.position.y = hip - legLen * 0.1;
  const band = new T.Mesh(new T.CylinderGeometry(0.24 * w, 0.24 * w, 0.04, seg), trim);
  band.position.y = hip + legLen * 0.05;
  const torso = new T.Group();
  torso.position.y = hip;
  const chest = new T.Mesh(new T.CylinderGeometry(0.26 * w, 0.22 * w, torsoLen, seg), jersey);
  chest.position.y = torsoLen / 2;
  chest.scale.z = 0.72;
  const collar = new T.Mesh(new T.TorusGeometry(0.075, 0.015, 6, seg), trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, torsoLen + 0.005, 0.02);
  torso.add(chest, collar);
  // number on the front and back, name on the back
  if (opts.num != null || av.num != null) {
    const n = String(opts.num ?? av.num);
    const numTex = textTexture(T, n, { color: j2, stroke: shade(j1) });
    const front = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: numTex, transparent: true }));
    front.position.set(0, torsoLen * 0.52, 0.26 * w * 0.72 + 0.006);
    const back = front.clone();
    back.position.z = -front.position.z;
    back.rotation.y = Math.PI;
    back.scale.setScalar(1.3);
    torso.add(front, back);
    if (opts.name && !opts.low) {
      const nameTex = textTexture(T, String(opts.name).toUpperCase().slice(0, 14), { color: j2, w: 512, h: 96, font: "800 64px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif" });
      const plate = new T.Mesh(new T.PlaneGeometry(0.4, 0.075), new T.MeshBasicMaterial({ map: nameTex, transparent: true }));
      plate.position.set(0, torsoLen * 0.82, back.position.z - 0.004);
      plate.rotation.y = Math.PI;
      torso.add(plate);
    }
  }

  // arms: a pivot at the shoulder
  const arm = (side) => {
    const p = new T.Group();
    p.position.set(side * 0.3 * w, shoulder - 0.05, 0);
    const up = new T.Mesh(new T.CylinderGeometry(0.068 * w, 0.056 * w, H * 0.16, seg), skin);
    up.position.y = -H * 0.08;
    const fore = new T.Mesh(new T.CylinderGeometry(0.054 * w, 0.044, H * 0.15, seg), skin);
    fore.position.y = -H * 0.235;
    const hand = new T.Mesh(new T.SphereGeometry(0.055, seg, Math.max(4, seg / 2)), skin);
    hand.position.y = -H * 0.32;
    const sweat = new T.Mesh(new T.CylinderGeometry(0.058, 0.058, 0.05, seg), trim);
    sweat.position.y = -H * 0.28;
    p.add(up, fore, hand);
    if (!opts.low && side > 0) p.add(sweat);
    g.add(p);
    return p;
  };
  const armL = arm(-1), armR = arm(1);
  armL.rotation.z = -0.12; armR.rotation.z = 0.12;

  // head: neck, head, ears, eyes, hair, extras
  const head = new T.Group();
  head.position.y = shoulder + 0.03;
  const neck = new T.Mesh(new T.CylinderGeometry(0.065, 0.075, 0.08, seg), skin);
  neck.position.y = 0.02;
  const skull = new T.Mesh(new T.SphereGeometry(headR, seg + 4, seg), skin);
  skull.position.y = 0.06 + headR;
  skull.scale.set(0.92, 1.05, 1);
  head.add(neck, skull);
  if (!opts.low) {
    for (const s of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(headR * 0.12, 6, 4), mat(T, "#1b1b1b"));
      eye.position.set(s * headR * 0.35, 0.06 + headR * 1.08, headR * 0.9);
      const ear = new T.Mesh(new T.SphereGeometry(headR * 0.22, 6, 4), skin);
      ear.position.set(s * headR * 0.92, 0.06 + headR, 0);
      head.add(eye, ear);
    }
  }
  addHair(T, head, av.hair || "short", hairC, headR, opts.low);
  if (!opts.low) addExtra(T, head, g, av.x || "none", { headR, j2, hairC, skinC, shoulder });
  g.add(shorts, band, torso, head);

  let ball = null;
  if (opts.ball) {
    ball = basketball(T);
    ball.position.set(0.38 * w, 0.5, 0.25);
    g.add(ball);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData = { armL, armR, legL, legR, torso, head, ball, H };
  return g;
}

/** A basketball: orange with dark seams. */
export function basketball(T, r = 0.12) {
  const b = new T.Group();
  b.add(new T.Mesh(new T.SphereGeometry(r, 16, 12), mat(T, "#d9692b", { roughness: 0.85 })));
  const seam = mat(T, "#2a1a10");
  for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2]]) {
    const ring = new T.Mesh(new T.TorusGeometry(r * 1.002, r * 0.04, 4, 24), seam);
    ring.rotation.set(...rot);
    b.add(ring);
  }
  return b;
}

function addHair(T, head, style, color, r, low) {
  const m = mat(T, color, { roughness: 0.95 });
  const top = 0.06 + r;
  const cap = (scale = 1.04, cut = 0.55) => {
    const s = new T.Mesh(new T.SphereGeometry(r * scale, 12, 8, 0, Math.PI * 2, 0, Math.PI * cut), m);
    s.position.y = top; s.scale.set(0.95, 1.05, 1.02);
    return s;
  };
  switch (style) {
    case "bald": return;
    case "buzz": case "fade": head.add(cap(1.02, style === "fade" ? 0.38 : 0.5)); return;
    case "afro": { const a = new T.Mesh(new T.IcosahedronGeometry(r * 1.45, 1), m); a.position.y = top + r * 0.35; head.add(a); return; }
    case "curly": { const a = new T.Mesh(new T.IcosahedronGeometry(r * 1.12, 1), m); a.position.y = top + r * 0.2; a.scale.y = 0.85; head.add(a); return; }
    case "mohawk": { head.add(cap(1.01, 0.35)); const b = new T.Mesh(new T.BoxGeometry(r * 0.35, r * 0.5, r * 1.9), m); b.position.y = top + r * 0.95; head.add(b); return; }
    case "long": { head.add(cap(1.06, 0.6)); const b = new T.Mesh(new T.BoxGeometry(r * 1.8, r * 1.6, r * 0.5), m); b.position.set(0, top - r * 0.6, -r * 0.7); head.add(b); return; }
    case "bun": { head.add(cap(1.04, 0.55)); const b = new T.Mesh(new T.SphereGeometry(r * 0.45, 10, 8), m); b.position.set(0, top + r * 1.05, -r * 0.35); head.add(b); return; }
    case "flattop": { head.add(cap(1.03, 0.45)); const b = new T.Mesh(new T.BoxGeometry(r * 1.75, r * 0.7, r * 1.7), m); b.position.y = top + r * 0.95; head.add(b); return; }
    case "spiky": { head.add(cap(1.03, 0.5)); if (!low) for (let i = 0; i < 9; i++) { const c = new T.Mesh(new T.ConeGeometry(r * 0.2, r * 0.6, 5), m); const a = (i / 9) * Math.PI * 2; c.position.set(Math.cos(a) * r * 0.55, top + r * 0.95, Math.sin(a) * r * 0.55); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); head.add(c); } return; }
    case "dreads": { head.add(cap(1.05, 0.55)); if (!low) for (let i = 0; i < 12; i++) { const a = Math.PI * 0.2 + (i / 11) * Math.PI * 1.6; const d = new T.Mesh(new T.CylinderGeometry(r * 0.09, r * 0.07, r * 1.5, 5), m); d.position.set(Math.sin(a) * r * 0.95, top - r * 0.45, -Math.cos(a) * r * 0.95); head.add(d); } return; }
    default: head.add(cap(1.04, 0.5));
  }
}

function addExtra(T, head, g, x, { headR: r, j2, hairC, skinC, shoulder }) {
  const top = 0.06 + r;
  const gold = mat(T, "#e2b33c", { metalness: 0.8, roughness: 0.3 });
  switch (x) {
    case "headband": { const b = new T.Mesh(new T.TorusGeometry(r * 1.0, r * 0.12, 6, 20), mat(T, j2)); b.rotation.x = Math.PI / 2; b.position.y = top + r * 0.35; head.add(b); return; }
    case "glasses": case "goggles": for (const s of [-1, 1]) { const l = new T.Mesh(new T.TorusGeometry(r * 0.22, r * 0.05, 5, 12), mat(T, x === "goggles" ? "#f2f2f2" : "#1b1b1b")); l.position.set(s * r * 0.36, top + r * 0.08, r * 0.95); head.add(l); } return;
    case "beard": { const b = new T.Mesh(new T.SphereGeometry(r * 0.75, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mat(T, hairC)); b.position.set(0, top - r * 0.2, r * 0.32); head.add(b); return; }
    case "mustache": { const b = new T.Mesh(new T.BoxGeometry(r * 0.6, r * 0.12, r * 0.12), mat(T, hairC)); b.position.set(0, top - r * 0.35, r * 0.95); head.add(b); return; }
    case "cap": { const c = new T.Mesh(new T.SphereGeometry(r * 1.06, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(T, j2)); c.position.y = top; const bill = new T.Mesh(new T.BoxGeometry(r * 1.1, r * 0.08, r * 0.9), mat(T, j2)); bill.position.set(0, top + r * 0.05, -r * 1.2); head.add(c, bill); return; }
    case "crown": { const c = new T.Mesh(new T.CylinderGeometry(r * 0.75, r * 0.7, r * 0.5, 8, 1, true), gold); c.position.y = top + r * 1.05; head.add(c); return; }
    case "chain": { const c = new T.Mesh(new T.TorusGeometry(0.11, 0.012, 6, 24), gold); c.rotation.x = Math.PI / 2.4; c.position.set(0, shoulder - 0.06, 0.06); g.add(c); return; }
    case "headphones": { const b = new T.Mesh(new T.TorusGeometry(r * 1.05, r * 0.08, 6, 20, Math.PI), mat(T, "#202020")); b.position.y = top; head.add(b); for (const s of [-1, 1]) { const e = new T.Mesh(new T.CylinderGeometry(r * 0.3, r * 0.3, r * 0.2, 12), mat(T, "#202020")); e.rotation.z = Math.PI / 2; e.position.set(s * r * 1.02, top, 0); head.add(e); } return; }
    case "facepaint": { for (const s of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(r * 0.35, r * 0.08, r * 0.05), mat(T, j2)); p.position.set(s * r * 0.45, top - r * 0.15, r * 0.9); head.add(p); } return; }
    default:
  }
}

/** Animate a figure. mode: "idle" (breathing, a slow sway), "dribble", "run", "shoot", "cheer". */
export function pose(fig, t, mode = "idle") {
  const { armL, armR, legL, legR, torso, head, ball, H } = fig.userData;
  const s = Math.sin(t * 2.2);
  if (mode === "run") {
    const k = Math.sin(t * 9);
    legL.rotation.x = k * 0.6; legR.rotation.x = -k * 0.6;
    armL.rotation.x = -k * 0.6; armR.rotation.x = k * 0.6;
    fig.position.y = Math.abs(Math.cos(t * 9)) * 0.04;
    return;
  }
  legL.rotation.x = legR.rotation.x = 0;
  torso.scale.y = 1 + s * 0.008;
  head.rotation.y = Math.sin(t * 0.6) * 0.15;
  if (mode === "shoot") { armL.rotation.x = armR.rotation.x = -2.6; armL.rotation.z = -0.1; armR.rotation.z = 0.1; return; }
  if (mode === "cheer") { armL.rotation.x = armR.rotation.x = -2.9; armL.rotation.z = -0.4 - s * 0.2; armR.rotation.z = 0.4 + s * 0.2; fig.position.y = Math.max(0, Math.sin(t * 6)) * 0.08; return; }
  if (mode === "dribble" && ball) {
    const b = Math.abs(Math.sin(t * 4.2)); // the bounce
    armR.rotation.x = -0.45 - (1 - b) * 0.35;
    ball.position.y = 0.12 + b * (H * 0.36);
    armL.rotation.x = 0.05 + s * 0.05;
    return;
  }
  armL.rotation.x = s * 0.04; armR.rotation.x = -s * 0.04;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** A darker version of a colour (outlines on numbers). */
function shade(hex) {
  const n = parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.45));
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
