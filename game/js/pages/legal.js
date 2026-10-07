// The site's legal and policy pages: #/privacy, #/terms, #/accessibility, #/licenses.
// Written in both languages here (not through the dictionary) so the Hebrew wording is exact.
// They describe what the code really does; update them whenever that changes.
import { html, store, toast } from "../ui.js";
import { icon } from "../lib/icons.js";
import { openFeedback } from "../lib/feedback.js";
import { undoToast } from "../lib/ux.js";
import { confirmDialog } from "../lib/modal.js";
import { getLang } from "../i18n/index.js";
import { connect, netStatus, onNet, send } from "../online/net.js";

const UPDATED = { en: "7 October 2026", he: "7 באוקטובר 2026" };
const he = () => getLang() === "he";
/** One piece of text in the page's language. */
const L = (en, hebrew) => (he() ? hebrew : en);

function page(root, signal, { title, intro, sections }) {
  root.innerHTML = html`<div data-no-tr>
    <div class="game-head"><div><h1>${title}</h1><p>${intro}</p>
      <p class="muted" style="font-size:13px">${L("Last updated", "עדכון אחרון")}: ${he() ? UPDATED.he : UPDATED.en}</p></div></div>
    <div class="legal">${sections.map(([ic, h, body]) => `<section class="card pad"><h2>${icon(ic)} ${h}</h2>${body}</section>`).join("")}</div>
    <p class="legal-links">${[["#/privacy", L("Privacy", "פרטיות")], ["#/terms", L("Terms of use", "תנאי שימוש")], ["#/accessibility", L("Accessibility", "נגישות")], ["#/licenses", L("Licenses", "רישיונות")], ["#/about", L("About", "אודות")]]
      .map(([h, t]) => `<a href="${h}">${t}</a>`).join(" · ")}</p>
  </div>`;
  root.querySelectorAll("[data-contact]").forEach((b) => b.addEventListener("click", () => openFeedback({ kind: b.dataset.contact || "other" }), { signal }));
}
const contactBtn = (kind = "other", label = L("Contact us (feedback form)", "פנייה אלינו (טופס משוב)")) =>
  `<button class="btn" data-contact="${kind}">${icon("chat", { size: 15 })} ${label}</button>`;

