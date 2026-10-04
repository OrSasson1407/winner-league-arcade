// My Career graphics: gauges, the skills radar, badge medallions, schedule calendar, standings with
// movement, playoff bracket and the contract-signing ceremony. Plain SVG/HTML strings.
import { teamName } from "../data.js";
import { crestSvg, icon } from "../lib/icons.js";
import { esc } from "../ui.js";
import { ATTRS, BADGES, BADGE_TIERS, ROLE_NAMES, table } from "./engine.js";

// ---------------------------------------------------------------- round gauge (one value 0–100)
export function gauge(label, value, prev = null, { size = 64 } = {}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = 26, c = 2 * Math.PI * r;
  const d = prev == null ? 0 : Math.round(value - prev);
  return `<div class="mc-gauge" role="img" aria-label="${esc(label)} ${v} out of 100${d ? `, ${d > 0 ? "up" : "down"} ${Math.abs(d)}` : ""}">
    <svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="32" cy="32" r="${r}" class="g-track"/>
      <circle cx="32" cy="32" r="${r}" class="g-fill" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v / 100)).toFixed(1)}" transform="rotate(-90 32 32)"/>
      <text x="32" y="37" text-anchor="middle" class="g-val">${v}</text>
    </svg>
    <small>${esc(label)}</small>${d ? `<b class="g-delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</b>` : ""}
  </div>`;
}

// ---------------------------------------------------------------- skills radar (now vs. last season)
const AX = Object.keys(ATTRS);
const SHORT = { sht: "Mid", thr: "3PT", fin: "Finish", pas: "Pass", def: "Defense", reb: "Rebound", ath: "Athletic", iq: "IQ" };
export function radar(now, before = null, { size = 300 } = {}) {
  const cx = 150, cy = 150, R = 105, lo = 20, hi = 99;
  const pt = (i, v) => { const a = (Math.PI * 2 * i) / AX.length - Math.PI / 2; const rr = (R * (Math.max(lo, Math.min(hi, v)) - lo)) / (hi - lo); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const poly = (vals) => AX.map((k, i) => pt(i, vals[k]).map((n) => n.toFixed(1)).join(",")).join(" ");
  const rings = [40, 60, 80, 99].map((v) => `<polygon points="${AX.map((k, i) => pt(i, v).map((n) => n.toFixed(1)).join(",")).join(" ")}" class="r-grid"/>`).join("");
  const spokes = AX.map((k, i) => { const [x, y] = pt(i, hi); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="r-grid"/>`; }).join("");
  const labels = AX.map((k, i) => {
    const [x, y] = pt(i, hi + 16);
    const anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" class="r-lab">${SHORT[k]} <tspan class="r-num">${Math.floor(now[k])}</tspan></text>`;
  }).join("");
  const dots = AX.map((k, i) => {
    const [x, y] = pt(i, now[k]);
    const diff = before ? Math.round((now[k] - before[k]) * 10) / 10 : null;
    return `<g class="r-hit" tabindex="0" role="img" aria-label="${ATTRS[k]} ${Math.floor(now[k])}${diff != null ? `, ${diff >= 0 ? "+" : ""}${diff} since last season` : ""}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" class="r-target"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="r-dot"/>
      <title>${ATTRS[k]}: ${Math.floor(now[k])}${diff != null ? ` (${diff >= 0 ? "+" : ""}${diff} since last season)` : ""}</title></g>`;
  }).join("");
  return `<div class="mc-radar">
    <div class="r-legend"><span><i class="la"></i>Now</span>${before ? `<span><i class="lb"></i>Last season</span>` : ""}</div>
    <svg viewBox="-60 -10 420 320" width="100%" style="max-width:${size + 120}px" role="img" aria-label="Skills radar: ${AX.map((k) => `${ATTRS[k]} ${Math.floor(now[k])}`).join(", ")}">
      ${rings}${spokes}
      ${before ? `<polygon points="${poly(before)}" class="r-before"/>` : ""}
      <polygon points="${poly(now)}" class="r-now"/>
      ${dots}${labels}
    </svg></div>`;
}

