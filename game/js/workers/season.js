// Background thread for the All-Time Draft season (about 500 games through the game engine), so the
// page never freezes while it plays. The same seed gives the same season as on the main thread.
import { seededRng } from "../data.js";
import { simulateSeason } from "../games/draft_sim.js";

self.onmessage = (e) => {
  const { id, season, drafted, seed } = e.data || {};
  if (id === undefined) return; // a warm-up message: the data is now loaded
  try { self.postMessage({ id, sim: simulateSeason(season, drafted, seededRng(seed)) }); }
  catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
