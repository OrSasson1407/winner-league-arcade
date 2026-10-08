// The live game on a 3D court: ten players and the ball, driven by the game engine's events (the same ones
// the 2D court uses). The engine has no player tracking: players take spots in a half-court set around the
// basket their team attacks, the shooter goes to the real shot spot, and the ball flies to the rim.
// Court units: the 2D court is 280 × 150 (tenths of a metre), so x / 10 is metres along the court.
import { drawWood, polishedFloor, stage, studioLights } from "./core.js";
import { makeRealPlayer } from "./player.js";
import { basketball, makePlayer, pose } from "./figures.js";
import { COURT } from "../mycareer/pbp.js";
import { SPOTS } from "../mycareer/live.js";

const toWorld = (x, y) => [x / 10 - COURT.w / 20, y / 10 - COURT.h / 20];
const RIM_H = 3.05;

function courtTexture(T, c1, c2) {
  const W = 1400, H = 750, k = W / COURT.w; // px per court unit
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  drawWood(g, W, H, 40, [212, 158, 98]); // maple boards
  g.strokeStyle = "#ffffff"; g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, W - 5, H - 5);
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 18 * k, 0, Math.PI * 2); g.stroke();
  for (const [dir, hx] of [[1, COURT.hoopR[0]], [-1, COURT.hoopL[0]]]) {
    const px = hx * k;
    g.fillStyle = dir > 0 ? c1 : c2; g.globalAlpha = 0.8;
    const paintX = dir > 0 ? W - 58 * k : 0;
    g.fillRect(paintX, (75 - 24.5) * k, 58 * k, 49 * k); g.globalAlpha = 1;
    g.strokeRect(paintX, (75 - 24.5) * k, 58 * k, 49 * k);
    g.beginPath(); g.arc(dir > 0 ? W - 58 * k : 58 * k, H / 2, 18 * k, dir > 0 ? Math.PI / 2 : -Math.PI / 2, dir > 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
    // three-point line: straight in the corners, an arc of 6.75 m
    const r = 67.5 * k, cornerY = 9 * k;
    const a = Math.asin((H / 2 - cornerY) / r);
    g.beginPath();
    if (dir > 0) { g.moveTo(W, cornerY); g.lineTo(px - Math.cos(a) * r, cornerY); g.arc(px, H / 2, r, Math.PI + a, Math.PI - a, true); g.lineTo(W, H - cornerY); }
    else { g.moveTo(0, cornerY); g.lineTo(px + Math.cos(a) * r, cornerY); g.arc(px, H / 2, r, -a, a, false); g.lineTo(0, H - cornerY); }
    g.stroke();
  }
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function hoop(T, x, dir) {
  const g = new T.Group();
  const m = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  const pole = new T.Mesh(new T.CylinderGeometry(0.09, 0.11, RIM_H + 0.4, 10), m("#2b2f36"));
  pole.position.set(x + dir * 1.2, (RIM_H + 0.4) / 2, 0);
  const arm = new T.Mesh(new T.BoxGeometry(1.0, 0.1, 0.1), m("#2b2f36"));
  arm.position.set(x + dir * 0.75, RIM_H + 0.35, 0);
  const board = new T.Mesh(new T.BoxGeometry(0.04, 1.05, 1.8), m("#ffffff", { transparent: true, opacity: 0.55 }));
  board.position.set(x + dir * 0.3, RIM_H + 0.45, 0);
  const rim = new T.Mesh(new T.TorusGeometry(0.23, 0.018, 8, 24), m("#e8501c", { metalness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, RIM_H, 0);
  const net = new T.Mesh(new T.CylinderGeometry(0.23, 0.15, 0.4, 12, 1, true), new T.MeshStandardMaterial({ color: "#ffffff", wireframe: true }));
  net.position.set(x, RIM_H - 0.2, 0);
  g.add(pole, arm, board, rim, net);
  return g;
}

/**
 * Build the court. teams: [{ c1, c2 }, { c1, c2 }] (home, away). Returns { formation(side), shot(e), dispose } or null.
 * shot(e): e is an engine event with x, y (2D court units), side, type ("2" | "3" | "miss" | "ft"), mine (your shot).
 */
export async function court3D(el, { teams, signal }) {
  const S = await stage(el, { signal, fov: 40, camera: [0, 9.5, 15.5], target: [0, 0, 0.5], drag: false, bloom: 0.1, label: "The game on a 3D court" });
  if (!S) return null;
  const { T, scene, camera } = S;
  studioLights(T, scene, { warm: "#fff7ea" });
  const [w, h] = [COURT.w / 10, COURT.h / 10];
  polishedFloor(S, { size: [w, h], map: courtTexture(T, teams[0].c1, teams[1].c1), roughness: 0.3, mirror: 0.2 });
  const apron = new T.Mesh(new T.PlaneGeometry(w + 6, h + 6), new T.MeshStandardMaterial({ color: "#1d2129" }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.01;
  scene.add(apron);
  const [rx] = toWorld(COURT.hoopR[0], 75), [lx] = toWorld(COURT.hoopL[0], 75);
  scene.add(hoop(T, rx, 1), hoop(T, lx, -1));
  // ten players: home 0-4, away 5-9; heights vary a little by spot (bigs inside)
  const players = await Promise.all([0, 1].flatMap((s) => [0, 1, 2, 3, 4].map(async (i) => {
    const o = { low: true, j1: teams[s].c1, j2: teams[s].c2, num: [3, 7, 11, 21, 33][i], height: [188, 196, 201, 206, 211][i], av: { skin: (i * 2 + s) % 6, hair: ["short", "fade", "buzz", "curly", "bald"][(i + s) % 5], hc: 0 } };
    const rp = await makeRealPlayer(T, o);
    const p = rp ? rp.root : makePlayer(T, o);
    p.userData.rp = rp; p.userData.mode = "idle";
    p.userData.target = new T.Vector3(); p.userData.side = s;
    scene.add(p);
    return p;
  })));
  if (signal?.aborted) return null;
  const facing = players[0].userData.rp?.facing ?? 1;
  const ball = basketball(T, 0.17); // a little big, to be seen from the broadcast camera
  scene.add(ball);
  let flight = null, offense = 0; // flight: { from, to, t, dur, made }

  function formation(side) {
    offense = side;
    const hx = side === 0 ? COURT.hoopR[0] : COURT.hoopL[0], dir = side === 0 ? 1 : -1;
    players.forEach((p, k) => {
      const s = p.userData.side, [ox, oy] = SPOTS[k % 5];
      let x = hx + dir * ox + (Math.random() - 0.5) * 8, y = 75 + oy + (Math.random() - 0.5) * 8;
      if (s !== side) { x += (hx - x) * 0.3; y += (75 - y) * 0.3; } // defenders sag toward the basket
      const [X, Z] = toWorld(x, y);
      p.userData.target.set(X, 0, Z);
    });
  }
  function shot(e) {
    if (e.x == null) return;
    const shooter = players[(e.side ? 5 : 0) + Math.floor(Math.random() * 5)];
    const [X, Z] = toWorld(e.x, e.y);
    shooter.userData.target.set(X, 0, Z);
    shooter.position.set(X, 0, Z);
    shooter.userData.shootUntil = performance.now() + 700;
    const hx = (e.side === 0 ? rx : lx);
    flight = { from: new T.Vector3(X, 2.3, Z), to: new T.Vector3(hx, RIM_H + 0.05, 0), t: 0, dur: 0.75 + Math.hypot(hx - X, Z) * 0.03, made: e.type !== "miss" };
  }
  formation(0);
  players.forEach((p) => p.position.copy(p.userData.target));

  S.onFrame((t, dt) => {
    for (const p of players) {
      const d = p.userData.target.clone().sub(p.position); d.y = 0;
      const dist = d.length();
      if (dist > 0.05) { p.position.addScaledVector(d, Math.min(1, dt * 3)); p.rotation.y = Math.atan2(d.x, d.z) + (facing < 0 ? Math.PI : 0); }
      const mode = p.userData.shootUntil > performance.now() ? "shoot" : dist > 0.6 ? "sprint" : dist > 0.25 ? "run" : "idle";
      const rp = p.userData.rp;
      if (rp) { if (mode !== p.userData.mode) { p.userData.mode = mode; rp.setMode(mode); } rp.update(dt, t + p.id * 0.37); }
      else pose(p, t + p.id * 0.37, mode === "sprint" ? "run" : mode);
    }
    if (flight) {
      flight.t += dt / flight.dur;
      const k = Math.min(1, flight.t);
      ball.position.lerpVectors(flight.from, flight.to, k);
      ball.position.y += Math.sin(k * Math.PI) * 2.2; // the arc
      if (k >= 1) { // through the net, or off the rim
        const end = flight.made ? flight.to.clone().setY(0.12) : flight.to.clone().add(new T.Vector3((Math.random() - 0.5) * 2, -RIM_H + 0.12, (Math.random() - 0.5) * 2));
        flight = flight.made === null ? null : { from: flight.to.clone(), to: end, t: 0, dur: 0.5, made: null };
      }
    } else {
      const holder = players[offense * 5]; // the point guard brings it up
      ball.position.lerp(holder.position.clone().add(new T.Vector3(0.3, 0.5 + Math.abs(Math.sin(t * 6)) * 0.6, 0.2)), Math.min(1, dt * 5));
    }
    // follow the play: the half where the ball is, so the basket stays in the picture
    const goal = flight ? flight.to.x * 0.62 : (offense === 0 ? rx : lx) * 0.62;
    camera.position.x += (goal - camera.position.x) * Math.min(1, dt * 1.2);
    camera.lookAt(camera.position.x * 1.15, 0.6, 0.5);
  });
  return { ...S, formation, shot };
}
