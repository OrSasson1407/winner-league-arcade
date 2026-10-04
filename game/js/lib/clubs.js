// Accent colours per club, for UI only. The best-known clubs use their traditional colours;
// the rest follow the usual convention (Hapoel = red, Maccabi = yellow/blue) or a stable
// colour derived from the club id. These are approximations, not official brand colours.
const KNOWN = {
  maccabi_tel_aviv: ["#FFD200", "#0A3E8C"],
  hapoel_tel_aviv: ["#D71920", "#FFFFFF"],
  hapoel_jerusalem: ["#D0021B", "#111111"],
  maccabi_haifa: ["#00843D", "#FFFFFF"],
  // EuroLeague clubs (traditional colours, approximate)
  fc_barcelona: ["#A50044", "#004D98"], real_madrid: ["#FFFFFF", "#3F2A7A"], olympiacos: ["#D10A11", "#FFFFFF"],
  panathinaikos: ["#007A3D", "#FFFFFF"], anadolu_efes: ["#00285E", "#E2001A"], baskonia: ["#1E3A8A", "#C8102E"],
  zalgiris_kaunas: ["#006B3F", "#FFFFFF"], cska_moscow: ["#C8102E", "#1E3A8A"], olimpia_milano: ["#E30613", "#FFFFFF"],
  fenerbahce: ["#FFED00", "#00205B"], partizan: ["#111111", "#FFFFFF"], unicaja_malaga: ["#00843D", "#7A3E9D"],
  alba_berlin: ["#FFD200", "#00387B"], crvena_zvezda: ["#D2122E", "#FFFFFF"], bayern_munich: ["#DC052D", "#FFFFFF"],
  valencia_basket: ["#F28C28", "#111111"], virtus_bologna: ["#111111", "#FFFFFF"], asvel: ["#111111", "#C8102E"],
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
