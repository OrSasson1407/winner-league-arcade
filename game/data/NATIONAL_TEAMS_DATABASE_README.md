# National teams database, 2025–2027

`game/tools/build_national_teams_2025_2027.mjs` builds `game/data/national_teams_db.js` as a standalone data module. It never reads, writes, imports or overwrites `game/data/game_db.js`.

The database is scoped to the top 70 senior men's teams in the FIBA World Ranking dated 1 September 2026. It contains every player found in the official 2025 continental championship and qualifying roster reports for those teams: 944 unique players and 1,194 roster entries at generation time.

Each player contains name, nationality, birth date and computed age when FIBA published them, height, primary position, current club, team, FIBA source URL, coverage, a deterministic `rating_mock`, and `stats: null`. The 36 players supplied only in FIBA Start Lists have a reported game-day age, while birth date remains `null`; the archive did not publish a verified birth date for them. Weight and secondary position are `null` where FIBA did not publish them. No statistics are included.

Run from the repository root after installing dependencies:

```powershell
npm run build:national-teams
```

The builder uses the public FIBA Competition Reports archive instead of the website's protected player-profile pages. It includes safeguards against emitting an empty output. The 2026–27 cycle is live; rerun it after each FIBA window to refresh the roster coverage.
