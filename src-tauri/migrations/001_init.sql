-- Nodus Database Schema
-- Version: 0.9.0
-- Local-first knowledge graph with EU sovereignty

-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Workspaces (must be created first - referenced by nodes and frames)
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    vault_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Default workspace
INSERT OR IGNORE INTO workspaces (id, name, color, created_at, updated_at)
VALUES ('default', 'Default', '#3b82f6', strftime('%s', 'now'), strftime('%s', 'now'));

-- 2. Frames: Spatial grouping on canvas (must be before nodes)
CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT,
    canvas_x REAL NOT NULL DEFAULT 0.0,
    canvas_y REAL NOT NULL DEFAULT 0.0,
    width REAL NOT NULL DEFAULT 600.0,
    height REAL NOT NULL DEFAULT 400.0,
    color TEXT,
    is_collapsed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 3. Nodes: The fundamental unit of the graph (after workspaces and frames)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,

    -- Content & Source
    file_path TEXT UNIQUE,
    markdown_content TEXT,
    node_type TEXT NOT NULL DEFAULT 'note',

    -- Spatial Metadata (Nodus exclusive)
    canvas_x REAL NOT NULL DEFAULT 0.0,
    canvas_y REAL NOT NULL DEFAULT 0.0,
    width REAL NOT NULL DEFAULT 200.0,
    height REAL NOT NULL DEFAULT 120.0,
    z_index INTEGER NOT NULL DEFAULT 0,
    frame_id TEXT REFERENCES frames(id) ON DELETE SET NULL,

    -- Styling & State
    color_theme TEXT,
    is_collapsed INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,

    -- Sync & Version Control
    checksum TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);

-- 2. Edges: Visual connections between nodes
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label TEXT,
    link_type TEXT NOT NULL DEFAULT 'related',
    weight REAL NOT NULL DEFAULT 1.0,
    created_at INTEGER NOT NULL,

    UNIQUE(source_node_id, target_node_id)
);

-- 5. Typst Cache: Stores rendered SVG for performance
CREATE TABLE IF NOT EXISTS typst_cache (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    raw_typst_code TEXT NOT NULL,
    rendered_svg TEXT NOT NULL,
    compiled_at INTEGER NOT NULL
);

-- 6. Canvas Views: Saved view states
CREATE TABLE IF NOT EXISTS canvas_views (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    zoom REAL NOT NULL DEFAULT 1.0,
    pan_x REAL NOT NULL DEFAULT 0.0,
    pan_y REAL NOT NULL DEFAULT 0.0,
    filter TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_workspace ON nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_frames_workspace ON frames(workspace_id);
