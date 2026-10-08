// The arcade's own icon set: basketball-themed line icons (24px grid, 2px rounded strokes, currentColor),
// plus the arcade logo and club crests.
import { clubColors } from "./clubs.js";
import { teamCrest } from "../../data/team_crests.js";

const P = {
  bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7v13M9 4.5 10.5 7M15 4.5 13.5 7M3.5 11H7M17 11h3.5M4 17l3-1.5M20 17l-3-1.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  send: '<path d="M3.5 11.5 20.5 4l-7 17-2.6-7.1z"/><path d="m10.9 13.9 9.6-9.9"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  book: '<path d="M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z"/><path d="M20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><circle cx="12" cy="15" r="3"/><path d="M9 15h6M12 12v6"/>',
  games: '<rect x="2.5" y="5" width="19" height="13" rx="2.5"/><path d="M12 5v13M7.5 3v2M16.5 3v2"/><path d="M6 9.5h3v5H6zM15 9.5h3v5h-3z"/>',
  players: '<path d="M8 3.5c.7 1.6 2.2 2.5 4 2.5s3.3-.9 4-2.5l3.5 1.8-1.2 4.2-1.8-.5V21H7.5V9l-1.8.5-1.2-4.2z"/><path d="M10.5 12.5h3v4"/>',
  shield: '<path d="M12 2.8 19.5 5.5V12c0 4.6-3.2 7.6-7.5 9.2C7.7 19.6 4.5 16.6 4.5 12V5.5z"/><circle cx="12" cy="11.5" r="3.6"/><path d="M8.4 11.5h7.2M12 7.9v7.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="2.6"/><path d="M9.4 15.5h5.2M12 12.9v5.2"/>',
  user: '<circle cx="12" cy="7.5" r="3.8"/><path d="M8.3 6.2h7.4"/><path d="M5 21v-3.5c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4V21"/><path d="M12 13.5v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  soundOn: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  soundOff: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  trophy: '<path d="M7.5 7h9v3.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 8.5H4.5a3 3 0 0 0 3 3.6M16.5 8.5h3a3 3 0 0 1-3 3.6M12 15v3M8 21h8M9.5 18h5"/><circle cx="12" cy="4.2" r="1.9"/>',
  chart: '<path d="M3 20.5h18"/><rect x="4.5" y="11" width="3.5" height="9.5" rx="1"/><rect x="10.25" y="6" width="3.5" height="14.5" rx="1"/><rect x="16" y="13.5" width="3.5" height="7" rx="1"/><circle cx="12" cy="3.3" r="1.3"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  skip: '<path d="M5 4l10 8-10 8zM19 5v14"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/><path d="M4 10.5h13M10.5 4c-2.2 2-2.2 11 0 13M10.5 4c2.2 2 2.2 11 0 13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v1.5M12 16.5V18"/>',
  link: '<path d="M8 12l3 3 5-6"/><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/>',
  arena: '<path d="M2.5 9.5 12 4l9.5 5.5"/><rect x="3.5" y="9.5" width="17" height="11" rx="1.5"/><path d="M12 9.5v11"/><circle cx="12" cy="15" r="2.5"/><path d="M3.5 13h2.5v4H3.5M20.5 13H18v4h2.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  timer: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M8 2.5h8M12 2.5v3"/><path d="M8 10h3v2.5H8V15h3M13.5 10v3h3M16.5 10v5"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  motionOff: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  motionOn: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.7 5.7c3.4 3.4 3.4 9.2 0 12.6M18.3 5.7c-3.4 3.4-3.4 9.2 0 12.6"/>',
  flame: '<path d="M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.6 2 3 0-3.2-.5-5.6.5-8z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  target: '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7l2.5 12M20 7l-2.5 12M6.5 19h11M9 9.8l1 9.2M15 9.8l-1 9.2M5.5 13h13"/>',
  hoop: '<rect x="4" y="2.5" width="16" height="10" rx="1.5"/><rect x="9" y="6" width="6" height="4" rx=".5"/><path d="M7 12.5h10"/><path d="M8 12.5l1.5 8.5M16 12.5 14.5 21M10.8 12.5l.4 8.5M13.2 12.5l-.4 8.5M8.6 16h6.8M9.2 19h5.6"/>',
  rocket: '<path d="M12 3c4 2 6 6 6 10l-3 3H9l-3-3c0-4 2-8 6-10z"/><circle cx="12" cy="10" r="2"/><path d="M9 16l-2 5 3-2M15 16l2 5-3-2"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="M8 3l2 6M16 3l-2 6M12 12.5v5"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="12" cy="12" r="1"/>',
  whistle: '<circle cx="9" cy="14.5" r="5.5"/><path d="M12.5 10.3 21 7v4.5l-5.5 1.8"/><circle cx="9" cy="14.5" r="1.6"/><path d="M4 9.5C3 7 4.5 4 7.5 3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9"/>',
  users: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c.6-3 3-5 6-5s5.4 2 6 5M12 20c.6-3 3-5 6-5 1.5 0 2.8.5 4 1.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  jersey: '<path d="M8 3.5c.7 1.6 2.2 2.5 4 2.5s3.3-.9 4-2.5l3.5 1.8-1.2 4.2-1.8-.5V21H7.5V9l-1.8.5-1.2-4.2z"/><path d="M10.5 12.5h3v4"/>',
  sneaker: '<path d="M3 17.5V9.5l4-1 2.5 3 4.5 1.5 5.5 1.5c1 .3 1.5 1.1 1.5 2v1z"/><path d="M3 17.5h18v2H3zM9 10.5l-1.5 2M11.5 11.8 10 14M7 8.5l-.5-3H3v4"/>',
  scoreboard: '<rect x="2.5" y="5" width="19" height="13" rx="2.5"/><path d="M12 5v13M7.5 3v2M16.5 3v2"/><path d="M6 9.5h3v5H6zM15 9.5h3v5h-3z"/>',
  court: '<rect x="2.5" y="4.5" width="19" height="15" rx="1.5"/><path d="M12 4.5v15"/><circle cx="12" cy="12" r="2.5"/><path d="M2.5 9h3.5v6H2.5M21.5 9H18v6h3.5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><circle cx="9" cy="10" r="1.2"/><path d="M8 16l3-3M8 13l3 3M14 9l2.5 2.5L14 14"/>',
};

