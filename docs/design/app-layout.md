# Application Layout

Status: Draft
Version: 0.1.0

## Overview

Each feature placed its own controls where there was room: a bar, a floating island in a canvas corner, a sidebar next to the previous one. The individual parts work; the application has no shared structure that decides where a control lives or how canvas and reader divide the window. This document defines that structure. Once approved, its required behaviours move into `PRODUCT_DESIGN.md` under UX: The Canvas and this draft is removed.

Colour is not changed. The mix of magenta, mint and cyan in the review screenshot is the `cyber` theme's palette (`src-tauri/themes/cyber.yaml`), and links sharing the primary colour with the active state is the platform convention in the other themes.

## Current State

Observed at 260929 with a storyline open in the reader, window 2000 px wide.

| Area | Current content |
|------|-----------------|
| Window title bar | Native title bar, about 42 px, empty apart from the window controls |
| App toolbar | Wordmark, workspace selector, edit and new workspace, undo, redo; search; timelines, storylines, import, theme, settings |
| Reader header | Storyline title; position "16 / 30"; contents, links and export toggles; close |
| Reader progress | A bar under the reader header |
| Reader footer | Previous; one dot per section; Next |
| Canvas, top centre | Colour bar |
| Canvas, top left | Agent log panel |
| Canvas, bottom left | Edge filters, stacked above the status bar (counts, MCP, log, interaction hint) |
| Canvas, bottom right | Zoom controls and minimap |

Problems this causes:

1. Three horizontal bars (title bar, toolbar, reader header) take about 160 px before the first line of text.
2. With the reader open, the strip of canvas beside it shows grid without content, and the bottom-left overlays are clipped by the reader: the status bar ends mid-word.
3. The reader's position is shown four times: progress bar, "16 / 30", the dot row, Previous and Next.
4. The reader header's title starts at the reader's left edge while the text column is centred, so header, text and footer share no alignment line.

## Required Behaviour

### Window regions

The window has exactly these regions. A control belongs to one of them; there are no free-floating controls.

| Region | Holds |
|--------|-------|
| Top bar | Workspace, undo and redo, search, mode toggles, settings |
| Canvas | The graph and the canvas overlays listed below |
| Right slot | One panel at a time: storyline overview, preview, or the reader at half width |
| Bottom sheet | Timelines |
| Modal layer | Dialogs, fullscreen editor |

- **One top bar.** On macOS the native title bar is merged into the app toolbar (Tauri `titleBarStyle: "Overlay"`, hidden title). The toolbar reserves space for the window controls and is the window's drag region. Windows and Linux keep native decorations.
- **One panel in the right slot.** Opening a panel in the right slot closes the one there, rather than stacking beside it.

### Canvas overlays

Canvas overlays sit in two corners, each a single group, instead of five separate islands.

| Corner | Group |
|--------|-------|
| Bottom left | One bar: counts, edge filters, MCP status, log, interaction hint |
| Bottom right | Zoom controls and minimap |

The colour bar stays at the top centre, because it acts on the selection. The agent log opens from the log control in the bottom-left bar instead of occupying the top left corner.

- An overlay never sits under another region. When the right slot or the bottom sheet is open, the canvas overlays move with the canvas edge, as the zoom controls already do (`--canvas-right-inset`).

### Reader

The reader has two widths, and each is a complete layout rather than a panel over whatever lies behind it.

- **Half width (split).** The canvas beside the reader centres the node of the section being read, so the split shows where the text sits in the graph. It updates when the active section changes.
- **Full width.** The reader occupies the window below the top bar. Canvas overlays are hidden, since there is no canvas to act on.
- **One position indicator.** The header shows "16 / 30" with previous and next buttons. The progress bar and the dot row are removed; the contents panel is the way to jump to a section.
- **One alignment line.** The header title, the text and the section headings start at the same left edge: the text column's.

## Enforcement

Each rule gets a gate, per the project's methodology.

| Rule | Gate |
|------|------|
| No free-floating controls | A test scans `src/canvas/components` and `src/components` for `position: absolute` or `fixed` with edge offsets outside the region containers, with an allowlist for tooltips, menus and modals |
| One panel in the right slot | A component test opens two right-slot panels and asserts one remains |
| One position indicator | A component test asserts the reader renders no progress bar and no dot row |
| Split follows the section | A component test changes the active section and asserts the canvas was asked to centre that node |
| Overlays hidden at full width | A component test at full width asserts the canvas overlays are not rendered |

## Implementation Order

Each step is one pull request, usable and tested on its own.

1. Reader: one position indicator and one alignment line.
2. Reader: full width hides canvas overlays; the split centres the active section's node.
3. Canvas overlays: merge into the two corner groups, with the placement gate.
4. Right slot: one panel at a time.
5. Top bar: merge the macOS title bar.

## Open Questions

1. Should the split centre the active node at the current zoom, or also zoom to fit it?
2. Merging the title bar changes window dragging and double-click-to-zoom to the toolbar's empty areas. Is that acceptable?