// ------------------------------------------------------------------ privacy
export function renderPrivacy(root, signal) {
  page(root, signal, {
    title: L("Privacy policy", "מדיניות פרטיות"),
    intro: L("Short version: no account, no ads, no analytics or tracking, no cookies. Your progress lives in your browser; online play keeps a nickname, an avatar and your results on the server.",
      "בקצרה: בלי חשבון, בלי פרסומות, בלי אנליטיקה או מעקב, בלי עוגיות. ההתקדמות שלך נשמרת בדפדפן; המשחק האונליין שומר בשרת כינוי, אווטאר ואת התוצאות שלך."),
    sections: [
      ["info", L("Who runs the site", "מי מפעיל את האתר"), L(
        `<p>Winner League Arcade is an independent, non-commercial fan project run by a private individual. It is not run by, or connected to, the Israeli Basketball Premier League, its clubs, Winner or Euroleague Basketball.</p><p>For any question or request about your data, use the feedback form.</p>${contactBtn()}`,
        `<p>ארקייד ליגת ווינר הוא פרויקט אוהדים עצמאי ולא מסחרי שמופעל על ידי אדם פרטי. הוא לא מופעל על ידי ליגת העל בכדורסל, הקבוצות שלה, ווינר או יורוליג, ואינו קשור אליהם.</p><p>לכל שאלה או בקשה לגבי המידע שלך, אפשר לפנות דרך טופס המשוב.</p>${contactBtn()}`)],
      ["lock", L("Kept only on your device", "נשמר רק במכשיר שלך"), L(
        `<p>Settings, progress, scores, achievements, daily results, saved games, your profile (nickname and avatar) and online friends list are stored in your browser (local storage and IndexedDB). They stay on the device unless you play online (below). The site sets no cookies.</p>`,
        `<p>ההגדרות, ההתקדמות, הניקוד, ההישגים, התוצאות היומיות, המשחקים השמורים, הפרופיל (כינוי ואווטאר) ורשימת החברים נשמרים בדפדפן שלך (local storage ו־IndexedDB). הם נשארים במכשיר, אלא אם משחקים אונליין (למטה). האתר לא משתמש בעוגיות.</p>`)],
      ["globe", L("Stored on the server", "נשמר בשרת"), L(
        `<p>While the arcade is open it connects to its server so friends can see you online and you can play online. The server stores:</p>
        <ul class="pv-list"><li><b>Your online profile:</b> nickname, avatar, level and a random device ID created by your browser. The ID is not linked to your name, email, phone or location.</li>
        <li><b>Online results:</b> ratings, wins and losses, streaks, and the history of your online matches (game, date, opponent's nickname and avatar, score). Your nickname, avatar and results appear on public leaderboards and in your opponents' history.</li>
        <li><b>Friend leagues</b> you create or join (league name and members' player codes).</li>
        <li><b>Messages you send:</b> feedback, and technical details if you leave that box ticked; nickname reports.</li></ul>
        <p>We do not collect real names, email addresses, phone numbers, contacts or location, and we don't sell or share data with anyone.</p>`,
        `<p>כשהארקייד פתוח הוא מתחבר לשרת שלו, כדי שחברים יראו שאתה אונליין ותוכל לשחק אונליין. בשרת נשמרים:</p>
        <ul class="pv-list"><li><b>הפרופיל האונליין:</b> כינוי, אווטאר, רמה ומזהה מכשיר אקראי שהדפדפן יוצר. המזהה לא מקושר לשם, למייל, לטלפון או למיקום שלך.</li>
        <li><b>תוצאות אונליין:</b> דירוגים, ניצחונות והפסדים, רצפים, והיסטוריית משחקי האונליין שלך (משחק, תאריך, הכינוי והאווטאר של היריב, תוצאה). הכינוי, האווטאר והתוצאות מופיעים בטבלאות מובילים פומביות ובהיסטוריה של היריבים שלך.</li>
        <li><b>ליגות חברים</b> שיצרת או הצטרפת אליהן (שם הליגה וקודי השחקנים של החברים).</li>
        <li><b>הודעות ששלחת:</b> משוב, ופרטים טכניים אם התיבה נשארה מסומנת; דיווחים על כינויים.</li></ul>
        <p>אנחנו לא אוספים שמות אמיתיים, כתובות מייל, מספרי טלפון, אנשי קשר או מיקום, ולא מוכרים או משתפים מידע עם אף אחד.</p>`)],
      ["shield", L("Why, where and for how long", "למה, איפה וכמה זמן"), L(
        `<p><b>Why:</b> only to run online play (matches, ratings, leaderboards, leagues, history), to answer feedback and to keep nicknames civil.</p>
        <p><b>Where:</b> the site is hosted by Render and the database by Neon, on servers outside Israel. Both are established cloud providers; connections to them are encrypted.</p>
        <p><b>How long:</b> online data is kept while you use online play. Records with no activity for 24 months may be deleted. Feedback is kept for up to 24 months. The host keeps standard server logs (including IP addresses) under its own policy.</p>`,
        `<p><b>למה:</b> רק כדי להפעיל את המשחק האונליין (משחקים, דירוגים, טבלאות, ליגות, היסטוריה), לענות על משוב ולשמור על כינויים מכבדים.</p>
        <p><b>איפה:</b> האתר מאוחסן ב־Render ומסד הנתונים ב־Neon, על שרתים מחוץ לישראל. שני אלה ספקי ענן מוכרים, והחיבור אליהם מוצפן.</p>
        <p><b>כמה זמן:</b> המידע האונליין נשמר כל עוד משתמשים במשחק האונליין. רשומות שלא היה בהן שימוש 24 חודשים עשויות להימחק. משוב נשמר עד 24 חודשים. ספק האחסון שומר יומני שרת רגילים (כולל כתובות IP) לפי המדיניות שלו.</p>`)],
      ["x", L("Your rights: see, correct, delete", "הזכויות שלך: לעיין, לתקן, למחוק"), L(
        `<p>You can change your nickname and avatar at any time on your profile page. The buttons below delete your data. Deleting from the server removes your record, ratings and league memberships, and removes your nickname, avatar and code from other players' match history (the match itself stays, as "Deleted player"). This can't be undone. For any other request (a copy of your data, a correction), contact us.</p>
        <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn danger" id="pv-all">${icon("x", { size: 15 })} Delete all my data (device and server)</button><button class="btn" id="pv-clear">${icon("x", { size: 15 })} Delete only on this device</button>${contactBtn()}</div>`,
        `<p>אפשר לשנות את הכינוי והאווטאר בכל רגע בעמוד הפרופיל. הכפתורים למטה מוחקים את המידע שלך. מחיקה מהשרת מסירה את הרשומה, הדירוגים והחברות בליגות, ומסירה את הכינוי, האווטאר והקוד שלך מהיסטוריית המשחקים של שחקנים אחרים (המשחק עצמו נשאר, בשם "Deleted player"). אי אפשר לבטל את זה. לכל בקשה אחרת (עותק של המידע, תיקון) אפשר לפנות אלינו.</p>
        <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn danger" id="pv-all">${icon("x", { size: 15 })} מחיקת כל המידע שלי (מכשיר ושרת)</button><button class="btn" id="pv-clear">${icon("x", { size: 15 })} מחיקה רק מהמכשיר הזה</button>${contactBtn()}</div>`)],
      ["users", L("Children", "ילדים"), L(
        `<p>The arcade asks for no personal details, so children can play without giving any. Nicknames are public: choose one that isn't your real full name. Offensive nicknames are blocked automatically, and any player can report one.</p>`,
        `<p>הארקייד לא מבקש שום פרט אישי, כך שילדים יכולים לשחק בלי למסור פרטים. הכינויים פומביים: כדאי לבחור כינוי שאינו השם המלא האמיתי. כינויים פוגעניים נחסמים אוטומטית, וכל שחקן יכול לדווח על כינוי.</p>`)],
      ["book", L("Real players in the data", "שחקנים אמיתיים בנתונים"), L(
        `<p>Player names, clubs, seasons, heights, birth dates and per-game statistics come from public league records (the official Israeli Basketball Premier League site). Ratings are calculated by the game and are not official. A player who wants details about them corrected or removed can contact us.</p>${contactBtn("other", "Request a correction or removal")}`,
        `<p>שמות שחקנים, קבוצות, עונות, גובה, תאריכי לידה וסטטיסטיקה למשחק מגיעים מרשומות פומביות של הליגה (האתר הרשמי של ליגת העל בכדורסל). הדירוגים מחושבים במשחק ואינם רשמיים. שחקן שרוצה לתקן או להסיר פרטים עליו יכול לפנות אלינו.</p>${contactBtn("other", "בקשה לתיקון או הסרה")}`)],
      ["info", L("Third parties", "צדדים שלישיים"), L(
        `<p>Nothing is loaded from other sites: fonts are served by this site. There are no ads, analytics, social buttons or trackers. Daily reminders are off unless you switch them on, and they come from your own browser.</p>`,
        `<p>שום דבר לא נטען מאתרים אחרים: הגופנים מוגשים מהאתר עצמו. אין פרסומות, אנליטיקה, כפתורי רשתות חברתיות או רכיבי מעקב. תזכורות יומיות כבויות אלא אם מפעילים אותן, והן מגיעות מהדפדפן שלך.</p>`)],
      ["refresh", L("Changes", "שינויים"), L(
        `<p>If this policy changes, the new version is published here with a new date.</p>`,
        `<p>אם המדיניות תשתנה, הגרסה החדשה תתפרסם כאן עם תאריך חדש.</p>`)],
    ],
  });
  root.querySelector("#pv-clear").addEventListener("click", () => {
    const snap = store.snapshot();
    const keys = Object.keys(snap);
    if (!keys.length) return undoToast(L("Nothing stored on this device", "שום דבר לא שמור במכשיר הזה"), () => {});
    keys.forEach((k) => store.remove(k));
    store.set("onboarded", true); // don't greet them with the intro right after
    undoToast(L(`Deleted ${keys.length} saved items. Reload to start fresh`, `נמחקו ${keys.length} פריטים שמורים. טעינה מחדש תתחיל מאפס`), () => store.restore(snap), { ms: 10000 });
  }, { signal });
  root.querySelector("#pv-all").addEventListener("click", () => deleteEverything(signal), { signal });
}

