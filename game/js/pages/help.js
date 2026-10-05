// Help center: rules of every game, how ratings / chemistry / simulation work, data and privacy.
import { icon } from "../lib/icons.js";
import { shortcutsHtml } from "../lib/shortcuts.js";
import { html } from "../ui.js";
import { reducedMotion } from "../lib/settings.js";

const SECTIONS = [
  { id: "draft", ic: "trophy", title: "All-Time Draft", body: `
    <p>Build the best team in league history, one real roster at a time.</p>
    <ul>
      <li>Each round you get a random <b>team + season</b> (e.g. Hapoel Jerusalem 2016-17) and pick <b>one</b> player from that real roster.</li>
      <li>Place them in a slot: PG, SG, SF, PF, C, and the optional <b>6th man</b>. Out-of-position players lose points: secondary position −2, the next position −5, further −12 or more.</li>
      <li>The same real person can only be drafted once, even from a different season.</li>
      <li><b>Team score</b> = average slot rating (the 6th man counts 30%) + <b>chemistry</b>.</li>
      <li><b>Modes:</b> solo, vs the computer (Easy / Normal / Hard), or a draft room for 2–4 players on one screen with a snake order and an optional pick timer.</li>
      <li><b>Filters:</b> era, Club Legends (every spin is one club), Israelis only, salary cap (75 coins, better players cost more), blind mode (ratings hidden).</li>
      <li>Your draft saves after every pick. Use <i>Save &amp; exit</i> and resume later from the Draft screen.</li>
    </ul>` },
  { id: "guess", ic: "search", title: "Guess the Player", body: `
    <p>Find the mystery player in 8 tries. Each guess is compared with the answer across 11 columns: last team, position, height, birth year, nationality, jersey (most-worn number), first season, seasons, clubs, career PPG and peak rating.</p>
    <ul>
      <li><b>Green</b> = exact match. <b>Yellow</b> = close: height ±4 cm, born ±2 years, jersey ±2, career PPG ±2, peak rating ±3, ±1 season or club, an adjacent position, a shared nationality, or the answer played for that team.</li>
      <li>Arrows ↑ ↓ show whether the answer is higher or lower.</li>
      <li><b>Hint shop:</b> buy the first letter, the nationality, a club, or one season's stat line. Each hint uses up one of your 8 tries.</li>
      <li><b>Daily</b> = the same player for everyone each day. <b>Unlimited</b> = a new player every time. <b>Stars</b> limits answers to well-known players.</li>
      <li><b>Stats</b> shows games played, win %, streaks, hints used and your guess distribution.</li>
    </ul>` },
  { id: "higher-lower", ic: "chart", title: "Higher or Lower", body: `
    <p>Two real player-seasons: did the second have a higher or lower number (points, rebounds, assists, efficiency or game rating)? Ties count as correct.</p>
    <ul>
      <li><b>Classic:</b> one miss ends the streak. <b>3 Lives:</b> three misses end the game. <b>Time attack:</b> as many as you can in 60 seconds; a miss costs 3 seconds.</li>
      <li><b>Pairs:</b> random player-seasons, or <b>the same player</b> in two different seasons.</li>
      <li>Each combination keeps its own best score.</li>
    </ul>` },
  { id: "career", ic: "arrowRight", title: "Career Path", body: `
    <p>You see a player's journey season by season and choose the right name from 4 options. A correct answer is worth 3 points, or 2 if you used the hint. 10 rounds, 30 points maximum.</p>` },
  { id: "mycareer", ic: "jersey", title: "My Career", body: `
    <p>Create a player (position, height, type, skills) and start at 16 in a club academy: stay, or go on loan to another club's youth team for more minutes. At 18 you sign your first pro contract (pick an agent and negotiate: ask too much and the club walks away).</p>
    <p>Every season is played game by game against the real teams of that season: your teammates and opponents are the real rosters, and team strength comes from each club's real players. Your role (bench, rotation, starter) depends on how you rank on the roster and on the coach's trust, which rises with good games and the right choices in events between games. There's a State Cup, an All-Star game, best-of-three playoffs and end-of-season awards decided against the real players of that season.</p>
    <p>Training points from games buy skill points and badges; summer camps and a personal coach help too. You grow fast until about 24, peak around 27 and decline after 30. Injuries happen: rest fully, or rush back and risk losing athleticism. Career totals are ranked against the real all-time records since 2010-11, and at retirement a Hall of Fame score decides if you're in; six strong seasons at one club gets your jersey retired. Seasons after ${"2025-26"} are simulated from the latest real rosters.</p>
    <p><b>How minutes work:</b> you compete with the real players at your position group (guards, wings, bigs) on the depth chart. Coaches also want a basic level before giving real minutes. Foreign players: only ${5} foreigners get real minutes on a team (a simplified version of the league's rules), so a foreigner must beat the other foreigners; Israelis get a small edge in minutes and pay. Coach trust belongs to each club, losing teams fire coaches (the new coach re-evaluates you) and team chemistry grows with every game you play together. Your arrival changes the team's strength by what you add over the player you push down the depth chart.</p>
    <p><b>Games:</b> fouls are tracked (5 and you're out; foul trouble costs minutes). <b>Money</b> is in US dollars, with a simplified tax estimate and the agent's fee taken off. <b>Injuries</b> come from a table of real basketball injuries, from ankle sprains to torn ACLs and Achilles tendons (season-ending, with lasting effects); age makes recovery slower, and rushing back makes a repeat more likely.</p>` },
  { id: "connections", ic: "link", title: "Connections", body: `
    <p>16 players hide four groups of four: players from the same club or team-season, a stat (like 20+ points per game in a season), a height, a birth year or a jersey number. Select four and submit. Every player fits exactly one group, but many look like they fit two. Four mistakes and the groups are revealed. Colours go from easiest (yellow) to trickiest (purple). "Most often wore #" means the number a player wore in most of his seasons here.</p>` },
  { id: "grid", ic: "games", title: "The Grid", body: `
    <p>Each square needs a player who fits both its row and its column: a club, or an achievement like 8+ rebounds per game in a season (15+ games), 8+ seasons in the league or 2.05 m and taller. You have 9 guesses for 9 squares and can use each player once. Every square has at least three right answers. Rarity (0 to 100) rewards less obvious picks: it compares the player's games played with all the other right answers.</p>` },
  { id: "rating", ic: "star", title: "Ratings and card colours", body: `
    <p>The rating on each card (60–99) is <b>game-generated</b>, not an official league rating. It ranks every player-season against the others in the same season, using real efficiency (VAL) and points per game, with a small bonus for efficient shooting and a correction for players with very few games.</p>
    <ul><li>Card frames: <b>rainbow</b> legend 95+, <b>gold</b> 90+, <b>silver</b> 80+, <b>bronze</b> below 80.</li>
      <li>Position colours: <span class="pill pos pos-g">guards</span> <span class="pill pos pos-f">forwards</span> <span class="pill pos pos-c">center</span>. The label always shows the exact position.</li></ul>` },
  { id: "chemistry", ic: "link", title: "Chemistry", body: `
    <p>In the Draft, every pair of your players adds chemistry: <b>+1</b> if they were real teammates in the same season, <b>+0.5</b> if they played for the same club in different seasons. Maximum +5.</p>` },
  { id: "simulation", ic: "arena", title: "Season simulation", body: `
    <p>After a draft your team can join the real league of any season. Everyone plays everyone twice, the top 8 go to the playoffs (best-of-3 quarter-finals and semi-finals, then a one-game final). Real teams' strength comes from their real players that season. Results, box scores and live games are simulated: they're a game, not history.</p>` },
  { id: "levels", ic: "medal", title: "Levels, XP and frames", body: `
    <p>Every game earns XP: finishing a draft (more for a better team), winning a Guess game (more for fewer tries), every right answer in Higher or Lower, Career Path points, simulated titles, and every achievement (bronze 50, silver 100, gold 200, legend 500). Levels go from 1 (Walk-on) to 50 (League Legend), and your level shows on your avatar.</p>
    <p><b>Avatar frames</b> unlock with levels (5, 10, 20) and achievements (3 gold, a simulated title, 15 achievements, any legend). Equip them on your profile page.</p>` },
  { id: "online", ic: "globe", title: "Online 1v1", body: `
    <p>Play any of the four games against a real person. <b>Find a random opponent</b> matches you with whoever is waiting for the same game; <b>Invite a friend</b> gives you a 5-letter code and a link to send. The server runs the game, so both players see the same questions at the same time.</p>
    <ul>
      <li><b>Higher or Lower:</b> 15 rounds, 10 seconds each. 100 points for a right answer plus up to 50 for speed.</li>
      <li><b>Guess the Player:</b> the same mystery player for both, 8 tries, 3 minutes. Fewer tries wins; a tie goes to the faster player. You see your opponent's colors, never their guesses.</li>
      <li><b>Career Path:</b> 10 careers, 20 seconds each. The first right answer takes 3 points; a wrong answer locks you out of that round.</li>
      <li><b>All-Time Draft:</b> a snake draft from shared spins, 6 picks each (PG to C plus a sixth man), 30 seconds per pick (the best fit is picked for you when time runs out), one re-spin each. Then your two teams play a simulated game you can watch live.</li>
    </ul>
    <p><b>Ranked</b> (Find a ranked match): every game has its own rating, starting at 1000. Beating a stronger player earns more. Ranks: Bronze, Silver 1100, Gold 1250, Platinum 1400, Diamond 1550, Champion 1700. Matchmaking looks for someone near your rating and widens the search the longer you wait. <b>Friendly</b> games (invites) and <b>bot</b> games don't change your rating.</p>
    <p><b>Friends:</b> everyone has a 6-character player code (Friends tab). Add friends by code or from the end screen, see who's online, and invite them: they get a pop-up anywhere in the arcade. <b>History</b> keeps your last 60 matches and your rivals' head-to-head records.</p>
    <p>No one around? After 30 seconds of searching you can play a bot (Rookie, Veteran or Legend). Quick chat sends preset lines only.</p>
    <p>Leaving a running match counts as a loss. If your connection drops the arcade reconnects by itself and you have about 45 seconds to come back. Online wins give 60 XP plus a streak bonus in ranked (up to +50), draws 35, losses 20; bot games give less. Your rating is stored on the server and as a signed copy in your browser, so it comes back even after the server restarts.</p>` },
  { id: "challenge", ic: "users", title: "Challenges, compare and recap", body: `
    <ul>
      <li><b>Challenge a friend:</b> create a code (e.g. WLA-G3K9F2A) for any game. Everyone who enters it gets exactly the same game: the same mystery player, the same pairs, the same spins or the same careers. Play, then send your result. Challenges never overwrite your saved games.</li>
      <li><b>Compare players:</b> two careers side by side, by season or by age, with saved comparisons. Open it from any profile.</li>
      <li><b>Monthly recap:</b> games played, XP, level-ups, best scores, banners and your most-viewed player for any month, with a shareable image.</li>
      <li><b>Fact of the day</b> on the home page comes straight from the data.</li>
    </ul>` },
  { id: "daily", ic: "calendar", title: "Daily challenges, records and today", body: `
    <ul>
      <li><b>Daily challenges:</b> four puzzles a day (Draft, Guess, Higher or Lower, Career), the same for everyone. Your first result counts. Finish at least one a day to keep your streak; there are banners for 7, 30 and 100-day streaks.</li>
      <li><b>All-time records:</b> career totals, career averages (100+ games) and single-season bests since 2010-11, with filters for Israelis, club and position. Totals are per-game averages × games played.</li>
      <li><b>Today in the league:</b> players born on today's date and flashbacks to the seasons 5, 10 and 15 years ago. (The league data has birth dates but no game dates.)</li>
      <li><b>Public profile:</b> on your profile page, copy a link with your avatar, level, banners, bests and ranks. It's a snapshot of that moment.</li>
      <li><b>Club colours:</b> Settings → Accent colour paints the arcade in your club's colours (adjusted so text stays readable).</li>
      <li><b>Player avatar:</b> on your profile choose Avatar style → Player and build your own: skin, hair, colours, jersey number (or your club's colours) and extras. Opponents see it online.</li>
      <li><b>Big card view:</b> press and hold any player card (or focus it and press V) to see it full size; tap it to flip to the season stats.</li>
      <li><b>Accessibility:</b> Settings → Contrast → High gives a black-and-white palette with yellow highlights, thicker borders and underlined links (it also turns on by itself when your system asks for more contrast). Screen readers hear page changes, game results, guess clues and online events; every page has a skip link, keyboard focus is always visible, and all games work with the keyboard.</li>
      <li><b>Install the app:</b> Settings → App, or your browser's "Install app" / "Add to Home Screen". Once installed, the single-player games work offline.</li>
    </ul>` },
  { id: "data", ic: "info", title: "Where the data comes from", body: `
    <p>Players, teams and regular-season stats from 2010-11 to 2026-27 come from the official Israeli Basketball Premier League site (bsl.org.il). Missing values are left empty, never invented. 2026-27 is in progress: rosters only, no stats yet. Playoff and cup games are not included in the stats.</p>` },
  { id: "privacy", ic: "shield", title: "Your data and settings", body: `
    <p>Your nickname, avatar, scores, saved games and settings are stored only in this browser on this device. Nothing is sent anywhere, except during online play: then your nickname, avatar and level are shared with the game server and your opponent. Clearing your browser's site data resets them.</p>
    <p>Settings (gear icon): dark / light theme, colour-blind safe colours, text size, animations and sound. The pause icon stops every animation at once.</p>` },
];

