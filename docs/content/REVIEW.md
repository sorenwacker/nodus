# Nodus Codebase Review

**Date:** 2026-06-13
**Scope:** Full codebase (src/, src-tauri/)
**Files Reviewed:** ~200 files, ~80,000 LOC

---

## Baseline Gates

| Gate | Status | Details |
|------|--------|---------|
| ESLint | PASS | 3 warnings (intentional v-html for markdown) |
| Clippy | PASS | No warnings |
| Vitest | PASS | 442 tests passed |
| Cargo test | PASS | 67 tests passed |

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 37 |
| MEDIUM | 134 |
| LOW | 138 |

### Files Exceeding 1000 Line Limit

| File | Lines | Over By |
|------|-------|---------|
| `src-tauri/src/commands.rs` | 2859 | 186% |
| `src/canvas/PixiCanvas.vue` | 2747 | 175% |
| `src/mcp/messageHandler.ts` | 1926 | 93% |
| `src-tauri/src/database.rs` | 1488 | 49% |
| `src/stores/nodes.ts` | 1289 | 29% |
| `src/canvas/composables/layout/useLayout.ts` | 1228 | 23% |
| `src/components/StorylineReader.vue` | 1041 | 4% |

---

## HIGH Severity Findings

### Security

| Location | Issue |
|----------|-------|
| `commands.rs:1957-1958` | `read_file_content(path)` allows reading ANY file on system - no path validation |
| `commands.rs:2082-2086` | `extract_pdf_text(path)` - same arbitrary file access |
| `commands.rs:2090-2095` | `extract_pdf_annotations(path)` - same arbitrary file access |

### Data Integrity

| Location | Issue |
|----------|-------|
| `database.rs:852-887` | `workspaces::delete` executes 5 DELETEs without transaction - partial deletion on failure |
| `database.rs:1095-1125` | `reorder_nodes` executes 2N UPDATEs without transaction - sequence corruption risk |

### Dead Code (Entire Files)

| File | Lines | Issue |
|------|-------|-------|
| `src/composables/useBacklinkUpdater.ts` | 239 | Never imported - nodes store has own implementation |
| `src/canvas/components/CanvasMagnifier.vue` | 97 | Never imported anywhere |

### Type Safety

| Location | Issue |
|----------|-------|
| `registry.ts:34-48` vs `handlers/types.ts:112-124` | Two incompatible `ToolContext` interfaces |
| `types.ts`, `registry.ts`, `handlers/types.ts` | Three different `ToolDefinition` types |
| `types/index.ts:62` | `Node.node_type` uses `string` but `NodeType` union exists |
| `stores/nodes.ts:119,122,343,345` | `= undefined!` bypasses TypeScript null safety |

### Production Debug Code

| Location | Issue |
|----------|-------|
| `commands.rs:2783-2814` | Debug `println!` statements in `import_ontology` |
| `PixiCanvas.vue:845-859` | `console.log` statements in `handleAddToZotero()` |
| `PixiCanvas.vue:2219-2220` | `window.exportGraphAsYaml` global pollution |

### Bugs

| Location | Issue |
|----------|-------|
| `messageHandler.ts:1135-1153` | `handleUpdateEdge` accepts `label` parameter but ignores it |
| `watcher.rs:157,210` | Mutex `.unwrap()` in watcher thread can crash silently |
| `spatialIndex.ts:151-158` | Cache invalidation only checks nodeCount, not positions |

---

## MEDIUM Severity Findings

### Missing Transactions

| Location | Issue |
|----------|-------|
| `database.rs:996-1058` | `storylines::add_node` - race condition on concurrent adds |
| `database.rs:1060-1093` | `storylines::remove_node` - concurrent modifications corrupt order |
| `database.rs:686-735` | `merge_bidirectional_wikilinks` - partial failure risk |

### Dead Code (Functions/Exports)

| Location | Function |
|----------|----------|
| `retry.ts:134-146` | `llmRetry` wrapper never used |
| `retry.ts:122-129` | `createRetryWrapper` never used |
| `tokenEstimator.ts:115-145` | `estimateBatchClassificationTokens` never used |
| `registry.ts:143-154` | `getToolsByCategory` never used (plural version used) |
| `registry.ts:235-244` | `getToolNames()`, `getCategories()` never used |
| `providers/registry.ts:97-115` | `loadConfigs()`, `exportConfigs()` never used |
| `stores/edges.ts` | `debugGetAllEdges`, `getEdgesForNodes`, `updateEdgeStoryline`, `getEdgesByLinkType`, `findEdgeBetween` - all unused |
| `stores/frames.ts` | `selectedFrame`, `findFrameAtPoint`, `findFrameByFolderPath`, `getChildFrames`, `getFramePath`, `updateFrameParent` - all unused |
| `useCommentMeta.ts:55-67` | `toggleResolved`, `updateCommentType` never called |
| `useTypst.ts:103-180` | `renderCodeBlock`, `clearCache`, `getCacheStats` never used |
| `useTypst.ts:184-185` | `isInitializing`, `initError` declared but never set |
| `theme.ts:98-100` | `variableNameToCSS` never used (duplicate in themeInjector) |
| `theme.ts:105-122` | `THEME_CSS_VARIABLES` never used |

