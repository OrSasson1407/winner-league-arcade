// Online social layer: friends list, match history, and the invite pop-up that shows anywhere in
// the arcade when a friend invites you. Friends and history live in this browser.
import { esc, store, toast } from "../ui.js";
import { icon } from "../lib/icons.js";
import { avatarHtml } from "../lib/me.js";
import { sound } from "../lib/fx.js";
import { emit } from "../lib/achievements.js";
import { cleanCode } from "../shared/rating.js";
import { connect, onNet, send } from "./net.js";
import { buzz } from "./feel.js";

export const GAME_NAMES = { hl: "Higher or Lower", guess: "Guess the Player", career: "Career Path", draft: "All-Time Draft", conn: "Connections", grid: "The Grid" };
export const GAME_ICONS = { hl: "chart", guess: "search", career: "arrowRight", draft: "trophy", conn: "link", grid: "games" };

// ---------------------------------------------------------------- friends
export const getFriends = () => store.get("online:friends", []);
export function addFriend(f) {
  const code = cleanCode(f.code);
  if (!code) return false;
  const list = getFriends().filter((x) => x.code !== code);
  list.unshift({ code, name: f.name || "Player " + code, icon: f.icon, color: f.color, frame: f.frame, style: f.style, av: f.av, added: new Date().toISOString() });
  store.set("online:friends", list.slice(0, 100));
  emit("online:friend", { count: list.length });
  return true;
}
export function removeFriend(code) { store.set("online:friends", getFriends().filter((x) => x.code !== code)); }
export const isFriend = (code) => !!code && getFriends().some((x) => x.code === code);
/** Keep stored names/avatars fresh from the server's answer. */
export function refreshFriends(list) {
  const byCode = new Map(list.filter((x) => x.known).map((x) => [x.code, x]));
  store.set("online:friends", getFriends().map((f) => (byCode.has(f.code) ? { ...f, ...pick(byCode.get(f.code)) } : f)));
}
const pick = ({ name, icon: ic, color, frame, style, av }) => ({ name, icon: ic, color, frame, style, av });

// ---------------------------------------------------------------- history
export const getHistory = () => store.get("online:history", []);
export function addHistory(entry) {
  const list = getHistory();
  list.unshift({ ...entry, at: new Date().toISOString() });
  store.set("online:history", list.slice(0, 60));
}
/** Head-to-head record against one opponent (by player code). */
export function headToHead(code) {
  const r = { w: 0, l: 0, d: 0 };
  for (const h of getHistory()) if (h.oppCode === code) r[h.result === "win" ? "w" : h.result === "lose" ? "l" : "d"]++;
  return r;
}
/** Most-played opponents with their head-to-head record (from a history list; this device's by default). */
export function rivals(limit = 5, list = getHistory()) {
  const map = new Map();
  for (const h of list) {
    if (!h.oppCode) continue;
    const r = map.get(h.oppCode) || { code: h.oppCode, opp: h.opp, w: 0, l: 0, d: 0, n: 0 };
    r[h.result === "win" ? "w" : h.result === "lose" ? "l" : "d"]++; r.n++;
    map.set(h.oppCode, r);
  }
  return [...map.values()].sort((a, b) => b.n - a.n).slice(0, limit);
}

// ---------------------------------------------------------------- incoming invites (global pop-up)
let box = null;
function closeInvite() { box?.remove(); box = null; }

function showInvite(m) {
  closeInvite();
  box = document.createElement("div");
  box.className = "invite-pop card pop";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-label", "Game invite");
  box.innerHTML = `${avatarHtml(m.from, 44)}
    <div class="ip-body"><small>GAME INVITE${isFriend(m.from.code) ? " · FRIEND" : ""}</small>
      <b>${esc(m.from.name)}</b><span>${icon(GAME_ICONS[m.game], { size: 14 })} ${GAME_NAMES[m.game]}</span></div>
    <div class="ip-actions"><button class="btn primary" data-a="yes">${icon("play", { size: 15 })} Play</button><button class="btn ghost" data-a="no">Not now</button></div>`;
  box.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    if (a === "yes") location.hash = `#/online/join/${m.code}`;
    else send({ t: "invite:decline", code: m.code });
    closeInvite();
  });
  document.body.appendChild(box);
  sound.play("select");
  buzz([80, 60, 80]);
  setTimeout(() => { if (box && box.dataset.code === m.code) { send({ t: "invite:decline", code: m.code }); closeInvite(); } }, 60000);
  box.dataset.code = m.code;
}

export function initSocial() {
  connect({ quiet: true });
  onNet((m) => {
    if (m.t === "invite:incoming") showInvite(m);
    if (m.t === "invite:gone" && box?.dataset.code === m.code) { closeInvite(); toast("The invite was cancelled"); }
  });
}
