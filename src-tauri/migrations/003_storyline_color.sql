-- Add color column to storylines table
-- This runs as a separate migration to handle existing databases
ALTER TABLE storylines ADD COLUMN color TEXT;
