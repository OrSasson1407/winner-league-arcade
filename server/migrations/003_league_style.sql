-- A friend league's look (a colour and an icon), chosen by its owner (bought in the shop).
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS style jsonb;
