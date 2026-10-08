// Heavy work off the main thread (Web Workers), with the same work on the main thread as a fallback
// (old browsers without module workers, or a worker that fails to load).
import { seededRng } from "../data.js";
import { activeLeague } from "../leagueChoice.js";

let worker = null, broken = false, seq = 0;
const waiting = new Map();

function seasonWorker() {
  if (worker || broken || typeof Worker === "undefined") return worker;
  try {
    // the worker can't read the settings: it gets the league in its URL (see leagueChoice.js)
    worker = new Worker(new URL(`../workers/season.js?league=${activeLeague()}`, import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data); } };
    worker.onerror = () => { broken = true; worker?.terminate(); worker = null; for (const w of waiting.values()) w({ error: "worker" }); waiting.clear(); };
  } catch { broken = true; worker = null; }
  return worker;
}

/** Load the worker (and its copy of the data) ahead of time, e.g. while the draft results are on screen. */
export function warmSeason() { seasonWorker()?.postMessage({}); }

/** Simulate an All-Time Draft season; resolves with the same result as simulateSeason(season, drafted, seededRng(seed)). */
export async function simulateSeasonAsync(season, drafted, seed) {
  const w = seasonWorker();
  if (w) {
    const id = ++seq;
    const res = await new Promise((resolve) => { waiting.set(id, resolve); w.postMessage({ id, season, drafted, seed }); });
    if (res.sim) return res.sim;
  }
  const { simulateSeason } = await import("../games/draft_sim.js");
  return simulateSeason(season, drafted, seededRng(seed));
}
