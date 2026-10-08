// #/pass: the season pass (lib/pass.js). The month's 30 tiers, your progress, and the rewards to claim.
import { PER_TIER, TIERS, badges, claim, claimable, daysLeft, monthKey, monthName, passState, rewards, tierOf } from "../lib/pass.js";
import { ITEMS } from "../lib/shop.js";
import { wallet } from "../lib/wallet.js";
import { icon } from "../lib/icons.js";
import { esc, html, toast } from "../ui.js";
import { confetti, sound } from "../lib/fx.js";

const ICON = { coins: "coin", token: "bulb", item: "star", badge: "crown" };

export function renderPass(root, signal) {
  function draw() {
    const s = passState(), t = tierOf(s.xp), list = rewards(monthKey(), ITEMS), open = claimable(ITEMS);
    const into = s.xp - t * PER_TIER;
    root.innerHTML = html`<div class="game-head"><div><a class="back" href="#/">← Home</a><h1>${icon("crown", { size: 30 })} Season pass</h1>
        <p><b>${esc(monthName())}</b> · <span>${daysLeft()} days left.</span> <span>Every XP point you earn in any game moves you along. Free: Buckets and items only.</span></p></div>
        ${open.length ? `<button class="btn primary" id="claim-all">${icon("star", { size: 15 })} Claim all (${open.length})</button>` : ""}</div>
      <div class="card pad pass-head">
        <div class="row"><b class="led pass-tier">${t}</b><div style="flex:1"><b>Tier ${t} of ${TIERS}</b>
          <div class="progress xp-bar"><i style="width:${t >= TIERS ? 100 : Math.round((into / PER_TIER) * 100)}%"></i></div>
          <small class="muted">${t >= TIERS ? "The whole pass is done this month!" : `${into}/${PER_TIER} XP to tier ${t + 1} · ${s.xp.toLocaleString("en-US")} XP this month`}</small></div></div>
      </div>
      <div class="pass-track">${list.map((r) => {
        const got = s.claimed.includes(r.tier), ready = r.tier <= t && !got;
        return `<div class="pass-tile ${got ? "got" : ready ? "ready" : "locked"} ${r.kind}">
          <small>${r.tier}</small>${icon(ICON[r.kind] || "star", { size: 22 })}<span>${esc(r.label)}</span>
          ${ready ? `<button class="btn primary sm" data-claim="${r.tier}">Claim</button>` : got ? `<em>${icon("check", { size: 13 })} Claimed</em>` : `<em class="muted">${icon("lock", { size: 12 })}</em>`}</div>`;
      }).join("")}</div>
      ${badges(wallet().owned).length ? `<div class="card pad"><h3>${icon("crown")} Season badges</h3><p class="pass-badges">${badges(wallet().owned).map((m) => `<span class="pill">${icon("crown", { size: 13 })} ${esc(monthName(m))}</span>`).join(" ")}</p></div>` : ""}
      <p class="muted" style="font-size:12px">Items you already own pay half their shop price in Buckets instead. A new pass starts on the first of every month.</p>`;
    const take = (tiers) => {
      const got = tiers.map((x) => claim(x, ITEMS)).filter(Boolean);
      if (!got.length) return;
      sound.play("win");
      if (got.some((r) => r.kind === "badge" || r.kind === "item")) confetti(1800);
      toast(got.length === 1 ? `Claimed: ${got[0].label}` : `Claimed ${got.length} rewards`);
      draw();
    };
    root.querySelector("#claim-all")?.addEventListener("click", () => take(open.map((r) => r.tier)), { signal });
    root.querySelectorAll("[data-claim]").forEach((b) => b.addEventListener("click", () => take([Number(b.dataset.claim)]), { signal }));
  }
  draw();
}
