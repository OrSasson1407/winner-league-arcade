// Achievements: definitions (20 per game), progress counters, unlock popups and banner art.
// Games report events with emit("draft:finish", {...}); everything is stored on this device.
import { localDate, store } from "../ui.js";
import { ICON_PATHS } from "./icons.js";
import { sound } from "./fx.js";
import { XP_FOR_TIER, addXP, logActivity, xpFor } from "./progress.js";
import { tr } from "../i18n/index.js";
import { COINS_FOR_TIER, earn, onEvent } from "./wallet.js";
import { trackMission } from "./missions.js";

export const GAMES = {
  draft: { name: "All-Time Draft", short: "DRAFT", color: "#ff7a1a" },
  guess: { name: "Guess the Player", short: "GUESS", color: "#9085e9" },
  hl: { name: "Higher or Lower", short: "HI · LO", color: "#199e70" },
  career: { name: "Career Path", short: "CAREER", color: "#3987e5", soon: true },
  online: { name: "Online 1v1", short: "ONLINE", color: "#e66767" },
  daily: { name: "Daily", short: "DAILY", color: "#c98500" },
  mycareer: { name: "My Career", short: "MY CAREER", color: "#0ea5e9" },
};
export const TIERS = { bronze: "Bronze", silver: "Silver", gold: "Gold", legend: "Legend" };

const C = () => store.get("ach:counters", {});
const n = (c, k) => c[k] || 0;
// prog: [current, target] for progress bars on counter-based achievements
const prog = (k, target) => (c) => [Math.min(n(c, k), target), target];

