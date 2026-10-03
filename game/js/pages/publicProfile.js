// Public profile (#/u/<snapshot>): a shareable page with your avatar, level, banners and bests.
// No database: the link itself carries a snapshot of the profile at the moment it was shared.
import { DEFS, GAMES, TIERS, bannerSvg, unlockedMap } from "../lib/achievements.js";
import { avatarHtml, getMe } from "../lib/me.js";
import { icon } from "../lib/icons.js";
import { levelInfo, titleFor } from "../lib/progress.js";
import { dailyStats, dailyStreak } from "../lib/daily.js";
import { rankOf } from "../shared/rating.js";
import { esc, html, store, toast } from "../ui.js";

const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Snapshot of this player's profile, as a URL-safe string. */
export function profileSnapshot() {
  const me = getMe();
  const map = unlockedMap();
  const bits = new Uint8Array(Math.ceil(DEFS.length / 8));
  DEFS.forEach((d, i) => { if (map[d.id]) bits[i >> 3] |= 1 << (i & 7); });
  const rec = store.get("online:rec", null);
  const data = {
    v: 1, n: me.nickname || "Guest", i: me.icon, c: me.color, f: me.frame, y: me.style, p: me.style === "player" ? me.av : undefined, x: levelInfo().xp, a: b64(bits),
    b: { d: store.get("draft:best", 0), h: store.get("hl:best:mixed", 0), c: store.get("career:best", 0), g: store.get("ach:counters", {}).guessWins || 0 },
    r: rec ? rec.elo : null, w: rec ? Object.values(rec.w).reduce((a, b) => a + b, 0) : 0,
    s: dailyStreak(), t: new Date().toISOString().slice(0, 10),
  };
  return b64(new TextEncoder().encode(JSON.stringify(data)));
}
export const profileLink = () => `${location.origin}${location.pathname}#/u/${profileSnapshot()}`;

function decode(s) {
  try {
    const d = JSON.parse(new TextDecoder().decode(unb64(s)));
    return d?.v === 1 ? d : null;
  } catch { return null; }
}

export function renderPublicProfile(root, signal, params = []) {
  const d = decode(params[0] || "");
  if (!d) {
    root.innerHTML = html`<div class="card center-card"><h2>${icon("x", { size: 26 })} This profile link doesn't work</h2>
      <p class="muted">It may have been cut off when it was copied. Ask for the link again.</p><a class="btn primary" href="#/">Home</a></div>`;
    return;
  }
  const bits = unb64(d.a);
  const got = DEFS.filter((_, i) => bits[i >> 3] & (1 << (i & 7)));
  const lv = levelInfo(d.x);
  const tiers = Object.keys(TIERS).map((t) => [t, got.filter((x) => x.tier === t).length]);
  const showcase = [...got].sort((a, b) => Object.keys(TIERS).indexOf(b.tier) - Object.keys(TIERS).indexOf(a.tier)).slice(0, 12);
  const isMe = profileSnapshot() === params[0];
  const games = { hl: "Higher or Lower", guess: "Guess the Player", career: "Career Path", draft: "All-Time Draft" };
  root.innerHTML = html`
    <div class="card pub-hero">
      ${avatarHtml({ icon: d.i, color: d.c, frame: d.f, style: d.y, av: d.p }, 96)}
      <div class="pub-who"><small class="muted">LEVEL ${lv.level} · ${esc(titleFor(lv.level).toUpperCase())}</small>
        <h1>${esc(d.n)}</h1>
        <div class="progress xp-bar" aria-hidden="true"><i style="width:${lv.pct * 100}%"></i></div>
        <small class="muted">${lv.xp.toLocaleString()} XP · ${got.length}/${DEFS.length} banners${d.s ? ` · 🔥 ${d.s}-day daily streak` : ""}</small></div>
      <div class="pub-actions">${isMe ? `<button class="btn" id="copy">${icon("link", { size: 15 })} Copy link</button>` : `<a class="btn primary" href="#/">${icon("play", { size: 15 })} Play the arcade</a>`}</div>
    </div>
    <div class="pub-grid">
      <div class="card pad"><h3>${icon("trophy")} Personal bests</h3>
        <div class="facts pub-facts">
          <div class="fact"><small>Best draft</small><b>${d.b.d || "–"}</b></div>
          <div class="fact"><small>Higher/Lower streak</small><b>${d.b.h || "–"}</b></div>
          <div class="fact"><small>Career Path best</small><b>${d.b.c ? d.b.c + "/30" : "–"}</b></div>
          <div class="fact"><small>Guess wins</small><b>${d.b.g}</b></div>
        </div></div>
      <div class="card pad"><h3>${icon("globe")} Online ranks</h3>
        ${d.r ? html`<ul class="clean pub-ranks">${Object.entries(games).map(([k, name]) => {
          const r = rankOf(d.r[k]);
          return `<li><span>${name}</span><span class="rank-badge rk-${r.id}"><i></i>${r.name} <b>${d.r[k]}</b></span></li>`;
        }).join("")}</ul><small class="muted">${d.w} ranked win${d.w === 1 ? "" : "s"}</small>` : `<p class="muted">Hasn't played online yet.</p>`}
      </div>
    </div>
    <div class="card pad">
      <div class="row"><h3 style="margin:0">${icon("flag")} Banners</h3><span class="spacer"></span>
        <span class="muted pub-tiers">${tiers.map(([t, n]) => `${TIERS[t]} ${n}`).join(" · ")}</span></div>
      ${showcase.length ? `<div class="pub-banners">${showcase.map((x) => `<figure title="${esc(x.title)}: ${esc(x.desc)}">${bannerSvg(x, { width: 92 })}<figcaption>${esc(GAMES[x.game]?.short || "")}</figcaption></figure>`).join("")}</div>` : `<p class="muted">No banners yet.</p>`}
    </div>
    <p class="muted" style="font-size:12px">Snapshot from ${esc(d.t)}. Profiles are shared as a link; nothing is stored on a server.</p>`;
  root.querySelector("#copy")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); toast("Profile link copied"); } catch { toast("Copy the address bar to share"); }
  }, { signal });
}
