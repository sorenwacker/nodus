-- Storyline feature tables
-- Version: 0.9.1
-- Storylines allow composing research nodes into sequential narratives/papers

-- Storylines table (like chapters/papers)
CREATE TABLE IF NOT EXISTS storylines (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    color TEXT,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Junction table for storyline membership (supports multi-story nodes)
CREATE TABLE IF NOT EXISTS storyline_nodes (
    id TEXT PRIMARY KEY,
    storyline_id TEXT NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    UNIQUE (storyline_id, node_id),
    UNIQUE (storyline_id, sequence_order)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_storylines_workspace ON storylines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storyline_nodes_storyline ON storyline_nodes(storyline_id);
CREATE INDEX IF NOT EXISTS idx_storyline_nodes_node ON storyline_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_storyline_nodes_order ON storyline_nodes(storyline_id, sequence_order);