export function renderHelp(root) {
  root.innerHTML = html`
    <div class="game-head"><div><h1>${icon("info", { size: 30 })} Help center</h1><p>How every game works, what the numbers mean and where they come from.</p></div></div>
    <div class="help-layout">
      <nav class="card pad help-toc" aria-label="Help topics">
        ${SECTIONS.map((s) => `<a href="#/help" data-jump="${s.id}">${icon(s.ic, { size: 16 })} ${s.title}</a>`).join("")}
        <a href="#/help" data-jump="keys">${icon("bulb", { size: 16 })} Keyboard shortcuts</a>
      </nav>
      <div class="help-body">
        ${SECTIONS.map((s) => `<section class="card pad help-sec" id="help-${s.id}"><h2>${icon(s.ic, { size: 22 })} ${s.title}</h2>${s.body}</section>`).join("")}
        <section class="card pad help-sec" id="help-keys"><h2>${icon("bulb", { size: 22 })} Keyboard shortcuts</h2>${shortcutsHtml()}</section>
      </div>
    </div>`;
  root.querySelector(".help-toc").addEventListener("click", (e) => {
    const a = e.target.closest("[data-jump]");
    if (!a) return;
    e.preventDefault();
    const el = root.querySelector(`#help-${a.dataset.jump}`);
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  });
}
