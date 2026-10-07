-- Every finished online match, for match history, head-to-head records and the
-- weekly / monthly leaderboards.
CREATE TABLE IF NOT EXISTS matches (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  game    text NOT NULL,              -- hl, guess, career, draft, conn, grid
  mode    text NOT NULL,              -- ranked, friendly, bot
  rated   boolean NOT NULL,
  sid0    text,                       -- the two players' device ids (NULL for a bot)
  sid1    text,
  winner  smallint,                   -- 0, 1, or NULL for a draw
  reason  text NOT NULL,              -- done, forfeit, disconnect, timeout…
  players jsonb NOT NULL,             -- per seat: code, name, avatar, bot, rating change, score text
  scores  jsonb                       -- the game's own scores per seat
);
CREATE INDEX IF NOT EXISTS matches_sid0 ON matches (sid0, at DESC);
CREATE INDEX IF NOT EXISTS matches_sid1 ON matches (sid1, at DESC);
CREATE INDEX IF NOT EXISTS matches_ranked_at ON matches (at) WHERE mode = 'ranked';
