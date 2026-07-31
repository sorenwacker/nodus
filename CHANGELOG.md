# Changelog

All notable changes to Nodus are documented in this file.

## [Unreleased]

### Fixed
- The reader genuinely stops above an open timelines sheet: an explicit height on its overlay was overriding the bottom offset, so the two overlapped
- The timelines sheet no longer opens from a glancing pass: the pointer must dwell at the bottom edge briefly (100ms) before it slides up

## [1.1.0-rc.1] - 2026-07-30

### Added
- Canvas and timelines are cross-linked: hovering a node highlights its timeline mark and vice versa, and clicking a timeline mark selects the node (opening the preview at low zoom, like a canvas click) and zooms to it. Tags are also editable in the preview panel, which works at any zoom level
- Tags are editable on the card: a selected node's chips gain remove buttons and a "+ #" chip adds tags; tag nodes and tagged edges are a toggleable canvas layer, and all edge-filter toggles moved from the toolbar to a cluster on the canvas beside the content they filter
- MCP node tools understand metadata: create_node and update_node accept `date`, `date_end` (written as frontmatter, empty string clears), and `tags`; node reads expose the date fields directly so agents can build timelines without parsing YAML
- Storylines can be reordered by dragging their rows in the overview, with the same pointer-drag mechanism as node reordering (extracted into one shared composable); the order persists and the timelines lanes follow it. The overview also shortens above an open timelines sheet instead of overlapping it
- Node dates are editable in place: click the date chip (or "+ Set date" on a selected node) to set `date` and `date_end` without touching YAML; the timelines sheet also sizes itself to its lanes instead of always taking 45% of the window
- MCP connections can scope themselves to a specific workspace (`list_workspaces` / `set_workspace`), independent of the one open in the app, so several agents can work different workspaces in parallel; scoped changes stay off the user's undo stack
- MCP connection trust persists: approving a client issues a token (only its hash is stored) that the bridge saves and presents on reconnect, so app restarts no longer re-prompt; unauthenticated clients still get the approval dialog. Settings > Integrations shows the trusted-client count with a forget-all revoke
- Timelines view: a bottom sheet showing all storylines as horizontal lanes in their colors, opened with a bottom-edge push or the overview's timelines button; the graph stays visible above and the storyline overview can remain open beside it. Nodes with `date_end:` render as spanning bars, a from/to range fixes the axis window (persisted), axis labels adapt from years down to minutes, and hovering a bead or bar shows the node's rendered preview. Only dated nodes are placed, and large empty gaps between event clusters are abbreviated with axis breaks. Lanes have a fixed identity column beside a scrollable plot; storylines without a color get a stable hue from a colorblind-validated palette with separate dark-mode steps. Nodes with a `date:` frontmatter field (including BC dates like `date: 20 BC`) are placed on a shared time axis, undated nodes are interpolated between dated neighbours, nodes shared between storylines are joined by dashed connectors, and graph edges between timeline nodes are drawn as arcs; clicking a lane opens its reader
- Node cards show their tags as chips, and YAML frontmatter (OKF metadata) is hidden from rendered content instead of appearing as raw text
- Frontmatter is fully structured metadata now: every editor (inline, fullscreen, preview panel) shows only the note body and preserves the metadata header across edits, while the card surfaces OKF fields as chips — date/date range and lifecycle status alongside tags
- Open Knowledge Format (OKF v0.2) support: export any workspace as an OKF bundle (frontmatter documents grouped by node type, root index.md, wikilinks rewritten as Markdown links) from the workspace editor; files Nodus creates in a vault carry OKF frontmatter, and content write-backs preserve existing frontmatter blocks

### Changed
- The full wikilink sync on startup and workspace switch is incremental: nodes whose content hash is unchanged since their last sync are skipped without touching the filesystem or the edge table. Links to nodes that do not exist yet are recorded and become edges the moment a matching node is created or renamed, instead of waiting for a full re-scan
- Storylines are navigated in steps along the screen edges: right-edge pushes go deeper (overview, half-screen reader with the graph visible, full-screen reader) and left-edge pushes step back down to the graph. The overview keeps its expanded sections across these steps and the reader's contents sidebar sits on the right. All storyline layers slide over the canvas with transform animations on a shared easing curve, so the graph no longer reflows during transitions. Returning to the canvas also closes an unpinned overview; the toolbar book button pins it. The separator between panel and canvas is a visible drag handle and the chosen width persists across sessions
- Storyline panel is now an accordion: every storyline is a collapsible section, several can be open at once, and titles wrap to two lines instead of truncating; dropping a node onto a section adds it to that storyline
- Settings modal reorganized into six tabs: Zotero merged into Citations, and About/License moved into a collapsible section under General alongside Advanced

### Fixed
- Timelines now cover every dated node: nodes outside all storylines appear in a gray Unassigned lane; marks use the node's own color (solidified) with the storyline color as fallback; bead hovers drive the same hover tooltip as the canvas instead of a separate preview; and the sheet stays open alongside the overview and reader (the reader shortens to sit above it)
- Mermaid diagram labels render again: DOMPurify 3.4.12 empties foreignObject content (mXSS hardening), which blanked mermaid's HTML labels, so mermaid now renders native SVG text labels instead
- Storyline layers stay open while the pointer is inside them: auto-close on mouse-leave is gone (left-edge push or the book button steps back), and stepping deeper while a layer is open requires pressing against the very window edge so panel interaction near the border no longer skips ahead
- Canvas overlays (minimap, zoom controls, hover preview) shift left in sync with the storyline layers instead of being covered by or floating above them
- Clicking a storyline row opens the reader directly; expanding the item list moved to the row's chevron. Previously the reader was only reachable via a button that appeared on hover
- The right-edge hover reveal works regardless of canvas overlays: edge detection moved from an invisible hot-zone element to a capture-phase pointer listener
- The storyline panel closes again after clicking inside it; a focus guard meant for text inputs was keeping it open after any click
- Nodes created with content (e.g. via MCP create_node or the LLM agent) now get wikilink edges for their `[[links]]` immediately; previously edges only appeared after a later content edit (#45)
- Hashtags in initial node content are now extracted into tags on creation, matching the behavior of content edits
- Node content updates no longer rewrite vault files while folder sync is off. Write-back now requires a sync-enabled workspace whose vault contains the file; otherwise only the database changes (#43)
- Wikilink sync no longer creates a parallel edge when the node pair is already connected by a manual edge, in either direction (#43)
- Edges of trashed notes are excluded from edge queries, graph summaries, structure, and orphan detection, and the database orphan cleanup now removes them; ghost "Unknown" entries no longer appear in analytics (#44)
- Content updates resolve wikilinks through the backend resolver, so `[[folder/note]]` and `[[note#section]]` links create edges from every code path instead of being silently dropped and having their existing edges deleted (#45)

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
