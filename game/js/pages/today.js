// Today in the league (#/today): players born on this day, birthdays this week, and season
// flashbacks (5 / 10 / 15 years ago). The league data has birth dates but no game dates, so
// "today" means birthdays; flashbacks show the season that started that many years ago.
import { PLAYED_SEASONS, careerSummary, isPlayable, namedPlayers, playersById, teamName } from "../data.js";
import { bestSeason, nameLink, playerCard } from "../components/playerCard.js";
import { icon } from "../lib/icons.js";
import { deferred, esc, fmt1, html } from "../ui.js";
import { LEAGUE, db } from "../data.js";
import { EL_INDEX, EL_SEASONS } from "../euroleague.js";
import { crestSvg } from "../lib/icons.js";

const pad = (n) => String(n).padStart(2, "0");
const md = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Players born on a month-day (MM-DD), best careers first. */
export function bornOn(mmdd) {
  return namedPlayers.filter((p) => !p._mockBio && p.birth_date?.slice(5) === mmdd) // EuroLeague birth dates are placeholders
    .map((p) => ({ p, s: careerSummary(p.player_id) }))
    .filter((x) => x.s.played.length)
    .sort((a, b) => b.s.bestRating - a.s.bestRating || b.s.totalGames - a.s.totalGames);
}

const seasonAgo = (yearsAgo, now) => {
  const startYear = now.getFullYear() - yearsAgo - (now.getMonth() < 8 ? 1 : 0); // seasons start in the autumn
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
};
/** The EuroLeague that season: Israeli clubs and how many Winner League players took part (from the EuroLeague data). */
function elFlash(season) {
  if (LEAGUE === "nba" || !EL_SEASONS.includes(season)) return null; // the NBA choice: no EuroLeague asides
  return { season, clubs: (EL_INDEX.seasonTeams[season] || []).length, israeli: EL_INDEX.israeli[season] || [], wl: EL_INDEX.wlCount[season] || 0 };
}
const elLine = (e) => e ? `<div class="flash-el"><small class="muted">IN THE EUROLEAGUE</small>
  ${e.israeli.length ? e.israeli.map((x) => `<a href="#/euroleague/club/${x.team}/${e.season}">${crestSvg(x.team, teamName(x.team), 18)} ${esc(teamName(x.team))}</a> <span class="muted">${x.wl.length} of ${x.size} players also in the Winner League</span>`).join("<br>") : `<span class="muted">No Israeli club in the data that season.</span>`}
  <br><a href="#/euroleague/season/${e.season}" class="muted">${e.clubs} clubs · ${e.wl} Winner League players →</a></div>` : "";

function flashback(yearsAgo, now) {
  const season = seasonAgo(yearsAgo, now);
  if (!PLAYED_SEASONS.includes(season)) return null;
  const recs = db.player_seasons.filter((r) => r.season === season && isPlayable(r, 10));
  const top = (k) => recs.filter((r) => r.stats[k] != null).sort((a, b) => b.stats[k] - a.stats[k])[0];
  const best = recs.slice().sort((a, b) => b.rating_mock - a.rating_mock)[0];
  return { yearsAgo, season, scorer: top("ppg"), reb: top("rpg"), ast: top("apg"), best, teams: db.seasons.find((s) => s.season === season)?.teams.length };
}