/** Delete on the server first (it needs this device's ID), then everything on the device. */
async function deleteEverything(signal) {
  const ok = await confirmDialog({ danger: true, title: L("Delete all your data?", "למחוק את כל המידע שלך?"),
    message: L("Your ratings, match history, league memberships and all your progress on this device will be deleted (display settings such as language and theme stay). This can't be undone.",
      "הדירוגים, היסטוריית המשחקים, החברות בליגות וכל ההתקדמות שלך במכשיר הזה יימחקו (הגדרות תצוגה כמו שפה וערכת נושא נשארות). אי אפשר לבטל את זה."),
    ok: L("Delete everything", "למחוק הכל"), cancel: L("Cancel", "ביטול") });
  if (!ok || signal.aborted) return;
  connect();
  const reply = await new Promise((resolve) => {
    const t = setTimeout(() => { off(); resolve(null); }, 12000);
    const off = onNet((m) => { if (m.t === "deleted") { clearTimeout(t); off(); resolve(m); } });
    const go = () => send({ t: "delete:me" });
    if (netStatus() === "online") go(); else { const off2 = onNet((m) => { if (m.t === "status" && m.status === "online") { off2(); go(); } }); }
  });
  if (!reply?.ok) {
    toast(L("Couldn't reach the server, so nothing was deleted. Try again when you're online.", "לא הצלחנו להגיע לשרת, ולכן שום דבר לא נמחק. אפשר לנסות שוב כשיש חיבור."));
    return;
  }
  const done = L("All your data was deleted", "כל המידע שלך נמחק");
  const keep = new Set(["settings", "units", "sound", "haptics"]); // display preferences aren't personal data
  for (const k of store.keys()) if (!keep.has(k)) store.remove(k); // a new device ID is created on the next visit
  store.set("onboarded", true);
  toast(done);
  setTimeout(() => location.reload(), 1500);
}