### Performance

| Location | Issue |
|----------|-------|
| `crossingReduction.ts:282-325` | `GreedySwapReduction` is O(n^4) worst case |
| `import_helpers.rs:89,108` | Regex compiled on every call - use lazy_static |

### Type Mismatches

| Location | Issue |
|----------|-------|
| `CanvasSettingsPanel.vue:21` | `edgeStyle` type missing `'direct'` value |
| `types/index.ts:18` | `NodeType` union missing `'tag'`, `'citation-stub'` |

### Memory Leaks

| Location | Issue |
|----------|-------|
| `stores/nodes.ts:1152-1160` | `handleTagNodesChange` listener never removed |
| `App.vue:521-533` | Global `__NODUS_*` functions never cleaned up |

### Unused Props

| Location | Prop |
|----------|------|
| `CanvasContextMenu.vue:18` | `hasDOI` (uses `doiCount` instead) |
| `CanvasStatusBar.vue:40` | `isWatching` |
| `CanvasFrames.vue:12` | `frameBorderWidth` |
| `CanvasHoverTooltip.vue:20` | `position` |

### Code Duplication

| Location | Issue |
|----------|-------|
| `useLLMTools.ts:344-445` | Same JSON parsing boilerplate repeated 4 times |
| `routeAroundObstacles` | Two functions with same name, different implementations |
| `OBSTACLE_MARGIN` | 20 in pathBuilder.ts, 40 in obstacleAvoider.ts |

---

## Remediation Themes

### 1. File Size Reduction (7 files over limit)

Split these files into smaller modules:
- `commands.rs` → 11 domain-specific modules
- `PixiCanvas.vue` → Extract ~500 lines to composables
- `messageHandler.ts` → 8 handler modules
- `database.rs` → 7 domain modules
- `nodes.ts` → Extract to sub-stores
- `useLayout.ts` → 5 layout-specific composables

### 2. Security Fixes (3 locations)

Add path validation to file access commands:
- Validate paths are within workspace vault
- Return error for paths outside allowed directories

### 3. Transaction Safety (5 locations)

Wrap multi-statement operations in transactions:
- `workspaces::delete`
- `reorder_nodes`
- `add_node`
- `remove_node`
- `merge_bidirectional_wikilinks`

### 4. Dead Code Removal (~50 items)

Remove unused:
- 2 entire files (useBacklinkUpdater.ts, CanvasMagnifier.vue)
- ~15 unused store exports
- ~10 unused LLM module exports
- ~10 unused composable functions
- ~5 unused type definitions

### 5. Type Safety Improvements

- Unify `ToolContext` interfaces
- Unify `ToolDefinition` types
- Extend `NodeType`/`LinkType` unions or remove them
- Replace `undefined!` with proper initialization

### 6. Debug Code Cleanup

Remove from production:
- `println!` statements in commands.rs
- `console.log` statements in Vue components
- Global window function assignments

---

## Files Reviewed by Module

| Module | Files | HIGH | MEDIUM | LOW |
|--------|-------|------|--------|-----|
| Rust commands | 1 | 7 | 12 | 5 |
| Rust database | 1 | 2 | 3 | 10 |
| Rust watcher/ontology | 5 | 3 | 7 | 8 |
| Rust other | 7 | 0 | 5 | 17 |
| PixiCanvas.vue | 1 | 3 | 15 | 4 |
| MCP module | 3 | 2 | 10 | 9 |
| Stores | 8 | 3 | 21 | 7 |
| LLM module | 20 | 2 | 12 | 6 |
| App composables | 22 | 1 | 7 | 15 |
| Canvas composables | 30 | 1 | 4 | 5 |
| Canvas layout/routing | 19 | 3 | 8 | 11 |
| Canvas components | 15 | 2 | 4 | 4 |
| Components | 17 | 2 | 6 | 14 |
| Settings panels | 6 | 2 | 5 | 12 |
| Types & lib | 3 | 3 | 7 | 4 |
| App.vue & main | 2 | 2 | 8 | 7 |
| **Total** | ~200 | **37** | **134** | **138** |
