-- The round-by-round record of an online match, for watching it again from the history.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS replay jsonb;
