// National teams (senior men, FIBA world ranking 1-70), kept apart from the Winner League data. The small index
// (teams, zones, links to Winner League players) is always available; the full file (about 1 MB) loads on demand.
// Rosters come from FIBA's public 2025 roster reports. There are no statistics, and the player ratings in the
// source file are placeholders, so the app never shows them as facts.
import { nationalIndex as IX } from "../data/national_index.js";
import { playersById } from "./data.js";

export const NT_RANKING_DATE = IX.ranking_date;
export const NT_NOTE = "National-team rosters come from FIBA's public roster reports for 2025 (finals and qualifiers). There are no national-team statistics here.";
export const ZONES = { europe: "Europe", americas: "Americas", africa: "Africa", asia: "Asia & Oceania" };
// FIBA team code -> ISO 3166-1 alpha-2: the flag file in game/flags/ (from flag-icons, MIT; npm run build:flags)
export const FIBA_TO_ISO = {
  USA: "us", GER: "de", FRA: "fr", SRB: "rs", CAN: "ca", ESP: "es", AUS: "au", ARG: "ar", TUR: "tr", LTU: "lt",
  BRA: "br", LAT: "lv", GRE: "gr", SLO: "si", ITA: "it", FIN: "fi", PUR: "pr", MNE: "me", POL: "pl", GEO: "ge",
  DOM: "do", JPN: "jp", CZE: "cz", SSD: "ss", NZL: "nz", MEX: "mx", ANG: "ao", IRI: "ir", ISR: "il", CHN: "cn",
  BIH: "ba", CRO: "hr", LBN: "lb", VEN: "ve", CIV: "ci", BEL: "be", UKR: "ua", EST: "ee", SWE: "se", PHI: "ph",
  JOR: "jo", EGY: "eg", URU: "uy", POR: "pt", ISL: "is", HUN: "hu", SEN: "sn", GBR: "gb", BAH: "bs", TUN: "tn",
  CPV: "cv", NGR: "ng", NED: "nl", COL: "co", CMR: "cm", PAN: "pa", KOR: "kr", BUL: "bg", CHI: "cl", DEN: "dk",
  MLI: "ml", ROU: "ro", SUI: "ch", KSA: "sa", MKD: "mk", AUT: "at", GUI: "gn", COD: "cd", CYP: "cy", CUB: "cu",
};
export const NT_TEAMS = IX.teams.map(([id, name, code, rank, zone]) => ({ id, name, code, rank, zone, iso: FIBA_TO_ISO[code] || null }));
const teamById = new Map(NT_TEAMS.map((t) => [t.id, t]));
export const ntTeam = (id) => teamById.get(id) || null;
const linkByWl = new Map(IX.links.map(([wl, team, nt]) => [wl, { team, nt }]));
const wlByNt = new Map(IX.links.map(([wl, , nt]) => [nt, wl]));
/** The national team of a Winner League player (in the 2025 rosters), or null. */
export const ntOfWl = (pid) => { const l = linkByWl.get(pid); return l ? { ...l, ...ntTeam(l.team) } : null; };
export const wlOfNt = (ntPid) => wlByNt.get(ntPid) || null;

// a nationality as written in the league data (or My Career) -> its national team
const ALIAS = { "United States": "USA", "Ivory Coast": "Côte d'Ivoire", Turkey: "Türkiye", "Czech Republic": "Czechia", "United Kingdom": "Great Britain", "South Korea": "Korea", "DR Congo": "Congo DR" };
const byName = new Map(NT_TEAMS.map((t) => [t.name, t]));
export const ntForNationality = (nat) => byName.get(ALIAS[nat] || nat) || null;

/** "AVDIJA Deni" -> "Deni Avdija"; "*DE COLO Nando" -> "Nando De Colo" (a linked player keeps his league spelling). */
export function fibaName(raw, ntPid) {
  const wl = ntPid && wlOfNt(ntPid);
  if (wl && playersById.get(wl)?.name) return playersById.get(wl).name;
  const words = String(raw || "").replace(/^\*/, "").trim().split(/\s+/);
  const isUpper = (w) => /[A-ZÀ-Þ]/.test(w) && w === w.toUpperCase();
  let i = 0;
  while (i < words.length - 1 && isUpper(words[i])) i++;
  if (i === 0) return words.join(" ");
  const cap = (w) => w.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/^Mc(\p{L})/u, (m, b) => "Mc" + b.toUpperCase());
  return [...words.slice(i), ...words.slice(0, i).map(cap)].join(" ");
}
/** "Hapoel Tel Aviv (ISR)" -> { club: "Hapoel Tel Aviv", country: "ISR" } */
export function splitClub(s) {
  const m = /^(.*?)\s*\(([A-Z]{3})\)\s*$/.exec(s || "");
  return m ? { club: m[1], country: m[2] } : { club: s || "", country: "" };
}

let full = null, loading = null;
/** Load the full national-team data once. Resolves to the API below. */
export function loadNational() {
  if (full) return Promise.resolve(full);
  return (loading ||= import("../data/national_teams_db.js").then(({ nationalTeamsDatabase: D }) => {
    const players = new Map(D.players.map((p) => [p.player_id, p]));
    const rosters = new Map(); // team -> [{ p, jersey, pos, comps: [..] }], one row per player
    for (const r of D.player_seasons) {
      if (!rosters.has(r.team_id)) rosters.set(r.team_id, new Map());
      const m = rosters.get(r.team_id);
      const row = m.get(r.player_id) || { p: players.get(r.player_id), jersey: r.jersey_number, pos: r.position || players.get(r.player_id)?.primary_position || "", comps: [] };
      if (!row.comps.includes(r.competition)) row.comps.push(r.competition);
      m.set(r.player_id, row);
    }
    const rowsByPlayer = new Map();
    for (const r of D.player_seasons) { if (!rowsByPlayer.has(r.player_id)) rowsByPlayer.set(r.player_id, []); rowsByPlayer.get(r.player_id).push(r); }
    const POS = { PG: 0, G: 1, SG: 2, SF: 3, F: 4, PF: 5, C: 6 };
    full = {
      db: D, players,
      name: (pid) => fibaName(players.get(pid)?.name, pid),
      roster: (tid) => [...(rosters.get(tid)?.values() || [])].sort((a, b) => (POS[a.pos] ?? 9) - (POS[b.pos] ?? 9) || (b.p?.height_cm || 0) - (a.p?.height_cm || 0)),
      /** A player's roster rows (team, competition, jersey) in the 2025 reports. */
      rowsOf: (pid) => rowsByPlayer.get(pid) || [],
      /** Find players by name (any order, accents ignored). */
      search: (q, n = 12) => {
        const k = (x) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        const words = k(q).split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        return D.players.filter((p) => { const nm = k(fibaName(p.name, p.player_id)); return words.every((w) => nm.includes(w)); }).slice(0, n);
      },
      /** National-team players at clubs of one country now (e.g. "ISR"). */
      atClubsIn: (country) => [...rosters.entries()].flatMap(([tid, m]) => [...m.values()].filter((r) => splitClub(r.p?.current_club).country === country).map((r) => ({ ...r, team: tid }))),
    };
    return full;
  }));
}
