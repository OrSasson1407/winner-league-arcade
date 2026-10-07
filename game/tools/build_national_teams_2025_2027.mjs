/*
 * Build a standalone senior-men national-teams database for the 70 highest
 * ranked FIBA nations. It never reads, imports, writes or alters game_db.js.
 *
 * Source: the public FIBA Competition Reports archive. Its roster PDFs contain
 * official player names, positions, heights, dates of birth and clubs.
 * Run: node --use-system-ca build_national_teams_2025_2027.mjs
 */
import { writeFile } from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const AS_OF = '2026-10-07';
const ROOT = 'https://reports.fiba.basketball';
const OUTPUT = new URL('../data/national_teams_db.js', import.meta.url);

// FIBA men's ranking, 1 September 2026, positions 1–70.
const RANKED = [
  ['USA','USA'],['GER','Germany'],['FRA','France'],['SRB','Serbia'],['CAN','Canada'],['ESP','Spain'],['AUS','Australia'],['ARG','Argentina'],['TUR','Türkiye'],['LTU','Lithuania'],
  ['BRA','Brazil'],['LAT','Latvia'],['GRE','Greece'],['SLO','Slovenia'],['ITA','Italy'],['FIN','Finland'],['PUR','Puerto Rico'],['MNE','Montenegro'],['POL','Poland'],['GEO','Georgia'],
  ['DOM','Dominican Republic'],['JPN','Japan'],['CZE','Czechia'],['SSD','South Sudan'],['NZL','New Zealand'],['MEX','Mexico'],['ANG','Angola'],['IRI','Iran'],['ISR','Israel'],['CHN','China'],
  ['BIH','Bosnia and Herzegovina'],['CRO','Croatia'],['LBN','Lebanon'],['VEN','Venezuela'],['CIV',"Côte d'Ivoire"],['BEL','Belgium'],['UKR','Ukraine'],['EST','Estonia'],['SWE','Sweden'],['PHI','Philippines'],
  ['JOR','Jordan'],['EGY','Egypt'],['URU','Uruguay'],['POR','Portugal'],['ISL','Iceland'],['HUN','Hungary'],['SEN','Senegal'],['GBR','Great Britain'],['BAH','Bahamas'],['TUN','Tunisia'],
  ['CPV','Cape Verde'],['NGR','Nigeria'],['NED','Netherlands'],['COL','Colombia'],['CMR','Cameroon'],['PAN','Panama'],['KOR','Korea'],['BUL','Bulgaria'],['CHI','Chile'],['DEN','Denmark'],
  ['MLI','Mali'],['ROU','Romania'],['SUI','Switzerland'],['KSA','Saudi Arabia'],['MKD','North Macedonia'],['AUT','Austria'],['GUI','Guinea'],['COD','Congo DR'],['CYP','Cyprus'],['CUB','Cuba'],
].map(([code, name], index) => ({ code, name, rank: index + 1 }));
const rankByCode = new Map(RANKED.map(x => [x.code, x]));

