# Nodus - Product Design Document

Version: 0.4.24
Date: 2026-04-11
Status: Active Development

---

## Executive Summary

Nodus is a local-first knowledge workspace where research nodes, Typst math, and Obsidian vaults live on a single, sovereign canvas.

**The Problem We Solve:**
Users are experiencing "Visual Burnout" and "Subscription Fatigue." They manage fragmented windows — a Notion page embedding a Miro board, a Zotero library separate from their notes, screenshots of diagrams that can't be edited. The doc and the whiteboard are never the same thing.

**Our Solution:**
A "Living Documentation" workspace where everything is a node on one canvas. No embeds. No dead images. No context switching.

**Core Differentiators:**
- **Single Canvas:** The doc and the whiteboard are the same thing
- **Modern Science:** Native Typst (sub-second rendering, not 90-second LaTeX)
- **Eco-Bridge:** Seamless Obsidian vault compatibility
- **EU Sovereignty:** Local-first + zero-knowledge EU sync

**Target markets:** Academic researchers and EU enterprises
**Revenue model:** Open core — free local app, paid EU-hosted sync

---

## Market Context (2026)

### The State of "Second Brain" Tools

Users are frustrated with the current landscape:

| Tool | User Criticism |
|------|----------------|
| **Notion** | "Frame Manager" — canvas is just embeds, data doesn't talk to each other |
| **Miro** | No offline, not knowledge-focused, separate from notes |
| **Heptabase** | $12-18/mo with no free tier, proprietary database lock-in |
| **Obsidian** | Graph is view-only, mobile app is "clunky," Canvas is separate from Notes |
| **Logseq** | Database version delays, performance degrades as vault grows |
| **LaTeX** | 90-second compile times, 1984-era syntax |

### What Users Are Actively Searching For

1. **"Living Documentation"**
   A single space where a paragraph can connect via visual arrow to a task or PDF highlight. The doc and whiteboard as ONE thing.

2. **"Sovereignty as a Budget Item"**
   EU AI Act (2026) enforcement means institutions cannot use US-hosted clouds for sensitive research. "GDPR-Native" is a procurement requirement.

3. **"LaTeX-to-Typst Migration"**
   Instant-preview math that looks professional enough for a thesis but feels as fast as Markdown.

4. **"Agent-Ready Data"**
   Users want to point Ollama at their notes. They criticize proprietary formats that trap data away from local AI.

### The Gap We Fill

| User Complaint | Nodus Solution |
|----------------|---------------------|
| "I'm paying $15/mo for proprietary cloud" | Free local app + open formats (Markdown/JSON) |
| "LaTeX takes forever to compile" | Typst integration (sub-second rendering) |
| "My university won't let me use Notion" | EU-hosted sync + local-first privacy |
| "My Obsidian Canvas is messy/slow" | Graph-first UI with native auto-layout |
| "I paste diagrams as dead images" | Editable, linkable nodes on canvas |
| "My tools don't talk to each other" | Single canvas, everything is a node |

---

## Positioning

### The Name: Nodus

**Nodus** (Latin: "node" / "knot") — the fundamental unit of connection.

### Manifesto

> *"In a world of scattered tabs and cloud-locked docs, Nodus is your anchor. It's the local-first node-based editor that treats every link as a discovery. With native Typst support and a deep bridge to your Obsidian vault, Nodus is the professional choice for those who think in systems. Your data, your device, your network."*

### What NOT To Say

> "We are a graph app"
> "We are a note-taking app"
> "We are an Obsidian alternative"

### What TO Say

> **"Stop managing windows."**
>
> Nodus is the only workspace where your research nodes, your Typst math, and your Obsidian vault live on a single, sovereign canvas.

### The "Aha!" Moment

The moment a user realizes:
- Their Zotero citation appears as a node they can drag next to their argument
- Their PDF highlight becomes a linked card on the canvas
- Their LaTeX equation renders instantly in Typst
- Their Obsidian vault imports with beautiful auto-layout

**This is not another tool to manage. This is where thinking happens.**

---

## Product Vision

### Core Concept

A "Living Documentation" workspace where:
1. Every piece of information is a **node**
2. Nodes live on an **infinite canvas**
3. Connections are **visual arrows**, not hidden backlinks
4. The **canvas IS the editor** — no separate views

### The "Single Surface" Principle

| Traditional Tools | Nodus |
|-------------------|------------|
| Note in one app, diagram in another | Everything on one canvas |
| Screenshot a diagram → "dead image" | Diagram is editable nodes |
| Embed a board inside a doc | No embeds — canvas IS the doc |
| Switch between graph view and editor | Graph view IS the editor |
| Canvas file separate from notes | Canvas and notes are unified |

### Guiding Principles

1. **Single Canvas:** Doc and whiteboard are the same thing
2. **Markdown-First:** Standard GFM for data longevity, no vendor lock-in
3. **Typst-Powered:** Modern, fast math and professional PDF export
4. **Obsidian-Compatible:** Use existing vaults without breaking them
5. **Local-First:** Data lives on user's device by default
6. **Agent-Ready:** Structured data that local AI (Ollama) can consume
7. **EU-Sovereign:** Zero-knowledge sync on EU infrastructure

---

## Target Users

### Primary: Academic Researchers

**Profile:**
- PhD students, postdocs, research faculty
- Literature review, concept mapping, thesis writing
- Privacy-conscious (unpublished research)

**Current Pain:**
- LaTeX is slow; Zotero sync is clunky
- University restricts US cloud tools
- Obsidian Canvas feels like afterthought

**Our Solution:**
- Typst speed + native Zotero-to-Canvas
- EU-hosted sync meets institutional requirements
- Graph-first UI where the graph IS the note

**Willingness to pay:** EUR 8-15/month individual, EUR 200-500/year institutional

### Secondary: EU Enterprises

**Profile:**
- Knowledge workers, consultants, strategists
- Compliance-sensitive industries (legal, finance, healthcare)
- GDPR-conscious organizations

**Current Pain:**
- US cloud risks (Schrems II, EU Data Act)
- Tools scan data for AI training
- No self-hosted options for sensitive work

**Our Solution:**
- Local-first + EU E2E sync (Hetzner/OVH)
- Zero-knowledge encryption (not a data processor)
- Self-hosted enterprise option

**Willingness to pay:** EUR 15-25/user/month, EUR 5K-20K/year enterprise

### Tertiary: Visual Thinkers / Privacy Enthusiasts

**Profile:**
- "Second brain" power users
- ADHD/non-linear thinkers
- Privacy-first individuals

**Current Pain:**
- Cloud apps scan data for AI training
- Graph views are read-only afterthoughts
- Subscription fatigue

**Our Solution:**
- Local LLM (Ollama) + local-first storage
- Graph-first UI
- Free tier with no artificial limits

---

## Architecture

### Local-First with Optional Sync

```
+------------------+     +-------------------+     +------------------+
|   Desktop App    |     |   EU Sync Server  |     |   Other Devices  |
|   (Tauri)        |<--->|   Zero-Knowledge  |<--->|   (Desktop/Web)  |
|   SQLite local   |     |   E2E encrypted   |     |                  |
+------------------+     +-------------------+     +------------------+
        |
        v
+------------------+
|   Local LLM      |
|   (Ollama)       |
+------------------+
```

### Why Local-First?

1. **Privacy:** Data never leaves device unless user opts in
2. **Performance:** No network latency for core operations
3. **Offline:** Full functionality without internet
4. **Compliance:** Not a "data processor" — simplifies GDPR
5. **Agent-Ready:** Local AI can access all data without cloud roundtrip

### Sync Architecture (Future)

- **CRDT-based** for conflict-free merging (planned; no CRDT library is wired up yet)
- **Zero-knowledge E2E encryption** — server cannot read content
- **EU-hosted infrastructure** (Hetzner, OVH, Scaleway)
- **Self-hosted option** for enterprises

---

## The Bridge: Obsidian Compatibility

### Why This Matters

Obsidian users are the primary migration target. They already:
- Have large vaults (100s-1000s of notes)
- Value local-first architecture
- Are frustrated with Canvas being separate from notes

### Strategy: "The Bridge" (Not Migration)

Users don't abandon Obsidian — they enhance it with Nodus.

**File Watcher:** Monitors local folder (Obsidian Vault)
**Database Mapping:** SQLite indexes Markdown while storing canvas metadata
**Bi-directional:** Edits sync both ways

### Mapping

| Obsidian Element | Nodus Implementation |
|------------------|---------------------------|
| `.md` file | A `node` entry in SQLite |
| Folder path | A `tag` (keeps canvas flat) |
| `[[Wikilink]]` | A row in `links` table |
| YAML frontmatter | Parsed into `tags`/`type` |
| `.canvas` file | Convert to our coordinates |
| `attachments/` | Link via local file paths |

