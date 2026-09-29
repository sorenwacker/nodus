# Removing Frames

Status: Draft
Version: 0.1.0

## Overview

Frames are removed from Nodus. A frame is a box on the canvas that nodes belong to by a stored `frame_id`. The box shows a region; the id records a membership. Resizing or moving a frame changes the region without changing the membership, so what the canvas shows and what the data says drift apart: a node inside a frame's box may not belong to it, and a member may sit outside it. `PRODUCT_DESIGN.md` > What belongs to a frame chose stored membership deliberately, to keep membership independent of where things happen to be; the drift is the cost of that choice, and the feature does not justify it.

Grouping that frames carried moves to tags. A tag names a group without claiming a region of the canvas, so it cannot disagree with where nodes sit.

## Blast Radius

Measured at 260929 against the production database, read-only.

| Item | Count |
|------|-------|
| Frames | 45, across 7 workspaces |
| Nodes with a `frame_id` | 317 of 11,706 |
| MCP frame tools | 15 |
| Source files referencing frames | about 130 |
| Open pull requests made obsolete | #80 Keep frame membership within a workspace |

## Required Behaviour

### The canvas

- The canvas has no frames: no `Shift+F`, no frame placement mode, no frame selection, resizing, fitting or overlap resolution.
- Layout arranges nodes only. The frame-aware layout paths (rigid frame units, post-layout frame expansion, overlap resolution) are removed.

### Existing data

A database migration runs once on upgrade:

1. For each frame with a title, its title is added to the `tags` of each of its member nodes.
2. Every `frame_id` is cleared and the `frames` table is dropped.
3. Node positions and file locations are not changed. Nodes stay where they were on the canvas.

The migration reports how many frames it converted and how many nodes it tagged.

### Imports that created frames

| Import | Before | After |
|--------|--------|-------|
| Vault import and refresh | One frame per folder | Nodes of one folder are placed as a cluster; the folder remains in each node's file path. No tag is added: the path already records it |
| PDF section graph | Section nodes in a frame named after the paper | Section nodes placed as a cluster and tagged with the paper title |
| Zotero collection | One frame per collection | Citation nodes tagged with the collection name |
| Starter content | "Demo Project" and "Entity Types" frames | Same nodes, tagged `demo-project` and `entity-types` |

### Agents

- The 15 MCP frame tools are removed. An agent that grouped nodes into a frame tags them instead, with the existing tag tools.
- The in-app agent's grouping tools create tags instead of frames.

## Documentation

`PRODUCT_DESIGN.md` loses its frame sections (Frames, What belongs to a frame, Moving a frame, Fitting a frame to its contents, the frame parts of Layout of a selection, Refreshing a workspace from its files, Neighborhood Mode, PDF as a graph, Zotero Integration, Starter Content, the schema), `features.md` its Frames section, and `docs/design/frame-folder-sync.md` is deleted. The project `CLAUDE.md` loses frames from its rendering tables.

## Enforcement

| Rule | Gate |
|------|------|
| No frame code remains | A test fails if `frame_id`, `createFrame` or a `frames` store is referenced anywhere under `src`, `src-tauri/src` or `packages/nodus-mcp-server/src` outside the migration |
| The migration keeps the grouping | A Rust test migrates a database with titled frames and asserts each member gained the tag, and no `frame_id` or `frames` table remains |

## Implementation Order

Each step is one pull request that leaves the app working.

1. Migration: frame titles become tags, `frame_id` cleared, table dropped, with its test.
2. Imports: vault, PDF, Zotero and starter content stop creating frames.
3. Canvas: frame rendering, interaction and frame-aware layout removed.
4. Agents: MCP frame tools and in-app grouping tools removed or converted to tags.
5. Gate test and remaining references removed; documentation updated.

## Open Questions

1. Should frame titles become tags (proposed), or should the grouping be dropped without a trace?
2. A frame title such as "Demo Project" is not a valid tag as written. The proposal lowercases it and replaces spaces with hyphens (`demo-project`). Acceptable?
3. Tags set through the app are stored in the database `tags` column only (`update_node_tags`); they are not written to the Markdown file. Should the migration also write the new tags into each member's frontmatter, so Obsidian sees them? That writes to up to 317 files.
