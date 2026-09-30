# Removing Frames

Status: Approved 260930
Version: 0.2.0

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
2. Every `frame_id` is cleared and the `frames` table is dropped.
3. Node positions and file locations are not changed. Nodes stay where they were on the canvas.

The migration reports how many frames it converted and how many nodes it tagged.

A frame title becomes a tag by the hashtag rule (`[a-zA-Z0-9][\w-]*`, at most 50 characters, `src/lib/contentParser.ts`): lowercased; ä, ö, ü and ß transliterated to ae, oe, ue and ss; every other character outside `a-z`, `0-9`, `_` and `-` replaced by a hyphen; runs of hyphens collapsed; leading and trailing hyphens removed; cut to 50 characters. "Definitions (Art. 3)" becomes `definitions-art-3`, "Kapitel 1-30" becomes `kapitel-1-30`. A title that yields no characters adds no tag.

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

One pull request, one commit per step, the test suite green after each. The frames table is dropped last: migrations run on every start and the frame code reads the table, so dropping it before the code is gone would break the app.

1. Imports: vault, PDF, Zotero and starter content stop creating frames.
2. Canvas: frame rendering, interaction and frame-aware layout removed.
3. Agents: MCP frame tools and in-app grouping tools removed or converted to tags.
4. Backend: frame commands and store removed; the migration converts titles to tags, clears `frame_id` and drops the table; fresh installs no longer create it.
5. Gate test; documentation updated and this draft removed.

## Decisions

Answered 260930.

1. Frame titles become tags.
2. Titles are converted by the rule above.
3. The migration does not write to Markdown files.
