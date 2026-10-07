// Player avatars: a little basketball player drawn as SVG from a few choices
// (skin, hair, hair colour, jersey colours, number, extras). Used on the profile, in games and online.
export const SKINS = ["#f6d5b8", "#e9b98f", "#d29a6c", "#b07448", "#8a5531", "#5e3a22"];
export const HAIR_COLORS = ["#1b1612", "#3b2416", "#6b4226", "#c8a063", "#a8442a", "#9aa0a8", "#2d5bd8"];
export const JERSEY_COLORS = ["#ff7a1a", "#ffd200", "#0a3e8c", "#d71920", "#00843d", "#111111", "#ffffff", "#6d28d9", "#0ea5e9", "#e11d48"];
export const HAIRS = { buzz: "Buzz", short: "Short", fade: "Fade", afro: "Afro", curly: "Curly", mohawk: "Mohawk", long: "Long", bun: "Bun", bald: "Bald",
  dreads: "Dreads", spiky: "Spiky", flattop: "Flat top" };
export const EXTRAS = { none: "None", headband: "Headband", glasses: "Glasses", goggles: "Goggles", beard: "Beard", mustache: "Moustache",
  cap: "Backwards cap", crown: "Crown", chain: "Gold chain", headphones: "Headphones", facepaint: "Face paint" };
/** Looks bought in the shop (with Buckets); the rest are free for everyone. */
export const PREMIUM_AV = { hair: ["dreads", "spiky", "flattop"], x: ["cap", "crown", "chain", "headphones", "facepaint"] };

export const DEFAULT_AV = { skin: 2, hair: "short", hc: 0, j1: "#ff7a1a", j2: "#ffffff", num: 7, x: "none" };

const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : d);
/** Clean an avatar object (also used by the server for other players' avatars). */
export function cleanAv(a) {
  if (!a || typeof a !== "object") return null;
  return {
    skin: Math.max(0, Math.min(SKINS.length - 1, Number(a.skin) | 0)),
    hair: HAIRS[a.hair] ? a.hair : "short",
    hc: Math.max(0, Math.min(HAIR_COLORS.length - 1, Number(a.hc) | 0)),
    j1: hex(a.j1, "#ff7a1a"), j2: hex(a.j2, "#ffffff"),
    num: Math.max(0, Math.min(99, Number(a.num) | 0)),
    x: EXTRAS[a.x] ? a.x : "none",
  };
}

const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

