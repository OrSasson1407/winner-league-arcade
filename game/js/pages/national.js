// National teams (#/nt): the FIBA world ranking 1-70 with each team's 2025 roster, Israel's national team,
// and the national-team players connected to the Winner League. Rosters only: no statistics, no ratings.
import { esc, html, store } from "../ui.js";
import { teamName, careerSummary } from "../data.js";
import { icon } from "../lib/icons.js";
import { fmtHeight } from "../lib/units.js";
import { dateLocale } from "../i18n/index.js";
import { nameLink } from "../components/playerCard.js";
import { NT_NOTE, NT_RANKING_DATE, NT_TEAMS, ZONES, loadNational, ntTeam, splitClub, wlOfNt } from "../national.js";

const ageOf = (p) => (p?.birth_date ? Math.floor((Date.parse(NT_RANKING_DATE) - Date.parse(p.birth_date)) / 3.15576e10) : null);
const rankDate = new Date(NT_RANKING_DATE).toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" });
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** A national team's mark: its FIBA code on a simple badge (not an official logo or flag). */
export function ntBadge(t, size = 36) {
  let h = 0; for (const ch of t.code) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="nt-badge" data-no-tr style="--h:${h};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.32)}px" aria-hidden="true">${esc(t.code)}</span>`;
}
const playerCell = (N, row) => {
  const wl = wlOfNt(row.p.player_id), name = N.name(row.p.player_id);
  return wl ? nameLink(wl, name) : esc(name);
};

export function renderNational(root, signal, params = []) {
  root.innerHTML = `<div class="card pad"><p class="muted">Loading the national-team rosters…</p></div>`;
  root.setAttribute("aria-busy", "true");
  loadNational().then((N) => {
    if (signal.aborted) return;
    root.removeAttribute("aria-busy");
    const t = params[0] && ntTeam(params[0]);
    if (params[0] && !t) { root.innerHTML = `<div class="card pad empty-state"><b>National team not found</b><a class="btn" href="#/nt">All national teams</a></div>`; return; }
    t ? drawTeam(root, signal, N, t) : drawIndex(root, signal, N);
  }).catch((err) => {
    console.error(err);
    root.removeAttribute("aria-busy");
    root.innerHTML = `<div class="card pad empty-state"><b>The national-team data didn't load</b><small class="muted">Check your connection and try again.</small></div>`;
  });
}

