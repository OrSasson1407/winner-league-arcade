// Smart player search: turns a plain question ("Israeli point guards born after 1995", "גבוהים מ-2.05
// ששיחקו בחולון") into filters over the real data. Pure: parse() reads text, run() reads the database.
import { careerSummary, db, isPlayable, namedPlayers, teamName } from "../data.js";

// ---------------------------------------------------------------- vocabulary
// [alias, team ids]: a club name, its city, or its Hebrew name. Longer aliases are tried first.
const CLUBS = [
  ["maccabi tel aviv", "maccabi_tel_aviv"], ["מכבי תל אביב", "maccabi_tel_aviv"], ['מכבי ת"א', "maccabi_tel_aviv"],
  ["hapoel tel aviv", "hapoel_tel_aviv"], ["הפועל תל אביב", "hapoel_tel_aviv"], ['הפועל ת"א', "hapoel_tel_aviv"],
  ["maccabi haifa", "maccabi_haifa"], ["מכבי חיפה", "maccabi_haifa"], ["hapoel haifa", "hapoel_haifa"], ["הפועל חיפה", "hapoel_haifa"],
  ["tel aviv", "maccabi_tel_aviv hapoel_tel_aviv"], ["תל אביב", "maccabi_tel_aviv hapoel_tel_aviv"], ["haifa", "maccabi_haifa hapoel_haifa"], ["חיפה", "maccabi_haifa hapoel_haifa"],
  ["jerusalem", "hapoel_jerusalem"], ["ירושלים", "hapoel_jerusalem"], ["holon", "hapoel_holon"], ["חולון", "hapoel_holon"],
  ["eilat", "hapoel_eilat"], ["אילת", "hapoel_eilat"], ["gilboa", "hapoel_gilboa_galil"], ["גלבוע", "hapoel_gilboa_galil"],
  ["galil elyon", "hapoel_galil_elyon"], ["upper galilee", "hapoel_galil_elyon"], ["גליל עליון", "hapoel_galil_elyon"],
  ["nahariya", "ironi_nahariya"], ["נהריה", "ironi_nahariya"], ["ashdod", "maccabi_ashdod"], ["אשדוד", "maccabi_ashdod"],
  ["rishon", "maccabi_rishon_lezion"], ["ראשון לציון", "maccabi_rishon_lezion"], ['ראשל"צ', "maccabi_rishon_lezion"],
  ["herzliya", "bnei_herzliya"], ["הרצליה", "bnei_herzliya"], ["ramat gan", "maccabi_ramat_gan"], ["רמת גן", "maccabi_ramat_gan"],
  ["be'er sheva", "hapoel_beer_sheva"], ["beer sheva", "hapoel_beer_sheva"], ["באר שבע", "hapoel_beer_sheva"],
  ["netanya", "elitzur_netanya"], ["נתניה", "elitzur_netanya"], ["afula", "hapoel_afula"], ["עפולה", "hapoel_afula"],
  ["habikaa", "bc_habikaa"], ["bikaa", "bc_habikaa"], ["הבקעה", "bc_habikaa"],
  ["kiryat ata", "ironi_kiryat_ata"], ["קריית אתא", "ironi_kiryat_ata"], ["קרית אתא", "ironi_kiryat_ata"],
  ["ness ziona", "ironi_ness_ziona"], ["נס ציונה", "ironi_ness_ziona"], ["ashkelon", "ironi_ashkelon"], ["אשקלון", "ironi_ashkelon"],
  ["kiryat gat", "maccabi_kiryat_gat"], ["קריית גת", "maccabi_kiryat_gat"], ["קרית גת", "maccabi_kiryat_gat"],
  ["ra'anana", "maccabi_raanana"], ["raanana", "maccabi_raanana"], ["רעננה", "maccabi_raanana"],
];
// Other leagues' teams (the NBA): full name, nickname and city from the data ("los angeles lakers", "lakers",
// "los angeles"), matched as whole words. Cities with two teams name both.
const WL_IDS = new Set(CLUBS.flatMap(([, ids]) => ids.split(" ")));
const TWO_WORD_NICKS = ["trail blazers"];
{
  const byCity = new Map();
  for (const t of db.teams) {
    if (String(t.team_id).startsWith("el:") || WL_IDS.has(t.team_id) || !t.canonical_name) continue;
    const name = t.canonical_name.toLowerCase();
    const nick = TWO_WORD_NICKS.find((n) => name.endsWith(" " + n)) || name.split(" ").pop();
    const city = name.slice(0, name.length - nick.length).trim();
    CLUBS.push([name, t.team_id, true], [nick, t.team_id, true]);
    if (city) byCity.set(city, [...(byCity.get(city) || []), t.team_id]);
  }
  if (byCity.has("la")) byCity.set("los angeles", [...(byCity.get("los angeles") || []), ...byCity.get("la")]); // "LA Clippers"
  for (const [city, ids] of byCity) if (!CLUBS.some(([a]) => a === city)) CLUBS.push([city, ids.join(" "), true]);
}
CLUBS.sort((a, b) => b[0].length - a[0].length);

