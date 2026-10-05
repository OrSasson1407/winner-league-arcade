-- Online records, friend leagues and feedback (what used to live in server/data/*.json).

-- One row per player (by device id): ratings, wins and losses per game, streaks, this week's
-- league numbers and the public profile, kept as one JSON document (the shape records.js uses).
CREATE TABLE IF NOT EXISTS records (
  sid        text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leagues (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  owner      text NOT NULL,
  members    text[] NOT NULL DEFAULT '{}',
  created    bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  kind    text NOT NULL,
  message text NOT NULL,
  tech    text NOT NULL DEFAULT ''
);