export const DEFS = [
  // ---------------------------------------------------------------- All-Time Draft
  { id: "d_first", game: "draft", tier: "bronze", icon: "trophy", title: "First Pick", desc: "Finish your first draft.", on: "draft:finish", test: (e, c) => n(c, "draftDone") >= 1, prog: prog("draftDone", 1) },
  { id: "d_vet", game: "draft", tier: "silver", icon: "medal", title: "Draft Veteran", desc: "Finish 10 drafts.", on: "draft:finish", test: (e, c) => n(c, "draftDone") >= 10, prog: prog("draftDone", 10) },
  { id: "d_contender", game: "draft", tier: "bronze", icon: "target", title: "Contender", desc: "Finish a draft with a team score of 87 or more (grade B).", on: "draft:finish", test: (e) => e.total >= 87 },
  { id: "d_champ", game: "draft", tier: "silver", icon: "crown", title: "Champion Grade", desc: "Team score of 91 or more (grade A).", on: "draft:finish", test: (e) => e.total >= 91 },
  { id: "d_dynasty", game: "draft", tier: "gold", icon: "star", title: "Dynasty", desc: "Team score of 95 or more (grade S).", on: "draft:finish", test: (e) => e.total >= 95 },
  { id: "d_fit", game: "draft", tier: "bronze", icon: "check", title: "Perfect Fit", desc: "Every starter plays their own position (no penalties).", on: "draft:finish", test: (e) => e.allOwnPosition },
  { id: "d_chem", game: "draft", tier: "silver", icon: "link", title: "Chemistry Lab", desc: "Reach the maximum chemistry bonus (+5).", on: "draft:finish", test: (e) => e.chem >= 5 },
  { id: "d_mates", game: "draft", tier: "silver", icon: "users", title: "Old Teammates", desc: "Draft 3 or more pairs who were real teammates.", on: "draft:finish", test: (e) => e.teammatePairs >= 3 },
  { id: "d_israel", game: "draft", tier: "silver", icon: "flag", title: "Blue & White", desc: "Score 85+ in an Israelis-only draft.", on: "draft:finish", test: (e) => e.cfg.israelis && e.total >= 85 },
  { id: "d_club", game: "draft", tier: "bronze", icon: "shield", title: "Club Legend", desc: "Finish a Club Legends draft.", on: "draft:finish", test: (e) => !!e.cfg.club },
  { id: "d_money", game: "draft", tier: "gold", icon: "coin", title: "Moneyball", desc: "Score 85+ with the salary cap on.", on: "draft:finish", test: (e) => e.cfg.budget && e.total >= 85 },
  { id: "d_blind", game: "draft", tier: "silver", icon: "eye", title: "Blindfolded", desc: "Grade B or better in blind mode.", on: "draft:finish", test: (e) => e.cfg.blind && e.total >= 87 },
  { id: "d_norespin", game: "draft", tier: "bronze", icon: "refresh", title: "No Regrets", desc: "Finish a draft without using a re-spin.", on: "draft:finish", test: (e) => e.respinsUsed === 0 },
  { id: "d_machine", game: "draft", tier: "gold", icon: "bolt", title: "Beat the Machine", desc: "Beat the Hard computer.", on: "draft:finish", test: (e) => e.mode === "cpu" && e.cpuLevel === "hard" && e.won },
  { id: "d_party", game: "draft", tier: "bronze", icon: "users", title: "Party Host", desc: "Finish a draft room with 3 or more players.", on: "draft:finish", test: (e) => e.mode === "room" && e.humans >= 3 },
  { id: "d_bench", game: "draft", tier: "bronze", icon: "rocket", title: "Bench Mob", desc: "Your sixth man is rated 90 or more.", on: "draft:finish", test: (e) => (e.sixth ?? 0) >= 90 },
  { id: "d_courtside", game: "draft", tier: "bronze", icon: "play", title: "Courtside", desc: "Watch a simulated game live until the final buzzer.", on: "draft:live", test: (e) => e.completed },
  { id: "d_playoffs", game: "draft", tier: "bronze", icon: "arena", title: "Playoff Bound", desc: "Make the playoffs in a simulated season.", on: "draft:season", test: (e) => e.madePlayoffs },
  { id: "d_title", game: "draft", tier: "silver", icon: "trophy", title: "Title Run", desc: "Win the championship in a simulated season.", on: "draft:season", test: (e) => e.champion },
  { id: "d_perfect", game: "draft", tier: "legend", icon: "crown", title: "Perfect Season", desc: "Go undefeated in a simulated regular season.", on: "draft:season", test: (e) => e.losses === 0 },

  // ---------------------------------------------------------------- Guess the Player
  { id: "g_first", game: "guess", tier: "bronze", icon: "search", title: "First Blood", desc: "Win your first game.", on: "guess:end", test: (e, c) => n(c, "guessWins") >= 1, prog: prog("guessWins", 1) },
  { id: "g_rookie", game: "guess", tier: "bronze", icon: "eye", title: "Rookie Scout", desc: "Win 5 games.", on: "guess:end", test: (e, c) => n(c, "guessWins") >= 5, prog: prog("guessWins", 5) },
  { id: "g_scout", game: "guess", tier: "silver", icon: "target", title: "Talent Scout", desc: "Win 25 games.", on: "guess:end", test: (e, c) => n(c, "guessWins") >= 25, prog: prog("guessWins", 25) },
  { id: "g_hof", game: "guess", tier: "gold", icon: "crown", title: "Hall of Famer", desc: "Win 100 games.", on: "guess:end", test: (e, c) => n(c, "guessWins") >= 100, prog: prog("guessWins", 100) },
  { id: "g_ace", game: "guess", tier: "legend", icon: "star", title: "Hole in One", desc: "Guess the player on your very first try.", on: "guess:end", test: (e) => e.won && e.tries === 1 },
  { id: "g_sharp", game: "guess", tier: "gold", icon: "bolt", title: "Sharpshooter", desc: "Win in 2 tries.", on: "guess:end", test: (e) => e.won && e.tries <= 2 },
  { id: "g_quick", game: "guess", tier: "silver", icon: "clock", title: "Quick Study", desc: "Win in 3 tries or fewer.", on: "guess:end", test: (e) => e.won && e.tries <= 3 },
  { id: "g_clutch", game: "guess", tier: "bronze", icon: "flame", title: "Clutch", desc: "Win on your 8th and last try.", on: "guess:end", test: (e) => e.won && e.tries === 8 },
  { id: "g_nohelp", game: "guess", tier: "silver", icon: "check", title: "No Help Needed", desc: "Win 10 games without using a hint.", on: "guess:end", test: (e, c) => n(c, "guessNoHintWins") >= 10, prog: prog("guessNoHintWins", 10) },
  { id: "g_shopper", game: "guess", tier: "bronze", icon: "bulb", title: "Window Shopper", desc: "Buy all 4 hints in one game and still win.", on: "guess:end", test: (e) => e.won && e.hints >= 4 },
  { id: "g_daily", game: "guess", tier: "bronze", icon: "calendar", title: "Daily Habit", desc: "Win a Daily puzzle.", on: "guess:end", test: (e) => e.won && e.mode === "daily" },
  { id: "g_daily7", game: "guess", tier: "gold", icon: "calendar", title: "Daily Grinder", desc: "Win the Daily puzzle on 7 different days.", on: "guess:end", test: (e, c) => (c.guessDailyDays || []).length >= 7, prog: (c) => [Math.min((c.guessDailyDays || []).length, 7), 7] },
  { id: "g_fire", game: "guess", tier: "bronze", icon: "flame", title: "On Fire", desc: "Win 3 games in a row.", on: "guess:end", test: (e) => e.streak >= 3 },
  { id: "g_unstop", game: "guess", tier: "gold", icon: "rocket", title: "Unstoppable", desc: "Win 10 games in a row.", on: "guess:end", test: (e) => e.streak >= 10 },
  { id: "g_stars", game: "guess", tier: "silver", icon: "star", title: "Star Spotter", desc: "Win 10 games in Stars mode.", on: "guess:end", test: (e, c) => n(c, "guessStarsWins") >= 10, prog: prog("guessStarsWins", 10) },
  { id: "g_deep", game: "guess", tier: "silver", icon: "players", title: "Deep Cut", desc: "Win 10 games in All players mode.", on: "guess:end", test: (e, c) => n(c, "guessAllWins") >= 10, prog: prog("guessAllWins", 10) },
  { id: "g_logic", game: "guess", tier: "silver", icon: "target", title: "Pure Logic", desc: "Win in 4 tries or fewer without hints.", on: "guess:end", test: (e) => e.won && e.hints === 0 && e.tries <= 4 },
  { id: "g_marathon", game: "guess", tier: "silver", icon: "clock", title: "Marathon", desc: "Play 50 games.", on: "guess:end", test: (e, c) => n(c, "guessPlayed") >= 50, prog: prog("guessPlayed", 50) },
  { id: "g_bounce", game: "guess", tier: "bronze", icon: "refresh", title: "Bounce Back", desc: "Win right after a loss.", on: "guess:end", test: (e) => e.won && e.prevLost },
  { id: "g_iron", game: "guess", tier: "gold", icon: "shield", title: "Iron Will", desc: "Win 3 games in a row without any hints.", on: "guess:end", test: (e, c) => n(c, "guessNoHintStreak") >= 3, prog: prog("guessNoHintStreak", 3) },

  // ---------------------------------------------------------------- Higher or Lower
  { id: "h_first", game: "hl", tier: "bronze", icon: "check", title: "First Call", desc: "Get your first answer right.", on: "hl:answer", test: (e) => e.ok },
  { id: "h_hot", game: "hl", tier: "bronze", icon: "flame", title: "Hot Hand", desc: "A streak of 5 in Classic.", on: "hl:answer", test: (e) => e.type === "classic" && e.score >= 5 },
  { id: "h_ten", game: "hl", tier: "silver", icon: "target", title: "Double Digits", desc: "A streak of 10 in Classic.", on: "hl:answer", test: (e) => e.type === "classic" && e.score >= 10 },
  { id: "h_25", game: "hl", tier: "gold", icon: "crown", title: "Mr. 25", desc: "A streak of 25 in Classic.", on: "hl:answer", test: (e) => e.type === "classic" && e.score >= 25 },
  { id: "h_50", game: "hl", tier: "legend", icon: "star", title: "Untouchable", desc: "A streak of 50 in Classic.", on: "hl:answer", test: (e) => e.type === "classic" && e.score >= 50 },
  { id: "h_surv", game: "hl", tier: "silver", icon: "heart", title: "Survivor", desc: "Score 15 in 3 Lives.", on: "hl:answer", test: (e) => e.type === "lives" && e.score >= 15 },
  { id: "h_iron", game: "hl", tier: "gold", icon: "shield", title: "Nine Lives", desc: "Score 30 in 3 Lives.", on: "hl:answer", test: (e) => e.type === "lives" && e.score >= 30 },
  { id: "h_flawless", game: "hl", tier: "silver", icon: "heart", title: "Flawless", desc: "Score 10 in 3 Lives without losing a life.", on: "hl:answer", test: (e) => e.type === "lives" && e.score >= 10 && e.wrongs === 0 },
  { id: "h_clock", game: "hl", tier: "bronze", icon: "timer", title: "Beat the Clock", desc: "Score 10 in Time attack.", on: "hl:answer", test: (e) => e.type === "time" && e.score >= 10 },
  { id: "h_speed", game: "hl", tier: "silver", icon: "bolt", title: "Speed Demon", desc: "Score 20 in Time attack.", on: "hl:answer", test: (e) => e.type === "time" && e.score >= 20 },
  { id: "h_light", game: "hl", tier: "gold", icon: "rocket", title: "Lightning", desc: "Score 30 in Time attack.", on: "hl:answer", test: (e) => e.type === "time" && e.score >= 30 },
  { id: "h_sweep", game: "hl", tier: "gold", icon: "check", title: "Clean Sweep", desc: "Finish Time attack with 15+ and no wrong answers.", on: "hl:over", test: (e) => e.type === "time" && e.score >= 15 && e.wrongs === 0 },
  { id: "h_mirror", game: "hl", tier: "silver", icon: "users", title: "Mirror Match", desc: "A streak of 10 with Same player pairs (Classic).", on: "hl:answer", test: (e) => e.type === "classic" && e.pairs === "same" && e.score >= 10 },
  { id: "h_reb", game: "hl", tier: "silver", icon: "hoop", title: "Glass Cleaner", desc: "A streak of 10 in Rebounds (Classic).", on: "hl:answer", test: (e) => e.type === "classic" && e.mode === "rpg" && e.score >= 10 },
  { id: "h_ast", game: "hl", tier: "silver", icon: "link", title: "Dime Dropper", desc: "A streak of 10 in Assists (Classic).", on: "hl:answer", test: (e) => e.type === "classic" && e.mode === "apg" && e.score >= 10 },
  { id: "h_pts", game: "hl", tier: "silver", icon: "ball", title: "Bucket Getter", desc: "A streak of 10 in Points (Classic).", on: "hl:answer", test: (e) => e.type === "classic" && e.mode === "ppg" && e.score >= 10 },
  { id: "h_rating", game: "hl", tier: "silver", icon: "star", title: "Scout's Eye", desc: "A streak of 10 in Rating (Classic).", on: "hl:answer", test: (e) => e.type === "classic" && e.mode === "rating" && e.score >= 10 },
  { id: "h_tie", game: "hl", tier: "bronze", icon: "whistle", title: "Dead Heat", desc: "Answer a pair where both numbers are exactly equal.", on: "hl:answer", test: (e) => e.tie },
  { id: "h_grind", game: "hl", tier: "gold", icon: "medal", title: "Grinder", desc: "500 correct answers in total.", on: "hl:answer", test: (e, c) => n(c, "hlCorrect") >= 500, prog: prog("hlCorrect", 500) },
  { id: "h_regular", game: "hl", tier: "bronze", icon: "calendar", title: "Regular", desc: "Play 25 games.", on: "hl:over", test: (e, c) => n(c, "hlGames") >= 25, prog: prog("hlGames", 25) },

  // ---------------------------------------------------------------- Online 1v1 (bot games don't count unless stated)
  { id: "o_first", game: "online", tier: "bronze", icon: "globe", title: "First Online Win", desc: "Win an online match against a real player.", on: "online:finish", test: (e, c) => n(c, "onWins") >= 1, prog: prog("onWins", 1) },
  { id: "o_10", game: "online", tier: "silver", icon: "medal", title: "Online Regular", desc: "Win 10 online matches.", on: "online:finish", test: (e, c) => n(c, "onWins") >= 10, prog: prog("onWins", 10) },
  { id: "o_50", game: "online", tier: "gold", icon: "trophy", title: "Online Star", desc: "Win 50 online matches.", on: "online:finish", test: (e, c) => n(c, "onWins") >= 50, prog: prog("onWins", 50) },
  { id: "o_100", game: "online", tier: "legend", icon: "crown", title: "Online Legend", desc: "Win 100 online matches.", on: "online:finish", test: (e, c) => n(c, "onWins") >= 100, prog: prog("onWins", 100) },
  { id: "o_games", game: "online", tier: "bronze", icon: "clock", title: "Showing Up", desc: "Play 25 online matches.", on: "online:finish", test: (e, c) => n(c, "onGames") >= 25, prog: prog("onGames", 25) },
  { id: "o_streak3", game: "online", tier: "bronze", icon: "flame", title: "Heating Up", desc: "Win 3 ranked matches in a row.", on: "online:finish", test: (e) => e.rated && e.streak >= 3 },
  { id: "o_streak10", game: "online", tier: "gold", icon: "rocket", title: "Unbeatable", desc: "Win 10 ranked matches in a row.", on: "online:finish", test: (e) => e.rated && e.streak >= 10 },
  { id: "o_silver", game: "online", tier: "bronze", icon: "shield", title: "Silver Rank", desc: "Reach Silver rank (1100) in any game.", on: "online:finish", test: (e) => (e.bestElo ?? 0) >= 1100 },
  { id: "o_gold", game: "online", tier: "silver", icon: "star", title: "Gold Rank", desc: "Reach Gold rank (1250) in any game.", on: "online:finish", test: (e) => (e.bestElo ?? 0) >= 1250 },
  { id: "o_plat", game: "online", tier: "gold", icon: "bolt", title: "Platinum Rank", desc: "Reach Platinum rank (1400) in any game.", on: "online:finish", test: (e) => (e.bestElo ?? 0) >= 1400 },
  { id: "o_champ", game: "online", tier: "legend", icon: "crown", title: "Champion Rank", desc: "Reach Champion rank (1700) in any game.", on: "online:finish", test: (e) => (e.bestElo ?? 0) >= 1700 },
  { id: "o_comeback", game: "online", tier: "silver", icon: "refresh", title: "Comeback Kid", desc: "Win a match after trailing your opponent.", on: "online:finish", test: (e) => e.mode !== "bot" && e.result === "win" && e.comeback },
  { id: "o_hl", game: "online", tier: "silver", icon: "chart", title: "Speed Duelist", desc: "Win 10 Higher or Lower duels.", on: "online:finish", test: (e, c) => n(c, "onWin_hl") >= 10, prog: prog("onWin_hl", 10) },
  { id: "o_guess", game: "online", tier: "silver", icon: "search", title: "Race Winner", desc: "Win 10 Guess the Player races.", on: "online:finish", test: (e, c) => n(c, "onWin_guess") >= 10, prog: prog("onWin_guess", 10) },
  { id: "o_career", game: "online", tier: "silver", icon: "arrowRight", title: "Quick Buzzer", desc: "Win 10 Career Path buzzer quizzes.", on: "online:finish", test: (e, c) => n(c, "onWin_career") >= 10, prog: prog("onWin_career", 10) },
  { id: "o_draft", game: "online", tier: "silver", icon: "trophy", title: "War Room", desc: "Win 10 head-to-head drafts.", on: "online:finish", test: (e, c) => n(c, "onWin_draft") >= 10, prog: prog("onWin_draft", 10) },
  { id: "o_allfour", game: "online", tier: "gold", icon: "games", title: "Four-Sport Athlete", desc: "Win an online match in each of the four games.", on: "online:finish", test: (e, c) => ["hl", "guess", "career", "draft"].every((g) => n(c, "onWin_" + g) >= 1), prog: (c) => [["hl", "guess", "career", "draft"].filter((g) => n(c, "onWin_" + g) >= 1).length, 4] },
  { id: "o_friend", game: "online", tier: "bronze", icon: "users", title: "Squad Up", desc: "Add a friend by their player code.", on: "online:friend", test: (e) => e.count >= 1 },
  { id: "o_friendly", game: "online", tier: "bronze", icon: "heart", title: "Friendly Fire", desc: "Play 5 matches with friends (invites).", on: "online:finish", test: (e, c) => n(c, "onFriendly") >= 5, prog: prog("onFriendly", 5) },
  // ---------------------------------------------------------------- My Career
  { id: "mc_pro", game: "mycareer", tier: "bronze", icon: "clipboard", title: "Signed!", desc: "Sign your first pro contract.", on: "mc:pro", test: () => true },
  { id: "mc_debut", game: "mycareer", tier: "bronze", icon: "jersey", title: "Debut", desc: "Play your first pro game.", on: "mc:game", test: (e) => !e.dnp },
  { id: "mc_starter", game: "mycareer", tier: "bronze", icon: "star", title: "Starting Five", desc: "Earn a starter's role.", on: "mc:game", test: (e) => e.role === "starter" && !e.dnp },
  { id: "mc_20", game: "mycareer", tier: "bronze", icon: "ball", title: "Twenty Piece", desc: "Score 20 points in a game.", on: "mc:game", test: (e) => e.pts >= 20 },
  { id: "mc_40", game: "mycareer", tier: "gold", icon: "flame", title: "Forty Bomb", desc: "Score 40 points in a game.", on: "mc:game", test: (e) => e.pts >= 40 },
  { id: "mc_dd", game: "mycareer", tier: "silver", icon: "hoop", title: "Double-Double", desc: "Reach double figures in two stats in one game.", on: "mc:game", test: (e) => ["pts", "reb", "ast", "stl", "blk"].filter((k) => e[k] >= 10).length >= 2 },
  { id: "mc_td", game: "mycareer", tier: "gold", icon: "crown", title: "Triple-Double", desc: "Double figures in three stats in one game.", on: "mc:game", test: (e) => ["pts", "reb", "ast", "stl", "blk"].filter((k) => e[k] >= 10).length >= 3 },
  { id: "mc_allstar", game: "mycareer", tier: "silver", icon: "star", title: "All-Star", desc: "Get picked for the All-Star game.", on: "mc:trophy", test: (e) => e.type === "allstar" },
  { id: "mc_cup", game: "mycareer", tier: "silver", icon: "medal", title: "Cup Winner", desc: "Win the State Cup.", on: "mc:trophy", test: (e) => e.type === "cup" },
  { id: "mc_title", game: "mycareer", tier: "gold", icon: "trophy", title: "Champion", desc: "Win the championship.", on: "mc:trophy", test: (e) => e.type === "title" },
  { id: "mc_euro", game: "mycareer", tier: "gold", icon: "crown", title: "Kings of Europe", desc: "Win the EuroLeague.", on: "mc:trophy", test: (e) => e.type === "euroleague" },
  { id: "mc_nba", game: "mycareer", tier: "gold", icon: "rocket", title: "The Call", desc: "Sign with an NBA team.", on: "mc:sign", test: (e) => e.nba },
  { id: "mc_nba_title", game: "mycareer", tier: "legend", icon: "trophy", title: "World Champion", desc: "Win the NBA title.", on: "mc:trophy", test: (e) => e.type === "nba" },
  { id: "mc_roy", game: "mycareer", tier: "silver", icon: "rocket", title: "Rookie of the Year", desc: "Win Rookie of the Year.", on: "mc:award", test: (e) => e.name === "Rookie of the Year" },
  { id: "mc_mvp", game: "mycareer", tier: "gold", icon: "crown", title: "MVP", desc: "Win the MVP award.", on: "mc:award", test: (e) => e.name === "MVP" },
  { id: "mc_1000", game: "mycareer", tier: "silver", icon: "target", title: "1,000 Club", desc: "Reach 1,000 career points.", on: "mc:season", test: (e) => e.pts >= 1000 },
  { id: "mc_record", game: "mycareer", tier: "gold", icon: "flag", title: "Record Breaker", desc: "Pass the real all-time points leader since 2010-11 (3,460).", on: "mc:season", test: (e) => e.pts > 3460 },
  { id: "mc_10", game: "mycareer", tier: "gold", icon: "calendar", title: "Decade of Hoops", desc: "Play 10 pro seasons.", on: "mc:season", test: (e) => e.seasons >= 10 },
  { id: "mc_loan", game: "mycareer", tier: "bronze", icon: "arrowRight", title: "Loan Ranger", desc: "Go on loan to get more minutes.", on: "mc:loan", test: () => true },
  { id: "mc_legend", game: "mycareer", tier: "legend", icon: "shield", title: "Club Legend", desc: "Have your jersey retired by a club.", on: "mc:retire", test: (e) => e.legends >= 1 },
  { id: "mc_hof", game: "mycareer", tier: "legend", icon: "crown", title: "Hall of Famer", desc: "Retire into the Hall of Fame.", on: "mc:retire", test: (e) => e.hof },

  // ---------------------------------------------------------------- Daily challenges
  { id: "dy_first", game: "daily", tier: "bronze", icon: "calendar", title: "Daily Starter", desc: "Finish your first daily challenge.", on: "daily:done", test: (e) => e.total >= 1 },
  { id: "dy_full", game: "daily", tier: "bronze", icon: "games", title: "Full House", desc: "Finish every daily challenge in one day.", on: "daily:done", test: (e) => e.today >= 6 },
  { id: "dy_7", game: "daily", tier: "silver", icon: "flame", title: "One Week Strong", desc: "A 7-day daily streak.", on: "daily:done", test: (e) => e.streak >= 7, prog: () => [Math.min(7, store.get("daily:best", 0)), 7] },
  { id: "dy_30", game: "daily", tier: "gold", icon: "rocket", title: "Monthly Regular", desc: "A 30-day daily streak.", on: "daily:done", test: (e) => e.streak >= 30, prog: () => [Math.min(30, store.get("daily:best", 0)), 30] },
  { id: "dy_100", game: "daily", tier: "legend", icon: "crown", title: "Century", desc: "A 100-day daily streak.", on: "daily:done", test: (e) => e.streak >= 100, prog: () => [Math.min(100, store.get("daily:best", 0)), 100] },
  { id: "dy_25", game: "daily", tier: "silver", icon: "medal", title: "Daily Grinder", desc: "Finish 25 daily challenges.", on: "daily:done", test: (e) => e.total >= 25 },
  { id: "dy_100t", game: "daily", tier: "gold", icon: "trophy", title: "Daily Devotee", desc: "Finish 100 daily challenges.", on: "daily:done", test: (e) => e.total >= 100 },
  { id: "dy_full7", game: "daily", tier: "gold", icon: "star", title: "Seven Full Houses", desc: "Finish every daily on 7 different days.", on: "daily:done", test: (e) => e.fullDays >= 7 },
  { id: "o_bot", game: "online", tier: "gold", icon: "target", title: "Machine Breaker", desc: "Beat the Legend Bot (hard).", on: "online:finish", test: (e) => e.mode === "bot" && e.botLevel === "hard" && e.result === "win" },
];
export const byId = new Map(DEFS.map((d) => [d.id, d]));