// Finals plus qualifying windows catch ranked nations that missed a 2025 final.
const FINALS = [
  ['FIBA EuroBasket 2025', '2025/FIBA EuroBasket/'],
  ['FIBA AmeriCup 2025', '2025/FIBA AmeriCup/'],
  ['FIBA Asia Cup 2025', '2025/FIBA Asia Cup/'],
  ['FIBA AfroBasket 2025', '2025/FIBA AfroBasket/'],
];
const QUALIFIERS = [
  ['FIBA EuroBasket 2025 Qualifiers', '2025/FIBA EuroBasket 2025 Qualifiers/'],
  ['FIBA AmeriCup 2025 Qualifiers', '2025/FIBA AmeriCup 2025 Qualifiers/'],
  ['FIBA Asia Cup 2025 Qualifiers', '2025/FIBA Asia Cup 2025 Qualifiers/'],
  ['FIBA AfroBasket 2025 Qualifiers', '2025/FIBA AfroBasket 2025 Qualifiers/'],
  ['FIBA Basketball World Cup 2027 Americas Pre-Qualifiers', '2025/FIBA Basketball World Cup 2027 Americas PQ/'],
  ['FIBA Basketball World Cup 2027 European Pre-Qualifiers', '2025/FIBA Basketball World Cup 2027 European Pre-Qualifiers/'],
];
const sourceUrl = path => `${ROOT}/api/view.php?file=${encodeURIComponent(path)}`;
const listUrl = path => `${ROOT}/api/list.php?path=${encodeURIComponent(path)}`;
const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const position = { PG: 'PG', SG: 'SG', SF: 'SF', PF: 'PF', C: 'C', G: 'G', F: 'F' };
const ymd = value => {
  const match = String(value).match(/^(\d{2})-([A-Z]{3})-(\d{4})$/);
  if (!match) return null;
  const month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(match[2]) + 1;
  return month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1]}` : null;
};
const ageOn = birth => {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number); const [ay, am, ad] = AS_OF.split('-').map(Number);
  return ay - y - (am < m || (am === m && ad < d) ? 1 : 0);
};
const mockRating = id => 60 + [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % 36;

async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (response.ok || response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, attempt * 750));
  }
  throw lastError;
}

async function listRosterFiles(path, wantedCodes = null) {
  const response = await fetchWithRetry(listUrl(path));
  if (!response.ok) throw new Error(`FIBA archive listing failed (${response.status}): ${path}`);
  const listing = await response.json();
  const own = (listing.files ?? []).filter(file => file.name === 'rosters.pdf').map(file => path + file.name);
  const nested = [];
  // FIBA's archive throttles large parallel traversals; one listing at a time
  // is slower but complete and repeatable.
  for (const folder of listing.folders ?? []) {
    // Game folders end in codes such as A12_ISR_SLO. Once at that level,
    // ignore a game if neither participant is within the selected top 70.
    const codes = folder.name.split('_').filter(part => /^[A-Z]{3}$/.test(part));
    if (wantedCodes && codes.length && !codes.some(code => wantedCodes.has(code))) continue;
    nested.push(...await listRosterFiles(path + folder.name + '/', wantedCodes));
  }
  return own.concat(nested);
}

function itemsByLine(items) {
  const lines = new Map();
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y).push({ x: item.transform[4], text: item.str });
  }
  return [...lines.entries()].sort(([a], [b]) => b - a).map(([y, xs]) => ({ y, xs: xs.sort((a, b) => a.x - b.x) }));
}
const join = xs => xs.map(x => x.text).join('').replace(/\s+/g, ' ').trim();
const inRange = (xs, min, max) => join(xs.filter(x => x.x >= min && x.x < max));

function extractPage(items, competition, reportPath) {
  const lines = itemsByLine(items);
  const pageText = lines.map(line => join(line.xs)).join('\n');
  const teamMatch = pageText.match(/\b([A-Z]{3})\s*-\s*([^\n]+)/);
  if (!teamMatch || !rankByCode.has(teamMatch[1])) return [];
  const code = teamMatch[1], team = rankByCode.get(code), players = [];
  for (const { xs } of lines) {
    const birth = ymd(inRange(xs, 333, 387));
    if (!birth) continue;
    const number = inRange(xs, 30, 55).match(/^\d+$/)?.[0] ?? null;
    const rawName = inRange(xs, 55, 254).replace(/\s*\(C\)\s*$/, '').trim();
    if (!rawName || !number) continue;
    const label = inRange(xs, 254, 288) || null;
    const metres = inRange(xs, 288, 333).match(/\d\.\d{2}/)?.[0] ?? null;
    players.push({ team, number: Number(number), name: rawName, birth_date: birth,
      height_cm: metres ? Math.round(Number(metres) * 100) : null, position_label: label,
      primary_position: position[label] ?? null, current_club: inRange(xs, 417, Infinity) || null,
      competition, source_url: sourceUrl(reportPath) });
  }
  return players;
}

async function extractReport(reportPath, competition) {
  const response = await fetchWithRetry(sourceUrl(reportPath));
  if (!response.ok) throw new Error(`FIBA roster download failed (${response.status}): ${reportPath}`);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await response.arrayBuffer()), useWorkerFetch: false }).promise;
  const players = [];
  for (let number = 1; number <= pdf.numPages; number++) players.push(...extractPage((await (await pdf.getPage(number)).getTextContent()).items, competition, reportPath));
  // Some pdfjs-dist builds expose cleanup rather than destroy.
  if (typeof pdf.destroy === 'function') await pdf.destroy();
  else if (typeof pdf.cleanup === 'function') pdf.cleanup();
  return players;
}

// Some World Cup pre-qualifier games publish a FIBA Start List instead of a
// Team Roster report. It still provides official names, positions, heights and
// game-day ages, but not dates of birth. This narrow fallback is only used for
// the three top-70 teams absent from all 2025 championship roster reports.
async function extractStartList(reportPath, competition, code) {
  const response = await fetchWithRetry(sourceUrl(reportPath));
  if (!response.ok) throw new Error(`FIBA start-list download failed (${response.status}): ${reportPath}`);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await response.arrayBuffer()), useWorkerFetch: false }).promise;
  const players = [];
  const team = rankByCode.get(code);
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const lines = itemsByLine((await (await pdf.getPage(pageNo)).getTextContent()).items);
    // A Start List contains both sides of the game. The requested country is
    // deliberately the home/first side in each fallback report, so retain
    // rows only between its ``CODE - Country`` heading and the Team total.
    const heading = lines.findIndex(line => join(line.xs).includes(`${code} -`));
    if (heading < 0) continue;
    for (const { y, xs } of lines.slice(heading + 1)) {
      const rawName = inRange(xs, 48, 163).replace(/\s*\(C\)\s*$/, '').trim();
      const label = inRange(xs, 163, 180) || null;
      const height = inRange(xs, 180, 195).match(/\b\d{3}\b/)?.[0] ?? null;
      const reportedAge = Number(inRange(xs, 235, 256));
      if (rawName.startsWith('Team')) break;
      const near = lines.filter(line => Math.abs(line.y - y) <= 2).flatMap(line => line.xs);
      // In Start Lists the jersey number baseline may be one point above the
      // name baseline, so select the one numeric glyph instead of joining both.
      const number = near.filter(item => item.x >= 30 && item.x < 48).map(item => item.text.trim()).find(text => /^\d{1,2}$/.test(text)) ?? null;
      if (!number || !rawName || !label || !height || !Number.isFinite(reportedAge)) continue;
      players.push({ team, number: Number(number), name: rawName, birth_date: null, reported_age: reportedAge,
        height_cm: Number(height), position_label: label, primary_position: position[label] ?? null, current_club: null,
        competition, source_url: sourceUrl(reportPath), age_source_date: '2025-08-06' });
    }
  }
  if (typeof pdf.destroy === 'function') await pdf.destroy(); else if (typeof pdf.cleanup === 'function') pdf.cleanup();
  return players;
}

const allReports = [];
const rosterRows = [];
async function addReports(competition, reports) {
  for (const reportPath of reports) {
    allReports.push({ competition, reportPath });
    try { rosterRows.push(...await extractReport(reportPath, competition)); }
    catch (error) { console.warn(`Skipped ${reportPath}: ${error.message}`); }
  }
}
for (const [competition, folder] of FINALS) {
  const response = await fetchWithRetry(listUrl(folder));
  const listing = await response.json();
  const reports = (listing.files ?? []).filter(file => file.name === 'rosters.pdf').map(file => folder + file.name);
  console.log(`${competition}: ${reports.length} roster reports`);
  await addReports(competition, reports);
}
let neededCodes = new Set(RANKED.map(team => team.code));
for (const row of rosterRows) neededCodes.delete(row.team.code);
console.log(`Finals cover ${70 - neededCodes.size}/70 ranked teams; checking qualifying reports for ${neededCodes.size} remaining teams.`);
for (const [competition, folder] of QUALIFIERS) {
  if (!neededCodes.size) break;
  const reports = [...new Set(await listRosterFiles(folder, neededCodes))];
  console.log(`${competition}: ${reports.length} relevant roster reports`);
  await addReports(competition, reports);
  for (const row of rosterRows) neededCodes.delete(row.team.code);
}
// These three FIBA game Start Lists cover the only ranked teams for which the
// archive has no 2025 ``rosters.pdf``. They preserve coverage without guessing
// any unpublished birth date or weight.
const START_LIST_FALLBACKS = [
  ['ROU', '2025/FIBA Basketball World Cup 2027 European Pre-Qualifiers/Window 4/2025-08-06/E2_ROU_HUN/start-list_E2_ROU_HUN_20250806.pdf'],
  ['SUI', '2025/FIBA Basketball World Cup 2027 European Pre-Qualifiers/Window 4/2025-08-06/D2_SUI_UKR/start-list_D2_SUI_UKR_20250806.pdf'],
  ['AUT', '2025/FIBA Basketball World Cup 2027 European Pre-Qualifiers/Window 4/2025-08-06/F2_AUT_BUL/start-list_F2_AUT_BUL_20250806.pdf'],
];
for (const [code, reportPath] of START_LIST_FALLBACKS) if (neededCodes.has(code)) {
  const competition = 'FIBA Basketball World Cup 2027 European Pre-Qualifiers';
  const rows = await extractStartList(reportPath, competition, code);
  if (rows.length) { allReports.push({ competition, reportPath }); rosterRows.push(...rows); neededCodes.delete(code); }
}

const teams = RANKED.map(team => ({ team_id: `national_${normalize(team.name)}`, canonical_name: team.name, fiba_code: team.code, world_rank: team.rank, source_url: 'https://www.fiba.basketball/en/ranking/men' }));
const playerMap = new Map(), playerSeasons = [], rowKeys = new Set();
for (const row of rosterRows) {
  const identity = `${row.team.code}:${normalize(row.name)}:${row.birth_date ?? 'unknown'}`;
  const id = `nt_${normalize(row.team.code)}_${normalize(row.name)}_${row.birth_date ?? 'unknown'}`;
  const effectiveAge = row.reported_age ?? ageOn(row.birth_date);
  const ageAsOf = row.age_source_date ?? AS_OF;
  if (!playerMap.has(identity)) playerMap.set(identity, { player_id: id, name: row.name, birth_date: row.birth_date, age: effectiveAge, age_as_of: ageAsOf,
    nationality: row.team.name, nationalities: [row.team.name], height_cm: row.height_cm, weight_kg: null, primary_position: row.primary_position, secondary_position: null,
    position_label: row.position_label, current_club: row.current_club, rating_mock: mockRating(id), stats: null, source_urls: [row.source_url], coverage: [row.competition] });
  else {
    const old = playerMap.get(identity);
    for (const field of ['height_cm', 'primary_position', 'position_label', 'current_club']) if (old[field] == null && row[field] != null) old[field] = row[field];
    if (!old.source_urls.includes(row.source_url)) old.source_urls.push(row.source_url);
    if (!old.coverage.includes(row.competition)) old.coverage.push(row.competition);
  }
  const key = `${id}:${row.competition}:${row.source_url}:${row.number}`;
  if (!rowKeys.has(key)) { rowKeys.add(key); playerSeasons.push({ player_id: id, season: '2025-26', team_id: `national_${normalize(row.team.name)}`, team_name: row.team.name,
    national_team_code: row.team.code, jersey_number: row.number, competition: row.competition, age: effectiveAge, position: row.primary_position,
    secondary_position: null, rating_mock: mockRating(id), stats: null, source_url: row.source_url }); }
}
const present = new Set(playerSeasons.map(row => row.national_team_code));
const missing = RANKED.filter(team => !present.has(team.code)).map(team => ({ rank: team.rank, code: team.code, name: team.name }));
if (!playerSeasons.length) throw new Error('No roster rows extracted; refusing to write an empty database.');
const data = { metadata: { dataset: 'Senior men national teams: FIBA world-ranking positions 1–70', generated_at: new Date().toISOString(), as_of: AS_OF,
  season_list: ['2025-26', '2026-27'], current_season: '2026-27', ranking_date: '2026-09-01', no_statistics: true,
  scope: 'Players found in official 2025 tournament and qualifying roster reports for ranked teams 1–70. The 2026–27 cycle is live and must be rebuilt after each FIBA window.',
  rating_notice: 'rating_mock is deterministic mock data only; it is not a factual player rating.', missing_weight_policy: 'null means no verified weight was published in the roster report.',
  sources: ['https://www.fiba.basketball/en/ranking/men', `${ROOT}/`], reports_examined: allReports.length },
  teams, seasons: [{ season: '2025-26', status: 'COMPLETE', teams: teams.map(team => team.team_id) }, { season: '2026-27', status: 'PARTIAL', teams: teams.map(team => team.team_id) }],
  players: [...playerMap.values()].sort((a, b) => a.name.localeCompare(b.name)), player_seasons: playerSeasons.sort((a, b) => a.player_id.localeCompare(b.player_id) || a.competition.localeCompare(b.competition)),
  season_teams: teams.map(team => ({ season: '2025-26', team_id: team.team_id, team_name: team.canonical_name, fiba_code: team.fiba_code })),
  validation: { ranked_teams: RANKED.length, covered_teams: present.size, missing_ranked_teams: missing, roster_rows: playerSeasons.length } };
await writeFile(OUTPUT, `// Generated by build_national_teams_2025_2027.mjs from public FIBA roster reports.\n// Independent from game_db.js. Personal data are sourced; ratings are mock; statistics are intentionally absent.\nexport const nationalTeamsDatabase = ${JSON.stringify(data)};\n`, 'utf8');
console.log(`Wrote ${data.players.length} players, ${data.player_seasons.length} roster rows, ${present.size}/70 ranked teams to ${OUTPUT.pathname}`);
if (missing.length) console.warn('Missing ranked teams:', missing.map(team => `${team.rank} ${team.code}`).join(', '));
