// #/op/CODE: a player's public online profile: ranks and record in every game, streaks, the last
// matches and the opponents they meet most. The same things leaderboards and opponents already see.
import { esc, html } from "../ui.js";
import { icon } from "../lib/icons.js";
import { avatarHtml } from "../lib/me.js";
import { skeletonHtml } from "../lib/ux.js";
import { RATED_GAMES, rankOf } from "../shared/rating.js";
import { GAME_ICONS, GAME_NAMES, addFriend, isFriend } from "../online/social.js";
import { connect, myCode, netStatus, onNet, send } from "../online/net.js";
import { toast } from "../ui.js";

const badge = (elo, small = false) => { const r = rankOf(elo); return `<span class="rank-badge rk-${r.id} ${small ? "sm" : ""}" title="${r.name} · ${elo}"><i></i>${r.name}${small ? "" : ` <b>${elo}</b>`}</span>`; };

export function renderOnlineProfile(root, signal, params) {
  const code = String(params[0] || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  root.innerHTML = skeletonHtml("player");
  connect();
  const ask = () => send({ t: "profile:get", code });
  onNet((m) => {
    if (m.t === "status" && m.status === "online") ask();
    if (m.t === "profile:data" && m.code === code) draw(m);
  }, signal);
  if (netStatus() === "online") ask();

  function draw(p) {
    if (p.missing) {
      root.innerHTML = html`<div class="card center-card"><h2>${icon("user")} Player not found</h2>
        <p class="muted">No online player has the code ${esc(code)}, or they haven't played online since the server last restarted.</p><a class="btn" href="#/online">${icon("globe", { size: 15 })} Online 1v1</a></div>`;
      return;
    }
    const total = (k) => RATED_GAMES.reduce((s, g) => s + (p[k]?.[g] || 0), 0);
    const best = Math.max(...RATED_GAMES.map((g) => p.elo?.[g] ?? 1000));
    const me = p.code === myCode;
    root.innerHTML = html`
      <div class="card pub-hero op-hero">
        ${avatarHtml(p, 96)}
        <div class="pub-who"><small class="muted">ONLINE PROFILE · LEVEL ${p.level}</small><h1>${esc(p.name)}</h1>
          <div class="row" style="gap:8px;flex-wrap:wrap">${badge(best)}<span class="muted">${total("w")}-${total("l")}${total("d") ? `-${total("d")}` : ""} · ${p.games} rated</span>
          ${p.streak >= 2 ? `<span class="streak-fire">🔥 ${p.streak} win streak</span>` : ""}<span class="muted">Best streak ${p.best}</span></div></div>
        <div class="pub-actions">${me ? `<span class="muted">This is you</span>` : isFriend(p.code) ? `<span class="muted">${icon("check", { size: 14 })} Friend</span>`
          : `<button class="btn" id="op-add">${icon("users", { size: 15 })} Add friend</button>`}</div>
      </div>
      <div class="op-grid">
        <section class="card pad"><h3>${icon("trophy")} Ranks by game</h3>
          <table class="stat-table"><thead><tr><th>Game</th><th>Rank</th><th>Peak</th><th>W</th><th>L</th><th>D</th></tr></thead>
          <tbody>${RATED_GAMES.map((g) => `<tr><td>${icon(GAME_ICONS[g], { size: 14 })} ${esc(GAME_NAMES[g] || g)}</td><td>${badge(p.elo?.[g] ?? 1000, true)} <b>${p.elo?.[g] ?? 1000}</b></td>
            <td>${p.peak?.[g] ?? "–"}</td><td><b>${p.w?.[g] ?? 0}</b></td><td>${p.l?.[g] ?? 0}</td><td>${p.d?.[g] ?? 0}</td></tr>`).join("")}</tbody></table></section>
        <div style="display:grid;gap:16px;align-content:start">
          <section class="card pad"><h3>${icon("clock")} Recent matches</h3>
            ${p.recent.length ? `<div class="hist-list">${p.recent.map((h) => html`<div class="hist-row ${h.result}">
              <span class="hist-res">${h.result === "win" ? "W" : h.result === "lose" ? "L" : "D"}</span>
              ${avatarHtml({ icon: h.opp.icon || "ball", color: h.opp.color || "#64748b", frame: h.opp.frame || "none", style: h.opp.style, av: h.opp.av }, 30)}
              <div class="hist-info">${h.opp.code ? `<a href="#/op/${esc(h.opp.code)}"><b>${esc(h.opp.name || "?")}</b></a>` : `<b>${esc(h.opp.name || "?")}</b>`}
                <small class="muted">${icon(GAME_ICONS[h.game], { size: 12 })} ${esc(GAME_NAMES[h.game] || h.game)} · ${esc(h.score)} · ${new Date(h.at).toLocaleDateString()}</small></div>
              <span class="mode-chip ${h.mode}">${h.mode === "ranked" ? "Ranked" : h.mode === "bot" ? "Bot" : "Friendly"}</span></div>`).join("")}</div>` : `<p class="muted">No matches yet.</p>`}
          </section>
          <section class="card pad"><h3>${icon("flame")} Rivals</h3>
            ${p.rivals.length ? p.rivals.map((r) => html`<a class="friend-row" href="#/op/${esc(r.code)}">${avatarHtml(r, 30)}<div class="fr-info"><b>${esc(r.name)}</b><small class="muted">${r.n} match${r.n === 1 ? "" : "es"}</small></div>
              <b class="h2h ${r.w > r.l ? "up" : r.w < r.l ? "down" : ""}">${r.w}-${r.l}${r.d ? `-${r.d}` : ""}</b></a>`).join("") : `<p class="muted">No rivals yet.</p>`}
          </section>
        </div>
      </div>`;
    root.querySelector("#op-add")?.addEventListener("click", () => {
      addFriend({ code: p.code, name: p.name, icon: p.icon, color: p.color, frame: p.frame, style: p.style, av: p.av });
      toast(`${p.name} added to friends`); draw(p);
    }, { signal });
  }
}
