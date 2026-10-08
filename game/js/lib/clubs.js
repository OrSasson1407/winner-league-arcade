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
  // NBA teams (traditional colours, approximate)
  atlanta_hawks: ["#E03A3E", "#C1D32F"], boston_celtics: ["#007A33", "#FFFFFF"], brooklyn_nets: ["#111111", "#FFFFFF"],
  charlotte_hornets: ["#1D1160", "#00788C"], chicago_bulls: ["#CE1141", "#111111"], cleveland_cavaliers: ["#860038", "#FDBB30"],
  dallas_mavericks: ["#00538C", "#B8C4CA"], denver_nuggets: ["#0E2240", "#FEC524"], detroit_pistons: ["#C8102E", "#1D42BA"],
  golden_state_warriors: ["#1D428A", "#FFC72C"], houston_rockets: ["#CE1141", "#FFFFFF"], indiana_pacers: ["#002D62", "#FDBB30"],
  la_clippers: ["#C8102E", "#1D428A"], los_angeles_lakers: ["#552583", "#FDB927"], memphis_grizzlies: ["#5D76A9", "#12173F"],
  miami_heat: ["#98002E", "#F9A01B"], milwaukee_bucks: ["#00471B", "#EEE1C6"], minnesota_timberwolves: ["#0C2340", "#78BE20"],
  new_orleans_pelicans: ["#0C2340", "#C8102E"], new_york_knicks: ["#006BB6", "#F58426"], oklahoma_city_thunder: ["#007AC1", "#EF3B24"],
  orlando_magic: ["#0077C0", "#C4CED4"], philadelphia_76ers: ["#006BB6", "#ED174C"], phoenix_suns: ["#1D1160", "#E56020"],
  portland_trail_blazers: ["#E03A3E", "#111111"], sacramento_kings: ["#5A2D81", "#63727A"], san_antonio_spurs: ["#C4CED4", "#111111"],
  toronto_raptors: ["#CE1141", "#111111"], utah_jazz: ["#002B5C", "#F9A01B"], washington_wizards: ["#002B5C", "#E31837"],
};

function hashHue(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function clubColors(teamId) {
  teamId = String(teamId).replace(/^el:/, ""); // the mixed data's EuroLeague side of a club
  if (KNOWN[teamId]) return KNOWN[teamId];
  if (teamId.startsWith("hapoel_")) return ["#C8102E", "#F2F2F2"];
  if (teamId.startsWith("maccabi_")) return ["#F5C400", "#1E4FA3"];
  const h = hashHue(teamId);
  return [`hsl(${h} 70% 50%)`, `hsl(${(h + 180) % 360} 60% 85%)`];
}