export function renderToday(root, signal) {
  root.innerHTML = html`<div class="game-head"><div><h1>${icon("calendar", { size: 30 })} Today in the league</h1><p>Looking through the records…</p></div></div>`;
  deferred(signal, () => {
    const now = new Date();
    const today = bornOn(md(now));
    const week = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      for (const x of bornOn(md(d)).slice(0, 2)) week.push({ ...x, d });
    }
    const flash = [5, 10, 15].map((y) => flashback(y, now)).filter(Boolean);
    // before the Winner League data starts, the EuroLeague data still goes back further
    const elOnly = [20, 25].map((y) => ({ yearsAgo: y, el: elFlash(seasonAgo(y, now)) })).filter((x) => x.el);
    const age = (p, d = now) => d.getFullYear() - Number(p.birth_date.slice(0, 4));
    const line = (r, k, label) => r ? `<li><span class="muted">${label}</span> ${nameLink(r.player_id, playersById.get(r.player_id).name)} <b>${fmt1(r.stats[k])}</b> <small class="muted">${esc(teamName(r.team_id))}</small></li>` : "";
    root.innerHTML = html`
      <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>${icon("calendar", { size: 30 })} Today in the league</h1>
        <p>${now.getDate()} ${MONTHS[now.getMonth()]}: birthdays from the league records, and a look back at past seasons.</p></div></div>
      <div class="card pad">
        <h2 style="margin:0 0 12px">${icon("star")} Born on ${now.getDate()} ${MONTHS[now.getMonth()]}</h2>
        ${today.length ? html`<div class="card-grid browse today-grid">${today.slice(0, 12).map(({ p, s }) => {
          const b = bestSeason(s.records);
          return html`<div class="today-card">${b ? playerCard(b, { size: "sm", info: false, attrs: `data-profile="${p.player_id}" role="button" tabindex="0" aria-label="${esc(p.name)}: open profile"` }) : ""}
            <div class="today-age"><b>${age(p) >= 0 ? `Turns ${age(p)}` : ""}</b><small class="muted">${s.seasonsPlayed} season${s.seasonsPlayed === 1 ? "" : "s"} · ${s.teams.length} club${s.teams.length === 1 ? "" : "s"} · ${s.totalGames} GP</small></div></div>`;
        }).join("")}</div>${today.length > 12 ? `<p class="muted">…and ${today.length - 12} more.</p>` : ""}`
          : `<p class="muted">No league player in the records was born on this date. Here's who's coming up this week.</p>`}
      </div>
      <div class="today-cols">
        <div class="card pad"><h3>${icon("clock")} Birthdays this week</h3>
          ${week.length ? `<ul class="rank-list today-week">${week.map(({ p, d }) => `<li><span class="tw-date">${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</span>${nameLink(p.player_id, p.name)}<span class="muted">turns ${age(p, d)}</span></li>`).join("")}</ul>`
            : `<p class="muted">No birthdays in the next 7 days.</p>`}
        </div>
        ${flash.map((f) => html`<div class="card pad flash-card">
          <small class="muted">${f.yearsAgo} YEARS AGO</small>
          <h3><a href="#/season/${f.season}">${f.season} season</a></h3>
          <p class="muted" style="margin:0 0 8px">${f.teams} teams. The standouts:</p>
          <ul class="clean flash-list">
            ${f.best ? `<li><span class="muted">Top rated</span> ${nameLink(f.best.player_id, playersById.get(f.best.player_id).name)} <b>${f.best.rating_mock}</b> <small class="muted">${esc(teamName(f.best.team_id))}</small></li>` : ""}
            ${line(f.scorer, "ppg", "Points")}${line(f.reb, "rpg", "Rebounds")}${line(f.ast, "apg", "Assists")}
          </ul>
          ${elLine(elFlash(f.season))}
        </div>`).join("")}
        ${elOnly.map((x) => html`<div class="card pad flash-card">
          <small class="muted">${x.yearsAgo} YEARS AGO</small>
          <h3><a href="#/euroleague/season/${x.el.season}">EuroLeague ${x.el.season}</a></h3>
          <p class="muted" style="margin:0 0 8px">Before the Winner League records here begin.</p>
          ${elLine(x.el)}
        </div>`).join("")}
      </div>
      <p class="muted" style="font-size:12px">${LEAGUE === "wl" ? "Birth dates and stats come from the official league site (regular season, minimum 10 games for season leaders)." : "Regular-season stats, minimum 10 games for season leaders."}</p>`;
  });
}