### Initial Import: Auto-Layout

**The "Empty Canvas" Problem:** If 1,000 notes land at (0,0), users quit in 5 minutes.

**Solution:** Force-Directed Layout algorithm on import
- Clusters related notes based on wikilinks
- Respects folder structure as grouping hint
- User can choose: "Explode" (spread out) or "Cluster" (tight groups)

### Conflict Resolution

- **Text:** Last Write Wins
- **Canvas position:** Nodus exclusive (Obsidian doesn't care about x,y)

### Timelines: Design Decisions

| Decision | Rationale |
|----------|-----------|
| Only dated nodes are placed | Positions are facts, not guesses; no interpolation, no sequence fallback. Undated nodes simply do not appear |
| Dates live in frontmatter (`date:`, `date_end:`) | Files stay the source of truth; Obsidian/OKF compatible; the in-app date editor (node card chip, preview panel) writes the same fields |
| Broken axis | Large empty stretches between event clusters are abbreviated with a marked break; gap detection compares against both span share and median spacing so even spreads never fragment |
| Per-segment label detail | Each axis segment labels itself at its own scale — years, months, days, or clock times — so a one-hour narrative and a millennium can share one axis |
| Bottom sheet, sized to content | Timelines slide up from the bottom edge (spatial model: storylines right, time below, graph above), only as tall as the lanes need, capped at 45% |
| Coexists with overview and reader | The sheet stays open alongside the storyline overview and under a shortened reader; left-edge pushes still step back through reader and overview but never close the sheet |
| Closes with an upward push | The sheet opened by moving down, so it closes by moving up: a push into the top edge band closes it, and so does the pointer leaving the window through the top region - an upward motion usually exits into the title bar before any pointermove lands in the narrow band. The same applies to every edge: a window leave counts as a push on the edge it left through, with horizontal exits taking precedence over vertical ones, because a fast flick reaches the desktop before any sample lands inside a 12px band. Mirrors the spatial model (time below, graph above); the left edge is reserved for stepping back through the storyline layers |
| Unassigned lane | Dated nodes outside every storyline get a neutral gray lane so the timeline shows every dated node in the workspace |
| Marks colored by node, lanes by storyline | Color follows the entity; node colors are solidified from their canvas background tints. Uncolored storylines get a stable hue from a colorblind-validated palette |
| One hover tool | Beads drive the canvas's own hover tooltip through the shared external-hover events; no second preview implementation |

### Wikilink Sync Strategy

Wikilink edges are maintained incrementally. Each node stores the content hash it was last wikilink-synced at (`wikilink_synced_hash`); the full sync pass on startup and workspace switch skips every node whose hash is unchanged, touching neither the filesystem nor the edge table for them. Links whose target does not exist yet are recorded in `pending_wikilinks` (source node, normalized target key) and resolved the moment a node with a matching title or path is created or renamed — so a dangling `[[link]]` becomes an edge without waiting for a full re-scan. The file watcher remains the primary mechanism for reacting to file edits; the full pass is a safety net that is now cheap when nothing changed.

### Open Knowledge Format (OKF)

Nodus interoperates with Google Cloud's Open Knowledge Format (OKF v0.2), the Markdown-plus-frontmatter spec for agent-readable knowledge bundles:

- **Bundle export:** A workspace exports to an OKF bundle — concept documents with `type`/`title`/`tags`/`generated` frontmatter grouped by node type, a root `index.md` with `okf_version: "0.2"`, and wikilinks rewritten as bundle-relative Markdown links. The source workspace and vault are untouched.
- **New files:** Note files that Nodus itself creates carry OKF frontmatter, so vaults grown inside Nodus converge toward OKF conformance without rewriting pre-existing user files.

---

## Rendering: Markdown + Typst

### The "LaTeX-to-Typst" Migration

Users are desperate to escape LaTeX's 90-second compile times.

| Aspect | LaTeX (1984) | Typst (2023) |
|--------|--------------|--------------|
| Compile | 30-90 seconds | Sub-second |
| Syntax | `\begin{equation}` | `$ x^2 $` |
| Debug | Cryptic errors | Clear messages |
| Setup | 2GB TeX Live | Few MB WASM |

### Implementation

**Markdown** for prose (GFM standard)
**Typst** for math and export (WASM in-app)

```markdown
# Research Note

The integral is: $ integral_a^b f(x) dif x $

```typst
#table(
  columns: (1fr, 1fr),
  [Variable], [Value],
  [Alpha], [0.5],
)
```
```

### "Modernize My Math" Import

On Obsidian import:
- Detect LaTeX math (`$\frac{a}{b}$`)
- Offer to convert to Typst syntax
- Immediate visual improvement

---

## UX: The Canvas

### The "Living Documentation" Experience

Everything is a node. Nodes can be:
- Text (Markdown)
- Math (Typst)
- Citation (from Zotero)
- PDF highlight
- Image
- Task
- Person

All nodes:
- Exist on the same canvas
- Can be connected with visual arrows
- Can be grouped into frames
- Are editable in place

### Editing Philosophy: "Inline-First, Modal-Second"

Users want the node on the canvas to be the "source of truth." They dislike clicking a node and having a sidebar that feels like a different app.

**Principle:** The ability to double-click a node and start typing immediately *inside* that box, with the box expanding to fit text.

**The Hybrid Sweet Spot:**
- **Inline editing** for content (the default)
- **Modal/sidebar** only for metadata (tags, properties, file path) or long-form writing (>500 words)

### Node Interaction States

| State | User Action | System Response |
|-------|-------------|-----------------|
| **Idle** | Click node | Highlight node, show contextual toolbar (color, link, edit) |
| **Quick Edit** | Double-click | Enable inline `textarea` within the canvas node |
| **Long Edit** | `Cmd/Ctrl + Enter` | Open note in modal/pane for distraction-free writing |
| **Connect** | Drag from edge | Draw connection line to target node |
| **Move** | Drag node | Update canvas_x, canvas_y in real-time |

### Semantic Zooming

**Problem:** 500+ nodes become "dust" when zoomed out.

**Solution:**
- Zoom out: Nodes aggregate into clusters, show only titles
- Zoom in: Content reveals, full editing mode

**Edge label sizing (required behavior):** Edge labels are rendered in canvas
coordinates inside the zoom-scaled layer, so a fixed canvas font shrinks as the
user zooms out and grows as they zoom in. To keep labels legible, the rendered
font is counter-scaled by `1/zoom` so labels hold a roughly constant on-screen
size. The divisor is clamped to a 0.2–3× zoom window so labels neither balloon
when zoomed far out nor collapse when zoomed far in; the base size still comes
from the user's `edgeLabelSize` canvas setting.

**Edge label zoom threshold (required behavior):** Analogous to the semantic
zoom threshold for node content, edge labels have their own zoom threshold.
When the viewport zoom is below the threshold, edge labels are not rendered;
at or above it, they render normally. Because labels are counter-scaled, they
would otherwise stay full-size while nodes collapse, dominating the zoomed-out
view. The threshold is a display setting (`edgeLabelZoomThreshold`, range 0–1,
default 0.5) configurable via a slider in Settings > Appearance next to the
semantic zoom threshold; setting it to 0 keeps labels visible at every zoom
level.

**Pan and zoom cost (required behavior):** Panning and zooming change the viewport on every frame, and the culling result feeds everything downstream - the rendered node list and all edge styling. The culled result therefore keeps its identity while the same nodes are on screen: a frame that moves the viewport a few pixels returns the previous array and set, so no dependent recomputes. A new result is produced only when a node actually enters or leaves the viewport, or when the node set itself is replaced (new objects must never be served from the cache). Enforced by tests that pan without changing visibility and assert referential stability, on both the linear-scan and spatial-index paths.

**Panel sizing (required behavior):** Every panel the user can resize uses one composable, so the drag behaviour, clamping and persistence cannot drift between them: the storyline overview (width), the agent panel (width) and the timelines sheet (height). Each grows in the direction that points away from its edge - a right-hand panel widens as its separator is dragged left, a bottom sheet grows taller as it is dragged up - within a clamped range, and the chosen size is stored per panel and restored on the next launch. The timelines sheet keeps sizing itself to its lane count until the user drags it, after which their height wins. While a separator is being dragged the panel's own slide transition is suspended, for the same reason the canvas overlays suspend theirs: a transition lags behind the pointer.

