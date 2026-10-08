// Draft scoring rules shared by the browser game and the online server (no DOM here).
import * as DATA from "../data.js";
import { POSITIONS } from "../dataApi.js";

export const CHEM_CAP = 5;
export const SIXTH = "6TH"; // bench slot: any position, counts 30% in the team score
export const SLOT_WEIGHT = (slot) => (slot === SIXTH ? 0.3 : 1);

// ---------------------------------------------------------------- scoring rules
export function slotValue(ps, slot) {
  const r = ps.rating_mock;
  if (slot === SIXTH) return r;
  if (!ps.position || ps.position === slot) return r;
  if (ps.secondary_position === slot) return r - 2;
  const d = Math.abs(POSITIONS.indexOf(ps.position) - POSITIONS.indexOf(slot));
  return Math.max(40, r - (d === 1 ? 5 : d === 2 ? 12 : 20));
}


export function grade(total) {
  if (total >= 95) return ["S", "Dynasty"];
  if (total >= 91) return ["A", "Champion"];
  if (total >= 87) return ["B", "Contender"];
  if (total >= 82) return ["C", "Playoff team"];
  return ["D", "Rebuilding"];
}


/** The rules over one league's data (the browser uses the chosen league; the online server one per room). */
export function makeDraftLogic(D) {
  const { H, playersById, teamName } = D;
  const careerKeys = new Map();
  function keysOf(pid) {
    if (!careerKeys.has(pid)) {
      const recs = H.getPlayerCareer(pid).filter((r) => r.appeared_in_regular_season);
      careerKeys.set(pid, { ts: new Set(recs.map((r) => `${r.team_id}|${r.season}`)), clubs: new Set(recs.map((r) => r.team_id)) });
    }
    return careerKeys.get(pid);
  }

  /** Chemistry: +1 per pair who were real teammates, +0.5 per pair who played for the same club. */
  function chemistry(psList) {
    let teammates = 0, club = 0;
    const links = [];
    for (let i = 0; i < psList.length; i++) {
      for (let j = i + 1; j < psList.length; j++) {
        const a = psList[i], b = psList[j];
        const ka = keysOf(a.player_id), kb = keysOf(b.player_id);
        const together = [...ka.ts].filter((k) => kb.ts.has(k));
        const names = `${playersById.get(a.player_id).name} & ${playersById.get(b.player_id).name}`;
        if (together.length) {
          teammates++;
          const [tid, season] = together[0].split("|");
          links.push({ type: "teammates", text: `${names}: teammates at ${teamName(tid)} ${season}${together.length > 1 ? ` (+${together.length - 1} more)` : ""}` });
        } else {
          const shared = [...ka.clubs].filter((c) => kb.clubs.has(c));
          if (shared.length) { club++; links.push({ type: "club", text: `${names}: both played for ${teamName(shared[0])}` }); }
        }
      }
    }
    return { chem: Math.min(CHEM_CAP, teammates + club * 0.5), links };
  }

  function teamSummary(team) {
    const list = team.slotList || POSITIONS;
    const filled = list.filter((p) => team.slots[p]);
    const picks = filled.map((p) => team.slots[p]);
    const wsum = filled.reduce((s, p) => s + SLOT_WEIGHT(p), 0);
    // starters count fully, the sixth man 30%
    const avg = wsum ? filled.reduce((s, p) => s + team.slots[p].value * SLOT_WEIGHT(p), 0) / wsum : 0;
    const { chem, links } = chemistry(picks.map((x) => x.ps));
    const total = avg + chem;
    const [g, label] = grade(total);
    return { avg, chem, links, total, grade: g, label };
  }
  return { chemistry, teamSummary };
}
export const { chemistry, teamSummary } = makeDraftLogic(DATA);
