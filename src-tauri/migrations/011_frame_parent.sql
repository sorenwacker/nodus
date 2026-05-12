-- Add parent_frame_id for nested frames support
ALTER TABLE frames ADD COLUMN parent_frame_id TEXT REFERENCES frames(id);

CREATE INDEX IF NOT EXISTS idx_frames_parent ON frames(parent_frame_id);
