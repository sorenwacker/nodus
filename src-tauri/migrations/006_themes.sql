-- Themes table for YAML-based theme storage
-- Enables LLM-generated themes and custom user themes

CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    yaml_content TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    workspace_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

-- Index for fast lookup by name
CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name);

-- Index for workspace-specific themes
CREATE INDEX IF NOT EXISTS idx_themes_workspace ON themes(workspace_id);
