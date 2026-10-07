// Nicknames are public (leaderboards, opponents, friend lists), so offensive ones are refused.
// Used by the server (the rule that counts) and by the profile page (to say so before saving).
// The list is short on purpose: slurs and sexual or hateful words in English and Hebrew, matched
// after undoing common disguises (spaces, dots, l33t letters). Anything it misses can be reported
// from the leaderboard and blocked by the admin (see server/index.js, /api/admin/name).

const WORDS = [
  // English
  "fuck", "shit", "cunt", "bitch", "whore", "slut", "dick", "cock", "pussy", "penis", "vagina", "porn", "rape", "rapist",
  "nigger", "nigga", "faggot", "fag", "retard", "spastic", "kike", "chink", "paki", "tranny", "nazi", "hitler", "heil",
  "asshole", "bastard", "motherf", "jizz", "cum", "anal", "sex", "nude", "pedo",
  // Hebrew
  "זונה", "שרמוטה", "שרמוטע", "כוסית", "כוסאמ", "כוסעמק", "כוסשל", "זין", "זיין", "מזדיין", "לזיין", "בןזונה", "בנזונה", "מניאק",
  "הומו", "קוקסינל", "ערבימלוכלך", "מוותלערבים", "נאצי", "היטלר", "פדופיל", "אנס", "סקס", "פורנו",
];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "l" };
const squash = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-֑ͯ-ׇ]/g, "") // accents, Hebrew vowel marks
  .replace(/[013457@$!|8]/g, (c) => LEET[c] || c)
  .replace(/[^a-zא-ת]/g, "") // spaces, dots, dashes, emoji
  .replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ") // final letters
  .replace(/(.)\1+/g, "$1"); // "fuuuck" -> "fuck"
const BLOCKED = WORDS.map(squash);
// short words that are also parts of ordinary names ("Dickson", "Cumberland", "Sexton", "Analise") only count on their own
const WHOLE_ONLY = new Set(["dick", "cock", "cum", "anal", "sex", "fag", "paki", "rape", "kike", "chink", "nude", "pedo", "heil", "nazi", "זין", "אנס", "הומו", "כוסית"].map(squash));

/** True when a nickname contains a blocked word. */
export function isOffensive(name) {
  const s = squash(name);
  if (!s) return false;
  return BLOCKED.some((w) => (WHOLE_ONLY.has(w) ? s === w : s.includes(w)));
}

/** The nickname to show: the player's own, or a neutral one when it's blocked. */
export const safeName = (name, fallback = "Player") => (isOffensive(name) ? fallback : name);
