// Accent colours per club, for UI only. The best-known clubs use their traditional colours;
// the rest follow the usual convention (Hapoel = red, Maccabi = yellow/blue) or a stable
// colour derived from the club id. These are approximations, not official brand colours.
const KNOWN = {
  maccabi_tel_aviv: ["#FFD200", "#0A3E8C"],
  hapoel_tel_aviv: ["#D71920", "#FFFFFF"],
  hapoel_jerusalem: ["#D0021B", "#111111"],
  maccabi_haifa: ["#00843D", "#FFFFFF"],
};

function hashHue(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function clubColors(teamId) {
  if (KNOWN[teamId]) return KNOWN[teamId];
  if (teamId.startsWith("hapoel_")) return ["#C8102E", "#F2F2F2"];
  if (teamId.startsWith("maccabi_")) return ["#F5C400", "#1E4FA3"];
  const h = hashHue(teamId);
  return [`hsl(${h} 70% 50%)`, `hsl(${(h + 180) % 360} 60% 85%)`];
}
