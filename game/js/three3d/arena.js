// The arena around the 3D court (built in code, no files): stands rising behind the far sideline and both
// baselines, a crowd in the clubs' colours that cheers when its team scores, LED boards along the court and
// the stands showing the clubs' names, a dark roof with rows of lights and a little haze. The camera looks at
// the court from above the near sideline, so nothing is built on that side.
// Quality: low has empty stands, medium a thinner crowd, high and ultra a full house.
import { SKINS } from "../lib/avatarArt.js";

const ROW_D = 0.85, ROW_H = 0.45, SEAT = 0.55; // metres per row (depth, rise) and per seat

/** A simple fan: shoulders, neck and the head on top come from two instanced meshes (shirt, skin). */
function fanGeometries(T) {
  const body = new T.LatheGeometry([[0, 0], [0.15, 0], [0.17, 0.2], [0.175, 0.33], [0.13, 0.41], [0.05, 0.45], [0, 0.46]].map(([x, y]) => new T.Vector2(x, y)), 8);
  const head = new T.SphereGeometry(0.095, 10, 8);
  head.scale(1, 1.15, 1);
  head.translate(0, 0.56, 0);
  return { body, head };
}

/** A board's texture: the clubs' names (and a chant) in their colours, whole words only, repeated along a board len × boardH metres. */
function boardTexture(T, teams, len, boardH, h = 64) {
  const words = teams.flatMap((t) => [[(t.name || "").toUpperCase(), t.c1, t.c2], ["DEFENSE!", t.c2, t.c1]]).filter(([w]) => w);
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const font = `800 ${Math.round(h * 0.62)}px 'Saira Condensed', 'Arial Narrow', Arial, sans-serif`;
  g.font = font;
  const widths = words.map(([w]) => Math.ceil(g.measureText(w).width + h * 1.4));
  c.width = Math.min(4096, widths.reduce((a, b) => a + b, 0)); c.height = h; // one cycle: it tiles without cutting a word
  g.font = font; g.textBaseline = "middle";
  let x = 0;
  words.forEach(([w, bg, fg], i) => {
    g.fillStyle = bg; g.fillRect(x, 0, widths[i], h);
    g.fillStyle = fg; g.fillText(w, x + h * 0.7, h / 2 + 2);
    x += widths[i];
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.wrapS = T.RepeatWrapping; t.anisotropy = 4;
  t.repeat.set(len / ((c.width / h) * boardH), 1);
  return t;
}

/**
 * Build the arena into S.scene. court: [w, d] in metres. teams: [{ c1, c2, name }, ...] (home first).
 * Returns { update(t, dt), cheer(side) } (cheer: that team's fans jump for a moment).
 */
export function buildArena(S, { court: [cw, cd], teams }) {
  const { T, scene, Q } = S;
  const group = new T.Group();
  scene.add(group);
  const std = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const glow = (map, k = 1.6) => new T.MeshBasicMaterial({ map, color: new T.Color(k, k, k) }); // brighter than white: it glows with bloom
  scene.fog = new T.Fog("#0a0c11", 34, 70); // haze: the far rows fade into the dark
  scene.background = new T.Color("#0a0c11");

  // floor around the court and the roof
  const deck = new T.Mesh(new T.PlaneGeometry(cw + 14, cd + 12), std("#22262e", { roughness: 0.6 }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = -0.012; deck.receiveShadow = true;
  group.add(deck);
  const roof = new T.Mesh(new T.PlaneGeometry(90, 70), std("#07080b"));
  roof.rotation.x = Math.PI / 2; roof.position.y = 17;
  group.add(roof);
  const lamp = new T.BoxGeometry(5, 0.15, 0.7), lampMat = new T.MeshBasicMaterial({ color: new T.Color(3.2, 3.0, 2.7) });
  for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) { const m = new T.Mesh(lamp, lampMat); m.position.set(i * 7, 16.8, j * 6 - 2); group.add(m); }

  // stands: the far side (behind the far sideline) and the two ends (behind the baselines)
  const sides = [
    { rows: 20, len: cw + 6, origin: [0, -(cd / 2 + 2.6)], dir: [0, -1] }, // far side: rows go away in -z
    { rows: 18, len: cd + 5, origin: [cw / 2 + 3.4, -1], dir: [1, 0] },  // right end
    { rows: 18, len: cd + 5, origin: [-(cw / 2 + 3.4), -1], dir: [-1, 0] },
  ];
  const homeC = teams[0]?.c1 || "#ff7a1a";
  const stepMat = std("#101217"), seatMat = std(new T.Color(homeC).lerp(new T.Color("#101217"), 0.78), { roughness: 0.7 });
  const fans = []; // [x, y, z, rotY, team]
  // the stands' boxes (steps, seats, seat backs) as three instanced meshes: a few draw calls, not hundreds
  const parts = { step: [], seat: [], back: [] };
  const box = (kind, [sx, sy, sz], [x, y, z]) => parts[kind].push(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(sx, sy, sz)));
  const density = Q === "low" ? 0 : Q === "medium" ? 0.45 : 0.9;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const s of sides) {
    const [ox, oz] = s.origin, [dx, dz] = s.dir, along = [Math.abs(dz), Math.abs(dx)]; // along the row
    const ry = Math.atan2(-dx, -dz); // fans face the court
    for (let r = 0; r < s.rows; r++) {
      const out = r * ROW_D, y = r * ROW_H;
      box("step", [along[0] ? s.len : ROW_D, y + ROW_H, along[1] ? s.len : ROW_D], [ox + dx * out, (y + ROW_H) / 2, oz + dz * out]);
      box("seat", [along[0] ? s.len : 0.42, 0.08, along[1] ? s.len : 0.42], [ox + dx * (out + 0.1), y + ROW_H + 0.04, oz + dz * (out + 0.1)]);
      box("back", [along[0] ? s.len : 0.06, 0.38, along[1] ? s.len : 0.06], [ox + dx * (out + 0.33), y + ROW_H + 0.23, oz + dz * (out + 0.33)]);
      const n = Math.floor(s.len / SEAT);
      for (let k = 0; k < n; k++) {
        if (rnd() > density) continue;
        const a = (k - (n - 1) / 2) * SEAT + (rnd() - 0.5) * 0.12;
        // which team: the home end and the far side lean home; the left end holds the away fans
        const away = s.dir[0] < 0 ? rnd() < 0.7 : rnd() < 0.15;
        fans.push([ox + dx * (out + 0.1) + along[0] * a, y + ROW_H + 0.08, oz + dz * (out + 0.1) + along[1] * a, ry, away ? 1 : 0]);
      }
    }
    // the stands' front: an LED ribbon
    const ribbonTex = boardTexture(T, teams, s.len, 0.55);
    const ribbon = new T.Mesh(new T.PlaneGeometry(s.len, 0.55), glow(ribbonTex, 1.25));
    ribbon.position.set(ox - dx * 0.44, 0.3, oz - dz * 0.44);
    ribbon.rotation.y = ry;
    ribbon.userData.scroll = 0.02;
    group.add(ribbon);
  }

  const unit = new T.BoxGeometry(1, 1, 1);
  for (const [kind, mat] of [["step", stepMat], ["seat", seatMat], ["back", seatMat]]) {
    const im = new T.InstancedMesh(unit, mat, parts[kind].length);
    parts[kind].forEach((m, i) => im.setMatrixAt(i, m));
    group.add(im);
  }

  // courtside LED boards: along the far sideline and behind both baselines
  const boards = [];
  const courtBoard = (len, x, z, ry) => {
    const tex = boardTexture(T, teams, len, 0.9, 96);
    const box = new T.Mesh(new T.BoxGeometry(len, 0.9, 0.2), [std("#111"), std("#111"), std("#111"), std("#111"), glow(tex, 1.4), std("#111")]);
    box.position.set(x, 0.45, z); box.rotation.y = ry;
    group.add(box);
    boards.push(tex);
  };
  courtBoard(cw + 2, 0, -(cd / 2 + 1.5), 0);
  courtBoard(cd, cw / 2 + 2.2, 0, -Math.PI / 2);
  courtBoard(cd, -(cw / 2 + 2.2), 0, Math.PI / 2);

  // the crowd: shirts in the clubs' colours (and some neutral), heads in a range of skin tones
  let crowd = null;
  if (fans.length) {
    const { body, head } = fanGeometries(T);
    const bodies = new T.InstancedMesh(body, std("#ffffff", { roughness: 0.9 }), fans.length);
    const heads = new T.InstancedMesh(head, std("#ffffff", { roughness: 0.7 }), fans.length);
    const neutral = ["#e9e9e9", "#2b2b2b", "#3c4a66", "#7a7f88"];
    const c = new T.Color();
    fans.forEach((f, i) => {
      const t = teams[f[4]] || teams[0];
      const pick = rnd();
      c.set(pick < 0.55 ? t.c1 : pick < 0.8 ? t.c2 : neutral[Math.floor(rnd() * neutral.length)]).multiplyScalar(0.62); // the stands are darker than the court
      bodies.setColorAt(i, c);
      heads.setColorAt(i, c.set(SKINS[Math.floor(rnd() * SKINS.length)]).multiplyScalar(0.7));
      f.push(rnd() * 6.28, 0.9 + rnd() * 0.25); // phase, size
    });
    bodies.frustumCulled = heads.frustumCulled = false;
    group.add(bodies, heads);
    crowd = { bodies, heads };
  }
  const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), sc = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  const jumpUntil = [0, 0];
  const placeFans = (t) => {
    if (!crowd) return;
    for (let i = 0; i < fans.length; i++) {
      const [x, y, z, ry, team, ph, size] = fans[i];
      const jumping = t < jumpUntil[team];
      const lift = jumping ? Math.max(0, Math.sin(t * 9 + ph)) * 0.28 + 0.18 : Math.sin(t * 1.3 + ph) * 0.015; // stand up and bounce, or sway a little
      q.setFromAxisAngle(up, ry + (jumping ? 0 : Math.sin(t * 0.4 + ph) * 0.25));
      p.set(x, y + lift, z); sc.setScalar(size);
      m4.compose(p, q, sc);
      crowd.bodies.setMatrixAt(i, m4);
      crowd.heads.setMatrixAt(i, m4);
    }
    crowd.bodies.instanceMatrix.needsUpdate = crowd.heads.instanceMatrix.needsUpdate = true;
  };
  placeFans(0);
  let clock = 0, lastPlace = -1;
  return {
    update(t, dt) {
      clock = t;
      for (const tex of boards) tex.offset.x += dt * 0.025;
      group.children.forEach((o) => { if (o.userData.scroll) o.material.map.offset.x -= dt * o.userData.scroll; });
      // the crowd moves at 30 updates a second at most (it's far away)
      if (t - lastPlace > 1 / 30) { lastPlace = t; placeFans(t); }
    },
    cheer(side) { if (side === 0 || side === 1) jumpUntil[side] = clock + 1.8; },
  };
}