**Tooltip placement (required behavior):** Tooltips default to below the element and centred on it, which is only safe away from a window edge. Every container holding controls against an edge declares the direction that keeps its labels on screen: the top-right toolbar aligns them to the button's right edge, bottom-anchored clusters (zoom controls, edge filters, timelines sheet, the agent panel's input row) open upward, and right-side storyline layers align right. Tooltip text always comes from the locale files - a literal string cannot be translated. Both rules are enforced by a gate test that names the edge-anchored containers and fails on any hardcoded tooltip text.

### Canvas Features

- Infinite pan/zoom
- Manual node positioning (drag to place)
- Double-click canvas → create node
- Double-click node → inline edit
- Drag between nodes → create connection
- Node auto-resizes to fit content
- **Multi-directional resize:** All edges and corners (8 handles)
- Minimap navigation (tucked into the canvas's top-right corner)
- **Frames:** Spatial grouping containers (see Frames section below)
- **Undo/Redo system:** Full support including node deletion with edge restoration
- **Cmd/Ctrl+Click:** Zoom-to-fit on specific node (auto-scales based on node size)
- **External links:** Open in default system browser
- **Context menu:** Right-click for node actions (fit, storyline, send to workspace, delete)
- **Copy/Paste nodes:** Cmd+C/Cmd+V to copy and paste nodes (preserves layout)
- **File drop import:** Drag files directly onto canvas (see File Drop Import below)

**Canvas overlays and the storyline panel (required behavior):** Overlays anchored to the canvas's right edge (minimap, zoom controls) are offset by `--canvas-right-inset`, the width of whatever storyline layer covers the canvas, so they stay beside it instead of underneath it. That offset animates on the shared step easing when a layer opens or closes by an edge step, but the animation must be suppressed while the user drags the panel's separator: a transition makes every overlay lag behind the pointer and rubber-band after the drag stops. The panel exposes its drag state, App publishes it as `--inset-duration` (`0s` while resizing), and every overlay that reads `--canvas-right-inset` must time its transition with that variable - enforced by a gate test that scans the stylesheets.

### File Drop Import

Drag and drop files directly onto the canvas to import them. Supported formats:

| Format | Extension | Import Behavior |
|--------|-----------|-----------------|
| **PDF** | `.pdf` | Extract text, clean up with AI, create note node(s) |
| **Markdown** | `.md` | Create note node with content |
| **BibTeX** | `.bib` | Parse citations, create citation nodes |
| **CSL-JSON** | `.json` | Parse citations, create citation nodes (Zotero export) |
| **Ontology** | `.ttl`, `.rdf`, `.owl`, `.jsonld` | Import RDF graph as nodes and edges |

**PDF Import:**
- Extracts text from PDF using Rust backend
- Splits long documents into multiple connected nodes
- AI cleanup: fixes OCR errors, rejoins broken paragraphs, formats as markdown
- Shows progress indicator during processing

**Ontology Import:**
- When ontology files are dropped, a modal appears with options:
  - Create nodes for classes
  - Create nodes for individuals/instances
- Nodes are auto-laid out after import
- RDF properties become edges between nodes

### Frames

Frames are spatial grouping containers that organize related nodes on the canvas.

**Creating Frames:**
- Press `Shift+F` to create a frame:
  - If nodes are selected: creates frame around selected nodes with padding
  - If no selection: enters placement mode (click to place frame center)
- Frames auto-size when created around existing nodes

**Frame Interactions:**
- Click frame to select (shows controls)
- Drag frame to move it along with contained nodes
- Double-click title to rename
- Resize using bottom-right handle

**Frame Controls (when selected):**
- Title label (top): displays frame name, editable on double-click
- Delete button (top-right): circular x button (same style as nodes)
- Color bar (bottom): color picker dots to change border color
- Resize handle (bottom-right): drag to resize frame

**Containment Rules:**
- Nodes are considered "inside" a frame if >50% of node area overlaps the frame
- Moving a frame moves all contained nodes
- Nodes can be moved independently in/out of frames

**Layout invariants (required behavior):**
- A global layout treats each frame as one rigid unit: the frame and its member nodes (by `frame_id`) move together, and member node targets are computed from the node's offset to the frame captured when the layout starts - never incrementally from the node's current (possibly mid-animation) position, so interrupted or repeated layout runs cannot displace nodes relative to their frame
- After a global layout places frames, frame-frame overlaps are resolved (`resolveFrameOverlaps`) and the resolution deltas apply to frames and their member nodes together, so repeated layout presses cannot stack frames
- A pending post-layout frame-expansion pass is cancelled when a new layout starts, so it can never fire against another run's in-flight positions
- These invariants are enforced by tests that run the layout pipeline with framed nodes and assert membership containment and frame separation after single and repeated (interrupting) runs

### Zotero Integration

Two methods for importing citations from Zotero:

**Method 1: File Drop (Export/Import)**
1. In Zotero: Right-click collection → Export Collection → CSL-JSON (Better BibTeX recommended)
2. Drop the `.json` file onto the Nodus canvas
3. If collection metadata detected, ImportOptionsModal appears with options:
   - Create frame for collection (auto-named from Zotero collection)
   - Import attached PDFs (future)
   - Layout choice (grid/force)
4. Citation nodes created inside frame

**Method 2: Direct Library Access (Settings)**
1. Settings → Zotero → Detect (auto-detects local Zotero installation)
2. Browse collections with item counts
3. (Future: Click to import collection directly)

**Supported Formats:**
- CSL-JSON (Zotero native, Better BibTeX extended)
- BibTeX (.bib)

**Better BibTeX Extensions:**
- `citation-key` field for custom citation keys
- `collections` array for collection names
- `attachments` array for linked PDFs

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected nodes/edges/frames |
| `L` | Force layout (D3-force) |
| `N` | Toggle neighborhood mode |
| `F` | Fit to content |
| `Shift+R` | Reset all node sizes to default |
| `Shift+E` | Export graph as YAML (debug) |
| `Shift+F` | Create frame (around selection or placement mode) |
| `Cmd/Ctrl+A` | Select all nodes |
| `Cmd/Ctrl+C` | Copy selected nodes as JSON |
| `Cmd/Ctrl+V` | Paste nodes from clipboard |
| `Ctrl+Shift+R` | Refresh workspace from files |

### Context Menu

Right-click on a node to access:

| Action | Description |
|--------|-------------|
| **Fit to Content** | Auto-resize node to fit its content |
| **Add to Storyline** | Add node(s) to existing or new storyline |
| **Send to Workspace** | Move node(s) to a different workspace |
| **Delete** | Remove node(s) from canvas |

Multi-selection: All context menu actions work on multiple selected nodes.

### Neighborhood Mode

Focus view that isolates a node and its connected neighbors:

- **Depth control:** Configurable 1-5 hops (edges away from focus node)
- **BFS traversal:** Finds all nodes within specified depth
- **Layout modes:**
  - Depth 1: Hierarchical layout (parents above, children below, siblings aside)
  - Depth 2+: Concentric ring layout around focus node
- **Visual highlighting:** Focus node and neighbors highlighted, rest dimmed

### Edge Routing (PCB-Style)

Edges are routed using a motherboard/PCB-inspired lane system:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `STANDOFF` | 80px | Minimum distance from node edge before routing |
| `LANE_WIDTH` | 12px | Spacing between parallel edge lanes |
| `PORT_SPACING` | 25px | Spacing between connection ports on same side |

**Routing algorithm:**
1. Analyze edges and determine exit/entry sides based on relative positions
2. Assign ports on each node side, sorted to minimize crossings
3. Route each edge through dedicated lanes using GridTracker
4. Obstacle avoidance via spatial indexing

**Edge styles:**
- `straight`: Direct line between nodes
- `orthogonal`: 90-degree turns only (default)
- `diagonal`: Angled routing with obstacle avoidance
- `curved`: Smooth Bezier curve
- `hyperbolic`: S-curve that exits/enters nodes orthogonally

**Live routing during drag and zoom (required behavior):**

While a node is being dragged or the canvas is being zoomed, edges must
re-route on every animation frame so they follow the moving node and keep
their configured style. This is intentional, not a performance oversight:
freezing the routing (reusing the pre-drag cached paths) leaves edges
stationary until the drag ends, and substituting cheap straight/orthogonal
fallback paths makes the edge style visibly "pop" during the drag. Both were
tried and rejected as regressions.

Implementation note: `useEdgeRouting` recomputes `routeAllEdges` when the
routing key changes **or** while `isDragging`/`isZooming` is true, and commits
the routing key only when not deferring, so the final positions are routed once
more when the interaction ends. Do not "optimize" this by skipping the
per-frame recompute during drag/zoom without preserving both the live-follow
and the styled appearance. If per-frame routing ever becomes a measured
bottleneck on very large graphs, gate any simplification behind a node-count
threshold rather than applying it to all graphs.

### Themes

YAML-based theme system with SQLite storage. Four built-in themes, plus LLM-generated custom themes.

| Theme | Background | Use Case |
|-------|------------|----------|
| `light` | Light gray | Default daytime |
| `dark` | Dark zinc | Evening work |
| `pitch-black` | True black | OLED displays |
| `cyber` | Neon accents | Aesthetic preference |

**Custom Themes:** Users can ask the graph agent to create themes:
- "Create a crazy bananas theme" generates YAML with custom colors
- Themes stored in `themes` table with workspace association
- Theme YAML defines CSS variables, effects, and metadata

**Theme Schema (YAML):**
```yaml
name: "custom-theme"
display_name: "Custom Theme"
is_dark: false
variables:
  bg_canvas: "#f4f4f5"
  bg_surface: "#ffffff"
  text_main: "#18181b"
  primary_color: "#3b82f6"
```

---

## Data Model

### Design Decisions

1. **TEXT IDs (UUIDs):** Required for CRDT sync compatibility. Auto-increment integers would conflict across devices.
2. **Checksum column:** SHA-256 hash of file content to detect external changes from Obsidian.
3. **Typst cache:** Pre-rendered SVG for 60fps canvas performance.

### Core Schema

```sql
-- 1. Nodes: The fundamental unit of the graph
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,             -- UUIDv4 generated by Rust
    title TEXT NOT NULL,

    -- Content & Source
    file_path TEXT UNIQUE,           -- Path to local .md file (NULL if not mapped)
    markdown_content TEXT,           -- Raw markdown for inline editing
    node_type TEXT DEFAULT 'note',   -- note, task, citation, pdf, etc.

    -- Spatial Metadata (Nodus exclusive)
    canvas_x REAL DEFAULT 0.0,
    canvas_y REAL DEFAULT 0.0,
    width REAL DEFAULT 300.0,
    height REAL DEFAULT 200.0,
    z_index INTEGER DEFAULT 0,
    frame_id TEXT,                   -- Grouping into frames

    -- Styling & State
    color_theme TEXT,                -- 'default', 'blue', 'red', etc.
    is_collapsed BOOLEAN DEFAULT 0,
    tags TEXT,                       -- JSON array
    workspace_id TEXT,

    -- Sync & Version Control
    checksum TEXT,                   -- Hash of content to detect external changes
    created_at INTEGER,              -- Unix timestamp
    updated_at INTEGER,
    deleted_at INTEGER,              -- Soft delete

    FOREIGN KEY(frame_id) REFERENCES frames(id),
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

-- 2. Edges: Visual connections between nodes
CREATE TABLE edges (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    label TEXT,                      -- Optional edge label (e.g., "cites", "blocks")
    link_type TEXT DEFAULT 'related',
    weight REAL DEFAULT 1.0,         -- For layout algorithms
    created_at INTEGER,

    FOREIGN KEY(source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(target_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(source_node_id, target_node_id)
);

-- 3. Frames: Spatial grouping on canvas
CREATE TABLE frames (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    title TEXT,
    canvas_x REAL DEFAULT 0.0,
    canvas_y REAL DEFAULT 0.0,
    width REAL DEFAULT 600.0,
    height REAL DEFAULT 400.0,
    color TEXT,
    is_collapsed BOOLEAN DEFAULT 0,

    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

-- 4. Typst Cache: Stores rendered SVG for performance
-- Prevents re-compiling math every time canvas moves
CREATE TABLE typst_cache (
    node_id TEXT PRIMARY KEY,
    raw_typst_code TEXT,             -- The math formula or Typst block
    rendered_svg TEXT,               -- The SVG string to render
    compiled_at INTEGER,             -- When last compiled

    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- 5. Canvas Views: Saved view states
CREATE TABLE canvas_views (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    name TEXT,
    zoom REAL DEFAULT 1.0,
    pan_x REAL DEFAULT 0.0,
    pan_y REAL DEFAULT 0.0,
    filter TEXT,                     -- JSON: visible types/tags
    updated_at INTEGER,

    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

-- 6. Workspaces
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    vault_path TEXT,                 -- Obsidian vault path
    created_at INTEGER
);

-- Indexes for performance
CREATE INDEX idx_nodes_filepath ON nodes(file_path);
CREATE INDEX idx_nodes_workspace ON nodes(workspace_id);
CREATE INDEX idx_nodes_type ON nodes(node_type);
CREATE INDEX idx_edges_source ON edges(source_node_id);
CREATE INDEX idx_edges_target ON edges(target_node_id);
CREATE INDEX idx_frames_workspace ON frames(workspace_id);
```

### File Watcher Logic (Obsidian Bridge)

The Rust backend uses the `notify` crate to watch the Obsidian vault:

| Scenario | Detection | Action |
|----------|-----------|--------|
| File unchanged | Checksum matches | No action |
| File edited externally | Checksum differs | Update `markdown_content` and `updated_at` |
| File edited in Nodus | After save | Update file on disk AND checksum (prevent loop) |
| New file added | No matching `file_path` | Create new node, run through parser |
| File deleted | `file_path` exists, file gone | Soft delete node |

### Typst Rendering Workflow

1. User types `$E=mc^2$` in a node
2. Node content updated in SQLite
3. Rust detects math block, calls Typst WASM compiler
4. Resulting SVG stored in `typst_cache`
5. Canvas reads from cache for 60fps rendering

### Node Types

| Type | Purpose | Source |
|------|---------|--------|
| `note` | Information, ideas | User created |
| `task` | Actionable items | User created |
| `citation` | Academic reference | Zotero import |
| `pdf` | Document | File import |
| `highlight` | PDF annotation | PDF viewer |
| `person` | Contact | User created |
| `topic` | Concept cluster | User/auto |

### Link Types

| Type | Meaning | Visual |
|------|---------|--------|
| `related` | General association | Gray arrow |
| `cites` | Academic citation | Blue arrow |
| `blocks` | Dependency | Red arrow |
| `supports` | Evidence | Green arrow |
| `contradicts` | Opposition | Orange arrow |

---

## Feature Roadmap

### Phase 1: Canvas + Obsidian Bridge

**Goal:** "Living Documentation" foundation

- [x] Infinite canvas with pan/zoom
- [x] Semantic zooming (aggregate on zoom-out)
- [x] Node CRUD on canvas
- [x] Visual connections (drag to link)
- [x] Inline editing
- [x] Frames for grouping
- [x] Obsidian vault import
- [x] Auto-layout algorithm (D3-force)
- [x] Bi-directional vault sync
- [x] Wikilink → link parsing
- [x] Minimap
- [x] Keyboard shortcuts
- [x] Undo/redo system with deletion support
- [x] Multi-directional node resize
- [x] PCB-style edge routing
- [x] Neighborhood mode with depth control
- [x] Theme system (4 themes)

### Phase 2: Modern Researcher

**Goal:** Zotero-to-Canvas as the "Aha!" moment

- [x] Zotero integration (core pillar)
- [x] Citation node type
- [x] Drag citation → create linked node (BibTeX/CSL-JSON drop)
- [x] Zotero collection → Frame mapping
- [x] Direct Zotero library access (Settings > Citations)
- [ ] PDF import with highlights
- [ ] PDF highlight → canvas node
- [x] Typst math rendering (WASM)
- [x] Live-rendered equations
- [ ] "Modernize My Math" import
- [ ] Export to Typst
- [ ] Export to PDF (journal-quality)
- [ ] LaTeX export (legacy support)

### Phase 3: EU Sync + Collaboration

**Goal:** Team usage, institutional sales

- [ ] EU-hosted sync (Hetzner)
- [ ] Zero-knowledge E2E encryption
- [ ] CRDT conflict resolution
- [ ] Shared workspaces
- [ ] Real-time cursors
- [ ] Comments on nodes
- [ ] Version history
- [ ] Offline-first with sync queue

### Phase 4: Enterprise

**Goal:** EUR 5K+ contracts

- [ ] SSO (SAML, OIDC)
- [ ] Audit logs
- [ ] Admin dashboard
- [ ] Role-based permissions
- [ ] Self-hosted (Docker)
- [ ] REST API
- [ ] Webhooks
- [ ] SLA options

---

## AI Compatibility

### "Agent-Ready" Data

Users want to point Ollama at their notes. We make this easy:
- SQLite database (queryable)
- Markdown content (readable)
- JSON export (portable)
- Built-in agent with tool calling

### Local LLM Agent (Ollama)

The canvas includes a built-in agent that can build and modify knowledge graphs via natural language.

**Chat transcript (required behavior):** The agent is a chat window occupying the full height of the canvas's left edge, not a band across the header: a transcript needs vertical room, and a header strip can give it none. The left edge is deliberate - the right one belongs to the storyline overview, reader, and timelines. Within the panel the conversation takes the free space at the top and scrolls, while the context line and the input row are pinned at the bottom, in that order, since the input belongs at the foot of the conversation it feeds. Canvas overlays anchored to the left edge (node preview, edge filters, hover tooltip, citation progress) are offset by the panel's width through `--canvas-chat-inset`, mirroring how `--canvas-right-inset` clears the storyline layers; right-anchored overlays such as the minimap and zoom controls are unaffected and must not carry that inset.

The panel folds away like the storyline panel, on the shared step easing, and the folded state persists across sessions. Its single toggle sits in the canvas's top-left corner, outside the panel: a control that travels with the panel disappears exactly when it is needed. A left-edge push also reveals it, mirroring the right-edge push that reveals the storyline overview - but only once no storyline layer is left to step back through, so the left edge dismisses the reader and overview first. While folded the panel contributes no inset and the left-anchored overlays reclaim the space. The panel's bottom follows `--canvas-bottom-inset`, so it ends above an open timelines sheet rather than disappearing behind it. The transcript shows the exchange in order: each prompt the user sent, and each answer the agent gave in full. Whenever the bar is visible the transcript area is visible too: before the first exchange it holds a placeholder naming itself as where answers appear, because an area that materializes only once output exists leaves the same question - where does the output go - unanswered. An answer that arrives as plain text is displayed as written - never truncated - because otherwise a reply that performs no canvas action leaves no visible trace at all.

Under each assistant turn, the actions taken during it collapse into a single line (`4 tool calls`) that expands to the list of tools and their outcomes. This is a summary of what the agent *did*, distinct from the activity log panel, which remains a diagnostic surface for errors and opens itself only when a run genuinely fails.

The transcript persists for the session, scrolls to the newest turn as it arrives, and is cleared by the same control that clears the agent's conversation memory, so what the user sees and what the model remembers are cleared together.

**Context indicator (required behavior):** The bar states what the agent will actually see before the prompt is sent. With nodes selected, the context is that selection and the bar names them (the first few titles, the remainder as `+N more`, the full list on hover); with nothing selected the context is the whole filtered graph and only its node count is given, since naming hundreds of nodes informs nobody. Untitled nodes are named as such rather than rendered blank. The displayed list and the list handed to the agent are derived from one computed source, so the claim cannot drift from the payload.

**Architecture:**
- Direct Ollama API integration (`/api/chat` with tools)
- Tool calling with native support + fallback JSON parsing
- Stateless requests (no history bleeding between requests)
- System prompt includes current canvas state (existing nodes)
- **Queue manager:** Sequential request processing to prevent race conditions

**Graph Agent Tools:** every tool the in-app agent can call. Which ones are offered depends on the mode: explore is read-only, plan designs for approval, execute may mutate. A gate test fails when this list and the registry disagree.

*Nodes and edges*

| Tool | Description |
|------|-------------|
| `create_node(title, content, x, y, date, date_end, tags)` | Create a new node on the canvas with a title and markdown content |
| `create_edge(from_title, to_title, label, color)` | Create an edge connecting two nodes by their titles |
| `create_edges_batch(edges)` | Create multiple edges at once. More efficient than create_edge for mind maps and graphs |
| `create_nodes_batch(nodes)` | Create or update multiple nodes. Handles any size array by processing in chunks |
| `update_node(title, new_content, date, date_end, tags)` | Update ONE node: content, date or tags. For multiple nodes use batch_update |
| `update_edge(from_title, to_title, label, color)` | Update an edge label or color by specifying the connected node titles |
| `update_title(title)` | Change the note title |
| `update_content(content)` | Update the note content with new text. THIS SAVES YOUR WORK |
| `append_content(text)` | Append text to the end of the note |
| `move_node(title, x, y)` | Move a single node to a new position |
| `batch_update(updates)` | Update multiple nodes. LLM decides values. Use for titles, content, OR positions |
| `delete_node(title)` | Delete a single node by its title |
| `delete_edges(filter)` | Delete edges. Use to remove connections without deleting nodes |
| `delete_matching(filter)` | Delete multiple nodes matching a filter |
| `generate_sequence(count, title_pattern, content_pattern, layout, connect)` | Generate N nodes with a pattern. Use for large batches (100+). Pattern uses {n} for number |
| `format_math()` | Reformat the math in the note to Typst syntax using the model. Use this when the note contains LaTeX (like \frac{a}{b} or \alpha) or other non-Typst math that should render correctly |
| `node_done(summary)` | Signal that the node editing task is complete. You MUST call update_content first |

*Reading the graph*

| Tool | Description |
|------|-------------|
| `read_graph(mode, include_content, max_content_length)` | Read the current graph state. Auto-adapts to available context. Modes: "auto" (default), "titles", "summary", "full" |
| `query_nodes(filter)` | Query nodes from database. Returns list of {title, content} for planning |
| `for_each_node(filter, action, template)` | Process nodes: set/append content with templates, or use LLM to generate/transform content |
| `check_completeness(topic, findings)` | Assess if research on a topic is complete. Returns coverage score and suggests follow-up queries if gaps exist |

*Selection*

| Tool | Description |
|------|-------------|
| `update_selected_content(content)` | Replace the content of the selected node(s). Use when user says "update this", "change this to", etc |
| `append_to_selected(text)` | Append text to the end of the selected node(s). Use when user says "add to this", "append", etc |
| `rename_selected(title)` | Rename the selected node. Only works with single selection |
| `color_selected(color)` | Set the color of all selected nodes. Use when user says "color these", "make these red", etc |
| `delete_selected()` | Delete all selected nodes. Use when user says "delete these", "remove selected", etc |
| `connect_selected_to(target_title, label)` | Connect the selected node(s) to another node by title. Creates edges from all selected to target |
| `summarize_selected(instruction)` | Create a summary of all selected nodes. Generates a new node with the summary |
| `expand_selected(instruction)` | Expand the selected node with more detail. Use when user says "expand this", "add more detail", etc |

*Layout and colour*

| Tool | Description |
|------|-------------|
| `auto_layout(layout, sort)` | Arrange nodes in a layout |
| `smart_move(instruction)` | Move nodes based on semantic criteria. LLM reasons about each node. Use for "move cars left, animals right" |
| `smart_connect(groups)` | Connect nodes within semantic groups. E.g., "connect animals together, connect cars together, but not across" |
| `smart_color(instruction)` | Color nodes into multiple categories based on what they represent. LLM semantically classifies each node |
| `color_matching(pattern, color)` | Color nodes by SEMANTIC criterion (what nodes represent). Use for categories like "person", "organization", "question". NOT for text patterns - use color_regex instead |
| `color_regex(regex, color, field)` | Color nodes by regex pattern on title. Use for "starts with x" (^x), "ends with .md" (\.md$), "contains foo" (foo). Fast batch operation, no LLM needed |
| `reset_edge_colors()` | Reset all edge colors to default. Removes custom colors from all edges |

*Themes*

| Tool | Description |
|------|-------------|
| `create_theme(name, description)` | Create a new custom theme. LLM generates YAML based on description |
| `update_theme(name, changes)` | Update an existing custom theme based on changes description |
| `apply_theme(name)` | Switch to a named theme |
| `list_themes()` | List available themes |

*Research*

| Tool | Description |
|------|-------------|
| `research(query, sources)` | Research a topic across web and local nodes. Returns results with source attribution |
| `deep_research(topic, depth, aspects)` | Perform deep, iterative research with cross-validation. Use for comprehensive research that needs multiple rounds of queries, Wikipedia article fetching, and source validation. Returns findings with confidence levels |
| `research_topic(topic, target_count, batch_size)` | Research a topic and create many nodes. Makes multiple LLM calls to avoid truncation |
| `web_search(query)` | Search the web for information. Use this to research topics before creating nodes |
| `fetch_url(url)` | Fetch and read the content of a web page. Use this after web_search to read full articles |
| `fetch_wikipedia(title)` | Fetch full Wikipedia article content for a topic. Use to get detailed information on a specific subject |
| `wikipedia_search(query, limit)` | Search Wikipedia for articles matching a query. Returns list of matching articles with snippets. Use this to discover relevant Wikipedia articles before fetching full content |
| `validate_claim(claim)` | Cross-validate a specific claim or fact across multiple sources. Returns confidence level and supporting sources |
| `build_knowledge_base(topic, scope, target_nodes, phases)` | Build a comprehensive knowledge graph about a topic. Runs multiple research phases with supervisor checks. Use for "create a knowledge base about X" requests |
| `check_progress(topic)` | Ask the supervisor to evaluate current knowledge graph progress. Returns recommendations |
| `expand_aspect(aspect, depth)` | Expand the knowledge graph by researching a specific aspect. Use after check_progress identifies gaps |

*Reasoning, planning and memory*

| Tool | Description |
|------|-------------|
| `think(thought)` | Express your reasoning or thinking process. Use this to plan before acting |
| `plan(tasks)` | Create a task list for a complex operation. Each task will be shown in the log |
| `create_plan(title, steps)` | Create a detailed plan with steps for user approval. Every step MUST declare its "action" so the user can see what will be created vs edited before approving. IMPORTANT: Plans for graphs MUST include separate steps for: 1) Creating nodes, 2) Creating edges with labels, 3) Applying layout |
| `request_approval(plan_id, message)` | Request user approval for the current plan. Agent will pause until user approves, rejects, or modifies |
| `update_task(task_index, status)` | Update the status of a task in the current plan |
| `set_goal(goal, steps)` | Start tracking a new goal. Clears previous session memory |
| `update_progress(progress, completed_action)` | Update progress on current goal (0-100%) |
| `complete_goal(summary)` | Mark current goal as complete and clear session memory |
| `push_task(description, priority, context)` | Add a task to the todo stack for later. Tasks are processed LIFO (last in, first out) |
| `pop_task()` | Get and remove the top task from the stack |
| `peek_stack()` | View the task stack without removing tasks |
| `clear_stack()` | Clear all tasks from the stack |
| `remember(message)` | Store important information for future reference in this conversation |
| `done(summary, force)` | Signal completion. BLOCKED if graph has nodes but no edges - you MUST create edges first with create_edges_batch |