export const ICON_PATHS = P;

/** Inline SVG icon. Decorative by default; pass label to make it announced. */
export function icon(name, { size = 18, cls = "", label = "" } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ic ic-${name} ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${P[name] || P.info}</svg>`;
}

/** Arcade crest: shield, ball through a hoop, three stars. */
export function logoSvg(size = 40) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lg-shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2c52"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
      <radialGradient id="lg-ball" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffc07a"/><stop offset=".6" stop-color="#ff7a1a"/><stop offset="1" stop-color="#c24e00"/></radialGradient></defs>
    <path d="M32 3l25 9v17c0 16-11 26-25 32C18 55 7 45 7 29V12z" fill="url(#lg-shield)" stroke="#ff7a1a" stroke-width="2.5"/>
    <path d="M14 15l18-6 18 6" fill="none" stroke="#ffb057" stroke-width="1.5" opacity=".7"/>
    <g fill="#ffd166"><path d="M22 14.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/><path d="M32 11l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/><path d="M42 14.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/></g>
    <circle cx="32" cy="33" r="11" fill="url(#lg-ball)"/>
    <path d="M21 33h22M32 22v22M24.5 25c4.5 4.5 4.5 11.5 0 16M39.5 25c-4.5 4.5-4.5 11.5 0 16" stroke="#3b1d06" stroke-width="1.6" fill="none"/>
    <path d="M19 44h26" stroke="#ff7a1a" stroke-width="3" stroke-linecap="round"/>
    <path d="M21 44l3 8M27 44l1.5 9M32 44v9M37 44l-1.5 9M43 44l-3 8M23 48h18" stroke="#eef2fa" stroke-width="1.2" fill="none" opacity=".85"/>
  </svg>`;
}

/** Club crest: shield in club colours with the club's initials. */
// Club logos where there's a file in game/crests/ (npm run crests:local); other clubs get the drawn shield.
let LOGOS = {};
export const crestsReady = import("../../crests/manifest.js").then((m) => { LOGOS = m.crestFiles || {}; }).catch(() => {});

export function crestSvg(teamId, name, size = 44) {
  if (LOGOS[teamId]) return `<img class="crest crest-logo" src="${LOGOS[teamId]}" width="${size}" height="${size}" alt="" aria-hidden="true" decoding="async">`;
  // the club's shield from data/team_crests.js (initials in club colours: npm run build:team-crests)
  const shield = teamCrest(teamId);
  if (shield) return shield.svg.replace(/ role="img" aria-label="[^"]*"/, "").replace("<svg ", `<svg class="crest" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  const [c1, c2] = clubColors(teamId);
  const words = (name || teamId).replace(/[^A-Za-z' ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(bc|the)$/i.test(w));
  const ini = (words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
  const id = "cr-" + teamId.replace(/\W/g, "");
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="M24 3l18 6v12c0 12-8 19-18 24C14 40 6 33 6 21V9z"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect width="48" height="48" fill="${c1}"/><path d="M0 30h48v18H0z" fill="${c2}" opacity=".9"/><path d="M0 30h48" stroke="rgba(0,0,0,.25)" stroke-width="1"/></g>
    <path d="M24 3l18 6v12c0 12-8 19-18 24C14 40 6 33 6 21V9z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
    <text x="24" y="25" text-anchor="middle" font-family="Barlow Condensed, Inter, sans-serif" font-weight="700" font-size="15" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width=".6" paint-order="stroke">${ini}</text>
  </svg>`;
}

/** A club's crest as an image URL (the logo file, or the drawn shield as an SVG data URL), for canvases and 3D. */
export async function crestUrl(teamId, name, size = 256) {
  await crestsReady;
  if (LOGOS[teamId]) return LOGOS[teamId];
  let svg = crestSvg(teamId, name, size);
  if (!/xmlns=/.test(svg)) svg = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** Position family colour class: guards / forwards / center (validated categorical palette). */
const FAMILY = { PG: "g", SG: "g", G: "g", SF: "f", PF: "f", F: "f", C: "c" };
export const posFamily = (pos) => FAMILY[pos] || "";
export function posPill(pos, secondary) {
  if (!pos) return `<span class="pill pos">?</span>`;
  return `<span class="pill pos pos-${posFamily(pos)}">${pos}${secondary ? "/" + secondary : ""}</span>`;
}