// ------------------------------------------------------------------ terms
export function renderTerms(root, signal) {
  page(root, signal, {
    title: L("Terms of use", "תנאי שימוש"),
    intro: L("By using the arcade you agree to these terms. They're short, in plain language.", "השימוש בארקייד מהווה הסכמה לתנאים האלה. הם קצרים ובשפה פשוטה."),
    sections: [
      ["info", L("What this is", "מה זה"), L(
        `<p>A free, non-commercial fan project with basketball games built on public Israeli league data. No account is needed and nothing is for sale.</p>`,
        `<p>פרויקט אוהדים חינמי ולא מסחרי, עם משחקי כדורסל שבנויים על נתונים פומביים של הליגה הישראלית. לא צריך חשבון ושום דבר לא נמכר.</p>`)],
      ["shield", L("Not official, not affiliated", "לא רשמי, לא קשור"), L(
        `<p>The arcade is not affiliated with, endorsed by or connected to the Israeli Basketball Premier League, its clubs or players, Winner (the Israel Sports Betting Board), or Euroleague Basketball. "Winner", "EuroLeague", "Final Four" and club names are trademarks of their owners and are used only to describe the real competitions and teams. Club crests in the game are simple initials drawn by the game, not official logos.</p>`,
        `<p>הארקייד לא קשור, לא נתמך ולא מאושר על ידי ליגת העל בכדורסל, הקבוצות או השחקנים שלה, ווינר (המועצה להסדר ההימורים בספורט) או יורוליג. "ווינר", "EuroLeague", "Final Four" ושמות הקבוצות הם סימנים מסחריים של בעליהם, ומשמשים רק כדי לתאר את המסגרות והקבוצות האמיתיות. סמלי הקבוצות במשחק הם ראשי תיבות פשוטים שהמשחק מצייר, לא לוגואים רשמיים.</p>`)],
      ["x", L("Not gambling", "לא הימורים"), L(
        `<p>There is no money, betting, odds or prizes of any kind. Scores, ratings and simulated results are a game, not predictions, and nothing here is betting advice.</p>`,
        `<p>אין כסף, הימורים, יחסי הימור או פרסים מכל סוג. הניקוד, הדירוגים והתוצאות המדומות הם משחק, לא תחזיות, ושום דבר כאן אינו המלצה להימור.</p>`)],
      ["book", L("The data", "הנתונים"), L(
        `<p>Statistics come from public league records and may contain mistakes or gaps. Player ratings, simulated games and seasons are produced by the game and are not official. EuroLeague statistics are placeholder data for now.</p>`,
        `<p>הסטטיסטיקה מגיעה מרשומות פומביות של הליגה ועלולה לכלול טעויות או חוסרים. דירוגי השחקנים, המשחקים והעונות המדומים נוצרים במשחק ואינם רשמיים. הסטטיסטיקה של היורוליג היא נתוני דמה בינתיים.</p>`)],
      ["users", L("Playing fair", "משחק הוגן"), L(
        `<ul class="pv-list"><li>Pick a nickname that isn't offensive, hateful or sexual, and isn't someone else's identity.</li><li>Don't cheat, use bots or scripts in online play, or try to break, overload or get around the site's protections.</li><li>Don't harass other players.</li></ul>
        <p>We may change a nickname, remove results or block access when these rules are broken, without notice.</p>`,
        `<ul class="pv-list"><li>לבחור כינוי שאינו פוגעני, מסית או מיני, ואינו זהות של מישהו אחר.</li><li>לא לרמות, לא להשתמש בבוטים או בסקריפטים במשחק האונליין, ולא לנסות לשבור, להעמיס או לעקוף את ההגנות של האתר.</li><li>לא להטריד שחקנים אחרים.</li></ul>
        <p>אנחנו רשאים לשנות כינוי, להסיר תוצאות או לחסום גישה כשהכללים האלה מופרים, בלי הודעה מוקדמת.</p>`)],
      ["lock", L("Your content", "התוכן שלך"), L(
        `<p>You're responsible for the nickname you choose and the messages you send. By choosing a nickname you allow the arcade to show it to other players (leaderboards, matches, leagues).</p>`,
        `<p>האחריות על הכינוי שבחרת ועל ההודעות ששלחת היא שלך. בבחירת כינוי מתאפשר לארקייד להציג אותו לשחקנים אחרים (טבלאות, משחקים, ליגות).</p>`)],
      ["info", L("No guarantees", "בלי התחייבות"), L(
        `<p>The arcade is provided free and "as is". It may change, lose data (for example online ratings), be unavailable or stop at any time. To the extent the law allows, the operator is not liable for any damage from using it or from relying on its data.</p>`,
        `<p>הארקייד ניתן בחינם ו"כמות שהוא" (AS IS). הוא עלול להשתנות, לאבד מידע (למשל דירוגי אונליין), להיות לא זמין או להיפסק בכל עת. ככל שהדין מאפשר, המפעיל אינו אחראי לנזק כלשהו מהשימוש בו או מהסתמכות על הנתונים בו.</p>`)],
      ["book", L("Code, design and licenses", "קוד, עיצוב ורישיונות"), L(
        `<p>The arcade's code and design belong to its developer. Fonts and libraries are used under their own licenses (see <a href="#/licenses">Licenses</a>).</p>`,
        `<p>הקוד והעיצוב של הארקייד שייכים למפתח שלו. גופנים וספריות משמשים לפי הרישיונות שלהם (ראו <a href="#/licenses">רישיונות</a>).</p>`)],
      ["globe", L("Law, changes and contact", "דין, שינויים ויצירת קשר"), L(
        `<p>These terms are governed by the laws of the State of Israel, and the competent courts in Israel have exclusive jurisdiction. If the terms change, the new version is published here with a new date.</p>${contactBtn()}`,
        `<p>על התנאים האלה חלים דיני מדינת ישראל, ולבתי המשפט המוסמכים בישראל סמכות השיפוט הבלעדית. אם התנאים ישתנו, הגרסה החדשה תתפרסם כאן עם תאריך חדש.</p>${contactBtn()}`)],
    ],
  });
}