**Node Agent Tools (per-node AI):**

| Tool | Description |
|------|-------------|
| `web_search(query)` | Search the web (optional) |
| `fetch_url(url)` | Read full web page content |
| `wikipedia_search(query)` | Search Wikipedia |
| `update_content(content)` | Replace note content (auto-converts LaTeX to Typst) |
| `append_content(text)` | Add text to note |
| `update_title(title)` | Change note title |
| `done(summary)` | Signal completion (requires prior update_content) |

**Key Design Decisions:**

1. **Upsert Behavior:** `create_nodes_batch` checks existing titles (case-insensitive). Updates existing nodes, creates new ones. Prevents duplicates.

2. **Iterator Pattern:** `for_each_node` with filter allows batch operations:
   - `for_each_node({ filter: "empty", action: "search", template: "{title} info" })`
   - Processes only nodes matching filter

3. **Query Before Execute:** `query_nodes` returns node list for planning before action.

4. **Thinking Layer:** Web search refines query via LLM before executing search.

5. **No Clear Canvas:** Removed from agent tools to prevent accidental deletion.

6. **Stateless Requests:** Each request starts fresh with current canvas state in system prompt. No conversation history pollution.

7. **LaTeX to Typst Conversion:** Node agent auto-converts LaTeX math (`\[...\]`, `$$...$$`) to Typst format when saving content.