// ---------------------------------------------------------------- the ranking
function drawIndex(root, signal, N) {
  let zone = store.get("nt:zone", "all"), q = "";
  const isr = ntTeam("national_israel");
  const inIsrael = N.atClubsIn("ISR").sort((a, b) => ntTeam(a.team).rank - ntTeam(b.team).rank);
  const fromLeague = NT_TEAMS.flatMap((tm) => N.roster(tm.id).filter((r) => wlOfNt(r.p.player_id)).map((r) => ({ ...r, team: tm.id })));
  const stats = (tm) => { const r = N.roster(tm.id); return { n: r.length, h: avg(r.map((x) => x.p.height_cm).filter(Boolean)), wl: r.filter((x) => wlOfNt(x.p.player_id) || splitClub(x.p.current_club).country === "ISR").length }; };
  const draw = () => {
    const list = NT_TEAMS.filter((tm) => (zone === "all" || tm.zone === zone) && (!q || tm.name.toLowerCase().includes(q) || tm.code.toLowerCase().includes(q)));
    root.querySelector("#nt-rows").innerHTML = list.map((tm) => { const s = stats(tm); return `<tr class="${tm.id === "national_israel" ? "nt-isr" : ""}"><td class="led">${tm.rank}</td>
      <td><a class="nt-team" href="#/nt/${tm.id}">${ntBadge(tm, 28)}<b>${esc(tm.name)}</b></a></td><td>${ZONES[tm.zone] || "–"}</td><td>${s.n}</td><td>${s.h ? fmtHeight(Math.round(s.h)) : "–"}</td><td>${s.wl || ""}</td></tr>`; }).join("")
      || `<tr><td colspan="6" class="muted">No national team matches.</td></tr>`;
    root.querySelectorAll("#nt-zone [data-z]").forEach((b) => { const on = b.dataset.z === zone; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
  };
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("globe", { size: 30 })} National teams</h1>
      <p>The 70 highest-ranked men's national teams in the FIBA world ranking (${rankDate}), with their 2025 rosters.</p></div>
      <a class="btn primary" href="#/nt/national_israel">${ntBadge(isr, 22)} Israel · #${isr.rank}</a></div>
    <div class="card pad">
      <div class="row" style="flex-wrap:wrap;gap:10px;margin-bottom:10px">
        <div class="seg sm" id="nt-zone" role="radiogroup" aria-label="Zone">${[["all", "All"], ...Object.entries(ZONES)].map(([k, l]) => `<button role="radio" data-z="${k}">${l}</button>`).join("")}</div>
        <input class="input" id="nt-q" type="search" placeholder="Find a country…" aria-label="Find a country" style="max-width:220px">
      </div>
      <div class="grid-wrap"><table class="stat-table nt-table"><thead><tr><th>Rank</th><th>National team</th><th>Zone</th><th>Players</th><th>Avg height</th><th title="Players who play in Israel now or played in the Winner League">Winner League link</th></tr></thead><tbody id="nt-rows"></tbody></table></div>
    </div>
    <h2 class="nt-h2">${icon("shield")} National-team players in our league</h2>
    <div class="mc-grid">
      <div class="card pad"><h3>Playing in Israel now</h3><p class="muted" style="font-size:13px;margin-top:0">At an Israeli club according to their 2025 roster report.</p>
        <ul class="clean nt-list">${inIsrael.map((r) => { const tm = ntTeam(r.team); return `<li>${ntBadge(tm, 24)}<span><b>${playerCell(N, r)}</b><small class="muted">${esc(tm.name)} · ${esc(splitClub(r.p.current_club).club)}</small></span></li>`; }).join("")}</ul></div>
      <div class="card pad"><h3>Played in the Winner League</h3><p class="muted" style="font-size:13px;margin-top:0">National-team players with Winner League seasons since 2010-11.</p>
        <ul class="clean nt-list">${fromLeague.sort((a, b) => ntTeam(a.team).rank - ntTeam(b.team).rank).map((r) => { const tm = ntTeam(r.team), cs = careerSummary(wlOfNt(r.p.player_id));
          return `<li>${ntBadge(tm, 24)}<span><b>${playerCell(N, r)}</b><small class="muted"><span>${esc(tm.name)}</span> · <span>${cs.seasonsPlayed === 1 ? "1 Winner League season" : `${cs.seasonsPlayed} Winner League seasons`}</span>${cs.lastTeam ? ` · <span>Last at ${esc(teamName(cs.lastTeam))}</span>` : ""}</small></span></li>`; }).join("")}</ul></div>
    </div>
    <p class="muted nt-note">${esc(NT_NOTE)}</p>`;
  root.querySelector("#nt-zone").addEventListener("click", (e) => { const b = e.target.closest("[data-z]"); if (b) { zone = b.dataset.z; store.set("nt:zone", zone); draw(); } }, { signal });
  root.querySelector("#nt-q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); draw(); }, { signal });
  draw();
}

// ---------------------------------------------------------------- one national team
function drawTeam(root, signal, N, t) {
  const roster = N.roster(t.id);
  const hs = roster.map((r) => r.p.height_cm).filter(Boolean), ages = roster.map((r) => ageOf(r.p)).filter((a) => a != null);
  const comps = [...new Set(roster.flatMap((r) => r.comps))];
  const tallest = roster.filter((r) => r.p.height_cm).sort((a, b) => b.p.height_cm - a.p.height_cm)[0];
  const youngest = roster.filter((r) => ageOf(r.p) != null).sort((a, b) => ageOf(a.p) - ageOf(b.p))[0];
  // where the players play: countries of their clubs
  const where = {};
  for (const r of roster) { const c = splitClub(r.p.current_club).country || "?"; where[c] = (where[c] || 0) + 1; }
  const near = NT_TEAMS.filter((x) => Math.abs(x.rank - t.rank) <= 3);
  const linked = roster.filter((r) => wlOfNt(r.p.player_id));
  const isIsrael = t.id === "national_israel";
  root.innerHTML = html`<div class="game-head"><div><a class="back" href="#/nt">← National teams</a>
      <div class="nt-title">${ntBadge(t, 52)}<h1>${esc(t.name)}</h1></div>
      <p><b>#${t.rank}</b> in the FIBA world ranking (${rankDate}) · ${ZONES[t.zone] || ""}</p></div></div>
    <div class="facts nt-facts">
      <div class="fact"><small>World rank</small><b>#${t.rank}</b></div>
      <div class="fact"><small>Players in 2025</small><b>${roster.length}</b></div>
      <div class="fact"><small>Average height</small><b>${hs.length ? fmtHeight(Math.round(avg(hs))) : "–"}</b></div>
      <div class="fact"><small>Average age</small><b>${ages.length ? Math.round(avg(ages) * 10) / 10 : "–"}</b></div>
      <div class="fact"><small>Tallest</small><b>${tallest ? `${esc(N.name(tallest.p.player_id))} · ${fmtHeight(tallest.p.height_cm)}` : "–"}</b></div>
      <div class="fact"><small>Youngest</small><b>${youngest ? `${esc(N.name(youngest.p.player_id))} · ${ageOf(youngest.p)}` : "–"}</b></div>
    </div>
    ${isIsrael ? html`<div class="card pad nt-isr-card"><h2>${icon("shield")} Israel and the Winner League</h2>
      <p class="muted" style="margin-top:0"><span>${linked.length} of the ${roster.length} players have Winner League seasons in the arcade's data.</span>${roster.filter((r) => splitClub(r.p.current_club).country === "ISR").length ? ` <span>${roster.filter((r) => splitClub(r.p.current_club).country === "ISR").length} play in Israel now.</span>` : ""}</p>
      <ul class="clean nt-list">${linked.map((r) => { const pid = wlOfNt(r.p.player_id), cs = careerSummary(pid);
        return `<li><span><b>${nameLink(pid, N.name(r.p.player_id))}</b><small class="muted"><span>${cs.seasonsPlayed === 1 ? "1 season" : `${cs.seasonsPlayed} seasons`}</span> · <span>${cs.totalGames} games</span> · <span>${cs.teams.map((x) => esc(teamName(x))).slice(0, 3).join(", ")}${cs.teams.length > 3 ? "…" : ""}</span></small></span></li>`; }).join("")}</ul></div>` : ""}
    <div class="card pad">
      <h2 style="margin-top:0">${icon("users")} Roster · 2025</h2>
      <p class="muted" style="font-size:13px;margin-top:0">${comps.map(esc).join(" · ")}</p>
      <div class="grid-wrap"><table class="stat-table nt-roster"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Height</th><th>Age</th><th>Club</th></tr></thead>
        <tbody>${roster.map((r) => { const c = splitClub(r.p.current_club);
          return `<tr><td>${r.jersey ?? ""}</td><td>${playerCell(N, r)}${wlOfNt(r.p.player_id) ? ` <span class="pill nt-wl" title="Has Winner League seasons">WL</span>` : ""}</td><td>${esc(r.pos || "–")}</td><td>${r.p.height_cm ? fmtHeight(r.p.height_cm) : "–"}</td><td>${ageOf(r.p) ?? "–"}</td>
            <td>${esc(c.club || "–")}${c.country ? ` <small class="muted">${esc(c.country)}</small>` : ""}</td></tr>`; }).join("")}</tbody></table></div>
    </div>
    <div class="mc-grid">
      <div class="card pad"><h3>${icon("globe")} Where they play</h3><p class="muted" style="font-size:13px;margin-top:0">Country of each player's club in the roster report.</p>
        <ul class="clean nt-where">${Object.entries(where).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<li><b>${c === "?" ? "Unknown" : esc(c)}</b><span class="progress"><i style="width:${(n / roster.length) * 100}%"></i></span><span>${n}</span></li>`).join("")}</ul></div>
      <div class="card pad"><h3>${icon("chart")} Around them in the ranking</h3>
        <ul class="clean nt-list">${near.map((x) => `<li class="${x.id === t.id ? "on" : ""}"><span class="led">#${x.rank}</span>${ntBadge(x, 24)}${x.id === t.id ? `<b>${esc(x.name)}</b>` : `<a href="#/nt/${x.id}">${esc(x.name)}</a>`}</li>`).join("")}</ul></div>
    </div>
    <p class="muted nt-note">${esc(NT_NOTE)} Names follow the roster reports; players with Winner League seasons link to their league profile.</p>`;
}
