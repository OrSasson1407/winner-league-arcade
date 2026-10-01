// Compare two players (#/compare?a=<id>&b=<id>): cards, career facts, a two-line chart, saved comparisons.
import { H, birthYear, careerSummary, db, namedPlayers, playersById, teamName } from "../data.js";
import { bestSeason, playerCard } from "../components/playerCard.js";
import { icon } from "../lib/icons.js";
import { autocomplete, copyLink, esc, fmt1, html, store, toast } from "../ui.js";

const SEASONS = db.metadata.season_list;
const METRICS = { rating: ["Game rating", (v) => String(Math.round(v))], ppg: ["Points per game", fmt1], rpg: ["Rebounds per game", fmt1], apg: ["Assists per game", fmt1] };
const SAVED_KEY = "compare:saved";

/** One point per season (multi-team seasons combined, per-game values weighted by games). */
function series(pid) {
  const by = new Map();
  for (const r of H.getPlayerCareer(pid)) {
    if (!r.stats || !r.appeared_in_regular_season) continue;
    const e = by.get(r.season) || { season: r.season, games: 0, rating: 0, ppg: 0, rpg: 0, apg: 0, age: r.age };
    for (const k of ["ppg", "rpg", "apg"]) e[k] += (r.stats[k] ?? 0) * r.stats.games;
    e.games += r.stats.games;
    e.rating = Math.max(e.rating, r.rating_mock);
    by.set(r.season, e);
  }
  for (const e of by.values()) for (const k of ["ppg", "rpg", "apg"]) e[k] /= e.games || 1;
  return [...by.values()];
}

function facts(pid) {
  const p = playersById.get(pid), cs = careerSummary(pid);
  const games = cs.played.reduce((a, r) => a + r.stats.games, 0);
  const w = (k) => (games ? cs.played.reduce((a, r) => a + (r.stats[k] ?? 0) * r.stats.games, 0) / games : null);
  return { seasons: cs.seasonsPlayed, games, ppg: w("ppg"), rpg: w("rpg"), apg: w("apg"), best: cs.bestRating, height: p.height_cm, clubs: cs.teams.length, born: birthYear(p) };
}

const ROWS = [
  ["seasons", "Seasons", (v) => v, true], ["games", "Games", (v) => v, true], ["ppg", "Career PPG", fmt1, true], ["rpg", "Career RPG", fmt1, true],
  ["apg", "Career APG", fmt1, true], ["best", "Peak rating", (v) => v, true], ["clubs", "Clubs", (v) => v, null], ["height", "Height (cm)", (v) => v ?? "–", null], ["born", "Born", (v) => v ?? "–", null],
];

