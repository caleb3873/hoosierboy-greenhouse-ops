-- Add-a-plant a NEW family (Salvia Species) failed: the auto-created starter recipe has
-- no pot matched yet, so scheduled_crops.container_id was null — but the column was NOT NULL.
-- Pot matching is now a deliberate later step (🪴 Pot Orders worksheet / family-page picker),
-- so an unmatched pot is a valid state. Make container_id nullable.
alter table scheduled_crops alter column container_id drop not null;
