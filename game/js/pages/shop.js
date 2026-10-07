// #/shop: spend Buckets (earned by playing) on looks, extra modes and single-player helpers.
// Also home to the weekly missions, the other way to earn.
import { esc, html, store, toast } from "../ui.js";
import { icon } from "../lib/icons.js";
import { avatarHtml, getMe, saveMe } from "../lib/me.js";
import { DEFAULT_AV, playerAvatarSvg } from "../lib/avatarArt.js";
import { courtSvg } from "../mycareer/live.js";
import { COURT } from "../mycareer/pbp.js";
import { confirmDialog } from "../lib/modal.js";
import { sound } from "../lib/fx.js";
import { CATEGORIES, DEAL_OFF, ITEMS, priceOf, todaysDeals } from "../lib/shop.js";
import { buy, coins, equip, equipped, owns, tokens, wallet } from "../lib/wallet.js";
import { MISSION_BONUS, daysLeft, missionText, missions } from "../lib/missions.js";

const fmt = (n) => Number(n).toLocaleString("en-US");

/** The weekly missions card (also used on the home page). */
export function missionsHtml({ compact = false } = {}) {
  const m = missions();
  const done = m.list.filter((x) => x.done).length;
  return html`<section class="card pad missions ${compact ? "compact" : ""}" aria-label="Weekly missions">
    <div class="row"><h3 style="margin:0">${icon("flag")} Weekly missions</h3><span class="spacer"></span>
      <small class="muted">${done}/4 · new missions in ${daysLeft()} day${daysLeft() === 1 ? "" : "s"}</small></div>
    <ul class="clean ms-list">${m.list.map((x) => html`<li class="${x.done ? "done" : ""}">
      <span class="ms-ic">${icon(x.done ? "check" : "target", { size: 16 })}</span>
      <div><b>${esc(missionText(x.def))}</b>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${x.def.n}" aria-valuenow="${x.have}" aria-label="${esc(missionText(x.def))}"><i style="width:${(x.have / x.def.n) * 100}%"></i></div></div>
      <span class="ms-reward">${x.done ? "Done" : `${x.have}/${x.def.n}`} · 🏀 ${x.def.reward}</span></li>`).join("")}</ul>
    <p class="muted ms-bonus">${m.bonus ? `${icon("check", { size: 14 })} Weekly bonus collected` : `All four: bonus 🏀 ${MISSION_BONUS}`}</p>
  </section>`;
}