8. **Per-Workspace Memory:** `remember` tool saves information to localStorage, persists across sessions.

9. **Content Enforcement:** Node agent must call `update_content()` before `done()` or request is rejected.

### Internationalization (i18n)

Nodus supports multiple EU languages:

| Language | Code | Status |
|----------|------|--------|
| English | `en` | Complete |
| German | `de` | Complete |
| French | `fr` | Complete |
| Spanish | `es` | Complete |
| Italian | `it` | Complete |

**Language Selection:**
- First launch: Language selector appears in onboarding flow
- Settings > General: Language dropdown to change anytime
- Persistence: Choice saved to localStorage, persists across sessions
- Browser detection: Auto-detects browser language on first launch

**Implementation:**
- Uses vue-i18n with lazy loading for non-default locales
- Locale files: `src/i18n/locales/{lang}.json`
- All UI strings are translatable; user content remains in original language

### Starter Content

After onboarding (and via Settings > Reset default workspace), the empty default workspace is seeded with starter content. The starter content must demo every user-facing feature, localized in all five locales:

| Feature | Demonstrated by |
|---------|-----------------|
| Notes, colors, untitled node | Tutorial and research-example notes (4 colored, 1 untitled) |
| All five edge link types, labels, directed/undirected | Edges between the tutorial and research nodes |
| Wikilinks | `[[links]]` in tutorial content become auto-edges |
| Typst math, Mermaid diagrams | Dedicated reference nodes |
| Frames | "Demo Project" frame (dated story nodes) and "Entity Types" frame |
| Storylines (panel, reader, timelines lane) | A storyline threading the three dated project notes in order |
| Timelines / dated nodes | `date:`/`date_end:` frontmatter on the project notes (incl. one date range); a dated citation outside the storyline shows the unassigned lane |
| Hashtags / tags | `#hashtags` in the project notes become tag chips |
| Entity node types | One node each: citation (with DOI), comment, character, location, term, item |

