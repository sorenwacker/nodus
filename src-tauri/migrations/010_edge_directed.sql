-- Add directed column to edges (default true for backwards compatibility)
ALTER TABLE edges ADD COLUMN directed INTEGER NOT NULL DEFAULT 1;