// ---------------------------------------------------------------- counters per event
function updateCounters(event, e) {
  const c = C();
  const inc = (k, by = 1) => { c[k] = (c[k] || 0) + by; };
  if (event === "draft:finish") inc("draftDone");
  if (event === "guess:end") {
    inc("guessPlayed");
    e.prevLost = c.guessLastLost === true;
    c.guessLastLost = !e.won;
    if (e.won) {
      inc("guessWins");
      if (e.level === "easy") inc("guessStarsWins"); else inc("guessAllWins");
      if (e.hints === 0) { inc("guessNoHintWins"); inc("guessNoHintStreak"); } else c.guessNoHintStreak = 0;
      if (e.mode === "daily") c.guessDailyDays = [...new Set([...(c.guessDailyDays || []), localDate()])];
    } else c.guessNoHintStreak = 0;
  }
  if (event === "hl:answer" && e.ok) inc("hlCorrect");
  if (event === "hl:over") inc("hlGames");
  if (event === "online:finish" && e.mode !== "bot") {
    inc("onGames");
    if (e.mode === "friendly") inc("onFriendly");
    if (e.result === "win") { inc("onWins"); inc("onWin_" + e.game); }
  }
  store.set("ach:counters", c);
  return c;
}

export const unlockedMap = () => store.get("ach:unlocked", {});
export const isUnlocked = (id) => !!unlockedMap()[id];

