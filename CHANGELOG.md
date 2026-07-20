# Changelog

All notable changes to Nodus are documented in this file.

## [1.0.0] - 2026-07-20

First stable release. Consolidates the 0.7.0-rc.1 review remediation (backend
hardening, database integrity, LLM agent pipeline, edge port ordering) with the
port-cache fix below; edge routing is crossing-free across all styles.

### Fixed
- Edge ports are now assigned purely from the current layout on every render.
  A port-order cache populated on node click was never invalidated, so once a
  node was touched its edges' port order was pinned to that moment's layout and
  drifted back into crossings as the graph changed. Removing the cache makes the
  angle-based fan ordering the single source of truth.

### Removed
- Unused crossing-reduction subsystem (barycentric/greedy port reordering) that
  was reachable only through the removed port cache; the angle-based fan
  ordering supersedes it.

## [0.7.0-rc.1] - 2026-07-19

### Fixed
- Edge port ordering now sorts by angle, so hub edges fan correctly when
  neighbours are in a row (not only a column); left and right sides wind
  consistently and no longer cross before attaching
- Orthogonal edge routing no longer inverts fan nesting: the left/right hub
  fans that crossed before attaching are now clean (curved and direct routing
  are fully crossing-free; some orthogonal/diagonal fan cases remain)
- Edges follow the node live during drag/zoom while keeping their routed style
- Edge labels stay legible when zoomed out (counter-scaled, capped at 12px)
- MCP approval prompts no longer storm: rejected connections are no longer
  force-closed into a client reconnect loop
- Database integrity: migration that never ran now applies; edge de-duplication
  keeps distinct link types; positional storyline insert no longer violates the
  unique constraint; ontology import is transactional
- Backend security: workspace-vault containment on file moves, SSRF guards on
  HTTP/fetch, MCP WebSocket origin check, fail-fast database initialisation
- LLM agent pipeline: unreachable smart tools, premature completion, dropped
  Anthropic tool messages, and LaTeX-corrupting content cleaning
- Zotero import pagination, markdown code escaping, HiDPI drop position, and
  other library/UI correctness fixes

### Changed
- Unified edge port ordering into a single shared function across assignment,
  optimisation, and crossing reduction
- Deferred node/frame position writes to drag end; memoised viewport culling

### Removed
- Dead code: unused canvas composables and agent/Zotero helpers

## [0.5.0] - 2026-05-14

### Added
- Zoom mode setting: choose between "Scroll to Zoom" and "Pinch to Zoom"
- Pinch zoom momentum for smooth glide after releasing gesture
- Selection-aware AI tools (update, append, rename, color, delete selected nodes)
- Frame-to-frame collision detection and resolution
- Auto-organize nodes when resizing frames (pulls overlapping nodes inside)

### Changed
- Unified AI interface: removed NodeLLMBar, CanvasLLMBar handles all operations
- Selected nodes become both context AND targets for AI operations
- CanvasLLMBar shows selection badge and dynamic placeholder
- Frames hidden in neighborhood view mode

### Removed
- NodeLLMBar component (functionality merged into CanvasLLMBar)
- Organize frames button (now automatic on resize)

## [0.5.0-rc.1] - 2026-05-12

### Added
- Frame collision detection and layout improvements
- Toast notifications positioning above controls bar

### Fixed
- Flaky performance test threshold for CI

## [0.4.20-rc.1] - 2026-04-10

### Added
- Performance monitor for canvas operations
- Entity system: EntityPanel, EntityNodeCard, EntityCreatePopover, EntityBadge components
- Entity picker modal for quick entity linking
- Entity sidebar and summary section in StorylineReader/StorylinePanel
- Link to Entity submenu in context menu
- Entity store helpers for nodes and edges
- Citation fetch countdown with rate limit handling
- Display settings tab with font scale and threshold controls
- Reactive display settings store for live updates
- More starter content examples with colored nodes and directed edges

### Changed
- Consolidate settings into 4 tabs: General, Appearance, Canvas, Integrations
- Strip markdown formatting in magnifier for cleaner preview
- Apply font-scale CSS variable across all text elements
- Enhanced stripMarkdown to handle wikilinks, HTML, and math delimiters

### Fixed
- Neighborhood mode drag lag by removing transform transition
- Content preview for untitled nodes when zoomed out
- Blank nodes when zoomed out without title
- Neighbor-highlighted nodes position by removing scale transform
- Blurry text with native resolution node rendering and improved font smoothing
- Entity performance via memoized linked entities map
- Citation fetch rate limits with cacheOnly mode
- Font-scale initialization on app load
- Magnifier body text rendering with flex layout
- Dynamic MAGNIFIER_THRESHOLD via storage getter
- Context limit errors with prompt truncation

### Security
- Bump lodash from 4.17.23 to 4.18.1
- Bump vite from 6.4.1 to 6.4.2

## [0.4.19] - Previous Release

See git history for earlier changes.