// ---------------------------------------------------------------- badge medallions
const BADGE_ICON = { sniper: "target", bucket: "ball", midrange: "star", general: "clipboard", lockdown: "shield", glass: "hoop", highflyer: "rocket", clutch: "timer", ironman: "heart" };
export function badgeMedals(C, { fresh = null, tpOk = (cost) => C.tp >= cost, cost }) {
  return `<div class="mc-medals">${Object.entries(BADGES).map(([id, b]) => {
    const t = C.badges[id] ?? -1, next = t + 1, need = b.need + next * 6;
    const can = next <= 2 && C.attrs[b.attr] >= need && tpOk(cost(next));
    return `<div class="mc-medal ${t >= 0 ? "tier" + t : "locked"} ${fresh === id ? "fresh" : ""}">
      <span class="md-coin" aria-hidden="true">${icon(BADGE_ICON[id] || "star", { size: 26 })}</span>
      <b>${esc(b.name)}</b><small>${t >= 0 ? BADGE_TIERS[t] : "Locked"} · ${esc(b.desc)}</small>
      ${next <= 2 ? `<button class="btn" data-badge="${id}" ${can ? "" : "disabled"}>${BADGE_TIERS[next]} · ${cost(next)} TP<small> ${ATTRS[b.attr]} ${need}+</small></button>` : `<span class="md-max">Maxed</span>`}
    </div>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- schedule calendar
export function scheduleGrid(S) {
  const league = S.games.filter((g) => !g.cup && !g.playoff && !g.eu);
  const cells = S.schedule.map((round, i) => {
    const m = round.find(([h, a]) => h === S.team || a === S.team);
    if (!m) return `<div class="sc-cell bye"><small>R${i + 1}</small><span>Bye</span></div>`;
    const opp = m[0] === S.team ? m[1] : m[0], home = m[0] === S.team;
    const g = league.find((x) => x.round === i);
    const idx = g ? S.games.indexOf(g) : -1;
    const cls = g ? (g.won ? "w" : "l") : i === S.round ? "next" : "";
    const inner = `<small>R${i + 1} · ${home ? "home" : "away"}</small>${crestSvg(opp, teamName(opp), 26)}<span class="sc-opp">${esc(teamName(opp))}</span>${g ? `<b>${g.won ? "W" : "L"} ${g.my}-${g.their}</b>` : i === S.round ? "<b>Next</b>" : ""}`;
    return g ? `<button class="sc-cell ${cls}" data-g="${idx}" aria-label="Round ${i + 1}: ${g.won ? "win" : "loss"} ${g.my}-${g.their} ${home ? "vs" : "at"} ${esc(teamName(opp))}">${inner}</button>` : `<div class="sc-cell ${cls}">${inner}</div>`;
  });
  const extra = S.games.map((g, i) => (g.cup || g.playoff || g.eu ? `<button class="sc-cell ${g.won ? "w" : "l"} special ${g.eu ? "eu" : ""}" data-g="${i}"><small>${g.cup ? "Cup" : g.eu ? (g.f4 ? "Final Four" : "EuroLeague") : "Playoffs"}</small>${crestSvg(g.opp, teamName(g.opp), 26)}<span class="sc-opp">${esc(teamName(g.opp))}</span><b>${g.won ? "W" : "L"} ${g.my}-${g.their}</b></button>` : "")).join("");
  return `<div class="mc-sched">${cells.join("")}${extra}</div>`;
}

// ---------------------------------------------------------------- standings with movement
export function standings(S) {
  const rows = table(S);
  return `<table class="stat-table mc-table2"><thead><tr><th>#</th><th><span class="sr-only">Movement</span></th><th>Team</th><th>W</th><th>L</th><th>+/-</th></tr></thead><tbody>${rows.map((r, i) => {
    const prev = S.prevRanks ? S.prevRanks.indexOf(r.id) : -1;
    const mv = prev < 0 ? 0 : prev - i;
    return `<tr class="${r.id === S.team ? "me-row" : ""} ${i < 8 ? "po" : ""} ${i === 7 ? "cut" : ""}">
      <td>${i + 1}</td><td class="mv ${mv > 0 ? "up" : mv < 0 ? "down" : ""}">${mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : "–"}</td>
      <td><span class="tm">${crestSvg(r.id, r.name, 22)} ${esc(r.name)}</span></td><td><b>${r.w}</b></td><td>${r.l}</td><td>${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`;
  }).join("")}</tbody></table>`;
}

// ---------------------------------------------------------------- playoff bracket
export function bracket(S, roundNames = null) {
  const P = S.playoffs;
  if (!P) return "";
  const rounds = [...(P.history || [])];
  if (!P.champion && P.series?.length && !(P.history || []).some((r) => r === P.series)) rounds.push(P.series);
  const names = roundNames || ["Quarter-finals", "Semi-finals", "Final"];
  const team = (id, wins, won) => `<div class="bk-team ${id === S.team ? "me" : ""} ${won ? "won" : ""}">${id ? crestSvg(id, teamName(id), 20) : `<i class="bk-tbd" aria-hidden="true"></i>`}<span>${id ? esc(teamName(id)) : "TBD"}</span><b>${wins ?? ""}</b></div>`;
  return `<div class="mc-bracket" role="group" aria-label="Playoff bracket">${[0, 1, 2].map((ri) => {
    const r = rounds[ri];
    const count = [4, 2, 1][ri];
    return `<div class="bk-col"><small>${names[ri]}</small>${Array.from({ length: count }, (_, j) => {
      const s = r?.[j];
      const done = s && (s.w[0] >= 2 || s.w[1] >= 2);
      return `<div class="bk-match">${team(s?.a, s?.w[0], done && s.w[0] >= 2)}${team(s?.b, s?.w[1], done && s.w[1] >= 2)}</div>`;
    }).join("")}</div>`;
  }).join("")}<div class="bk-col champ"><small>Champion</small><div class="bk-trophy">${icon("trophy", { size: 34 })}<b>${P.champion ? esc(teamName(P.champion)) : "?"}</b></div></div></div>`;
}

// ---------------------------------------------------------------- contract ceremony
export function contractHtml(C, o, money, jerseyAvatar, season) {
  return `<div class="mc-contract">
    <div class="ct-paper">
      <div class="ct-head">${crestSvg(o.team, o.name, 44)}<div><small>PLAYER CONTRACT</small><b>${esc(o.name)}</b></div></div>
      <p>This agreement is made in the summer before the ${esc(season)} season between <b>${esc(o.name)}</b> ("the Club") and <b>${esc(C.name)}</b> ("the Player").</p>
      <ul class="clean ct-terms">
        <li><span>Term</span><b>${o.years} season${o.years > 1 ? "s" : ""}</b></li>
        <li><span>Salary</span><b>${money(o.salary)} per season (gross)</b></li>
        <li><span>Role</span><b>${ROLE_NAMES[o.promised || o.role] || o.role}${o.promised ? " (promised)" : ""}</b></li>
        ${o.homeGrown ? `<li><span>Note</span><b>Home-grown player</b></li>` : ""}
      </ul>
      <div class="ct-sign"><span class="ct-line"></span><span class="ct-name" aria-label="Signed: ${esc(C.name)}">${esc(C.name)}</span><small>Player's signature</small></div>
    </div>
    <div class="ct-photo">${jerseyAvatar}<small>Welcome to ${esc(o.name)}!</small></div>
  </div>`;
}