function unlock(ids) {
  if (!ids.length) return;
  const map = unlockedMap();
  const fresh = ids.filter((id) => !map[id]);
  if (!fresh.length) return;
  const when = new Date().toISOString();
  for (const id of fresh) map[id] = when;
  store.set("ach:unlocked", map);
  for (const id of fresh) { logActivity("ach", { id }); addXP(XP_FOR_TIER[byId.get(id).tier], "achievement"); earn(COINS_FOR_TIER[byId.get(id).tier], "achievement"); }
  fresh.forEach((id, i) => setTimeout(() => showUnlock(byId.get(id)), i * 1600));
  document.dispatchEvent(new CustomEvent("achievements-changed"));
}

/** Report a game event; unlocks every achievement whose test passes. */
// what the monthly recap needs from each event (hl:answer is too frequent to log one by one)
const LOGGED = {
  "draft:finish": (e) => ({ g: "draft", total: Math.round(e.total * 10) / 10 }),
  "draft:season": (e) => ({ g: "draft", champion: !!e.champion }),
  "guess:end": (e) => ({ g: "guess", won: !!e.won, tries: e.tries }),
  "hl:over": (e) => ({ g: "hl", score: e.score, type: e.type, xpRun: e.xpRun || 0 }),
  "career:finish": (e) => ({ g: "career", score: e.score }),
  "online:finish": (e) => ({ g: "online", game: e.game, result: e.result }),
  "daily:done": (e) => ({ g: "daily", game: e.game, streak: e.streak }),
  "conn:end": (e) => ({ g: "connections", won: !!e.won, mistakes: e.mistakes }),
  "grid:end": (e) => ({ g: "grid", filled: e.filled, score: e.score }),
  "mc:season": (e) => ({ g: "mycareer", seasons: e.seasons, overall: e.overall }),
  "mc:retire": (e) => ({ g: "mycareer", hof: !!e.hof }),
};