// ------------------------------------------------------------------ accessibility statement
export function renderAccessibility(root, signal) {
  page(root, signal, {
    title: L("Accessibility statement", "הצהרת נגישות"),
    intro: L("We want everyone to be able to play, including people with disabilities.", "אנחנו רוצים שכל אחד יוכל לשחק, כולל אנשים עם מוגבלות."),
    sections: [
      ["check", L("Standard", "תקן"), L(
        `<p>The site aims to meet the Israeli standard IS 5568, based on the Web Content Accessibility Guidelines (WCAG) 2.0 at level AA, under the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 2013. We work to WCAG 2.1 AA where we can.</p>`,
        `<p>האתר שואף לעמוד בתקן הישראלי ת"י 5568, המבוסס על הנחיות WCAG 2.0 ברמה AA, לפי תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג־2013. במקומות שאפשר אנחנו עובדים לפי WCAG 2.1 ברמה AA.</p>`)],
      ["settings", L("What's in place", "מה קיים באתר"), L(
        `<ul class="pv-list"><li>Every game works with the keyboard; shortcuts are listed with "?".</li><li>A "Skip to content" link, visible focus, and a logical heading order on every page.</li><li>Screen readers hear page changes, results, clues and online events; buttons and images have text labels.</li><li>Settings: high contrast, colour-blind safe colours, four text sizes, reduced or paused animations, sound and vibration on or off.</li><li>Full Hebrew interface, right to left, as well as English.</li><li>The page adapts to phones, zoom up to 200% and landscape or portrait.</li><li>Single-player games have no time limits unless you choose them (Time attack, the draft pick timer).</li></ul>`,
        `<ul class="pv-list"><li>כל המשחקים עובדים עם המקלדת; רשימת הקיצורים נפתחת ב־"?".</li><li>קישור "דילוג לתוכן", מיקוד גלוי וסדר כותרות הגיוני בכל עמוד.</li><li>קוראי מסך שומעים מעברי עמודים, תוצאות, רמזים ואירועי אונליין; לכפתורים ולתמונות יש תוויות טקסט.</li><li>הגדרות: ניגודיות גבוהה, צבעים מותאמים לעיוורון צבעים, ארבעה גדלי טקסט, אנימציות מופחתות או מושהות, צליל ורטט לפי בחירה.</li><li>ממשק מלא בעברית מימין לשמאל, וגם באנגלית.</li><li>העמוד מתאים את עצמו לטלפונים, להגדלה עד 200% ולמצב לאורך ולרוחב.</li><li>במשחקי יחיד אין מגבלת זמן, אלא אם בוחרים בה (נגד השעון, שעון הבחירה בדראפט).</li></ul>`)],
      ["search", L("How we check", "איך אנחנו בודקים"), L(
        `<p>Main pages and game screens are tested with the axe-core automated checker (WCAG 2 A and AA rules) in English and Hebrew, and by hand with the keyboard and at phone width.</p>`,
        `<p>העמודים הראשיים ומסכי המשחק נבדקים בכלי הבדיקה האוטומטי axe-core (כללי WCAG 2 ברמות A ו־AA) באנגלית ובעברית, וגם ידנית עם המקלדת וברוחב טלפון.</p>`)],
      ["info", L("Known limitations", "מגבלות ידועות"), L(
        `<ul class="pv-list"><li>The animated court in live games is visual; the same events are written in the play-by-play line next to it, and the box score has everything in tables.</li><li>Online matches have time limits, because both players play at the same time.</li><li>Share images (team and career cards) are pictures; the same information is shown as text on the page.</li></ul>`,
        `<ul class="pv-list"><li>המגרש המונפש במשחקים החיים הוא ויזואלי; אותם אירועים כתובים בשורת התיאור שלידו, וכל המידע מופיע בטבלאות בבוקס סקור.</li><li>במשחקי אונליין יש מגבלת זמן, כי שני השחקנים משחקים בו זמנית.</li><li>תמונות השיתוף (כרטיס קבוצה וכרטיס קריירה) הן תמונות; אותו מידע מוצג כטקסט בעמוד.</li></ul>`)],
      ["chat", L("Something not accessible? Tell us", "משהו לא נגיש? ספרו לנו"), L(
        `<p>Accessibility contact: the site's developer, through the feedback form (choose "Bug" and mention accessibility). Please describe the page and the problem, and the browser and assistive technology you use. We aim to reply within 14 days.</p>${contactBtn("bug", "Report an accessibility problem")}`,
        `<p>רכז הנגישות: מפתח האתר, דרך טופס המשוב (לבחור "תקלה" ולציין שמדובר בנגישות). כדאי לתאר את העמוד ואת הבעיה, ואת הדפדפן והטכנולוגיה המסייעת שבהם משתמשים. אנחנו שואפים לענות תוך 14 ימים.</p>${contactBtn("bug", "דיווח על בעיית נגישות")}`)],
    ],
  });
}

