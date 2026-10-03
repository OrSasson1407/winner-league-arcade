// "Me": nickname + avatar, personal records and best drafts.
import { AVATAR_COLORS, AVATAR_ICONS, avatarHtml, getMe, saveMe } from "../lib/me.js";
import { icon } from "../lib/icons.js";
import { DEFS, bannerSvg, totals, unlockedMap } from "../lib/achievements.js";
import { FRAMES, frameUnlocked, levelInfo } from "../lib/progress.js";
import { esc, html, store, toast } from "../ui.js";
import { EXTRAS, HAIRS, HAIR_COLORS, JERSEY_COLORS, SKINS, playerAvatarSvg, randomAv } from "../lib/avatarArt.js";
import { clubColors } from "../lib/clubs.js";
import { getSettings } from "../lib/settings.js";
import { profileLink } from "./publicProfile.js";

const toHex = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; return x.fillStyle; };

/** The player-avatar builder (skin, hair, colours, number, extras). */
function builderHtml(me) {
  const a = me.av;
  const sw = (key, list, cur, label) => `<div class="sw-grid" role="radiogroup" aria-label="${label}">${list.map((c, i) => {
    const v = key === "skin" || key === "hc" ? i : c;
    return `<button role="radio" aria-checked="${cur === v}" class="sw ${cur === v ? "on" : ""}" data-av="${key}" data-v="${v}" style="background:${c}" aria-label="${label} ${i + 1}"></button>`;
  }).join("")}</div>`;
  const opts = (key, map, cur) => `<div class="av-opts">${Object.entries(map).map(([k, l]) => `<button class="av-opt-txt ${cur === k ? "on" : ""}" data-av="${key}" data-v="${k}" aria-pressed="${cur === k}">
    <span class="av-mini">${playerAvatarSvg({ ...a, [key]: k }, me.color)}</span>${l}</button>`).join("")}</div>`;
  return html`<div class="av-builder">
    <div class="field"><label>Skin</label>${sw("skin", SKINS, a.skin, "Skin tone")}</div>
    <div class="field"><label>Hair</label>${opts("hair", HAIRS, a.hair)}</div>
    <div class="field"><label>Hair colour</label>${sw("hc", HAIR_COLORS, a.hc, "Hair colour")}</div>
    <div class="field"><label>Jersey</label>${sw("j1", JERSEY_COLORS, a.j1, "Jersey colour")}</div>
    <div class="field"><label>Trim</label>${sw("j2", JERSEY_COLORS, a.j2, "Trim colour")}</div>
    <div class="row av-row"><div class="field"><label for="av-num">Number</label><input id="av-num" class="input" type="number" min="0" max="99" value="${a.num}" style="width:90px"></div>
      <button class="btn" data-av="club">${icon("shield", { size: 15 })} My club's colours</button>
      <button class="btn ghost" data-av="random">${icon("dice", { size: 15 })} Random</button></div>
    <div class="field"><label>Extras</label>${opts("x", EXTRAS, a.x)}</div>
  </div>`;
}

