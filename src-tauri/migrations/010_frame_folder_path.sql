-- Add folder_path column to frames for folder-frame sync
ALTER TABLE frames ADD COLUMN folder_path TEXT;
CREATE INDEX IF NOT EXISTS idx_frames_folder_path ON frames(folder_path);