Resetting the default workspace also removes its previous frames and storylines before reseeding, so repeated resets do not accumulate duplicates.

### Settings

Settings modal with six tabs: General, Appearance, Canvas, AI, Citations, Integrations.

**General:**
- Language selector (en, de, fr, es, it)
- Collapsible About & License section
- Collapsible Advanced section with workspace diagnostics (scan for node counts per workspace, recovery)

**Appearance:**
- Theme selection grid (built-in + custom), delete custom themes
- Display options

**Canvas:**
- Snap to grid toggle
- Grid size (px)
- Edge style (straight, orthogonal, diagonal, curved, hyperbolic)

**AI:**
- LLM Features toggle (show/hide AI prompts)
- Provider selection (Ollama, OpenAI, Anthropic, OpenAI-compatible)
- Streaming toggle (optional)
- API key, base URL, model selection
- Max tokens, context window, timeout
- Neighbor context limit
- Web search API key (Tavily)
- System prompt customization

**Citations:**
- Zotero connection (library access, collection import)
- Citation import via BibTeX / CSL-JSON

**Integrations:**
- MCP server controls

**Content Rules (System Prompt):**
- Title = label, Content = substance
- No meta-commentary
- Be concise: data, definitions, or markdown only

### MCP Server

Workspace scoping: each connection can target its own workspace via `list_workspaces` / `set_workspace` (id or name), independent of the workspace open in the app — multiple agents can work different workspaces in parallel. An unscoped connection follows the open workspace. Scoped reads serve that workspace's nodes, edges, and frames; node creation lands there; scoped changes stay off the user's undo stack.

Connection trust: a client's first connection requires user approval in the app. On approval the server issues a random token whose SHA-256 hash is stored in the `mcp_trusted_clients` table; the client persists the token (`~/.nodus/mcp-token`) and presents it via an `authenticate` request on later connections, which are then approved without a prompt. Clients that present no valid token get the approval prompt after a short grace period or on their first request. Settings > Integrations shows the number of trusted clients and can forget them all, which revokes every stored token.

```yaml
resources:
  - graph://nodes/{id}
  - graph://workspaces/{id}
  - graph://canvas/{workspaceId}

tools:
  - create_node
  - update_node
  - link_nodes
  - search_nodes
  - get_context      # Returns relevant nodes for a query
  - get_neighbors    # Returns connected nodes
```

---

## Monetization

### Open Core Model

| Component | License |
|-----------|---------|
| Desktop app | Open source (trust, academics) |
| Obsidian bridge | Open source |
| Local AI | Open source |
| Sync server | Proprietary |
| Team features | Proprietary |
| Enterprise features | Proprietary |

### Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | EUR 0 | 3 canvas boards, local only, Ollama, no mobile |
| **Pro** | EUR 10/mo | Unlimited boards, EU sync, mobile access, PDF import, Typst export |
| **Team** | EUR 15/user/mo | Shared workspaces, real-time collaboration |
| **Enterprise** | Custom | SSO, audit, self-hosted, SLA |

**Free Tier Limits (Critical for Conversion):**
- 3 canvas boards maximum
- Local only (no cross-device sync)
- No mobile access
- Ollama AI allowed (local)
- Obsidian bridge allowed

**Pro Value Prop:** Not just "sync" — **Cross-device intelligence**
- Desktop LLM summarizes node → appears summarized on phone
- Seamless mobile capture → lands on desktop canvas

### Competitive Pricing

| Competitor | Price | Our Advantage |
|------------|-------|---------------|
| Heptabase | EUR 12-18/mo, no free tier | Limited free tier + open source |
| Notion | EUR 10/mo, US cloud | EU sovereignty |
| Obsidian Sync | EUR 8/mo | More features, graph-first |

