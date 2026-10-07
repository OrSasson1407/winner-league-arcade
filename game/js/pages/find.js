// Smart player search page (#/find/<question>): ask in plain English or Hebrew, see the filters it
// understood as chips (each one removable), and the players that match.
import { esc, html } from "../ui.js";
import { teamName } from "../data.js";
import { icon, crestSvg } from "../lib/icons.js";
import { nameLink } from "../components/playerCard.js";
import { fmtHeight } from "../lib/units.js";
import { announce } from "../lib/a11y.js";
import { getLang } from "../i18n/index.js";
import { parse, run } from "../lib/smartSearch.js";

const EXAMPLES = {
  en: ["Taller than 2.05 who played for Holon", "Israeli point guards born after 1995", "Centers with 8+ rebounds since 2018", "Played for Jerusalem and Eilat",
    "Foreign guards with 300+ games", "15+ points for Maccabi Tel Aviv", "Shorter than 1.85", "Number 23"],
  he: ["גבוהים מ-2.05 ששיחקו בחולון", "רכזים ישראלים שנולדו אחרי 1995", "סנטרים עם 8 ריבאונדים מאז 2018", "שיחקו בירושלים ובאילת",
    "גארדים זרים עם 300 משחקים", "15 נקודות במכבי תל אביב", "נמוכים מ-1.85", "מספר 23"],
};
const LIMIT = 200;

export function renderFind(root, signal, params = []) {
  let q = params[0] || "";
  root.innerHTML = html`<div class="game-head"><div><a class="back" href="#/players">← Players</a><h1>Smart search</h1>
      <p>Ask about players in plain words: height, position, clubs, seasons, nationality, birth year, averages, jersey.</p></div></div>
    <div class="card pad find-box">
      <label class="sr-only" for="find-q">Your question</label>
      <div class="find-input">${icon("search", { size: 20 })}<input id="find-q" class="input" type="search" autocomplete="off" placeholder="e.g. Israeli centers born after 1995" value="${esc(q)}"></div>
      <div class="find-chips" id="find-chips" aria-live="polite"></div>
      <div class="find-ex"><small class="muted">Try:</small> ${EXAMPLES[getLang() === "he" ? "he" : "en"].map((e) => `<button class="chip-btn" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div>
    </div>
    <div id="find-out"></div>`;
  const input = root.querySelector("#find-q"), chipsBox = root.querySelector("#find-chips"), out = root.querySelector("#find-out");

  function draw() {
    const { filters, chips, ignored } = parse(q);
    history.replaceState(null, "", q.trim() ? `#/find/${encodeURIComponent(q.trim())}` : "#/find");
    chipsBox.innerHTML = chips.map((c, i) => `<span class="find-chip">${esc(c.cm ? c.label.replace(/\d+ cm/, fmtHeight(c.cm)) : c.label)}<button data-rm="${i}" aria-label="Remove: ${esc(c.label)}">${icon("close", { size: 12 })}</button></span>`).join("")
      + (ignored.length ? `<small class="muted find-ign">Not understood: ${ignored.map(esc).join(", ")}</small>` : "");
    chipsBox.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const src = chips[Number(b.dataset.rm)].src;
      const i = q.toLowerCase().indexOf(src);
      q = (i >= 0 ? q.slice(0, i) + q.slice(i + src.length) : q).replace(/\s{2,}/g, " ").trim();
      input.value = q; draw(); input.focus();
    }));
    if (!chips.length) {
      out.innerHTML = q.trim() ? `<div class="card pad empty-state">${icon("search", { size: 28 })}<b>Nothing to search by yet</b><small class="muted">Try a height, a position, a club, a season or a nationality: see the examples above.</small></div>` : "";
      return;
    }
    const rows = run(filters);
    const statK = filters.stats?.[0]?.k, statLabel = { ppg: "PPG", rpg: "RPG", apg: "APG", spg: "SPG", bpg: "BPG" }[statK];
    announce(`${rows.length} players`);
    out.innerHTML = rows.length ? html`<div class="card pad">
        <div class="row" style="justify-content:space-between"><b>${rows.length} players</b>${rows.length > LIMIT ? `<small class="muted">Showing the first ${LIMIT}</small>` : ""}</div>
        <div class="grid-wrap"><table class="stat-table find-table"><thead><tr><th>Player</th><th>Pos</th><th>Height</th><th>Born</th><th>Nationality</th><th>Seasons</th><th>Games</th>${statLabel ? `<th>Best ${statLabel}</th>` : ""}<th>Clubs</th></tr></thead>
        <tbody>${rows.slice(0, LIMIT).map(({ p, cs, stat }) => `<tr><td>${nameLink(p.player_id, p.name)}</td><td>${esc(p.primary_position || "–")}</td><td>${fmtHeight(p.height_cm)}</td>
          <td>${p.birth_date ? p.birth_date.slice(0, 4) : "–"}</td><td><small>${esc((p.nationalities || []).join(" / ") || "–")}</small></td>
          <td>${cs.seasonsPlayed}</td><td>${cs.totalGames}</td>${statLabel ? `<td><b>${stat}</b></td>` : ""}
          <td class="find-crests">${cs.teams.slice(0, 5).map((t) => `<span title="${esc(teamName(t))}">${crestSvg(t, teamName(t), 22)}</span>`).join("")}${cs.teams.length > 5 ? `<small class="muted">+${cs.teams.length - 5}</small>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`
      : `<div class="card pad empty-state">${icon("search", { size: 28 })}<b>No players match all of that</b><small class="muted">Remove a filter above or loosen a number.</small></div>`;
  }

  let t = 0;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { q = input.value; draw(); }, 250); }, { signal });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(t); q = input.value; draw(); } }, { signal });
  root.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { q = b.dataset.ex; input.value = q; draw(); }, { signal }));
  draw();
  if (!q) input.focus();
}