export function emit(event, data = {}) {
  const e = { ...data };
  const c = updateCounters(event, e);
  addXP(xpFor(event, e), event, { log: event !== "hl:answer" });
  onEvent(event, e); // Buckets for the shop
  trackMission(event, e); // weekly missions
  if (LOGGED[event]) logActivity(event, LOGGED[event](e));
  unlock(DEFS.filter((d) => d.on === event && !isUnlocked(d.id) && safe(() => d.test(e, c))).map((d) => d.id));
}
const safe = (fn) => { try { return !!fn(); } catch { return false; } };

/** Unlock achievements already earned before this system existed (from saved records). */
export function retroSync() {
  const ids = [];
  const draftBest = store.get("draft:best", 0);
  if (draftBest > 0) ids.push("d_first");
  if (draftBest >= 87) ids.push("d_contender");
  if (draftBest >= 91) ids.push("d_champ");
  if (draftBest >= 95) ids.push("d_dynasty");
  const gs = store.get("guess:stats", null);
  const c = C();
  const boardLen = store.get("draft:board", []).length; // drafts finished before achievements existed
  if (boardLen > (c.draftDone || 0)) { c.draftDone = boardLen; store.set("ach:counters", c); }
  if (gs && !c.guessSynced) { // seed counters once from the existing Guess stats
    c.guessPlayed = Math.max(c.guessPlayed || 0, gs.played || 0);
    c.guessWins = Math.max(c.guessWins || 0, gs.wins || 0);
    c.guessSynced = true;
    store.set("ach:counters", c);
  }
  const wins = C().guessWins || 0;
  if (wins >= 1) ids.push("g_first");
  if (wins >= 5) ids.push("g_rookie");
  if (wins >= 25) ids.push("g_scout");
  if (wins >= 100) ids.push("g_hof");
  const gStreakBest = Math.max(gs?.maxStreak || 0, store.get("guess:streak", 0));
  if (gStreakBest >= 3) ids.push("g_fire");
  if (gStreakBest >= 10) ids.push("g_unstop");
  const hl = store.get("hl:best:mixed", 0);
  if (hl >= 1) ids.push("h_first");
  if (hl >= 5) ids.push("h_hot");
  if (hl >= 10) ids.push("h_ten");
  if (hl >= 25) ids.push("h_25");
  if (hl >= 50) ids.push("h_50");
  // silently: no popup storm for old records
  const map = unlockedMap();
  let changed = false;
  for (const id of ids) if (!map[id]) { map[id] = new Date().toISOString(); changed = true; }
  if (changed) store.set("ach:unlocked", map);
}