// [regex, positions]: English with word edges; Hebrew as whole words (a prefix letter is fine).
const HE = (w) => new RegExp(`(^|[\\s,])[והבלמש]?(${w})(?=[\\s,.]|$)`, "g");
const POS = [
  [/\bpoint guards?\b|\bpgs?\b/g, ["PG"]], [/\bshooting guards?\b|\bsgs?\b/g, ["SG"]], [/\bsmall forwards?\b|\bsfs?\b/g, ["SF"]],
  [/\bpower forwards?\b|\bpfs?\b/g, ["PF"]], [/\bcent(?:er|re)s?\b/g, ["C"]], [/\bguards?\b/g, ["PG", "SG"]], [/\bforwards?\b/g, ["SF", "PF"]],
  [/\bwings?\b/g, ["SG", "SF"]], [/\bbigs?\b/g, ["PF", "C"]],
  [HE("רכזים|רכז"), ["PG"]], [HE("קלעים|קלע"), ["SG"]], [HE("סמול פורוורד|פורוורד קטן"), ["SF"]], [HE("פאוור פורוורד|פורוורד כבד"), ["PF"]],
  [HE("סנטרים|סנטר"), ["C"]], [HE("גארדים|גארד"), ["PG", "SG"]], [HE("פורוורדים|פורוורד"), ["SF", "PF"]],
];

// [regex, nationality filter]
const NATS = [
  [/\bisraelis?\b/g, "Israel"], [HE("ישראלים|ישראלי|ישראליות"), "Israel"],
  [/\bforeign(?:ers?)?\b|\bimports?\b|\bnon[- ]israelis?\b/g, "!Israel"], [HE("זרים|זר"), "!Israel"],
  [/\bdual (?:nationals?|citizens?|nationality)\b|\btwo nationalities\b/g, "dual"], [HE("אזרחות כפולה|שתי אזרחויות"), "dual"],
  [/\bamericans?\b|\busa\b|\bu\.s\.?\b/g, "United States"], [HE("אמריקאים|אמריקאי|אמריקנים|אמריקני"), "United States"],
  [/\bnigerians?\b/g, "Nigeria"], [HE("ניגרים|ניגרי"), "Nigeria"], [/\bcanadians?\b/g, "Canada"], [HE("קנדים|קנדי"), "Canada"],
  [/\bserbians?\b|\bserbs?\b/g, "Serbia"], [HE("סרבים|סרבי"), "Serbia"], [/\bpuerto ricans?\b/g, "Puerto Rico"], [/\bjamaicans?\b/g, "Jamaica"],
  [/\baustralians?\b/g, "Australia"], [HE("אוסטרלים|אוסטרלי"), "Australia"], [/\bfrench\b/g, "France"], [HE("צרפתים|צרפתי"), "France"],
  [/\bcroatians?\b/g, "Croatia"], [HE("קרואטים|קרואטי"), "Croatia"], [/\bgreeks?\b/g, "Greece"], [HE("יוונים|יווני"), "Greece"],
  [/\blithuanians?\b/g, "Lithuania"], [HE("ליטאים|ליטאי"), "Lithuania"], [/\bgeorgians?\b/g, "Georgia"], [/\bukrainians?\b/g, "Ukraine"], [HE("אוקראינים|אוקראיני"), "Ukraine"],
  [/\bbrazilians?\b/g, "Brazil"], [/\bgermans?\b/g, "Germany"], [HE("גרמנים|גרמני"), "Germany"], [/\bsenegalese\b/g, "Senegal"],
];