// ------------------------------------------------------------------ licenses
export function renderLicenses(root, signal) {
  const row = ([name, what, license, url]) => `<li><b>${name}</b> <span class="muted">· ${what}</span><br><small>${license} · <a href="${url}" target="_blank" rel="noopener noreferrer">${url.replace(/^https?:\/\//, "")}</a></small></li>`;
  page(root, signal, {
    title: L("Licenses and credits", "רישיונות וקרדיטים"),
    intro: L("The arcade is built on open-source work. Thank you to everyone behind it.", "הארקייד בנוי על עבודת קוד פתוח. תודה לכל מי שעומד מאחוריה."),
    sections: [
      ["book", L("Fonts (served by this site)", "גופנים (מוגשים מהאתר)"), `<ul class="pv-list">${[
        ["Saira Condensed", L("headings", "כותרות"), "SIL Open Font License 1.1", "https://fonts.google.com/specimen/Saira+Condensed"],
        ["Barlow · Barlow Condensed", L("text", "טקסט"), "SIL Open Font License 1.1", "https://fonts.google.com/specimen/Barlow"],
        ["Heebo", L("Hebrew text", "טקסט בעברית"), "SIL Open Font License 1.1", "https://fonts.google.com/specimen/Heebo"],
        ["Inter", L("share images", "תמונות שיתוף"), "SIL Open Font License 1.1", "https://rsms.me/inter/"],
        ["Orbitron", L("scoreboards", "לוחות תוצאות"), "SIL Open Font License 1.1", "https://fonts.google.com/specimen/Orbitron"],
        ["Fontsource", L("font packaging", "אריזת הגופנים"), "MIT", "https://fontsource.org"],
      ].map(row).join("")}</ul>`],
      ["globe", L("Server", "שרת"), `<ul class="pv-list">${[
        ["Node.js", L("runtime", "סביבת הרצה"), "MIT", "https://nodejs.org"],
        ["ws", L("online play (WebSocket)", "משחק אונליין (WebSocket)"), "MIT", "https://github.com/websockets/ws"],
        ["node-postgres (pg)", L("database driver", "חיבור למסד הנתונים"), "MIT", "https://node-postgres.com"],
        ["PostgreSQL", L("database", "מסד נתונים"), "PostgreSQL License", "https://www.postgresql.org/about/licence/"],
      ].map(row).join("")}</ul>`],
      ["settings", L("Development tools (not part of the site)", "כלי פיתוח (לא חלק מהאתר)"), `<ul class="pv-list">${[
        ["axe-core", L("accessibility testing", "בדיקות נגישות"), "MPL 2.0", "https://github.com/dequelabs/axe-core"],
        ["RTLCSS", L("right-to-left stylesheets", "גיליונות סגנון מימין לשמאל"), "MIT", "https://rtlcss.com"],
        ["Acorn", L("reading the code for translation", "קריאת הקוד לתרגום"), "MIT", "https://github.com/acornjs/acorn"],
        ["PGlite", L("database tests", "בדיקות מסד הנתונים"), "Apache 2.0 / PostgreSQL", "https://pglite.dev"],
      ].map(row).join("")}</ul>`],
      ["info", L("Data", "נתונים"), L(
        `<p>Winner League statistics: the official Israeli Basketball Premier League site (bsl.org.il). EuroLeague names, clubs and seasons: EuroLeague records; its statistics in the arcade are placeholder data. Club and competition names are trademarks of their owners.</p>`,
        `<p>הסטטיסטיקה של ליגת ווינר: האתר הרשמי של ליגת העל בכדורסל (bsl.org.il). שמות, קבוצות ועונות של היורוליג: רשומות היורוליג; הסטטיסטיקה שלו בארקייד היא נתוני דמה. שמות הקבוצות והמסגרות הם סימנים מסחריים של בעליהם.</p>`)],
    ],
  });
}
