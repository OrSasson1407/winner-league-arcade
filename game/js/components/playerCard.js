// Player card (FIFA / 2K style). Tier frame by rating: legend 95+, gold 90+, silver 80+, bronze.
import { playersById, teamName } from "../data.js";
import { clubColors } from "../lib/clubs.js";
import { posFamily } from "../lib/icons.js";
import { esc, fmt1, initials } from "../ui.js";

export function tierOf(rating) {
  if (rating >= 95) return "legend";
  if (rating >= 90) return "gold";
  if (rating >= 80) return "silver";
  return "bronze";
}

/** Small Israeli flag as inline SVG (flag emojis don't render on Windows). */
export const IL_FLAG = `<svg class="flag" viewBox="0 0 22 16" role="img" aria-label="Israeli"><rect width="22" height="16" rx="2" fill="#fff"/><rect y="2" width="22" height="2.2" fill="#0038b8"/><rect y="11.8" width="22" height="2.2" fill="#0038b8"/><path d="M11 4.6l2.6 4.5H8.4zM11 11.4L8.4 6.9h5.2z" fill="none" stroke="#0038b8" stroke-width=".9"/></svg>`;

const isIsraeli = (p) => p?.nationality === "Israel" || (p?.nationalities || []).includes("Israel");

/**
 * ps: a player-season record (stats, team, season, rating). Options:
 *  size: "sm" | "md" | "lg"; hideRating; hideStats; info (show profile button, default true);
 *  classes: extra classes; badge: small text badge (e.g. cost); attrs: extra HTML attributes.
 */
export function playerCard(ps, opts = {}) {
  const { size = "md", hideRating = false, hideStats = false, info = true, classes = "", badge = "", attrs = "" } = opts;
  const p = playersById.get(ps.player_id);
  const [c1, c2] = clubColors(ps.team_id);
  const rating = ps.rating_mock;
  const tier = hideRating ? "bronze" : tierOf(rating);
  const s = ps.stats;
  const pos = ps.position || p.primary_position || "?";
  const label = `${p.name}, ${pos}, ${teamName(ps.team_id)} ${ps.season}${hideRating ? "" : `, rating ${rating}`}`;
  // a card that is itself a button can't contain the profile button: render it next to the card instead
  const interactive = /role="button"/.test(attrs);
  const infoBtn = `<button class="pc-info${interactive ? " pc-info-out" : ""}" data-profile="${ps.player_id}" aria-label="Open ${esc(p.name)} profile" title="Player profile">i</button>`;
  return `${interactive ? '<div class="pc-wrap">' : ""}<div class="pc ${size === "md" ? "" : size} tier-${tier} ${classes}" style="--club:${c1};--club2:${c2}" ${hideRating || hideStats ? "" : `data-ps="${ps.player_id}|${ps.season}|${ps.team_id}"`} aria-label="${esc(label)}" ${attrs}>
    ${tier === "legend" ? `<span class="pc-glow" aria-hidden="true"></span><span class="pc-sparks" aria-hidden="true">${"<i></i>".repeat(8)}</span>` : ""}
    <div class="pc-top"><span class="pc-rating">${hideRating ? "?" : rating}</span><span class="pc-pos pos-${posFamily(pos)}">${esc(pos)}${ps.secondary_position ? "/" + esc(ps.secondary_position) : ""}</span></div>
    ${isIsraeli(p) ? `<span class="pc-flag" title="Israeli">${IL_FLAG}</span>` : ""}
    ${badge ? `<span class="pc-badge">${badge}</span>` : ""}
    <div class="pc-avatar" aria-hidden="true">${esc(initials(p.name))}</div>
    <div class="pc-name">${esc(p.name)}</div>
    <div class="pc-team"><i class="dot" style="background:${c1}"></i><span>${esc(teamName(ps.team_id))} · ${ps.season}</span></div>
    ${hideStats || !s ? "" : `<div class="pc-stats">
      <div><b>${fmt1(s.ppg)}</b><small>PPG</small></div><div><b>${fmt1(s.rpg)}</b><small>RPG</small></div><div><b>${fmt1(s.apg)}</b><small>APG</small></div></div>`}
    ${info && !interactive ? infoBtn : ""}
  </div>${info && interactive ? infoBtn : ""}${interactive ? "</div>" : ""}`;
}

/** Best season record of a player (highest rating with games), used for profile/hero cards. */
export function bestSeason(records) {
  return records.filter((r) => r.stats && r.appeared_in_regular_season).sort((a, b) => b.rating_mock - a.rating_mock || b.stats.games - a.stats.games)[0] || records[records.length - 1];
}

/** Player name that opens the profile when clicked. */
export function nameLink(playerId, text) {
  return `<button class="link-name" data-profile="${playerId}">${esc(text ?? playersById.get(playerId)?.name ?? playerId)}</button>`;
}
