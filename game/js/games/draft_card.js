// Draws a shareable 1080x1080 team card on a canvas.
import { POSITIONS, playersById, teamName } from "../data.js";
import { clubColors } from "../lib/clubs.js";

export function drawTeamCard(team, summary) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1080;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, "#0b1220"); bg.addColorStop(1, "#1b2a52");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);

  g.fillStyle = "#ff7a1a";
  g.font = "600 30px Barlow Condensed, Inter, sans-serif";
  g.fillText("WINNER LEAGUE ARCADE · ALL-TIME DRAFT", 70, 95);
  g.fillStyle = "#eef2fa";
  g.font = "700 68px Barlow Condensed, Inter, sans-serif";
  g.fillText(team.name.toUpperCase(), 70, 180);
  g.fillStyle = "#93a1bf";
  g.font = "500 28px Inter, sans-serif";
  g.fillText(summary.label, 70, 225);

  g.textAlign = "right";
  g.fillStyle = "#ff7a1a";
  g.font = "700 120px Barlow Condensed, Inter, sans-serif";
  g.fillText(summary.total.toFixed(1), 1010, 190);
  g.fillStyle = "#eef2fa";
  g.font = "700 40px Barlow Condensed, Inter, sans-serif";
  g.fillText(`GRADE ${summary.grade}`, 1010, 240);
  g.textAlign = "left";

  POSITIONS.forEach((pos, i) => {
    const s = team.slots[pos];
    const y = 290 + i * 140;
    g.fillStyle = "#16213a";
    g.beginPath(); g.roundRect(70, y, 940, 118, 18); g.fill();
    if (!s) return;
    const [c1] = clubColors(s.ps.team_id);
    g.fillStyle = c1;
    g.beginPath(); g.roundRect(70, y, 14, 118, [18, 0, 0, 18]); g.fill();
    g.fillStyle = "#ff7a1a";
    g.font = "700 44px Barlow Condensed, Inter, sans-serif";
    g.fillText(pos, 110, y + 74);
    g.fillStyle = "#eef2fa";
    g.font = "700 40px Inter, sans-serif";
    g.fillText(playersById.get(s.ps.player_id).name, 220, y + 56);
    g.fillStyle = "#93a1bf";
    g.font = "500 26px Inter, sans-serif";
    g.fillText(`${teamName(s.ps.team_id)} · ${s.ps.season}`, 220, y + 94);
    g.textAlign = "right";
    g.fillStyle = s.value >= 92 ? "#fbbf24" : s.value >= 82 ? "#22c55e" : "#cbd5e1";
    g.font = "700 56px Barlow Condensed, Inter, sans-serif";
    g.fillText(String(s.value), 985, y + 78);
    g.textAlign = "left";
  });

  g.fillStyle = "#93a1bf";
  g.font = "500 26px Inter, sans-serif";
  const sixth = team.slots["6TH"];
  if (sixth) {
    g.fillStyle = "#eef2fa";
    g.fillText(`6th man: ${playersById.get(sixth.ps.player_id).name} (${teamName(sixth.ps.team_id)} ${sixth.ps.season}) · ${sixth.value}`, 70, 1010);
    g.fillStyle = "#93a1bf";
  }
  g.fillText(`Average ${summary.avg.toFixed(1)}  ·  Chemistry +${summary.chem.toFixed(1)}`, 70, 1048);
  g.textAlign = "right";
  g.fillText("Ratings are game-generated", 1010, 1048);
  return c;
}

export async function shareOrDownload(canvas, fileName, title = "My All-Time Draft team") {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; } catch { /* fall back to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