### Revenue Target

**Full-time: EUR 15K/month**

| Year | Pro | Team | MRR |
|------|-----|------|-----|
| 1 | 500 | 50 | EUR 5,750 |
| 2 | 1,500 | 200 | EUR 18,000 |
| 3 | 3,000 | 500 | EUR 37,500 |

---

## Technical Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | Vue 3, TypeScript | Proven, ecosystem |
| Canvas | **PixiJS + DOM hybrid** | PixiJS for performance, DOM for text editing |
| Desktop | **Tauri v2** | Small binary (~10MB), Rust security, native WebView |
| Database | **SQLite** via `sqlx` | Embedded, WAL mode, no server to run |
| Content | **.md files** | Text content in Markdown files, NOT in SQLite |
| State | Pinia | Vue standard |
| Math | **@myriaddreamin/typst.ts** | Typst WASM, sub-second rendering |
| Editor | Plain `textarea` overlay | Markdown edited as text; rendered separately, with Typst and Mermaid blocks |
| Layout | D3-force | Force-directed auto-layout on import |
| Edge Routing | Custom PCB-style | Lane-based routing with GridTracker, obstacle avoidance |
| File Watch | Rust `notify` crate + **file locking** | Prevent corruption with Obsidian |
| Sync | *Not implemented* | Planned: CRDT merge of canvas positions only, never text |
| Backend | Rust (Tauri commands) | Local file, database and watcher work; no sync server exists yet |
| Hosting | *Not implemented* | Planned for sync: EU, GDPR-native |

### Critical Architecture Rule

**Separation of Concerns:**
- **SQLite:** Metadata, canvas positions, edges, tags
- **.md files:** Actual text content (Obsidian compatible)
- **CRDTs (planned):** Would sync canvas positions across devices only

**Never** store CRDT binary data in the same column as Markdown content.

### Why No "Conflicting Copies" (Unlike OneNote)

OneNote creates duplicates because it syncs at file/section level. Nodus avoids this:

1. **Local-first:** All edits happen locally. No internet needed.
2. **CRDT sync for positions (planned):** would sync node x,y coordinates, NOT text.
3. **File locking:** Rust acquires lock on .md when open in Nodus.
4. **Checksum detection:** SHA-256 detects external changes.

### Canvas Rendering: Hybrid (PixiJS + DOM)

**Problem:** Editable text inside WebGL is difficult.

**Solution: Layer separation**

| Layer | Technology | What it renders |
|-------|------------|-----------------|
| Background + edges | PixiJS (WebGL) | Grid, connections, node outlines |
| Text editing | HTML DOM overlay | Actual editable text |
| Zoomed out | PixiJS texture | Hide DOM, render text as sprite |

**Use PixiJS (WebGL) for:**
- Handles thousands of nodes at 60fps
- DOM/SVG chokes on too many elements
- SVG only for node *contents* (like Typst formulas)
- Render SVG as PixiJS Sprite for performance

**Rendering strategy:**
1. Canvas background + pan/zoom: PixiJS (WebGL)
2. Node content (text, math): SVG rendered to texture
3. Connections/arrows: PixiJS Graphics

---

## Implementation Roadmap

### Recommended Approach: Hybrid (Bottom-Up + Visual)

Given the priority on data integrity (no OneNote-style conflicts), but also need for momentum:

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Rust backend | File watcher, checksum logic, SQLite writes |
| 2 | Canvas MVP | PixiJS canvas with mock nodes (hardcoded JSON) |
| 3 | Integration | Canvas reads from SQLite, displays real nodes |
| 4 | Editing | Inline text editing in nodes |
| 5 | Connections | Draw edges between nodes |
| 6 | Obsidian import | Parse vault, auto-layout, wikilink → edges |

### Development Milestones

| Step | Task | Success Metric |
|------|------|----------------|
| 01 | Initialize Tauri v2 + Vue project | App opens in <0.5s |
| 02 | Implement Rust file-watcher for test folder | Adding `.md` file triggers console log |
| 03 | Basic PixiJS canvas with draggable nodes | 100 nodes drag at 60fps |
| 04 | Integrate Typst WASM for math node | `$a^2 + b^2 = c^2$` renders instantly |
| 05 | Build Obsidian link parser | `[[Link]]` creates edge on canvas |
| 06 | Implement checksum-based sync | External file edit updates node |
| 07 | Auto-layout on import | D3-force positions 100 nodes in <3s |
| 08 | Inline editing | Double-click node, type, save |

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sync method (planned) | Local SQLite + a CRDT layer | Granular merge of positions, no file-level conflicts |
| Data locality | Local-first | Instant editing, internet only for sync |
| File handling | Rust notify + locking | Prevents corruption when Obsidian open |
| Canvas renderer | PixiJS (WebGL) | 60fps with 1000+ nodes |
| Math renderer | Typst WASM + SVG cache | Sub-second, cached for performance |

### Project Scaffolding

```bash
# Create Tauri v2 project
npm create tauri-app@latest nodus
# Choose: Vite + Vue + TypeScript

# Project structure:
nodus/
├── src/                    # Frontend (Vue + PixiJS)
│   ├── components/
│   ├── canvas/             # PixiJS canvas logic
│   ├── stores/             # Pinia state
│   └── App.vue
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── watcher.rs      # File watcher (notify crate)
│   │   ├── database.rs     # SQLite operations
│   │   └── commands.rs     # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

### Key Crates (Rust)

| Crate | Purpose |
|-------|---------|
| `notify` | File system watcher |
| `fs2` | File locking (cross-platform) |
| `sqlx` or `tauri-plugin-sql` | SQLite operations |
| `sha2` | Checksum calculation |
| `uuid` | Node ID generation |
| `serde` | JSON serialization |
| `y-crdt` *(planned)* | CRDT bindings for position sync; not a dependency yet |

### File Locking Workflow

```
User opens node in Nodus
    ↓
Acquire SHARED lock on .md file (read)
    ↓
User starts editing (double-click)
    ↓
Try to upgrade to EXCLUSIVE lock (write)
    ↓
┌─────────────────┬──────────────────────────┐
│ Lock acquired   │ Lock failed              │
│ → Edit enabled  │ → Show: "File is being   │
│                 │   edited in another app" │
└─────────────────┴──────────────────────────┘
    ↓
User saves → Write to .md → Release lock
```

**Important:** Do NOT lock during initial import checksum scan — only during active editing.

### CRDT to PixiJS Integration (planned)

The sync layer below is a design, not shipped code. Since it would sync canvas
positions only (never text):

```
CRDT Document (Backend)
    │
    │  Maps: NodeID → (x, y, z_index)
    ↓
Rust updates SQLite nodes table
    │
    │  Tauri event: "node-position-changed"
    ↓
Vue Frontend receives event
    │
    ↓
PixiJS updates Container.position.x/y
```

### Hybrid Rendering Workflow

```
┌─────────────────────────────────────────────┐
│                 CANVAS                      │
│  ┌─────────────────────────────────────┐   │
│  │ PixiJS Layer (WebGL)                │   │
│  │ - Background grid                   │   │
│  │ - Edges/connections                 │   │
│  │ - Node containers (rectangles)      │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ DOM Layer (HTML overlay)            │   │
│  │ - <textarea> for editing            │   │
│  │ - Positioned via CSS transform      │   │
│  │ - Maps PixiJS coords → CSS top/left │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘

Zoom threshold:
  zoom > 0.5 → Show DOM text elements
  zoom < 0.5 → Hide DOM, render text as PixiJS texture