const STATS = { ppg: "PPG", rpg: "RPG", apg: "APG", spg: "SPG", bpg: "BPG" };
const STAT_RE = /(\d+(?:\.\d)?)\s*\+?\s*(points?|pts|ppg|נקודות|נק'?|rebounds?|rebs?|rpg|ריבאונדים|ריבאונד|assists?|asts?|apg|אסיסטים|אסיסט|steals?|spg|חטיפות|blocks?|bpg|חסימות)/g;
const statOf = (w) => (/^(p|נק)/.test(w) ? "ppg" : /^(reb|rpg|ריב)/.test(w) ? "rpg" : /^(as|apg|אס)/.test(w) ? "apg" : /^(st|spg|חט)/.test(w) ? "spg" : "bpg");
// words before a number that turn "at least" into "at most"
const MAXW = /(shorter|under|below|less|fewer|at most|smaller|up to|lower|נמוכים|נמוך|מתחת|פחות|עד)/;
const FROMW = /(since|from|after|starting|מאז|אחרי|החל)/, TOW = /(before|until|up to|till|לפני|עד)/;

const STOP = new Set(("players player who that with and the a an in for of played play playing plays has have had than more over above at least averaged average averaging avg per game games season seasons from since " +
  "born after before tall taller shorter under below less most were was is are all on to or by show find list me who's whose me any some team teams club clubs " +
  "שחקנים שחקן שחקנית ש שיחקו ששיחקו שיחק ששיחק עם של את כל מעל מתחת יותר פחות לפחות גבוהים גבוה נמוכים נמוך נולדו שנולדו נולד אחרי לפני מאז עד עונה בעונה עונות ממוצע בממוצע " +
  "קלעו שקלעו שקלע מסרו שמסרו לקחו שלקחו הורידו שהורידו "+
  "הראה תמצא מצא מי גובה מטר משחק למשחק משחקים וגם או ה ב מ ו ל קבוצה קבוצות ס\"מ cm m").split(" "));

// ---------------------------------------------------------------- parse
/** Text → { filters, chips: [{label, src}], ignored: [words] }. `src` is the part of the text each chip came from. */
export function parse(text) {
  const raw = (text || "").replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'").toLowerCase();
  let s = ` ${raw} `;
  const f = {}, chips = [];
  const take = (m, start, len) => { const src = s.slice(start, start + len).trim(); s = s.slice(0, start) + " ".repeat(len) + s.slice(start + len); return src; };
  const lastWords = (i, n = 3) => raw.slice(0, Math.max(0, i - 1)).split(/\s+/).slice(-n).join(" ");
  const each = (re, fn) => { re.lastIndex = 0; let m; const found = []; while ((m = re.exec(s))) { found.push([m, m.index]); if (!m[0].length) re.lastIndex++; } for (const [mm, i] of found.reverse()) fn(mm, i); };

  // born before / after / in YEAR
  each(/(born|נולדו|נולד|שנולדו|שנולד|ילידי|יליד)\s*(before|after|in|לפני|אחרי|ב-?|בשנת)?\s*((?:19|20)\d\d)/g, (m, i) => {
    const y = Number(m[3]), how = m[2] || "";
    const src = take(m, i, m[0].length);
    if (/before|לפני/.test(how)) { f.bornMax = y - 1; chips.push({ label: `Born before ${y}`, src }); }
    else if (/after|אחרי/.test(how)) { f.bornMin = y + 1; chips.push({ label: `Born after ${y}`, src }); }
    else { f.bornMin = f.bornMax = y; chips.push({ label: `Born in ${y}`, src }); }
  });
  // a season: 2015-16
  each(/(20\d\d)\s*[-/–]\s*(\d\d)\b/g, (m, i) => {
    const season = `${m[1]}-${m[2]}`, before = lastWords(i - 1 + 1, 2), src = take(m, i, m[0].length);
    if (FROMW.test(before)) { f.seasonFrom = season; chips.push({ label: `From ${season}`, src }); }
    else if (TOW.test(before)) { f.seasonTo = season; chips.push({ label: `Up to ${season}`, src }); }
    else { f.season = season; chips.push({ label: `Season ${season}`, src }); }
  });
  // height: 2.05 (m) · 205 cm · 6'9
  each(/(\d)[.,](\d\d)\s*(?:m\b|מ'|מטר)?|(\d{3})\s*(?:cm|ס"מ|סמ)|(\d)'\s?(\d{1,2})"?/g, (m, i) => {
    const cm = m[3] ? Number(m[3]) : m[4] ? Math.round(Number(m[4]) * 30.48 + Number(m[5]) * 2.54) : Number(m[1]) * 100 + Number(m[2]);
    if (cm < 150 || cm > 235) return;
    const src = take(m, i, m[0].length);
    if (MAXW.test(lastWords(i))) { f.heightMax = cm; chips.push({ label: `Height ≤ ${cm} cm`, src, cm }); }
    else { f.heightMin = cm; chips.push({ label: `Height ≥ ${cm} cm`, src, cm }); }
  });
  // per-game stats in a season: "20+ points", "8 ריבאונדים"
  each(STAT_RE, (m, i) => {
    const k = statOf(m[2]), v = Number(m[1]), src = take(m, i, m[0].length);
    f.stats ||= [];
    if (MAXW.test(lastWords(i))) { f.stats.push({ k, max: v }); chips.push({ label: `Best ${STATS[k]} ≤ ${v}`, src }); }
    else { f.stats.push({ k, min: v }); chips.push({ label: `${v}+ ${STATS[k]} in a season`, src }); }
  });
  // seasons / games in the league
  each(/(\d+)\s*\+?\s*(seasons|עונות)/g, (m, i) => { const v = Number(m[1]), src = take(m, i, m[0].length);
    if (MAXW.test(lastWords(i))) { f.seasonsMax = v; chips.push({ label: `Up to ${v} seasons`, src }); } else { f.seasonsMin = v; chips.push({ label: `${v}+ seasons`, src }); } });
  each(/(\d+)\s*\+?\s*(games|משחקים)/g, (m, i) => { const v = Number(m[1]), src = take(m, i, m[0].length);
    if (MAXW.test(lastWords(i))) { f.gamesMax = v; chips.push({ label: `Up to ${v} games`, src }); } else { f.gamesMin = v; chips.push({ label: `${v}+ games`, src }); } });
  // jersey number
  each(/(?:jersey|number|no\.|#|מספר|חולצה)\s*(\d{1,2})\b/g, (m, i) => { f.jersey = Number(m[1]); chips.push({ label: `Jersey #${m[1]}`, src: take(m, i, m[0].length) }); });
  // a bare year: "since 2018", "before 2015", "in 2020"
  each(/\b((?:20|19)\d\d)\b/g, (m, i) => {
    const y = Number(m[1]); if (y < 2010 || y > 2027) return;
    const season = `${y}-${String((y + 1) % 100).padStart(2, "0")}`, before = lastWords(i, 2), src = take(m, i, m[0].length);
    if (FROMW.test(before)) { f.seasonFrom = season; chips.push({ label: `From ${season}`, src }); }
    else if (TOW.test(before)) { f.seasonTo = season; chips.push({ label: `Up to ${season}`, src }); }
    else { f.season = season; chips.push({ label: `Season ${season}`, src }); }
  });
  // clubs (each one named must be in the career)
  for (const [alias, ids, whole] of CLUBS) {
    let i, from = 0;
    while ((i = s.indexOf(alias, from)) >= 0) {
      // generated names count only as whole words ("kings" isn't in "rankings")
      if (whole && (/[a-z]/.test(s[i - 1] || "") || /[a-z]/.test(s[i + alias.length] || ""))) { from = i + 1; continue; }
      const src = take(null, i, alias.length);
      const list = ids.split(" ");
      (f.clubs ||= []).push(list);
      chips.push({ label: `Played for ${list.map(teamName).join(" or ")}`, src });
    }
  }
  for (const [re, ps] of POS) each(re, (m, i) => {
    const src = take(m, i, m[0].length);
    f.pos = [...new Set([...(f.pos || []), ...ps])];
    chips.push({ label: `Position: ${ps.join("/")}`, src });
  });
  for (const [re, n] of NATS) each(re, (m, i) => {
    const src = take(m, i, m[0].length);
    if (n === "dual") { f.dual = true; chips.push({ label: "Two nationalities", src }); }
    else if (n === "!Israel") { f.foreign = true; chips.push({ label: "Not Israeli", src }); }
    else { (f.nat ||= []).push(n); chips.push({ label: n === "Israel" ? "Israeli" : `From ${n}`, src }); }
  });

  // what's left: filler words, or part of a name
  const words = s.split(/[\s,.?!:;()"-]+/).filter((w) => w && !STOP.has(w) && !STOP.has(w.replace(/^[והבלמש]/, "")) && !/^\d+$/.test(w));
  const ignored = [];
  for (const w of words) {
    if (w.length >= 2 && /[a-z]/.test(w) && namedPlayers.some((p) => p.name.toLowerCase().includes(w))) {
      (f.name ||= []).push(w); chips.push({ label: `Name has “${w}”`, src: w });
    } else ignored.push(w);
  }
  return { filters: f, chips, ignored };
}

// ---------------------------------------------------------------- run
const inWindow = (f, season) => (!f.season || season === f.season) && (!f.seasonFrom || season >= f.seasonFrom) && (!f.seasonTo || season <= f.seasonTo);

/** Filters → matching players, best first: [{ p, cs, stat }] (stat = the first stat filter's best value). */
export function run(f) {
  const out = [];
  const byTime = f.season || f.seasonFrom || f.seasonTo;
  for (const p of namedPlayers) {
    if (f.heightMin && !(p.height_cm >= f.heightMin)) continue;
    if (f.heightMax && !(p.height_cm && p.height_cm <= f.heightMax)) continue;
    if (f.pos && !f.pos.includes(p.primary_position)) continue;
    const nats = p.nationalities || [];
    if (f.nat && !f.nat.every((n) => nats.includes(n))) continue;
    if (f.foreign && nats.includes("Israel")) continue;
    if (f.dual && nats.length < 2) continue;
    const by = p.birth_date ? Number(p.birth_date.slice(0, 4)) : null;
    if (f.bornMin && !(by >= f.bornMin)) continue;
    if (f.bornMax && !(by && by <= f.bornMax)) continue;
    if (f.jersey != null && p.jersey !== f.jersey) continue;
    if (f.name && !f.name.every((w) => p.name.toLowerCase().includes(w))) continue;
    const cs = careerSummary(p.player_id);
    if (!cs.totalGames && !f.name) continue; // on a roster but never played a league game
    if (f.seasonsMin && cs.seasonsPlayed < f.seasonsMin) continue;
    if (f.seasonsMax && cs.seasonsPlayed > f.seasonsMax) continue;
    if (f.gamesMin && cs.totalGames < f.gamesMin) continue;
    if (f.gamesMax && cs.totalGames > f.gamesMax) continue;
    // seasons in the asked window; clubs and stats are checked inside it ("played for Holon in 2015-16")
    const recs = byTime ? cs.records.filter((r) => inWindow(f, r.season)) : cs.records;
    if (byTime && !recs.length) continue;
    if (f.clubs && !f.clubs.every((ids) => recs.some((r) => ids.includes(r.team_id)))) continue;
    let stat = null, ok = true;
    for (const [n, st] of (f.stats || []).entries()) {
      const pool = recs.filter((r) => isPlayable(r) && (!f.clubs || f.clubs.some((ids) => ids.includes(r.team_id))));
      const best = pool.reduce((a, r) => Math.max(a, r.stats[st.k] ?? 0), -1);
      if (best < 0 || (st.min != null && best < st.min) || (st.max != null && best > st.max)) { ok = false; break; }
      if (n === 0) stat = best;
    }
    if (!ok) continue;
    out.push({ p, cs, stat });
  }
  return out.sort((a, b) => (f.stats ? b.stat - a.stat : 0) || b.cs.totalGames - a.cs.totalGames);
}

/** Does this look like a question for the smart search (and not just a name)? */
export const looksSmart = (q) => parse(q).chips.some((c) => !c.label.startsWith("Name has"));
