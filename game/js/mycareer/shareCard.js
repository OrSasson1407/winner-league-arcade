// "Share career card": a 1080×1350 broadcast-style image of a My Career player, made on a canvas.
import { teamName } from "../wl.js";
import { clubColors } from "../lib/clubs.js";

const NAVY = "#061532", NAVY2 = "#0e2552", RED = "#e4002b", GOLD = "#ffc629";
const DISPLAY = "'Saira Condensed', 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const BODY = "Barlow, Inter, Arial, sans-serif";

function fit(g, text, max, size, weight = 800, family = DISPLAY) {
  let s = size;
  do g.font = `${weight} ${s}px ${family}`; while (g.measureText(text).width > max && (s -= 2) > 14);
}
/** A slanted strap (the broadcast graphic shape). */
function strap(g, x, y, w, h, color, slant = 18) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - slant, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
}
const loadImage = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });

/**
 * C: the career save. avatarSvg: the player's avatar as an SVG string.
 * Returns a canvas ready for shareOrDownload().
 */
export async function drawCareerCard(C, avatarSvg, { overall, hofScore, hofLine }) {
  try { await Promise.all([document.fonts.load(`800 60px ${DISPLAY}`), document.fonts.load(`600 30px ${BODY}`)]); } catch { /* fallback fonts */ }
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const pro = C.history.filter((h) => h.pro);
  const clubs = [...new Set(pro.map((h) => h.team))];
  const club = C.cur?.team || C.club || clubs[clubs.length - 1] || C.academy?.club;
  const [c1] = clubColors(club || "x");

  // background: night navy, a light beam, the club colour band
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, NAVY); bg.addColorStop(1, NAVY2);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,.035)";
  g.beginPath(); g.moveTo(640, 0); g.lineTo(760, 0); g.lineTo(420, H); g.lineTo(300, H); g.closePath(); g.fill();
  g.fillStyle = c1; g.globalAlpha = .9; g.fillRect(0, 0, 18, H); g.globalAlpha = 1;
  g.fillStyle = RED; g.fillRect(0, H - 14, W * 0.72, 14);
  g.fillStyle = GOLD; g.fillRect(W * 0.72, H - 14, W * 0.28, 14);

  // header straps
  strap(g, 60, 60, 300, 58, RED);
  g.fillStyle = "#fff"; g.font = `800 34px ${DISPLAY}`; g.textBaseline = "middle"; g.fillText("MY CAREER", 82, 90);
  g.fillStyle = "#b6c4e6"; g.font = `700 30px ${DISPLAY}`; g.fillText("WINNER LEAGUE ARCADE", 380, 90);

  // avatar
  try {
    // an <svg> drawn as an image needs its namespace and a size
    let svg = avatarSvg.includes("xmlns=") ? avatarSvg : avatarSvg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace("<svg", '<svg width="340" height="340"');
    const im = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    g.save(); g.beginPath(); g.arc(W - 250, 330, 170, 0, Math.PI * 2); g.closePath();
    g.fillStyle = c1; g.fill(); g.clip(); g.drawImage(im, W - 420, 160, 340, 340); g.restore();
    g.lineWidth = 10; g.strokeStyle = "#fff"; g.beginPath(); g.arc(W - 250, 330, 170, 0, Math.PI * 2); g.stroke();
  } catch { /* no avatar: the card still works */ }

  // name lower-third
  const nameY = 560;
  g.fillStyle = GOLD; g.beginPath(); g.moveTo(60, nameY); g.lineTo(260, nameY); g.lineTo(240, nameY + 190); g.lineTo(60, nameY + 190); g.closePath(); g.fill();
  g.fillStyle = NAVY; g.textAlign = "center"; g.font = `800 28px ${DISPLAY}`; g.fillText("OVERALL", 150, nameY + 44);
  g.font = `800 112px ${DISPLAY}`; g.fillText(String(overall), 150, nameY + 120);
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(244, nameY); g.lineTo(W - 60, nameY); g.lineTo(W - 84, nameY + 190); g.lineTo(224, nameY + 190); g.closePath(); g.fill();
  g.textAlign = "left"; g.fillStyle = RED; g.font = `800 28px ${DISPLAY}`; g.fillText(C.retired ? "CAREER COMPLETE" : `${pro.length ? `${pro.length} PRO SEASON${pro.length === 1 ? "" : "S"}` : "ACADEMY"} · AGE ${C.age}`, 280, nameY + 42);
  g.fillStyle = NAVY; fit(g, C.name.toUpperCase(), W - 380, 92); g.fillText(C.name.toUpperCase(), 280, nameY + 108);
  g.fillStyle = "#42527a"; g.font = `600 30px ${BODY}`;
  g.fillText(`${C.pos}/${C.pos2} · ${(C.height / 100).toFixed(2)} m · ${C.nat}${club ? ` · ${teamName(club)}` : ""}`, 280, nameY + 160);

  // stats strip
  const t = C.totals || { gp: 0, pts: 0, reb: 0, ast: 0 };
  const per = (k) => (t.gp ? (t[k] / t.gp).toFixed(1) : "0.0");
  const stats = [["GAMES", t.gp], ["POINTS", t.pts.toLocaleString("en-US")], ["PPG", per("pts")], ["RPG", per("reb")], ["APG", per("ast")]];
  const sy = 820, sw = (W - 120) / stats.length;
  stats.forEach(([l, v], i) => {
    const x = 60 + i * sw;
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + 4, sy, sw - 8, 150);
    g.fillStyle = GOLD; g.fillRect(x + 4, sy, sw - 8, 6);
    g.textAlign = "center"; g.fillStyle = "#fff"; fit(g, String(v), sw - 24, 72); g.fillText(String(v), x + sw / 2, sy + 76);
    g.fillStyle = "#b6c4e6"; g.font = `700 26px ${DISPLAY}`; g.fillText(l, x + sw / 2, sy + 126);
  });
  g.textAlign = "left";
  g.fillStyle = "#b6c4e6"; g.font = `600 24px ${BODY}`;
  g.fillText(`Winner League regular season${C.elTotals?.gp ? ` · plus ${C.elTotals.gp} EuroLeague games, ${C.elTotals.pts.toLocaleString("en-US")} points` : ""}`, 64, sy + 190);

  // trophies and awards
  const count = (type) => C.trophies.filter((x) => x.type === type).length;
  const awards = (name) => C.awards.filter((a) => a.name === name).length;
  const plural = (one, many, n) => (n === 1 ? one : many);
  const honours = [[plural("TITLE", "TITLES", count("title")), count("title")], [plural("EUROLEAGUE TITLE", "EUROLEAGUE TITLES", count("euroleague")), count("euroleague")],
    [plural("STATE CUP", "STATE CUPS", count("cup")), count("cup")], [plural("ALL-STAR", "ALL-STARS", count("allstar")), count("allstar")], [plural("MVP", "MVPS", awards("MVP")), awards("MVP")]].filter(([, n]) => n);
  let hx = 60;
  const hy = 1080;
  g.font = `800 30px ${DISPLAY}`;
  for (const [l, n] of honours.length ? honours : [["NO TROPHIES YET", ""]]) {
    const text = n ? `${n}× ${l}` : l;
    const w = g.measureText(text).width + 50;
    if (hx + w > W - 60) break;
    strap(g, hx, hy, w, 54, n ? RED : "rgba(255,255,255,.12)", 12);
    g.fillStyle = "#fff"; g.fillText(text, hx + 18, hy + 29);
    hx += w + 12;
  }
  // clubs and Hall of Fame
  g.fillStyle = "#dfe7fb"; g.font = `600 28px ${BODY}`;
  const clubLine = clubs.length ? `Clubs: ${clubs.map(teamName).join(" · ")}` : `Academy: ${teamName(C.academy?.club || "")}`;
  let line = clubLine;
  while (g.measureText(line).width > W - 130 && line.length > 10) line = line.slice(0, -2);
  g.fillText(line === clubLine ? line : line.trimEnd() + "…", 64, 1185);
  g.fillStyle = C.hof ? GOLD : "#b6c4e6"; g.font = `800 30px ${DISPLAY}`;
  g.fillText(C.hof ? "HALL OF FAME" : hofScore >= hofLine ? `ON COURSE FOR THE HALL OF FAME · SCORE ${hofScore}` : `HALL OF FAME SCORE ${hofScore} OF ${hofLine}`, 64, 1240);
  g.textAlign = "right"; g.fillStyle = "#7f8db0"; g.font = `500 24px ${BODY}`;
  g.fillText(location.host, W - 60, 1290);
  return cv;
}
