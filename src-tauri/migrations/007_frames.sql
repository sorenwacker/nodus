-- Frames table for canvas grouping
CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Frame',
    canvas_x REAL NOT NULL DEFAULT 0,
    canvas_y REAL NOT NULL DEFAULT 0,
    width REAL NOT NULL DEFAULT 400,
    height REAL NOT NULL DEFAULT 300,
    color TEXT,
    workspace_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_frames_workspace ON frames(workspace_id);
