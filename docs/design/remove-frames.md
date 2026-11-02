# Removing Frames

Status: Implemented 260930
Version: 0.3.0

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

1. For each frame with a title, its title is added to the `tags` of each of its member nodes. The Markdown files are not changed: tags set in the app live in the database `tags` column, and the migration writes nowhere else.
2. Every `frame_id` is cleared and the `frames` table is emptied. It is not dropped: `nodes.frame_id` has a foreign key to it, and SQLite checks that key on every node insert even when the value is NULL, so with the table gone no node could be written (a test found this before it shipped). Removing the key means rebuilding the `nodes` table with foreign keys off, which risks cascading deletes into edges and storylines for no gain beyond an empty table.
3. Node positions and file locations are not changed. Nodes stay where they were on the canvas.

The migration reports how many frames it converted and how many nodes it tagged.

A frame title becomes a tag by the hashtag rule (`[a-zA-Z0-9][\w-]*`, at most 50 characters, `src/lib/contentParser.ts`): lowercased; ä, ö, ü and ß transliterated to ae, oe, ue and ss; every other character outside `a-z`, `0-9`, `_` and `-` replaced by a hyphen; runs of hyphens collapsed; leading and trailing hyphens removed; cut to 50 characters. "Definitions (Art. 3)" becomes `definitions-art-3`, "Kapitel 1-30" becomes `kapitel-1-30`. A title that yields no characters adds no tag.

### Imports that created frames

| Import | Before | After |
|--------|--------|-------|
| Vault import | One frame per folder | Nodes of one folder are placed as a cluster; the folder remains in each node's file path. No tag is added: the path already records it |
| Refresh | Newcomers placed inside their folder frame | No node is moved |
| PDF section graph | Section nodes in a frame named after the paper | Section nodes placed as a cluster and tagged with the paper title |
| Zotero collection | One frame per collection | Citation nodes tagged with the collection name |
| Starter content | "Demo Project" and "Entity Types" frames | Same nodes, tagged `demo-project` and `entity-types` |

### Agents

- The 15 MCP frame tools are removed. An MCP client tags by id through `update_node` and `batch_update_nodes`.
- The in-app agent's three frame tools are replaced by `tag_nodes(tag, node_titles)`, which adds the converted tag to each named node and keeps its other tags.

### Moving files

Dropping a node into a folder frame moved its Markdown file into that folder. That was the only way to reach the file-move code, so it is removed with the frames: the file-move commands, the collision dialog, and the watcher's guard against its own moves.

## Documentation

`PRODUCT_DESIGN.md` loses its frame sections (Frames, What belongs to a frame, Moving a frame, Fitting a frame to its contents, the frame parts of Layout of a selection, Refreshing a workspace from its files, Neighborhood Mode, PDF as a graph, Zotero Integration, Starter Content, the schema), `features.md` its Frames section, and `docs/design/frame-folder-sync.md` is deleted. The project `CLAUDE.md` loses frames from its rendering tables.

## Enforcement

| Rule | Gate |
|------|------|
| No frame code remains | A test fails if `frame_id`, `createFrame` or a `frames` store is referenced anywhere under `src`, `src-tauri/src` or `packages/nodus-mcp-server/src` outside the migration |
| The migration keeps the grouping | A Rust test migrates a database with titled frames and asserts each member gained the tag, and no `frame_id` or `frames` table remains |

## Implementation Order

One pull request. The commits are grouped by layer (frontend and agents, MCP server, backend and migration, documentation). The frame code was removed before the migration empties the table, so no reader of the table remains.

## Measured Result

Run at 260930 on a copy of the production database: 45 frames removed, 299 nodes gained a tag (20 members already carried their frame's tag), node, edge and storyline-membership counts unchanged (13,915 / 23,775 / 299), node positions identical, integrity and foreign-key checks clean.

## Known Limitation

A file-backed node whose file gains frontmatter tags in another editor has its tags replaced by the frontmatter tags (`useFileSync`), which drops a migrated tag. This predates the removal and applies equally to tags added by hand; 21 framed nodes are file-backed and none carries frontmatter tags today.

## Decisions

Answered 260930.

1. Frame titles become tags.
2. Titles are converted by the rule above.
3. The migration does not write to Markdown files.
