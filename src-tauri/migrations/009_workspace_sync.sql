-- Add sync_enabled flag to workspaces
-- When true, new files in vault create nodes, and new nodes create files

ALTER TABLE workspaces ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0;
