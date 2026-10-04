// Player profile: opened as a modal from anywhere ([data-profile] clicks), or as a page (#/player/<id>).
import { MOCK_NOTE, elCareer } from "./euroleague.js";
import { fmtHeight } from "./lib/units.js";
import { H, db, playersById, teamName } from "./data.js";
import { bestSeason, playerCard } from "./components/playerCard.js";
import { clubColors } from "./lib/clubs.js";
import { esc, fmt1, html } from "./ui.js";
import { crestSvg, icon } from "./lib/icons.js";
import { closeModal, closeSilently, openModal } from "./lib/modal.js";
import { copyLink } from "./ui.js";
import { logActivity } from "./lib/progress.js";
import { posPill } from "./lib/icons.js";

const SEASONS = db.metadata.season_list;
const METRICS = {
  rating: { label: "Game rating", fmt: (v) => String(Math.round(v)), domain: () => [55, 100] },
  ppg: { label: "Points per game", fmt: fmt1 },
  rpg: { label: "Rebounds per game", fmt: fmt1 },
  apg: { label: "Assists per game", fmt: fmt1 },
};

/** One point per season: rating = best record, per-game stats weighted by games across teams. */
function seasonSeries(records) {
  const by = new Map();
  for (const r of records) {
    if (!r.stats || !r.appeared_in_regular_season) continue;
    const e = by.get(r.season) || { season: r.season, games: 0, rating: 0, ppg: 0, rpg: 0, apg: 0, teams: [] };
    const g = r.stats.games;
    for (const k of ["ppg", "rpg", "apg"]) e[k] += (r.stats[k] ?? 0) * g;
    e.games += g;
    e.rating = Math.max(e.rating, r.rating_mock);
    e.teams.push(teamName(r.team_id));
    by.set(r.season, e);
  }
  for (const e of by.values()) for (const k of ["ppg", "rpg", "apg"]) e[k] = e.games ? e[k] / e.games : null;
  return by;
}

function age(dob) {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const now = new Date();
  return now.getFullYear() - y - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
}

/** Light club colours (e.g. Maccabi yellow) need dark text on top. */
const isLight = (c) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
};
function timelineHtml(records) {
  const first = SEASONS.indexOf(records[0].season), last = SEASONS.indexOf(records[records.length - 1].season);
  const cells = [];
  for (let i = first; i <= last; i++) {
    const s = SEASONS[i];
    const rs = records.filter((r) => r.season === s);
    if (!rs.length) { cells.push(`<div class="gap" style="flex:1" title="${s}: not in the league">–</div>`); continue; }
    for (const r of rs) {
      const [c1] = clubColors(r.team_id);
      cells.push(`<div style="flex:${1 / rs.length};background:${c1}${isLight(c1) ? ";color:#111;text-shadow:none" : ""}" title="${esc(teamName(r.team_id))} · ${s}">${rs.length === 1 && last - first < 12 ? s.slice(2) : ""}</div>`);
    }
  }
  return `<div class="timeline" role="img" aria-label="Career timeline">${cells.join("")}</div>
    <div class="tl-labels"><span>${SEASONS[first]}</span><span>${SEASONS[last]}</span></div>`;
}

function stintsHtml(records) {
  const stints = [];
  for (const r of records) {
    const last = stints[stints.length - 1];
    if (last && last.team_id === r.team_id) last.to = r.season;
    else stints.push({ team_id: r.team_id, from: r.season, to: r.season });
  }
  return `<div class="stints">${stints.map((s) => `<span class="stint"><i class="dot" style="background:${clubColors(s.team_id)[0]}"></i><b>${esc(teamName(s.team_id))}</b><span class="muted">${s.from === s.to ? s.from : `${s.from.slice(0, 4)}–${s.to.slice(5)}`}</span></span>`).join("")}</div>`;
}