function hairBack(style, c) {
  if (style === "afro") return `<circle cx="32" cy="24" r="17" fill="${c}"/>`;
  if (style === "long") return `<path d="M17 26c0-11 7-17 15-17s15 6 15 17v14H17z" fill="${c}"/>`;
  if (style === "bun") return `<circle cx="32" cy="9" r="5.5" fill="${c}"/>`;
  if (style === "dreads") return `<g stroke="${c}" stroke-width="3.2" stroke-linecap="round" fill="none">${[[20, 22, 18, 40], [23, 18, 21.5, 42], [41, 18, 42.5, 42], [44, 22, 46, 40]].map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1}Q${(x1 + x2) / 2 + (x1 < 32 ? -2 : 2)} ${(y1 + y2) / 2} ${x2} ${y2}"/>`).join("")}</g>`;
  if (style === "curly") return `<g fill="${c}">${[[21, 17], [26, 12.5], [32, 11], [38, 12.5], [43, 17], [44.5, 23], [19.5, 23]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join("")}</g>`;
  return "";
}
function hairFront(style, c) {
  switch (style) {
    case "buzz": return `<path d="M21.2 24c.4-7 5-11 10.8-11s10.4 4 10.8 11c-3-3.2-6.6-4.6-10.8-4.6S24.2 20.8 21.2 24z" fill="${c}" opacity=".85"/>`;
    case "short": return `<path d="M20.5 25c-.4-8.6 5-13.5 11.5-13.5S44 16.4 43.5 25c-1.5-2.6-3.4-4.3-5.6-5-1.8 1.8-5 2.6-9 2.3-3 .9-5.7 1.7-8.4 2.7z" fill="${c}"/>`;
    case "fade": return `<path d="M21 23.5c.6-7.6 5.3-11.5 11-11.5s10.4 3.9 11 11.5c-2.8-1.8-6.5-2.8-11-2.8s-8.2 1-11 2.8z" fill="${c}"/><path d="M21 23.5c0 1.5.1 2.6.4 3.6M43 23.5c0 1.5-.1 2.6-.4 3.6" stroke="${c}" stroke-width="1.6" opacity=".45"/>`;
    case "mohawk": return `<path d="M29 23c-.5-6 .5-11 3-15 2.5 4 3.5 9 3 15z" fill="${c}"/>`;
    case "dreads": return `<path d="M20.5 25c0-8.5 5-13 11.5-13s11.5 4.5 11.5 13c-2-3-5.5-5-11.5-5s-9.5 2-11.5 5z" fill="${c}"/><g fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".8">${[24, 28, 32, 36, 40].map((x) => `<path d="M${x} 13.5v6"/>`).join("")}</g>`;
    case "spiky": return `<path d="M20.6 25c-.6-5 .8-8.5 3.4-10.6L23.2 9l4.6 3.6L30 6.5l2.8 5.4L36.6 7l1.2 6.1 5-2.2-1.6 5.5c1.8 2.4 2.5 5.3 2.2 8.6-2-3.2-6-5.4-10.4-5.4s-9.4 2.4-11.4 5.4z" fill="${c}"/>`;
    case "flattop": return `<path d="M20.6 25c-.4-3 0-6 .8-8.6V8.5h21.2v7.9c.8 2.6 1.2 5.6.8 8.6-2.2-3.2-6.4-4.8-11.4-4.8s-9.2 1.6-11.4 4.8z" fill="${c}"/>`;
    case "long": case "afro": case "curly": return `<path d="M20.5 25c0-8.5 5-13 11.5-13s11.5 4.5 11.5 13c-2-3-5.5-5-11.5-5s-9.5 2-11.5 5z" fill="${c}"/>`;
    case "bun": return `<path d="M20.8 25c-.2-8.3 4.9-12.6 11.2-12.6s11.4 4.3 11.2 12.6c-2.4-3.1-6-4.6-11.2-4.6s-8.8 1.5-11.2 4.6z" fill="${c}"/>`;
    default: return "";
  }
}
function extra(x, j2, skin, hc) {
  switch (x) {
    case "headband": return `<rect x="20.4" y="18.6" width="23.2" height="4.2" rx="2" fill="${j2}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`;
    case "glasses": return `<g fill="none" stroke="#151515" stroke-width="1.4"><rect x="23.3" y="25.2" width="7" height="5" rx="2"/><rect x="33.7" y="25.2" width="7" height="5" rx="2"/><path d="M30.3 27.2h3.4"/></g>`;
    case "goggles": return `<g><rect x="21.6" y="24.4" width="20.8" height="6.4" rx="3.2" fill="rgba(120,200,255,.55)" stroke="#1d3c66" stroke-width="1.4"/><path d="M20.5 27.5h1.5M42 27.5h1.5" stroke="#1d3c66" stroke-width="1.4"/></g>`;
    case "beard": return `<path d="M22.5 31c.5 6.5 4.6 10 9.5 10s9-3.5 9.5-10c-1.6 2.6-3.6 3.6-5.5 3.6-1.2-1.2-2.4-1.6-4-1.6s-2.8.4-4 1.6c-1.9 0-3.9-1-5.5-3.6z" fill="${hc}"/>`;
    case "cap": return `<g><path d="M20.4 22c.6-6.6 5.4-10.4 11.6-10.4s11 3.8 11.6 10.4z" fill="${j2}" stroke="rgba(0,0,0,.3)" stroke-width=".7"/><path d="M15.5 21.4c1.8-1.6 3.8-2 5.6-1.6l-.4 2.6c-1.8-.4-3.4 0-5.2-1z" fill="${j2}" stroke="rgba(0,0,0,.3)" stroke-width=".6"/><circle cx="32" cy="12.2" r="1.1" fill="rgba(0,0,0,.3)"/></g>`;
    case "crown": return `<path d="M22.5 15.5 21 6.5l5.6 4.4L32 4.5l5.4 6.4L43 6.5l-1.5 9z" fill="#f5c542" stroke="#b8860b" stroke-width=".8"/><circle cx="32" cy="10.5" r="1.3" fill="#d71920"/>`;
    case "chain": return `<path d="M24 44.6c2.2 3.6 5 5.4 8 5.4s5.8-1.8 8-5.4" fill="none" stroke="#f5c542" stroke-width="1.6" stroke-dasharray="1.6 .8"/><circle cx="32" cy="50.6" r="2" fill="#f5c542" stroke="#b8860b" stroke-width=".6"/>`;
    case "headphones": return `<g><path d="M19.4 28c0-9 5.6-15.4 12.6-15.4S44.6 19 44.6 28" fill="none" stroke="#151515" stroke-width="2.2"/><rect x="16.8" y="24.6" width="5.4" height="8.4" rx="2.4" fill="#d71920"/><rect x="41.8" y="24.6" width="5.4" height="8.4" rx="2.4" fill="#d71920"/></g>`;
    case "facepaint": return `<g fill="${j2}" opacity=".9"><rect x="24.4" y="30.4" width="5.4" height="1.6" rx=".8"/><rect x="24.4" y="32.6" width="5.4" height="1.6" rx=".8"/><rect x="34.2" y="30.4" width="5.4" height="1.6" rx=".8"/><rect x="34.2" y="32.6" width="5.4" height="1.6" rx=".8"/></g>`;
    case "mustache": return `<path d="M27.4 33.4c1.6-1.4 3.2-1.5 4.6-.4 1.4-1.1 3-1 4.6.4-1.6.6-3.2.6-4.6-.1-1.4.7-3 .7-4.6.1z" fill="${hc}"/>`;
    default: return "";
  }
}

