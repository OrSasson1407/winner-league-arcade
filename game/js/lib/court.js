// Lineup on a half court: each position has its spot (basket at the top), the sixth man sits on the bench.
// Spots are buttons when they can take the selected player (data-slot), so the same click/keyboard
// handlers as the old slot list keep working.
import { esc } from "../ui.js";
import { initials } from "../ui.js";

const SPOTS = { C: [38, 21], PF: [68, 30], SF: [17, 49], SG: [83, 57], PG: [50, 76] };

const COURT_SVG = `<svg class="court-bg" viewBox="0 0 100 94" preserveAspectRatio="none" aria-hidden="true">
  <rect x="1" y="1" width="98" height="92" rx="2" class="cl"/>
  <rect x="33" y="1" width="34" height="36" class="cl key"/>
  <path d="M33 37a17 17 0 0 0 34 0" class="cl"/>
  <path d="M8 1v14a42 42 0 0 0 84 0V1" class="cl"/>
  <path d="M43 7h14" class="cl rim"/><circle cx="50" cy="10" r="3" class="cl rim"/>
  <path d="M36 93a14 14 0 0 1 28 0" class="cl"/>
</svg>`;

/**
 * spots: [{ slot, label, filled?: { name, sub, value, color, pid }, can, preview, hidden }]
 * (hidden: blind mode, value shown as "?")
 */
export function courtHtml(spots, { id = "", compact = false } = {}) {
  const spot = (s) => {
    const bench = s.slot === "6TH";
    const style = bench ? "" : `left:${SPOTS[s.slot]?.[0] ?? 50}%;top:${SPOTS[s.slot]?.[1] ?? 50}%`;
    if (s.filled) {
      const f = s.filled;
      return `<div class="spot filled ${bench ? "bench" : ""}" style="${style}" title="${esc(f.name)} · ${esc(f.sub)}">
        <span class="spot-tok" style="--c:${f.color}">${esc(initials(f.name))}<b class="spot-val">${s.hidden ? "?" : f.value}</b></span>
        <span class="spot-name"><button class="link-name" data-profile="${f.pid}">${esc(f.name)}</button><small>${esc(s.label)} · ${esc(f.sub)}</small></span></div>`;
    }
    const tag = s.can ? "button" : "div";
    return `<${tag} class="spot empty ${s.can ? "target" : ""} ${bench ? "bench" : ""}" style="${style}" ${s.can ? `data-slot="${s.slot}" aria-label="Place at ${esc(s.label)}${s.preview != null ? `, value ${s.preview}` : ""}"` : ""}>
      <span class="spot-tok">${esc(s.slot === "6TH" ? "6th" : s.slot)}${s.can && s.preview != null ? `<b class="spot-val">${s.preview}</b>` : ""}</span>
      <span class="spot-name"><small>${s.can ? "Place here" : bench ? "Bench (30%)" : "Empty"}</small></span></${tag}>`;
  };
  const court = spots.filter((s) => s.slot !== "6TH"), bench = spots.filter((s) => s.slot === "6TH");
  return `<div class="court ${compact ? "compact" : ""}" ${id ? `id="${id}"` : ""} role="group" aria-label="Lineup on the court">
    <div class="court-floor">${COURT_SVG}${court.map(spot).join("")}</div>
    ${bench.length ? `<div class="court-bench"><span class="muted">Bench</span>${bench.map(spot).join("")}</div>` : ""}
  </div>`;
}