function chartSvg(sa, sb, metric, byAge) {
  const W = 800, Hh = 280, L = 44, R = 90, T = 18, B = 34;
  const xs = byAge ? [...new Set([...sa, ...sb].map((e) => e.age).filter((a) => a !== null && a !== undefined))].sort((a, b) => a - b)
    : SEASONS.filter((s) => sa.some((e) => e.season === s) || sb.some((e) => e.season === s));
  if (!xs.length) return `<p class="muted">No regular-season data to chart.</p>`;
  const lo = byAge ? xs[0] : SEASONS.indexOf(xs[0]), hi = byAge ? xs[xs.length - 1] : SEASONS.indexOf(xs[xs.length - 1]);
  const pos = (e) => (byAge ? e.age : SEASONS.indexOf(e.season));
  const vals = [...sa, ...sb].map((e) => e[metric]);
  let [y0, y1] = metric === "rating" ? [Math.min(55, Math.floor(Math.min(...vals) / 5) * 5), 100] : [0, Math.max(4, Math.ceil((Math.max(...vals) * 1.15) / 2) * 2)];
  const x = (v) => L + (hi === lo ? (W - L - R) / 2 : ((v - lo) * (W - L - R)) / (hi - lo));
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (Hh - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const fmt = METRICS[metric][1];
  const line = (s) => {
    const pts = s.filter((e) => pos(e) !== null && pos(e) !== undefined && pos(e) >= 0).sort((a, b) => pos(a) - pos(b));
    let d = "", prev = null;
    for (const e of pts) { d += `${prev !== null && pos(e) - prev === 1 ? "L" : "M"}${x(pos(e)).toFixed(1)},${y(e[metric]).toFixed(1)}`; prev = pos(e); }
    return { d, pts };
  };
  const A = line(sa), Bl = line(sb);
  const labels = [];
  for (let v = lo; v <= hi; v++) {
    const step = hi - lo > 12 ? 2 : 1;
    if ((v - lo) % step === 0 || v === hi) labels.push(`<text class="axis-label" x="${x(v)}" y="${Hh - 10}" text-anchor="middle">${byAge ? v : SEASONS[v].slice(2)}</text>`);
  }
  const endLabel = (o, cls, nm) => o.pts.length ? `<text class="end-label ${cls}" x="${x(pos(o.pts[o.pts.length - 1])) + 8}" y="${y(o.pts[o.pts.length - 1][metric]) + 4}">${esc(nm.split(" ").slice(-1)[0])}</text>` : "";
  const hits = [];
  for (let v = lo; v <= hi; v++) hits.push(`<rect class="hit" data-x="${v}" x="${x(v) - (W - L - R) / Math.max(1, hi - lo) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, hi - lo)}" height="${Hh - T - B}"/>`);
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${METRICS[metric][0]} comparison">
    ${ticks.map((t) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("")}
    ${labels.join("")}
    <line class="cross" id="cmp-cross" x1="0" x2="0" y1="${T}" y2="${Hh - B}" visibility="hidden"/>
    <path class="series sa" d="${A.d}"/><path class="series sb" d="${Bl.d}"/>
    ${A.pts.map((e) => `<circle class="marker ma" cx="${x(pos(e))}" cy="${y(e[metric])}" r="5"/>`).join("")}
    ${Bl.pts.map((e) => `<circle class="marker mb" cx="${x(pos(e))}" cy="${y(e[metric])}" r="5"/>`).join("")}
    ${endLabel(A, "la", playersById.get(sa.pid)?.name || "")}${endLabel(Bl, "lb", playersById.get(sb.pid)?.name || "")}
    ${hits.join("")}
  </svg>`;
}

export function renderCompare(root, signal, params, query = {}) {
  let a = playersById.get(query.a)?.name ? query.a : null;
  let b = playersById.get(query.b)?.name ? query.b : null;
  let metric = "rating", byAge = false;
  const items = namedPlayers.map((p) => {
    const cs = careerSummary(p.player_id);
    return { id: p.player_id, label: p.name, sub: `${teamName(cs.lastTeam)} · ${cs.firstSeason.slice(0, 4)}–${cs.lastSeason.slice(5)}` };
  });

  function syncUrl() {
    const qs = new URLSearchParams(Object.entries({ a, b }).filter(([, v]) => v)).toString();
    history.replaceState(history.state, "", "#/compare" + (qs ? "?" + qs : ""));
  }

  function draw() {
    syncUrl();
    const saved = store.get(SAVED_KEY, []);
    const pa = a && playersById.get(a), pb = b && playersById.get(b);
    const picker = (which, p) => `<div class="cmp-pick ${which}">
      <div class="guess-input search">${icon("search", { size: 18, cls: "search-ic" })}<input class="input" id="pick-${which}" placeholder="${p ? esc(p.name) : `Choose player ${which.toUpperCase()}…`}" autocomplete="off" aria-label="Choose player ${which.toUpperCase()}"></div>
      ${p ? playerCard(bestSeason(careerSummary(p.player_id).records), { size: "lg" }) : `<div class="cmp-empty">${icon("user", { size: 40 })}<span>Pick a player</span></div>`}
    </div>`;
    const isSaved = a && b && saved.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a));
    let body = "";
    if (pa && pb) {
      const fa = facts(a), fb = facts(b);
      const sa = Object.assign(series(a), { pid: a }), sb = Object.assign(series(b), { pid: b });
      body = html`
        <div class="card pad"><h3>${icon("chart")} Career numbers</h3>
          <div class="grid-wrap"><table class="stat-table cmp-table"><thead><tr><th>${esc(pa.name)}</th><th></th><th>${esc(pb.name)}</th></tr></thead>
          <tbody>${ROWS.map(([k, label, f, higherBetter]) => {
            const va = fa[k], vb = fb[k];
            const win = higherBetter && va !== null && vb !== null && va !== vb ? (va > vb ? "a" : "b") : "";
            return `<tr><td class="${win === "a" ? "win" : ""}">${f(va) ?? "–"}</td><th>${label}</th><td class="${win === "b" ? "win" : ""}">${f(vb) ?? "–"}</td></tr>`;
          }).join("")}</tbody></table></div>
          <p class="muted" style="font-size:12px;margin:8px 0 0">Regular season since 2010-11. Highlighted = the better number.</p>
        </div>
        <div class="card pad">
          <div class="row"><h3 id="cmp-title">${METRICS[metric][0]}</h3><span class="spacer"></span>
            <div class="seg sm" id="cmp-axis" role="radiogroup" aria-label="X axis">${[["season", "By season"], ["age", "By age"]].map(([k, l]) => `<button role="radio" aria-checked="${(k === "age") === byAge}" data-v="${k}" class="${(k === "age") === byAge ? "on" : ""}">${l}</button>`).join("")}</div>
            <div class="seg sm" id="cmp-metric" role="radiogroup" aria-label="Metric">${Object.keys(METRICS).map((k) => `<button role="radio" aria-checked="${k === metric}" data-v="${k}" class="${k === metric ? "on" : ""}">${k === "rating" ? "Rating" : k.toUpperCase()}</button>`).join("")}</div></div>
          <div class="cmp-legend"><span><i class="la"></i>${esc(pa.name)}</span><span><i class="lb"></i>${esc(pb.name)}</span></div>
          <div class="chart-box cmp-chart" id="cmp-chart">${chartSvg(sa, sb, metric, byAge)}<div class="chart-tip" hidden></div></div>
        </div>`;
      setTimeout(() => wireChart(sa, sb), 0);
    }
    root.innerHTML = html`
      <div class="game-head"><div><h1>${icon("users", { size: 30 })} Compare players</h1><p>Pick two players to put their careers side by side.</p></div>
        <div class="row">${a && b ? `<button class="btn ghost" id="save">${icon("star", { size: 15 })} ${isSaved ? "Saved" : "Save comparison"}</button><button class="btn ghost" id="share">${icon("link", { size: 15 })} Copy link</button>` : ""}</div></div>
      ${saved.length ? `<div class="saved-cmp">${saved.map((s, i) => `<span class="chip-saved"><a href="#/compare?a=${s.a}&b=${s.b}">${esc(playersById.get(s.a)?.name || s.a)} <b>vs</b> ${esc(playersById.get(s.b)?.name || s.b)}</a><button data-del="${i}" aria-label="Remove saved comparison">${icon("close", { size: 12 })}</button></span>`).join("")}</div>` : ""}
      <div class="cmp-head">${picker("a", pa)}<div class="cmp-vs led">VS</div>${picker("b", pb)}</div>
      <div class="cmp-body">${body || `<div class="card pad empty-state">${icon("users", { size: 30 })}<b>Choose two players to compare</b><span class="muted">Tip: open any player's profile and press “Compare”.</span></div>`}</div>`;
    autocomplete(root.querySelector("#pick-a"), items, (it) => { a = it.id; draw(); }, { signal });
    autocomplete(root.querySelector("#pick-b"), items, (it) => { b = it.id; draw(); }, { signal });
    root.querySelector("#cmp-metric")?.addEventListener("click", (e) => { const t = e.target.closest("[data-v]"); if (t) { metric = t.dataset.v; draw(); } }, { signal });
    root.querySelector("#cmp-axis")?.addEventListener("click", (e) => { const t = e.target.closest("[data-v]"); if (t) { byAge = t.dataset.v === "age"; draw(); } }, { signal });
    root.querySelector("#share")?.addEventListener("click", () => copyLink(location.hash), { signal });
    root.querySelector("#save")?.addEventListener("click", () => {
      const list = store.get(SAVED_KEY, []);
      if (!isSaved) { list.unshift({ a, b }); store.set(SAVED_KEY, list.slice(0, 12)); toast("Comparison saved"); }
      draw();
    }, { signal });
    root.querySelector(".saved-cmp")?.addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]"); if (!d) return;
      e.preventDefault();
      const list = store.get(SAVED_KEY, []); list.splice(Number(d.dataset.del), 1); store.set(SAVED_KEY, list); draw();
    }, { signal });
  }

  function wireChart(sa, sb) {
    const box = root.querySelector("#cmp-chart");
    if (!box) return;
    const svg = box.querySelector("svg"), tip = box.querySelector(".chart-tip"), cross = box.querySelector("#cmp-cross");
    if (!svg) return;
    const key = (e) => (byAge ? e.age : e.season);
    box.querySelectorAll(".hit").forEach((h) => {
      const show = () => {
        const xv = byAge ? Number(h.dataset.x) : SEASONS[Number(h.dataset.x)];
        const ea = sa.find((e) => key(e) === xv), eb = sb.find((e) => key(e) === xv);
        const cx = Number(h.getAttribute("x")) + Number(h.getAttribute("width")) / 2;
        cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
        const f = METRICS[metric][1];
        tip.hidden = false;
        tip.innerHTML = `<div class="muted">${byAge ? `Age ${xv}` : xv}</div>
          <div><i class="dot la-bg"></i>${esc(playersById.get(a).name)}: <b>${ea ? f(ea[metric]) : "–"}</b></div>
          <div><i class="dot lb-bg"></i>${esc(playersById.get(b).name)}: <b>${eb ? f(eb[metric]) : "–"}</b></div>`;
        const scale = svg.getBoundingClientRect().width / 800, half = tip.offsetWidth / 2;
        tip.style.left = `${Math.min(Math.max(cx * scale, half + 4), box.clientWidth - half - 4)}px`;
        tip.style.top = `${40 * scale}px`;
      };
      h.addEventListener("mouseenter", show);
      h.addEventListener("click", show);
    });
    svg.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  }

  draw();
}
