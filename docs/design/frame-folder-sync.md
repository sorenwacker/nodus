# Frame-Folder Synchronization

Status: Draft
Version: 0.1.0

## Overview

Frames in Nodus should map to folders in the file system. Moving a node between frames moves the underlying file. Wikilinks update automatically.

## Requirements

### 1. Nested Frames

Frames can contain other frames, creating a hierarchy that mirrors folder structure.

```
Frame: "06-monitoring"
├── Frame: "alerts"
│   └── Node: prometheus-alerts.md
├── Frame: "dashboards"
│   └── Node: grafana-setup.md
└── Node: prometheus-setup.md
```

**Data model change:**

```typescript
interface Frame {
  id: string
  title: string
  parent_frame_id: string | null  // NEW: enables nesting
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  color: string | null
  workspace_id: string | null
  folder_path: string | null
}
```

### 2. Frame-Folder Mapping

- Each frame's `folder_path` corresponds to a directory
- Nested frames create nested directories
- Root-level nodes (outside frames) live in workspace root

### 3. Node Movement = File Movement

When a node is dragged from one frame to another:

1. Detect source and target frames
2. Compute new file path
3. Check for name collisions (warn user)
4. Move file on disk
5. Update node's `file_path` in database
6. Update all backlinks (see below)

### 4. Wikilink Resolution

Priority order for resolving `[[path/to/note]]`:

1. **Exact title match**: Node titled "path/to/note"
2. **File path match**: Node with `file_path` containing "path/to/note"
3. **Frame path + title**: Frame hierarchy "path/to" + node titled "note"
4. **Filename only**: Node titled "note" (fallback, may be ambiguous)

### 5. Backlink Updates

When node moves from `old/path/note.md` to `new/path/note.md`:

1. Find all nodes containing `[[old/path/note]]` or `[[note]]` that resolved to this node
2. Update wikilinks to `[[new/path/note]]`
3. Save modified files to disk
4. Show summary of changes to user

### 6. Collision Detection

Before moving a node, check if target location has a file with the same name:

- If collision: Show warning dialog with options:
  - Cancel move
  - Rename the moving file
  - Replace existing (dangerous)

## Implementation Steps

### Phase 1: Data Model (Completed)

1. [x] Add `parent_frame_id` to Frame type
2. [x] Update database schema with migration (011_frame_parent.sql)
3. [x] Update frame CRUD operations (frames.ts store, commands.rs)

### Phase 2: UI for Nested Frames

1. [ ] Allow creating frames inside frames
2. [ ] Visual indication of frame hierarchy
3. [ ] Drag frame into another frame to nest

### Phase 3: Wikilink Resolution (Completed)

1. [x] Update wikilink matching to use frame hierarchy (wikilink.ts, useContentRenderer.ts)
2. [ ] Show frame path in link tooltips
3. [ ] Autocomplete includes frame paths

### Phase 4: Move Operations (Completed)

1. [x] Detect cross-frame node movement (useNodeDragging.ts)
2. [x] Implement file move with collision check (commands.rs check_file_collision, move_node_file)
3. [x] Collision dialog for user choice (FileMoveCollisionDialog.vue)
4. [ ] Transaction support for atomic operations

### Phase 5: Backlink Updates (Completed)

1. [x] On move: find affected nodes (nodes.ts updateBacklinksForMovedNode)
2. [x] Batch update wikilinks in content
3. [x] Sync to disk
4. [x] Created useBacklinkUpdater.ts composable for reuse

## Open Questions

1. Should moving a frame move all contained files?
2. How to handle nodes that span multiple frames visually?
3. What about nodes not backed by files (canvas-only)?
4. Performance implications of backlink scanning on large workspaces?

## Related

- Obsidian's folder-based organization
- Notion's nested pages
- Roam's namespaces