function chartSvg(series, metric, first, last) {
  const W = 800, Hh = 260, L = 44, R = 16, T = 18, B = 34;
  const seasons = SEASONS.slice(first, last + 1);
  const vals = seasons.map((s) => series.get(s)?.[metric] ?? null);
  const present = vals.filter((v) => v !== null);
  let [y0, y1] = METRICS[metric].domain ? METRICS[metric].domain() : [0, Math.max(4, Math.ceil((Math.max(...present) * 1.15) / 2) * 2)];
  if (metric === "rating") { y0 = Math.min(55, Math.floor(Math.min(...present) / 5) * 5); }
  const x = (i) => L + (seasons.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (seasons.length - 1));
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (Hh - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  let path = "", pen = false;
  vals.forEach((v, i) => { if (v === null) { pen = false; return; } path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  const step = seasons.length > 12 ? 2 : 1;
  const colW = seasons.length > 1 ? (W - L - R) / (seasons.length - 1) : W - L - R;
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(METRICS[metric].label)} by season">
    ${ticks.map((t) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${METRICS[metric].fmt(t)}</text>`).join("")}
    ${seasons.map((s, i) => (i % step === 0 || i === seasons.length - 1) ? `<text class="axis-label" x="${x(i)}" y="${Hh - 10}" text-anchor="middle">${s.slice(2)}</text>` : "").join("")}
    <line class="cross" id="cross" x1="0" x2="0" y1="${T}" y2="${Hh - B}" visibility="hidden"/>
    <path class="series" d="${path}"/>
    ${vals.map((v, i) => v === null ? "" : `<circle class="marker" cx="${x(i)}" cy="${y(v)}" r="5"/>`).join("")}
    ${vals.map((v, i) => v === null ? "" : `<rect class="hit" data-i="${i}" x="${x(i) - colW / 2}" y="${T}" width="${colW}" height="${Hh - T - B}"/>`).join("")}
  </svg>`;
}

export function profileHtml(pid) {
  const p = playersById.get(pid);
  if (!p) return `<div class="profile"><h1>Player not found</h1></div>`;
  const records = H.getPlayerCareer(pid);
  const played = records.filter((r) => r.stats && r.appeared_in_regular_season);
  const best = bestSeason(records);
  const games = played.reduce((s, r) => s + r.stats.games, 0);
  const cPPG = games ? played.reduce((s, r) => s + (r.stats.ppg ?? 0) * r.stats.games, 0) / games : null;
  const a = age(p.birth_date);
  const bestKey = best ? `${best.season}|${best.team_id}` : "";
  return html`<div class="profile">
    <div class="profile-head">
      ${best ? playerCard(best, { size: "lg", info: false }) : ""}
      <div>
        <div class="muted" style="font-weight:700;letter-spacing:2px;font-size:12px">PLAYER PROFILE</div>
        <h1>${esc(p.name || p.name_he || pid)}</h1>
        ${p.name_he && p.name ? `<div class="muted" dir="rtl" lang="he">${esc(p.name_he)}</div>` : ""}
        <div class="facts">
          <div class="fact"><small>Position</small><b>${p.primary_position ? posPill(p.primary_position) : "–"}</b></div>
          <div class="fact"><small>Height</small><b>${fmtHeight(p.height_cm)}</b></div>
          <div class="fact"><small>Born</small><b>${p.birth_date ? `${p.birth_date.slice(0, 4)}${a !== null ? ` (age ${a})` : ""}` : "–"}</b></div>
          <div class="fact"><small>Nationality</small><b>${esc((p.nationalities || []).join(", ") || "–")}</b></div>
          <div class="fact"><small>Seasons</small><b>${new Set(played.map((r) => r.season)).size}</b></div>
          <div class="fact"><small>Clubs</small><b>${new Set(records.map((r) => r.team_id)).size}</b></div>
          <div class="fact"><small>Games</small><b>${games}</b></div>
          <div class="fact"><small>Career PPG</small><b>${fmt1(cPPG)}</b></div>
          <div class="fact"><small>Best rating</small><b>${best?.rating_mock ?? "–"} <span class="muted" style="font-size:12px">${best?.season ?? ""}</span></b></div>
        </div>
      </div>
    </div>
    <div class="card pad"><h3>Career timeline</h3>${timelineHtml(records)}${stintsHtml(records)}</div>
    ${played.length ? html`<div class="card pad">
      <div class="row"><h3 id="chart-title">${METRICS.rating.label}</h3><span class="spacer"></span>
        <div class="seg sm" id="metric" role="radiogroup" aria-label="Chart metric">${Object.entries(METRICS).map(([k, m], i) => `<button role="radio" aria-checked="${i === 0}" data-m="${k}" class="${i === 0 ? "on" : ""}">${k === "rating" ? "Rating" : k.toUpperCase()}</button>`).join("")}</div></div>
      <div class="chart-box" id="chart"></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Regular season only. Seasons with two teams combine both (per-game values weighted by games). Ratings are game-generated.</p>
    </div>` : ""}
    <div class="card pad"><h3>Season by season</h3>
      <div class="grid-wrap"><table class="stat-table">
        <thead><tr><th>Season</th><th>Team</th><th class="hide-sm">Age</th><th>Pos</th><th>GP</th><th class="hide-sm">MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th class="hide-sm">FG%</th><th class="hide-sm">3P%</th><th class="hide-sm">FT%</th><th class="hide-sm">VAL</th><th>Rating</th></tr></thead>
        <tbody>${records.map((r) => {
          const s = r.stats;
          return `<tr class="${`${r.season}|${r.team_id}` === bestKey ? "best" : ""}"><td>${r.season}</td>
            <td><i class="dot" style="background:${clubColors(r.team_id)[0]}"></i>${esc(teamName(r.team_id))}</td>
            <td class="hide-sm">${r.age ?? "–"}</td><td>${posPill(r.position)}</td>
            ${s ? `<td>${s.games}</td><td class="hide-sm">${fmt1(s.mpg)}</td><td>${fmt1(s.ppg)}</td><td>${fmt1(s.rpg)}</td><td>${fmt1(s.apg)}</td>
              <td class="hide-sm">${fmt1(s.fg_pct)}</td><td class="hide-sm">${fmt1(s.fg3_pct)}</td><td class="hide-sm">${fmt1(s.ft_pct)}</td><td class="hide-sm">${fmt1(s.valuation_per_game)}</td>`
              : `<td colspan="9" class="muted" style="text-align:left">${r.season === db.metadata.current_season ? "season not started" : "no regular-season games"}</td>`}
            <td class="rating">${s ? r.rating_mock : "–"}</td></tr>`;
        }).join("")}</tbody></table></div>
    </div>
    ${euroleagueHtml(pid)}
  </div>`;
}

/** The player's EuroLeague years (separate competition data), if any. */
function euroleagueHtml(pid) {
  const rows = elCareer(pid);
  if (!rows.length) return "";
  const clubs = [...new Set(rows.map(([, t]) => t))];
  return html`<div class="card pad el-career"><div class="row"><h3 style="margin:0">${icon("globe")} EuroLeague career</h3><span class="spacer"></span>
      <a class="btn ghost sm" href="#/euroleague/player/${esc(pid)}">EuroLeague page ${icon("arrowRight", { size: 13 })}</a></div>
    <p class="muted" style="margin:6px 0 10px">${rows.length} season${rows.length === 1 ? "" : "s"} with ${clubs.length} club${clubs.length === 1 ? "" : "s"} in the EuroLeague, alongside the Winner League above.</p>
    <div class="el-years">${rows.map(([season, tid]) => `<a class="el-year" href="#/euroleague/club/${tid}/${season}" style="--club:${clubColors(tid)[0]}">${crestSvg(tid, teamName(tid), 22)}<span><b>${season}</b><small>${esc(teamName(tid))}</small></span></a>`).join("")}</div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${esc(MOCK_NOTE)} Only seasons and clubs are shown here.</p></div>`;
}

/** Wires the chart (metric switch, hover crosshair + tooltip) inside a rendered profile. */
export function wireProfile(root, pid) {
  const box = root.querySelector("#chart");
  if (!box) return;
  const records = H.getPlayerCareer(pid);
  const series = seasonSeries(records);
  const first = SEASONS.indexOf(records[0].season), last = SEASONS.indexOf(records[records.length - 1].season);
  const seasons = SEASONS.slice(first, last + 1);
  let metric = "rating";
  const draw = () => {
    box.innerHTML = chartSvg(series, metric, first, last) + `<div class="chart-tip" hidden></div>`;
    const tip = box.querySelector(".chart-tip"), cross = box.querySelector("#cross"), svg = box.querySelector("svg");
    box.querySelectorAll(".hit").forEach((h) => {
      const show = () => {
        const i = Number(h.dataset.i), e = series.get(seasons[i]);
        const cx = Number(h.getAttribute("x")) + Number(h.getAttribute("width")) / 2;
        cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
        const scale = svg.getBoundingClientRect().width / 800;
        tip.hidden = false;
        tip.innerHTML = `<div class="muted">${seasons[i]} · ${esc(e.teams.join(" / "))}</div><b>${METRICS[metric].fmt(e[metric])}</b> ${METRICS[metric].label.toLowerCase()} · ${e.games} games`;
        // keep the tooltip inside the chart: anchor left/right near the edges
        const boxW = box.clientWidth, half = tip.offsetWidth / 2, px = cx * scale;
        const left = Math.min(Math.max(px, half + 4), boxW - half - 4);
        tip.style.left = `${left}px`;
        tip.style.top = `${40 * scale}px`;
      };
      h.addEventListener("mouseenter", show);
      h.addEventListener("click", show);
    });
    svg.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  };
  root.querySelector("#metric").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    metric = b.dataset.m;
    root.querySelectorAll("#metric button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
    root.querySelector("#chart-title").textContent = METRICS[metric].label;
    draw();
  });
  draw();
}

let dialog = null;
export function openProfile(pid, { reuseEntry = false } = {}) {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "profile-modal";
    dialog.setAttribute("aria-label", "Player profile");
    dialog.addEventListener("click", (e) => { if (e.target === dialog) closeModal(dialog); });
    document.body.appendChild(dialog);
  }
  dialog.innerHTML = `<button class="icon-btn profile-close" aria-label="Close profile">${icon("close", { size: 18 })}</button>
    <div class="row" style="padding:14px 22px 0"><a class="btn ghost" href="#/player/${pid}" data-close-nav>${icon("arrowRight", { size: 15 })} Open as page</a><button class="btn ghost" data-copy>${icon("link", { size: 15 })} Copy link</button><a class="btn ghost" href="#/compare?a=${pid}" data-compare>${icon("users", { size: 15 })} Compare</a></div>${profileHtml(pid)}`;
  dialog.querySelector(".profile-close").addEventListener("click", () => closeModal(dialog));
  dialog.querySelector("[data-close-nav]").addEventListener("click", (e) => { e.preventDefault(); closeSilently(dialog); location.replace(`#/player/${pid}`); });
  dialog.querySelector("[data-copy]").addEventListener("click", () => copyLink(`#/player/${pid}`));
  dialog.querySelector("[data-compare]").addEventListener("click", (e) => { e.preventDefault(); closeSilently(dialog); location.replace(`#/compare?a=${pid}`); });
  logActivity("profile:view", { pid });
  openModal(dialog, { reuseEntry });
  dialog.scrollTop = 0;
  wireProfile(dialog, pid);
  dialog.querySelector(".profile-close").focus();
}

export function renderProfilePage(root, signal, params = []) {
  const pid = decodeURIComponent(params[0] || "");
  root.innerHTML = `<a class="back" href="#/">← Home</a>${profileHtml(pid)}`;
  wireProfile(root, pid);
}