export function renderShop(root, signal, params) {
  let cat = CATEGORIES.some(([k]) => k === params[0]) ? params[0] : store.get("shop:cat", "deals");

  function preview(item) {
    const me = getMe();
    switch (item.cat) {
      case "avatar": return `<span class="sh-av">${playerAvatarSvg({ ...(me.av || DEFAULT_AV), [item.slot]: item.value }, me.color)}</span>`;
      case "frame": return avatarHtml({ ...me, frame: item.id.split(":")[1] }, 56);
      case "card": return `<span class="sh-card card-skin-${item.id.split(":")[1]}">${avatarHtml(me, 30)}<b>${esc(me.nickname || "Guest")}</b></span>`;
      case "court": return `<span class="sh-court" data-court="${item.id.split(":")[1]}"><svg viewBox="-6 -6 ${COURT.w + 12} ${COURT.h + 12}" aria-hidden="true">${courtSvg()}</svg></span>`;
      case "sticker": return `<span class="sticker-btn st-${item.sticker} sh-sticker">${esc(item.name)}</span>`;
      case "mode": return `<span class="sh-ic">${icon("games", { size: 34 })}</span>`;
      case "helper": return `<span class="sh-ic">${icon(item.token === "hint" ? "bulb" : "refresh", { size: 34 })}</span>`;
      default: return `<span class="sh-ic">${icon("trophy", { size: 34 })}</span>`;
    }
  }

  // what "using" a bought item means, per kind
  const slotOf = (item) => (item.cat === "court" ? "court" : item.cat === "card" ? "card" : null);
  const inUse = (item) => {
    const me = getMe();
    if (item.cat === "avatar") return me.style === "player" && (me.av || DEFAULT_AV)[item.slot] === item.value;
    if (item.cat === "frame") return me.frame === item.id.split(":")[1];
    const slot = slotOf(item);
    return slot ? equipped(slot) === item.id : false;
  };
  function use(item) {
    if (item.cat === "avatar") { const me = getMe(); saveMe({ style: "player", av: { ...(me.av || DEFAULT_AV), [item.slot]: item.value } }); }
    else if (item.cat === "frame") saveMe({ frame: item.id.split(":")[1] });
    else if (slotOf(item)) equip(slotOf(item), inUse(item) ? null : item.id);
  }
  const usable = (item) => ["avatar", "frame", "court", "card"].includes(item.cat);
  const note = { sticker: "Shows up in online matches", mode: "Shows up in the game's setup", league: "Style your leagues in Online → Leagues" };

  function cardHtml(item) {
    const own = item.kind !== "token" && owns(item.id), price = priceOf(item), deal = price < item.price;
    const action = own
      ? usable(item) ? `<button class="btn ${inUse(item) ? "" : "primary"}" data-use="${item.id}">${inUse(item) ? (slotOf(item) ? "Take off" : "In use") : "Use"}</button>` : `<span class="sh-owned">${icon("check", { size: 14 })} ${note[item.cat] || "Owned"}</span>`
      : `<button class="btn primary" data-buy="${item.id}" ${coins() >= price ? "" : "disabled"} aria-label="Buy ${esc(item.name)} for ${price} Buckets">🏀 ${fmt(price)}${deal ? ` <s>${fmt(item.price)}</s>` : ""}</button>`;
    return html`<article class="card sh-item ${own ? "owned" : ""} ${deal ? "deal" : ""}">
      ${deal ? `<span class="sh-tag">−${Math.round(DEAL_OFF * 100)}%</span>` : ""}
      <div class="sh-prev">${preview(item)}</div>
      <h3>${esc(item.name)}</h3><p class="muted">${esc(item.desc)}</p>
      ${item.kind === "token" ? `<small class="muted">You have ${tokens(item.token)}</small>` : ""}
      <div class="sh-act">${action}</div></article>`;
  }

  function draw() {
    const w = wallet();
    const list = cat === "deals" ? todaysDeals() : ITEMS.filter((i) => i.cat === cat);
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("coin", { size: 30 })} Shop</h1>
        <p>Spend the Buckets you earn by playing. Everything here is looks, extra modes or helpers for single-player games: nothing gives an edge online, and nothing costs real money.</p></div>
        <div class="sh-balance" aria-live="polite"><small>YOUR BUCKETS</small><b class="led">🏀 ${fmt(w.coins)}</b><small class="muted">${fmt(w.total)} earned in all</small></div></div>
      <div class="sh-top">${missionsHtml()}
        <details class="card pad sh-earn"><summary>${icon("info", { size: 16 })} How to earn Buckets</summary>
          <ul class="pv-list"><li>Every game: more for a better result (a draft over 90, a quick guess, a long streak).</li>
          <li>Daily challenges: 10 each, and 20 more for the Full House. Streak milestones: 50 at 7 days, 200 at 30, 500 at 100.</li>
          <li>Achievements: 25 bronze, 50 silver, 100 gold, 250 legend. Every new level: 50 + 10 × the level.</li>
          <li>Online: 20 for a win (plus a streak bonus), 10 a draw, 5 a loss; bots pay less. Weekly missions: 40–90 each, 150 for all four.</li></ul></details></div>
      <div class="seg sh-cats" role="tablist" aria-label="Shop sections">${CATEGORIES.map(([k, l, ic]) => `<button role="tab" aria-selected="${k === cat}" class="${k === cat ? "on" : ""}" data-cat="${k}">${icon(ic, { size: 14 })} ${l}</button>`).join("")}</div>
      ${cat === "deals" ? `<p class="muted" style="margin:10px 0 0">Three items, ${Math.round(DEAL_OFF * 100)}% off, new every day.</p>` : ""}
      <div class="sh-grid">${list.map(cardHtml).join("")}</div>`;
    root.querySelector(".sh-cats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; store.set("shop:cat", cat); draw(); } }, { signal });
    root.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", async () => {
      const item = ITEMS.find((i) => i.id === b.dataset.buy), price = priceOf(item);
      const ok = await confirmDialog({ title: `Buy ${item.name}?`, message: `${fmt(price)} Buckets. You have ${fmt(coins())}.`, ok: "Buy", cancel: "Cancel" });
      if (!ok || signal.aborted) return;
      if (!buy(item, price)) return toast("Not enough Buckets yet");
      sound.play("win");
      if (usable(item)) use(item); // wear it right away
      toast(`${item.name}: yours!`);
      draw();
    }, { signal }));
    root.querySelectorAll("[data-use]").forEach((b) => b.addEventListener("click", () => { use(ITEMS.find((i) => i.id === b.dataset.use)); sound.play("tick"); draw(); }, { signal }));
  }
  document.addEventListener("wallet-changed", () => { if (!signal.aborted) draw(); }, { signal });
  draw();
}
