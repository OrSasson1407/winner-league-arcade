// Shareable result card for an online match (1080x1080 PNG).
import { rankOf } from "../shared/rating.js";
import { GAME_NAMES } from "./social.js";

const RESULT = { win: ["VICTORY", "#ffb020"], lose: ["DEFEAT", "#ff6b6b"], draw: ["DRAW", "#c3cad5"] };

function avatar(g, p, x, y, r) {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = p.color || "#ff7a1a"; g.fill();
  g.lineWidth = 8; g.strokeStyle = "rgba(255,255,255,.85)"; g.stroke();
  g.fillStyle = "#fff"; g.font = `800 ${Math.round(r * 0.9)}px Oswald, Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText((p.name || "?").trim()[0]?.toUpperCase() || "?", x, y + 4);
  g.restore();
}

function fit(g, text, max, size, weight = 700, family = "Oswald, Arial, sans-serif") {
  let s = size;
  do g.font = `${weight} ${s}px ${family}`; while (g.measureText(text).width > max && (s -= 2) > 12);
}

/** m: { game, mode, result, you, opp, myScore, oppScore, delta, elo, streak, line } */
export function drawResultCard(m) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1080;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, "#0b1222"); bg.addColorStop(1, "#1a1030");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
  // court lines
  g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 6;
  g.beginPath(); g.arc(540, 1080, 300, Math.PI, 0); g.stroke();
  g.beginPath(); g.moveTo(540, 0); g.lineTo(540, 1080); g.stroke();
  const [label, col] = RESULT[m.result];
  g.textAlign = "center";
  g.fillStyle = "#ff7a1a"; g.font = "800 34px Orbitron, Arial, sans-serif";
  g.fillText("WINNER LEAGUE ARCADE · ONLINE 1V1", 540, 92);
  g.fillStyle = "#93a1bf"; g.font = "600 34px Inter, Arial, sans-serif";
  g.fillText(`${GAME_NAMES[m.game]} · ${m.mode === "ranked" ? "Ranked" : m.mode === "bot" ? "vs Bot" : "Friendly"}`, 540, 146);
  g.fillStyle = col; g.font = "800 150px Oswald, Arial, sans-serif";
  g.fillText(label, 540, 320);
  avatar(g, m.you, 260, 520, 110);
  avatar(g, m.opp, 820, 520, 110);
  g.fillStyle = "#eef2fa";
  fit(g, m.you.name, 380, 52); g.fillText(m.you.name, 260, 690);
  fit(g, m.opp.name, 380, 52); g.fillText(m.opp.name, 820, 690);
  g.font = "800 120px Orbitron, Arial, sans-serif";
  g.fillStyle = "#3987e5"; g.fillText(String(m.myScore ?? ""), 260, 840);
  g.fillStyle = "#d95926"; g.fillText(String(m.oppScore ?? ""), 820, 840);
  g.fillStyle = "#93a1bf"; g.font = "800 60px Orbitron, Arial, sans-serif"; g.fillText("VS", 540, 540);
  if (m.line) { g.fillStyle = "#c9d3e6"; fit(g, m.line, 900, 38, 600, "Inter, Arial, sans-serif"); g.fillText(m.line, 540, 930); }
  const extra = [];
  if (m.mode === "ranked" && m.elo != null) extra.push(`${rankOf(m.elo).name} ${m.elo} (${m.delta >= 0 ? "+" : ""}${m.delta})`);
  if (m.streak >= 2) extra.push(`${m.streak} win streak 🔥`);
  if (extra.length) { g.fillStyle = "#ffb020"; g.font = "700 38px Inter, Arial, sans-serif"; g.fillText(extra.join("  ·  "), 540, 990); }
  g.fillStyle = "#64748b"; g.font = "500 28px Inter, Arial, sans-serif";
  g.fillText(location.host, 540, 1048);
  return c;
}
