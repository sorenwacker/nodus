-- Links whose target node does not exist yet, resolved when a matching
-- node is created or renamed
CREATE TABLE IF NOT EXISTS pending_wikilinks (
    source_node_id TEXT NOT NULL,
    target_key TEXT NOT NULL,
    PRIMARY KEY (source_node_id, target_key)
);
CREATE INDEX IF NOT EXISTS idx_pending_wikilinks_target ON pending_wikilinks (target_key);