```

### Coordinate Mapping (PixiJS → DOM)

```typescript
function syncDOMToPixi(nodeId: string, pixi: PIXI.Container) {
  const domElement = document.getElementById(`node-${nodeId}`);
  const globalPos = pixi.toGlobal(new PIXI.Point(0, 0));

  domElement.style.transform = `translate(${globalPos.x}px, ${globalPos.y}px)`;
  domElement.style.width = `${pixi.width * currentZoom}px`;
}
```

### Multi-User & Collaboration Guidelines

**Local-First Principles:**
1. **Local database is source of truth** — sync is secondary
2. **Network is optional** — work is never trapped on one device
3. **Partition data** — per note/board/project, not one massive file
4. **Smaller payloads** — faster sync, graceful failures

**Conflict Resolution Strategy:**

| Approach | Pros | Cons | Use Case |
|----------|------|------|----------|
| **CRDTs** | Automatic merge, no data loss | More complex | Collaborative editing |
| **Last-Write-Wins** | Simple, fast | May lose data | Single-user sync |

**Recommendation:** CRDTs for content, LWW for metadata (positions, colors).

**Collaboration-Aware UI:**
- Show activity indicators (who's editing)
- Prevent conflicts through awareness, not just auto-merge
- Optional: real-time cursors for shared workspaces

### Task & Project Management Integration

Tasks and projects are **nodes in the graph**, not separate silos.

**Design Principles:**

1. **Actionable Integration:** Todos linked directly to notes and projects
2. **Minimalist Capture:** Fast entry, auto-organization via tags
3. **Context-Based Views:** Tasks grouped by project, not just flat list
4. **Daily Notes:** Canvas for daily thoughts, sort into tasks in evening

**Node Types for PM:**

| Type | Purpose | Properties |
|------|---------|------------|
| `task` | Actionable item | due_date, status, assignee |
| `project` | Container | progress, deadline |
| `milestone` | Achievement marker | target_date |
| `daily` | Daily note canvas | date |

**Task States:**

```
[ ] todo → [~] in_progress → [x] done
                ↓
            [!] blocked
```

### Mobile Strategy: The Capture Bridge

**Phase 1:** Do NOT rebuild canvas on mobile. Build a simple **PWA** for capture only.

**Mobile PWA Features:**
- Create new `.md` files in synced folder (Dropbox/Nextcloud initially)
- Tag and title new notes
- Voice-to-text capture
- Photo → OCR → node

**Desktop Integration:**
- Desktop detects new files via watcher
- Auto-adds to SQLite with default position
- User arranges on canvas later

**This justifies Pro tier** — mobile capture only works with cloud sync.

---

## Go-to-Market

### Phase 1: Community (Months 1-6)

- Open source desktop app
- "Stop managing windows" messaging
- Obsidian subreddit, Academic Twitter
- Blog: "LaTeX to Typst migration guide"
- Conference: local academic meetups

### Phase 2: Monetize (Months 6-12)

- Launch Pro tier
- First 100 paying researchers
- Case studies: "How I wrote my thesis in Nodus"
- University IT outreach

### Phase 3: Scale (Year 2+)

- Team tier
- Enterprise pilots
- Institutional licenses
- EU grant applications (Horizon Europe)

---

## Risks and Mitigations

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Empty canvas overwhelms users | High churn | Nail auto-layout, provide templates |
| Obsidian adds canvas editing | Competition | Move fast, deeper Zotero integration |
| Typst adoption slower than expected | Reduced differentiation | Keep LaTeX fallback |
| Mobile gap loses users | Incomplete solution | PWA capture app early |
| Enterprise sales cycle too long | Cash flow | Focus on self-serve researchers first |
| Free tier too generous | No conversion | Limit free to 3 canvas boards |

### Architectural Risks (Critical)

#### 1. The Sync Trilemma

**Problem:** SQLite (data) + a future CRDT layer (collab) + Obsidian (.md files) creates conflict risk. Only the first and third exist today; the mitigations below are the rules a sync layer would have to follow.

If user edits in Nodus (SQLite) AND Obsidian (.md) simultaneously → **data corruption**.

**Mitigations:**

| Strategy | Implementation |
|----------|----------------|
| **File Locking** | Rust backend acquires lock on .md when open in Nodus |
| **Separation of Concerns** | SQLite for metadata/positions only; .md files for content |
| **CRDTs for Canvas Only** | A CRDT layer would sync node positions, NOT text content |

**Critical Rule:** Do NOT store CRDT binary data in the `markdown_content` column. Keep text in .md files.

#### 2. Obsidian Canvas Drift

**Problem:** Obsidian Canvas (.canvas) has x,y coordinates. Nodus has x,y. If user moves nodes in Nodus, Obsidian Canvas becomes outdated.

**Mitigation:** Build an **Obsidian Plugin** that reads/writes x,y from Nodus database, or vice versa.

**Also:** Obsidian uses folder structure; Nodus canvas is flat. Auto-map folders → Frames on import.

#### 3. Text Editing in WebGL

**Problem:** Editable text inside PixiJS/WebGL canvas is difficult.

**Mitigation: Hybrid Rendering**

| Layer | Technology | Purpose |
|-------|------------|---------|
| Background, edges, outlines | PixiJS (WebGL) | Performance |
| Text editing | HTML DOM overlay | Native input |
| Zoomed out | PixiJS texture | Hide DOM, render as sprite |

**Rule:** Never compile Typst while panning. Compile on text change only, cache SVG.

### The "Empty Canvas" Problem

**Critical risk:** New users hate a blank screen. If they import 1,000 notes and see a messy pile, they quit.

**Mitigations:**
1. Auto-layout that actually looks good
2. "Suggested layouts" based on vault structure
3. Quick-start templates
4. Guided onboarding for first nodes
5. "Import 10 notes first" recommendation

---

## Success Metrics

### Product

- Daily active users
- Nodes created per session
- Connections created per user
- Obsidian vaults imported
- Typst equations rendered

### Business

- MRR
- Free → Pro conversion rate
- Churn rate
- NPS score

### Quality

- Canvas performance (60fps with 1000 nodes)
- Import success rate
- Sync conflict rate

---

## Open Questions

1. **Product name:** "Nodus" sounds like a library. Consider: Synapse, Loom, Kinetic, Aura, Marrow, Lattice
2. **Mobile strategy:** PWA capture app vs native? Focus on "add node" not full editing
3. **Zotero integration depth:** Plugin vs direct API?
4. **One-time purchase:** Offer perpetual license for desktop-only users?
5. **Academic discount:** 50% for .edu emails?

---

## Next Steps

### Completed (Weeks 1-8)

1. [x] Finalize product name → **Nodus**
2. [x] Initialize Tauri v2 + Vue project
3. [x] Set up LibSQL database with schema
4. [x] Implement Rust file-watcher (notify crate)
5. [x] Write checksum function (SHA-256)
6. [x] PixiJS canvas with hybrid rendering (WebGL + DOM overlay)
7. [x] DOM overlay for text editing
8. [x] Draggable nodes at 60fps
9. [x] Connect canvas to SQLite
10. [x] Inline node editing (DOM layer)
11. [x] Obsidian vault import
12. [x] Wikilink → edge parsing
13. [x] D3-force auto-layout
14. [x] Draw connections between nodes
15. [x] Semantic zooming
16. [x] PCB-style edge routing with lane separation
17. [x] Undo/redo system with node deletion support
18. [x] Multi-directional node resize (8 handles)
19. [x] Neighborhood mode with configurable depth (1-5 hops)
20. [x] Theme system with 4 themes and persistence
21. [x] External links open in system browser
22. [x] LLM agent with tool calling and queue manager
23. [x] Multi-language support (en, de, fr, es, it)
24. [x] Language selector in onboarding and settings
25. [x] Unified file drop import (PDF, MD, BibTeX, ontology)
26. [x] File locking mechanism (fs2 crate for cross-platform locks)
27. [x] Integrity test suite (concurrent edit tests, checksum validation)
28. [x] Typst backend rendering (Rust-side typst crate for math compilation)
29. [x] Folder → Frame mapping (auto-create frames from Obsidian folders on import)
30. [x] Typst WASM frontend integration (browser mode fallback via @myriaddreamin/typst.ts)
31. [x] Bi-directional vault sync (file watcher + write-back with checksum tracking)
32. [x] Zotero integration (BibTeX/CSL-JSON import, collection-to-frame mapping, direct library access)

### In Progress

- [ ] Obsidian Plugin (sync x,y coordinates with Obsidian Canvas)

### Future

20. [ ] **Obsidian Plugin** — sync x,y coordinates between Nodus and Obsidian Canvas
21. [ ] PDF import + highlights
22. [ ] EU sync service (a CRDT layer for positions + hosting)
23. [ ] Mobile PWA capture app
24. [ ] User interviews with PhD students

---

## Appendix: Key References

- **Tauri v2:** https://v2.tauri.app
- **PixiJS:** https://pixijs.com (WebGL canvas)
- **Typst:** https://typst.app
- **typst.ts:** https://github.com/myriaddreamin/typst.ts (WASM)
- **Yjs:** https://yjs.dev (CRDT library considered for the planned sync layer)
- **LibSQL:** https://libsql.org (SQLite fork)
- **D3-force:** https://d3js.org/d3-force
- **notify (Rust):** https://docs.rs/notify (file watcher)
- **Heptabase:** UX reference
- **Obsidian Canvas:** JSON format for import compatibility

---

*Document: `/docs/PRODUCT_DESIGN.md`*
*Version: 0.17.0 — Added: Frames documentation section with creation, interaction, and controls. Added Shift+F shortcut.*