export function progressOf(def) {
  return def.prog ? def.prog(C()) : null;
}

// ---------------------------------------------------------------- banner art
const TIER_FILL = {
  bronze: ["#d39252", "#8a5226"], silver: ["#e3e8ef", "#8c97a8"], gold: ["#ffd86b", "#b8860b"], legend: null,
};

function wrap(title, max = 12) {
  const words = tr(title).toUpperCase().split(" "); // the banner's words, in the interface language
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + " " + w).trim();
  }
  return lines.slice(0, 3);
}

/** Hanging championship-style banner (SVG). */
export function bannerSvg(def, { locked = false, width = 120 } = {}) {
  const g = GAMES[def.game];
  const id = `bn-${def.id}-${locked ? "l" : "u"}`;
  const [t1, t2] = TIER_FILL[def.tier] || ["#ff9de2", "#7ab8ff"];
  const lines = wrap(def.title);
  const stars = { bronze: 1, silver: 2, gold: 3, legend: 4 }[def.tier];
  const fillDefs = locked
    ? `<linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4357"/><stop offset="1" stop-color="#232a3a"/></linearGradient>`
    : def.tier === "legend"
      ? `<linearGradient id="${id}-f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd86b"/><stop offset=".35" stop-color="#ff7ad9"/><stop offset=".7" stop-color="#7ab8ff"/><stop offset="1" stop-color="#7dffb2"/></linearGradient>`
      : `<linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t1}"/><stop offset="1" stop-color="${t2}"/></linearGradient>`;
  const ink = locked ? "#8b95aa" : def.tier === "silver" || def.tier === "gold" || def.tier === "legend" ? "#1b1206" : "#fff7ee";
  const band = locked ? "#4a5468" : g.color;
  const iconPath = ICON_PATHS[locked ? "lock" : def.icon] || ICON_PATHS.star;
  return `<svg class="banner ${locked ? "locked" : ""} tier-${def.tier}" width="${width}" height="${Math.round(width * 1.5)}" viewBox="0 0 120 180" role="img" aria-label="${locked ? "Locked: " : ""}${def.title} banner">
    <defs>${fillDefs}
      <linearGradient id="${id}-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(255,255,255,0)"/><stop offset=".5" stop-color="rgba(255,255,255,.35)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></linearGradient>
    </defs>
    <path d="M30 2 L60 14 L90 2" fill="none" stroke="#6b7280" stroke-width="1.5"/>
    <rect x="6" y="12" width="108" height="6" rx="3" fill="#9aa3b2"/>
    <path d="M12 18 H108 V146 L60 174 L12 146 Z" fill="url(#${id}-f)" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
    <path d="M18 24 H102 V142 L60 166 L18 142 Z" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="1.2"/>
    <rect x="12" y="18" width="96" height="16" fill="${band}"/>
    <text x="60" y="30" text-anchor="middle" font-family="Orbitron, Barlow Condensed, sans-serif" font-weight="800" font-size="8.5" letter-spacing="1.5" fill="#fff">${g.short}</text>
    <circle cx="60" cy="64" r="21" fill="rgba(0,0,0,.18)" stroke="${ink}" stroke-opacity=".55" stroke-width="1.5"/>
    <g transform="translate(46 50) scale(1.17)" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</g>
    ${lines.map((l, i) => `<text x="60" y="${101 + i * 13}" text-anchor="middle" font-family="Barlow Condensed, Inter, sans-serif" font-weight="700" font-size="${l.length > 10 ? 11 : 12.5}" letter-spacing=".5" fill="${ink}">${l}</text>`).join("")}
    <g fill="${ink}" fill-opacity="${locked ? ".35" : ".85"}">${Array.from({ length: stars }, (_, i) => {
      const x = 60 + (i - (stars - 1) / 2) * 11;
      return `<path transform="translate(${x - 4} 145) scale(.34)" d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3 1.2-6.5L2.5 8.9 9.1 8z"/>`;
    }).join("")}</g>
    ${locked ? "" : `<path d="M12 18 H108 V146 L60 174 L12 146 Z" fill="url(#${id}-s)" class="banner-shine"/>`}
  </svg>`;
}

// ---------------------------------------------------------------- unlock popup
function showUnlock(def) {
  if (!def) return;
  const el = document.createElement("div");
  el.className = "ach-pop";
  el.setAttribute("role", "status");
  el.innerHTML = `${bannerSvg(def, { width: 64 })}<div><small>Achievement unlocked · ${TIERS[def.tier]}</small><b>${def.title}</b><span>${def.desc}</span></div>`;
  el.addEventListener("click", () => { location.hash = `#/achievements?game=${def.game}`; el.remove(); });
  document.body.appendChild(el);
  sound.play("win");
  setTimeout(() => el.classList.add("out"), 3600);
  setTimeout(() => el.remove(), 4200);
}

export function totals() {
  const map = unlockedMap();
  const live = DEFS;
  return { done: live.filter((d) => map[d.id]).length, total: live.length };
}
