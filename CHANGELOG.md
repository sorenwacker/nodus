# Changelog

All notable changes to Nodus are documented in this file.

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
