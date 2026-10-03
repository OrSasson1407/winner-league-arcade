// My Career: events between games (media, the coach, teammates, the community). Each event offers
// choices with consequences for coach trust, popularity, money, attributes or injury risk.
import { teamName } from "../data.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Event templates. when(C, g) decides if it fits the moment; choices[].do(C) applies the effect and returns a result text. */
const EVENTS = [
  { id: "media-big", when: (C, g) => g && g.line.pts >= 20, title: "Post-game interview",
    text: (C, g) => `You scored ${g.line.pts}. The reporters want a word.`,
    choices: [
      { label: "Credit the team", do: (C) => { C.trust += 3; C.pop += 2; return "The coach liked that. (Trust +3, popularity +2)"; } },
      { label: "\"I can do this every night\"", do: (C) => { C.pop += 5; C.trust -= 1; return "Bold. The fans love it. (Popularity +5, trust −1)"; } },
      { label: "Call out the refs", do: (C) => { C.pop += 7; C.trust -= 5; C.money -= 1500; return "Viral clip, and a $1,500 fine. (Popularity +7, trust −5)"; } },
    ] },
  { id: "media-bad", when: (C, g) => g && !g.won && g.line.min > 10 && g.line.pts <= 4, title: "Tough questions",
    text: () => "A quiet night. A reporter asks if you're in a slump.",
    choices: [
      { label: "\"I'll work harder\"", do: (C) => { C.trust += 2; return "Honest answer. (Trust +2)"; } },
      { label: "Blame your minutes", do: (C) => { C.trust -= 6; C.pop += 2; return "The coach read it in the paper. (Trust −6)"; } },
      { label: "No comment", do: () => "The story dies down." },
    ] },
  { id: "coach-bench", when: (C) => C.cur.role === "starter", title: "Coach's idea",
    text: () => "The coach wants to try you off the bench for a few games, as a spark.",
    choices: [
      { label: "Accept it", do: (C) => { C.trust += 7; return "Team-first. The coach won't forget it. (Trust +7)"; } },
      { label: "Push back", do: (C) => { C.trust -= 8; return "Tense meeting. (Trust −8)"; } },
    ] },
  { id: "coach-defense", when: (C) => C.attrs.def < 70, title: "Film session",
    text: () => "The coach shows clips of your defense. It isn't pretty.",
    choices: [
      { label: "Extra defensive drills", do: (C) => { C.attrs.def = Math.min(99, C.attrs.def + 1); C.trust += 3; return "Defense +1, trust +3."; } },
      { label: "Argue your case", do: (C) => { C.trust -= 7; return "The coach doesn't agree. (Trust −7)"; } },
    ] },
  { id: "coach-position", when: (C) => C.pos2 && C.pos2 !== C.pos, title: "Out of position",
    text: (C) => `Injuries on the team. The coach asks you to play ${C.pos2} for a while.`,
    choices: [
      { label: "Whatever the team needs", do: (C) => { C.trust += 5; C.attrs.iq = Math.min(99, C.attrs.iq + 1); return "Trust +5, IQ +1."; } },
      { label: "Ask to stay at your position", do: (C) => { C.trust -= 3; return "Trust −3."; } },
    ] },
  { id: "extra-shooting", when: () => true, title: "Empty gym",
    text: () => "The arena is empty after practice. Stay and shoot?",
    choices: [
      { label: "500 more threes", do: (C) => { C.attrs.thr = Math.min(99, C.attrs.thr + 1); C.fatigue = (C.fatigue || 0) + 1; return "Three-point +1 (a bit tired)."; } },
      { label: "Go rest", do: () => "Fresh legs for the next game." },
    ] },
  { id: "party", when: (C) => C.age >= 18, title: "Night out",
    text: () => "Teammates are going out the night before a game.",
    choices: [
      { label: "Stay home", do: (C) => { C.trust += 2; return "Professional. (Trust +2)"; } },
      { label: "Go with them", do: (C) => { C.pop += 3; C.injuryRisk = 0.04; C.fatigue = (C.fatigue || 0) + 1; C.trust -= 2; return "Fun night, heavy legs. (Popularity +3, trust −2)"; } },
    ] },
  { id: "teammate", when: () => true, title: "Locker-room tension",
    text: (C) => `A veteran at ${teamName(C.cur.team)} isn't happy about your role.`,
    choices: [
      { label: "Talk it out", do: (C) => { C.trust += 2; return "Cleared the air. (Trust +2)"; } },
      { label: "Let your game talk", do: (C) => { C.pop += 1; return "Popularity +1."; } },
    ] },
  { id: "charity-hospital", when: () => true, title: "Children's hospital visit",
    text: () => "The club organises a visit to a children's hospital.",
    choices: [
      { label: "Go and bring jerseys", do: (C) => { C.pop += 5; C.money -= 800; C.charity = (C.charity || 0) + 1; return "A day nobody there will forget. (Popularity +5)"; } },
      { label: "Skip it", do: (C) => { C.pop -= 1; return "Popularity −1."; } },
    ] },
  { id: "charity-camp", when: () => true, title: "Youth camp",
    text: () => "Your old neighbourhood asks you to run a free basketball camp.",
    choices: [
      { label: "Run the camp", do: (C) => { C.pop += 4; C.attrs.iq = Math.min(99, C.attrs.iq + 1); C.charity = (C.charity || 0) + 1; return "Teaching sharpens you too. (Popularity +4, IQ +1)"; } },
      { label: "Send a video message", do: (C) => { C.pop += 1; return "Popularity +1."; } },
    ] },
  { id: "sponsor", when: (C) => C.pop >= 30, title: "Sponsor offer",
    text: () => "A sports drink wants you in an ad.",
    choices: [
      { label: "Sign it", do: (C) => { const v = 2500 + Math.round(C.pop * 160); C.money += v; C.pop += 2; return `+$${v.toLocaleString()}, popularity +2.`; } },
      { label: "Not now", do: () => "Maybe next season." },
    ] },
  { id: "fans", when: (C) => C.pop >= 15, title: "Fans outside the arena",
    text: () => "A crowd waits for autographs in the rain.",
    choices: [
      { label: "Sign every one", do: (C) => { C.pop += 3; return "Popularity +3."; } },
      { label: "Wave and leave", do: () => "A few disappointed kids." },
    ] },
];

/** After a game: maybe an event (about one game in five). */
export function maybeEvent(C, g) {
  if (Math.random() > 0.2) return null;
  const fits = EVENTS.filter((e) => e.when(C, g));
  if (!fits.length) return null;
  const e = pick(fits);
  return { id: e.id, title: e.title, text: e.text(C, g), choices: e.choices.map((c) => c.label) };
}
export function resolveEvent(C, id, i) {
  const e = EVENTS.find((x) => x.id === id);
  const res = e.choices[i].do(C);
  C.trust = clamp(C.trust, 0, 100); C.pop = clamp(C.pop, 0, 100);
  C.log.unshift({ t: "event", text: `${e.title}: ${res}` });
  return res;
}
