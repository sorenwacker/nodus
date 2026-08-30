# Performance investigation — handover notes (30 Aug 2026)

User report: canvas interaction (pan/zoom/scroll) extremely slow on the
Portfolio workspace, with nodes and edges visibly not moving together.
Machine: Intel HD 620 (i915), Wayland, webkit2gtk-4.1. Not a weak machine; no
NVIDIA/DMA-BUF weirdness in play.

## The workspace, measured

Read from the live app over MCP and from the backup DB, not estimated:

- **205 nodes, 1,189 edges**; content is modest (median 1.2 KB, max 4.2 KB).
- Graph extent **6,200 x 6,830 canvas px** — small. An earlier guess that the
  compositing layer overflowed the GPU's max texture size was wrong.
- Saved viewport: **zoom 0.089**, i.e. near the 0.01 floor.

That zoom is the whole story. At 0.089 the viewport covers ~21,600 x 12,200
canvas px, so the entire 6,200 x 6,830 graph is on screen at once.

## Why every reduction mechanism was off at once

The workspace sits below every threshold while being zoomed far enough out
that none of the detail can be seen:

| Mechanism | Gate | At 205 nodes / 1,189 edges / zoom 0.089 |
|---|---|---|
| Viewport culling of nodes | nodes outside viewport + margin | culls **nothing** — whole graph on screen |
| Edge viewport filter | > 500 edges, needs an endpoint off-screen | culls **nothing** — all endpoints visible |
| `isLargeGraph` (simple edge form) | > 500 nodes or > 1,500 edges | **false** — renders the heavy form |
| Edge hover-only reduction | > 1,500 edges (`edgeHoverThreshold`) | **never fires** |
| LOD / bubble mode | > 500 *visible nodes* (`lodThreshold`) | **unreachable** — only 205 nodes exist |

So the canvas paid full price for detail nobody could see: ~1,189 edges in the
full `<g>` form (hit path + visible path + optional glow) ≈ **3,600 SVG
elements**, each hit path a `pointer-events: stroke` region 12px wide that
renders about **1 screen px** at this zoom.

## Why nodes and edges moved separately

Both layers get the same `transform` from the same computed, in the same Vue
flush, so the DOM was never inconsistent. The split was in painting:

- `.nodes-layer` — ~200 collapsed cards (`isTextHidden` below 0.10 strips the
  text), promoted, translated on the GPU. Cheap, tracks the pointer.
- `.canvas-content` — the ~3,600-element SVG, needing a main-thread style and
  paint pass wider than a frame before its new position showed.

The node layer landed immediately, the edge layer one or more frames later.
Two things made the edge layer's pass far more expensive than it needed to be,
both now removed (see below).

## Fixed in this pass

1. **Full-viewport repaint of the grid every pan frame.** `.canvas-viewport`
   bound `background-position` to the pan offset; moving a background
   invalidates paint for the whole element, and the root viewport is the one
   surface that cannot be composited away. The grid now lives on its own
   promoted `.canvas-grid` layer translated by `offset mod 24` — pixel-identical,
   because the grid is periodic with a 24px cell, but it moves on the GPU.
2. **`:has()` plus a 1,189-element opacity transition on the edge layer.**
   `.edges-layer:has(.edge-highlighted) .edge-line-visible:not(...)` forced
   `:has()` to be re-evaluated across every edge on any style recalc in the
   layer, and the accompanying `transition: opacity 0.15s` animated all of them
   at once on any hover. It was also redundant: `useEdgeVisibility` already
   sets a per-edge `stroke-opacity`, so edges were dimmed twice
   (0.3 x 0.5 = 0.15). Removed; the per-edge value is now the only dimming.
3. **Edge detail is now decided by zoom, not only by graph size.**
   `useSimpleEdges` (in `useGraphMetrics`) picks the single-path form when the
   12px hit stroke would render under 4 screen px (zoom < 1/3), on top of the
   existing size tiers. Roughly 3,600 SVG elements down to ~1,200, and no
   per-edge hit region for the compositor to test. The `CanvasEdgesSVG` prop is
   renamed `isLargeGraph` -> `simplified`, which is what it actually selects.

All three live in the composables rather than `GraphCanvas.vue`: the derived
transforms in `useViewState` (which already owns scale and offset) and the
detail decision in `useGraphMetrics` (which already owns the size tiers and
scale). `GraphCanvas.vue` is past the 1,000-line limit that
`file-size-limit.test.ts` guards, so it may not grow - and both belong with the
state they are derived from anyway.

**Verified 30 Aug.** With Node 20.20.2 (`~/.nvm`, matching the Dockerfile):
`npm run typecheck` clean, and `npx vitest run` green at **1096/1096 across
129 files**.

Two notes-keeping corrections, since earlier drafts of this file asserted
otherwise and both claims are load-bearing for whoever picks this up:

- The claim that `render-benchmark.test.ts` fails on main, "one of the 14",
  does not hold. Nothing fails on main.
- A concurrent session recorded "the same 6 failures as clean HEAD (the
  pre-existing localStorage/jsdom family)" from running two test files. The
  full suite does not reproduce that. The untested hypothesis worth one
  minute if it matters: that session used `~/.local/node/bin/node` (v26.5.1);
  this run used Node 20, the version the Dockerfile pins. Do not treat those
  6 failures as pre-existing without re-checking on Node 20.

## The biggest remaining lever

**LOD / bubble mode is gated on node count, so it can never fire for this
graph.** `isLODMode = forceLODMode || visibleNodes.length > lodThreshold`
(default 500). At zoom 0.089 a 400x200 card renders 36x18 screen px with its
text already stripped — precisely what bubble mode is for — yet 205 nodes can
never reach a 500-node gate at any zoom.

Gating it on *rendered size* rather than count (e.g. when a typical card falls
below ~40 screen px) would put this workspace into the cheap circle renderer
exactly when detail stops being legible. Left undone deliberately: it changes
what the user sees, and there is already a manual bubble-mode toggle, which is
the immediate workaround.

Secondary, if more is needed: the edge SVG is `width:100%;height:100%` of a
1px x 1px parent with `overflow: visible`, which gives the browser no real
viewport to cull paint against. Sizing it to the graph's bounding box is worth
testing.

## Measuring

`src/__tests__/render-benchmark.test.ts` was reported failing on main
(pre-existing); fixing it gives a measuring stick. For the real thing, the
build has the `devtools` feature: Ctrl+Shift+I -> Performance, record ~5s of
panning, and compare Paint vs Style/Layout vs JS before and after.

## Environment note

There is no `node` on the default `PATH` on this machine, which is why an
earlier pass concluded it was absent. Two exist:

- `~/.local/node/bin/node` (v26.5.1) — what the MCP server runs on.
- `~/.nvm/versions/node/v20.20.2/bin/node` — matches the Dockerfile's Node 20,
  and what the verification above used.

`make dev` needs one exported first:
`export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`.
