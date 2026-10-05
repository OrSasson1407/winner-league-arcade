// The game screen for a simulated draft game (season games, playoffs, the online final): the shared game
// screen fed by the game engine, with a pre-game graphic, the live view and the full box score.
import { nameLink } from "../components/playerCard.js";
import { emit } from "../lib/achievements.js";
import { keysFor, openGameView } from "../lib/gameView.js";
import { teamPreview } from "../shared/gameSim.js";
import { simOf, simTeam } from "./draft_sim.js";

const meta = (t) => ({ name: t.name, id: t.drafted ? null : t.id, color: t.drafted ? "#e4002b" : undefined });

function preOf(game) {
  const teams = [simTeam(game.home), simTeam(game.away)];
  const previews = teams.map(teamPreview);
  const lineups = teams.map((t) => t.players.slice().sort((a, b) => (t.minutes?.[b.id] ?? b.mpg) - (t.minutes?.[a.id] ?? a.mpg)).slice(0, 5));
  const pre = { previews, lineups, tactics: teams.map((t) => t.tactics) };
  pre.keys = keysFor(meta(game.home), meta(game.away), pre);
  return pre;
}
const link = (l) => nameLink(l.id.split("#")[0], l.name);

export function openBoxScore(game) {
  return openGameView({ home: meta(game.home), away: meta(game.away), sim: simOf(game), label: game.label || "", start: "final", link });
}

export function openLiveGame(game, { celebrate = () => false } = {}) {
  const sim = simOf(game);
  const win = sim.score[0] > sim.score[1] ? game.home : game.away;
  return openGameView({ home: meta(game.home), away: meta(game.away), sim, label: game.label || "", pre: preOf(game), start: "pregame", link,
    celebrate: celebrate({ ...game, winner: win }) ? (win === game.home ? 0 : 1) : null,
    onClose: () => emit("draft:live", { completed: true, final: game.label === "Final" }) });
}
