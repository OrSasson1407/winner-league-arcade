// Daily challenges hub (#/daily): today's four puzzles, your streak and the last four weeks.
import { DAILY_GAMES, addDays, dailyLink, dailyStats, dailyStreak, todayStatus } from "../lib/daily.js";
import { icon } from "../lib/icons.js";
import { esc, html, localDate, store } from "../ui.js";

export function renderDaily(root) {
  const today = localDate();
  const done = todayStatus();
  const streak = dailyStreak();
  const s = dailyStats();
  const count = Object.keys(done).length;
  const L = store.get("daily:log", {});
  // last 28 days, oldest first, aligned so each row is a week
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  root.innerHTML = html`
    <div class="game-head"><div><a class="back" href="#/">← Home</a><h1>${icon("calendar", { size: 30 })} Daily challenges</h1>
      <p>Four puzzles every day, the same for everyone. Your first try counts. Finish at least one a day to keep your streak.</p></div></div>
    <div class="daily-top">
      <div class="card pad daily-streak ${streak ? "hot" : ""}"><span class="ds-flame">🔥</span><div><b class="led">${streak}</b><span>day streak</span></div>
        <small class="muted">Best ${Math.max(s.best, streak)} · ${s.total} finished · ${s.fullDays} full house${s.fullDays === 1 ? "" : "s"}</small></div>
      <div class="card pad daily-today"><small class="muted">TODAY · ${today}</small><b class="led">${count}/4</b>
        <div class="progress"><i style="width:${count * 25}%"></i></div>
        <small class="muted">${count >= 4 ? "Full house! See you tomorrow." : count ? "Keep going: finish all 4 for a Full House." : "New puzzles every day at midnight."}</small></div>
    </div>
    <div class="daily-grid">${Object.entries(DAILY_GAMES).map(([k, g]) => html`
      <a class="card daily-card ${done[k] ? "done" : ""}" href="${dailyLink(k)}">
        <span class="dc-ic">${icon(done[k] ? "check" : g.ic, { size: 26 })}</span>
        <div><b>${g.name}</b><small class="muted">${done[k] ? `Done: ${esc(done[k])}` : g.rules}</small></div>
        <span class="btn ${done[k] ? "ghost" : "primary"}">${done[k] ? "Replay" : "Play"}</span>
      </a>`).join("")}</div>
    <div class="card pad">
      <h3>${icon("clock")} Last 4 weeks</h3>
      <div class="daily-cal" role="img" aria-label="Daily challenges finished over the last 28 days">${days.map((d) => {
        const n = Object.keys(L[d] || {}).length;
        return `<span class="dcal l${n} ${d === today ? "today" : ""}" title="${d}: ${n}/4"></span>`;
      }).join("")}</div>
      <div class="dcal-legend muted"><span>0</span>${[0, 1, 2, 3, 4].map((n) => `<span class="dcal l${n}"></span>`).join("")}<span>4 of 4</span></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Daily banners (streaks of 7, 30 and 100 days and more) are in <a href="#/achievements?game=daily">Achievements</a>.</p>
    </div>`;
}
