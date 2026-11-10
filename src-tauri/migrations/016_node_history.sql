-- Earlier versions of a node's title and content
-- (docs/content/PRODUCT_DESIGN.md > Node history).
-- A row holds the state a write replaced; the current state is the node row.
CREATE TABLE IF NOT EXISTS node_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    markdown_content TEXT,
    -- 'app' for a write from Nodus (editor, agent, undo, restore),
    -- 'file' for a change picked up from the vault file
    source TEXT NOT NULL,
    saved_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_node_history_node ON node_history(node_id, saved_at);
