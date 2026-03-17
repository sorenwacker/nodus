-- Add storyline_id to edges to track which storyline created the edge
ALTER TABLE edges ADD COLUMN storyline_id TEXT REFERENCES storylines(id) ON DELETE SET NULL;