export function renderMe(root, signal) {
  const draw = () => {
    const me = getMe();
    const board = store.get("draft:board", []);
    const plays = ["draft", "guess", "higher-lower", "career"].map((k) => store.get(`plays:${k}`, 0));
    const lv = levelInfo();
    const map = unlockedMap();
    const got = DEFS.filter((d) => map[d.id]);
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("user", { size: 30 })} Your profile</h1>
        <p>Your nickname and avatar appear on leaderboards and as your team name in games. Saved on this device only.</p></div></div>
      <div class="setup-grid">
        <div class="card pad setup">
          <div class="me-preview">${avatarHtml(me, 84)}<div><div class="muted" style="font-size:12px;font-weight:700;letter-spacing:2px">LEVEL ${lv.level} · ${esc(lv.title.toUpperCase())}</div><h2>${me.nickname ? esc(me.nickname) : "Guest"}</h2></div></div>
          <div class="level-card">
            <div class="row"><b class="led lv-num">${lv.level}</b><div style="flex:1"><b>${esc(lv.title)}</b>
              <div class="progress xp-bar" role="progressbar" aria-valuenow="${lv.into}" aria-valuemax="${lv.need}" aria-label="XP to next level"><i style="width:${lv.pct * 100}%"></i></div>
              <small class="muted">${lv.max ? "Max level reached" : `${lv.into.toLocaleString()} / ${lv.need.toLocaleString()} XP to level ${lv.level + 1}`} · ${lv.xp.toLocaleString()} XP total</small></div></div>
          </div>
          <div class="field"><label for="nick">Nickname</label>
            <input id="nick" class="input" maxlength="18" placeholder="e.g. Coach Or" value="${esc(me.nickname)}"></div>
          <div class="field"><label>Avatar style</label>
            <div class="seg" id="av-style" role="radiogroup" aria-label="Avatar style">
              <button role="radio" data-style="player" aria-checked="${me.style === "player"}" class="${me.style === "player" ? "on" : ""}">${icon("jersey", { size: 15 })} Player</button>
              <button role="radio" data-style="icon" aria-checked="${me.style !== "player"}" class="${me.style !== "player" ? "on" : ""}">${icon("ball", { size: 15 })} Icon</button></div></div>
          ${me.style === "player" ? builderHtml(me) : ""}
          <div class="field" ${me.style === "player" ? "hidden" : ""}><label>Avatar</label>
            <div class="av-grid" role="radiogroup" aria-label="Avatar icon">${AVATAR_ICONS.map((n) => `<button role="radio" aria-checked="${me.icon === n}" class="av-opt ${me.icon === n ? "on" : ""}" data-icon="${n}" aria-label="${n}">${icon(n, { size: 22 })}</button>`).join("")}</div></div>
          <div class="field"><label>Frame</label>
            <div class="frame-grid" role="radiogroup" aria-label="Avatar frame">${FRAMES.map((f) => {
              const ok = frameUnlocked(f, lv.level, got);
              return `<button role="radio" aria-checked="${me.frame === f.id}" class="frame-opt ${me.frame === f.id ? "on" : ""} ${ok ? "" : "locked"}" data-frame="${f.id}" ${ok ? "" : "disabled"} title="${esc(f.req)}">
                ${avatarHtml({ ...me, frame: f.id }, 40)}<span>${esc(f.name)}</span><small>${ok ? (me.frame === f.id ? "Equipped" : "Unlocked") : esc(f.req)}</small></button>`;
            }).join("")}</div></div>
          <div class="field"><label>Colour</label>
            <div class="sw-grid" role="radiogroup" aria-label="Avatar colour">${AVATAR_COLORS.map((c) => `<button role="radio" aria-checked="${me.color === c}" class="sw ${me.color === c ? "on" : ""}" data-color="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("")}</div></div>
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          <div class="card pad"><h3>${icon("chart")} Your records</h3>
            <div class="facts">
              <div class="fact"><small>Best draft</small><b>${store.get("draft:best", 0)}</b></div>
              <div class="fact"><small>Guess streak</small><b>${store.get("guess:streak", 0)}</b></div>
              <div class="fact"><small>Higher/Lower best</small><b>${store.get("hl:best:mixed", 0)}</b></div>
              <div class="fact"><small>Career Path best</small><b>${store.get("career:best", 0)}/30</b></div>
              <div class="fact"><small>Games played</small><b>${plays.reduce((a, b) => a + b, 0)}</b></div>
            </div></div>
          <div class="card pad share-prof">
            <div><b>${icon("link", { size: 16 })} Your public profile</b><small class="muted">A link with your avatar, level, banners and bests. It's a snapshot: share a new link after you improve.</small></div>
            <div class="row"><button class="btn primary" id="share-prof">${icon("link", { size: 15 })} Copy profile link</button><a class="btn" id="view-prof" href="#">${icon("eye", { size: 15 })} Preview</a></div>
          </div>
          <div class="card pad me-links">
            <a class="btn" href="#/daily">${icon("calendar", { size: 16 })} Daily challenges</a>
            <a class="btn" href="#/recap">${icon("calendar", { size: 16 })} Monthly recap</a>
            <a class="btn" href="#/online">${icon("globe", { size: 16 })} Online 1v1</a>
            <a class="btn" href="#/challenge">${icon("users", { size: 16 })} Challenge a friend</a>
            <a class="btn" href="#/compare">${icon("chart", { size: 16 })} Compare players</a>
          </div>
          <div class="card pad"><div class="row"><h3>${icon("flag")} Achievements</h3><span class="spacer"></span><a class="btn ghost" href="#/achievements">Hall of Banners ${icon("arrowRight", { size: 14 })}</a></div>
            ${(() => {
              const map = unlockedMap(); const t = totals();
              const recent = DEFS.filter((d) => map[d.id]).sort((a, b) => map[b.id].localeCompare(map[a.id])).slice(0, 5);
              return `<p class="muted" style="margin:6px 0 10px">${t.done} of ${t.total} unlocked</p>
                <div class="mini-banners">${recent.map((d) => bannerSvg(d, { width: 64 })).join("") || `<span class="muted">No banners yet. Play to earn your first.</span>`}</div>`;
            })()}</div>
          <div class="card pad"><h3>${icon("trophy")} Best drafts</h3>
            ${board.length ? `<ol class="board">${board.slice(0, 5).map((e) => `<li><span class="b-score">${e.total.toFixed(1)}</span><span class="b-grade">${e.grade}</span><span class="b-main"><b>${esc(e.name)}</b><small>${esc(e.mode)} · ${esc(e.date)}</small></span></li>`).join("")}</ol>`
              : `<div class="empty-state">${icon("trophy", { size: 30 })}<b>No drafts yet</b><a class="btn primary" href="#/draft">Start a draft</a></div>`}
          </div>
        </div>
      </div>`;
    root.querySelector("#share-prof").addEventListener("click", async () => {
      const link = profileLink();
      try { await navigator.clipboard.writeText(link); toast("Profile link copied: share it anywhere"); } catch { toast("Couldn't copy: use Preview and copy the address"); }
    }, { signal });
    root.querySelector("#view-prof").addEventListener("click", (e) => { e.preventDefault(); location.hash = profileLink().split("#")[1]; }, { signal });
    let t;
    root.querySelector("#nick").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { saveMe({ nickname: e.target.value }); root.querySelector(".me-preview h2").textContent = getMe().nickname || "Guest"; }, 250);
    }, { signal });
    root.querySelector("#nick").addEventListener("change", () => toast("Nickname saved"), { signal });
    root.querySelector("#av-style").addEventListener("click", (e) => { const b = e.target.closest("[data-style]"); if (b) { saveMe({ style: b.dataset.style }); draw(); } }, { signal });
    const setAv = (patch) => { saveMe({ av: { ...getMe().av, ...patch } }); draw(); };
    root.querySelector(".av-builder")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-av]"); if (!b) return;
      if (b.dataset.av === "random") return setAv(randomAv());
      if (b.dataset.av === "club") { const club = getSettings().club; if (!club) return toast("Pick your club in Settings → Accent colour first"); const [c1, c2] = clubColors(club); return setAv({ j1: toHex(c1), j2: toHex(c2) }); }
      const v = b.dataset.v;
      setAv({ [b.dataset.av]: ["skin", "hc"].includes(b.dataset.av) ? Number(v) : v });
    }, { signal });
    root.querySelector("#av-num")?.addEventListener("change", (e) => setAv({ num: Math.max(0, Math.min(99, Number(e.target.value) || 0)) }), { signal });
    root.querySelector(".av-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-icon]"); if (b) { saveMe({ icon: b.dataset.icon }); draw(); } }, { signal });
    root.querySelector(".frame-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-frame]:not([disabled])"); if (b) { saveMe({ frame: b.dataset.frame }); draw(); } }, { signal });
    root.querySelector(".sw-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-color]"); if (b) { saveMe({ color: b.dataset.color }); draw(); } }, { signal });
  };
  draw();
}
