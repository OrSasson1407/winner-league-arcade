// The player's own profile: nickname + avatar (icon on a colour), shown in games and leaderboards.
import { esc, store } from "../ui.js";
import { icon } from "./icons.js";
import { DEFAULT_AV, playerAvatarSvg } from "./avatarArt.js";

export const AVATAR_ICONS = ["ball", "hoop", "star", "crown", "flame", "bolt", "trophy", "target", "rocket", "medal", "whistle", "shield"];
export const AVATAR_COLORS = ["#ff7a1a", "#3987e5", "#199e70", "#d55181", "#9085e9", "#c98500", "#e66767", "#64748b"];

export function getMe() {
  return { nickname: "", icon: "ball", color: "#ff7a1a", frame: "none", style: "icon", av: { ...DEFAULT_AV }, ...store.get("me", {}) };
}

export function saveMe(patch) {
  const me = { ...getMe(), ...patch };
  me.nickname = (me.nickname || "").trim().slice(0, 18);
  store.set("me", me);
  document.dispatchEvent(new CustomEvent("me-changed", { detail: me }));
  return me;
}

/** Display name for the player's team / results. */
export const myName = (fallback = "Your team") => getMe().nickname || fallback;

export function avatarHtml(me = getMe(), size = 32) {
  // a built player avatar, or the icon on a colour
  if (me.style === "player" && me.av) {
    return `<span class="avatar-chip player frame-${me.frame || "none"}" style="--av:${me.color};width:${size}px;height:${size}px" aria-hidden="true">${playerAvatarSvg(me.av, me.color)}</span>`;
  }
  return `<span class="avatar-chip frame-${me.frame || "none"}" style="--av:${me.color};width:${size}px;height:${size}px" aria-hidden="true">${icon(me.icon, { size: Math.round(size * 0.58) })}</span>`;
}

export function meLabel(me = getMe()) {
  return me.nickname ? esc(me.nickname) : "Guest";
}