let uid = 0;
/** SVG of the avatar (fills its box; clipped to a circle). */
export function playerAvatarSvg(raw, bg = "#3987e5") {
  const a = cleanAv(raw) || DEFAULT_AV;
  const skin = SKINS[a.skin], hc = HAIR_COLORS[a.hc];
  const id = `pav${++uid}`;
  const numInk = lum(a.j1) > 0.6 ? "#111" : "#fff";
  const shade = "rgba(0,0,0,.14)";
  return `<svg viewBox="0 0 64 64" aria-hidden="true" class="pav"><defs><clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath></defs>
    <g clip-path="url(#${id})">
      <rect width="64" height="64" fill="${bg}"/>
      <circle cx="32" cy="32" r="30" fill="rgba(255,255,255,.08)"/>
      ${hairBack(a.hair, hc)}
      <rect x="27.5" y="35" width="9" height="9" rx="3" fill="${skin}"/>
      <path d="M8 64c1-10 6-16 13-18.5 2.5 3.6 6.4 5.5 11 5.5s8.5-1.9 11-5.5C50 48 55 54 56 64z" fill="${skin}"/>
      <path d="M14.5 64V52c0-3 1.6-5.3 4.4-6.4l3.4-1.2c1.5 4 5 6.6 9.7 6.6s8.2-2.6 9.7-6.6l3.4 1.2c2.8 1.1 4.4 3.4 4.4 6.4V64z" fill="${a.j1}"/>
      <path d="M22.3 44.4c1.5 4 5 6.6 9.7 6.6s8.2-2.6 9.7-6.6" fill="none" stroke="${a.j2}" stroke-width="2.2"/>
      <path d="M14.5 52c0-3 1.6-5.3 4.4-6.4M49.5 52c0-3-1.6-5.3-4.4-6.4" fill="none" stroke="${a.j2}" stroke-width="1.8"/>
      <text x="32" y="62.5" text-anchor="middle" font-family="Barlow Condensed, Inter, sans-serif" font-weight="800" font-size="12" fill="${numInk}">${a.num}</text>
      <circle cx="20.6" cy="28" r="2.6" fill="${skin}"/><circle cx="43.4" cy="28" r="2.6" fill="${skin}"/>
      <ellipse cx="32" cy="27" rx="11.4" ry="12.6" fill="${skin}"/>
      <path d="M32 39.6c-4.6 0-8.4-2.6-10.2-6.6 2.4 2.2 6 3.4 10.2 3.4s7.8-1.2 10.2-3.4c-1.8 4-5.6 6.6-10.2 6.6z" fill="${shade}"/>
      ${hairFront(a.hair, hc)}
      <path d="M25.2 24.2c1.4-.8 2.8-.9 4.2-.4M34.6 23.8c1.4-.5 2.8-.4 4.2.4" stroke="${hc}" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      <circle cx="27.4" cy="27.8" r="1.4" fill="#1a1a1a"/><circle cx="36.6" cy="27.8" r="1.4" fill="#1a1a1a"/>
      <path d="M28.6 33.6c2.2 1.6 4.6 1.6 6.8 0" stroke="#7a3b2a" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      ${extra(a.x, a.j2, skin, hc)}
    </g></svg>`;
}

export function randomAv() {
  const r = (n) => Math.floor(Math.random() * n);
  const keys = Object.keys(HAIRS).filter((k) => !PREMIUM_AV.hair.includes(k)), ex = Object.keys(EXTRAS).filter((k) => !PREMIUM_AV.x.includes(k));
  return { skin: r(SKINS.length), hair: keys[r(keys.length)], hc: r(HAIR_COLORS.length), j1: JERSEY_COLORS[r(JERSEY_COLORS.length)], j2: JERSEY_COLORS[r(JERSEY_COLORS.length)], num: r(100), x: Math.random() < 0.5 ? "none" : ex[r(ex.length)] };
}
