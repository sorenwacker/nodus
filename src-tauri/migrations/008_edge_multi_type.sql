-- Migration 008: Allow multiple edges between same nodes with different link_types
-- This is needed for ontology imports where classes can have multiple relationships
--
-- SQLite doesn't support dropping constraints directly, so we need to recreate the table.
-- Idempotency lives in Rust (database/mod.rs): this file only runs when the edges
-- table still has the old 2-column unique constraint, inside a transaction, after
-- any leftover edges_new from an interrupted run has been dropped. The directed
-- column is guaranteed to exist because its ALTER migration runs first.

-- Step 1: Create new table with updated constraint
CREATE TABLE edges_new (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label TEXT,
    link_type TEXT NOT NULL DEFAULT 'related',
    weight REAL NOT NULL DEFAULT 1.0,
    color TEXT,
    storyline_id TEXT REFERENCES storylines(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    directed INTEGER NOT NULL DEFAULT 1,

    -- New constraint includes link_type to allow multiple edge types between same nodes
    UNIQUE(source_node_id, target_node_id, link_type)
);

-- Step 2: Copy data from old table
INSERT INTO edges_new (id, source_node_id, target_node_id, label, link_type, weight, color, storyline_id, created_at, directed)
SELECT id, source_node_id, target_node_id, label, link_type, weight, color, storyline_id, created_at, directed
FROM edges;

-- Step 3: Drop old table
DROP TABLE edges;

-- Step 4: Rename new table
ALTER TABLE edges_new RENAME TO edges;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_storyline ON edges(storyline_id);
