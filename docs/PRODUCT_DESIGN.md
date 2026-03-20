# Nodus - Product Design Document

Version: 0.16.0
Date: 2026-03-20
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

- **CRDT-based** for conflict-free merging (Yjs)
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

### Canvas Features

- Infinite pan/zoom
- Manual node positioning (drag to place)
- Double-click canvas → create node
- Double-click node → inline edit
- Drag between nodes → create connection
- Node auto-resizes to fit content
- **Multi-directional resize:** All edges and corners (8 handles)
- Minimap navigation
- Frames/areas for grouping
- **Undo/Redo system:** Full support including node deletion with edge restoration
- **Cmd/Ctrl+Click:** Zoom-to-fit on specific node (auto-scales based on node size)
- **External links:** Open in default system browser
- **Context menu:** Right-click for node actions (fit, storyline, send to workspace, delete)
- **Copy/Paste nodes:** Cmd+C/Cmd+V to copy and paste nodes (preserves layout)
- **File drop import:** Drag files directly onto canvas (see File Drop Import below)

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
- [x] Direct Zotero library access (Settings > Zotero)
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

**Architecture:**
- Direct Ollama API integration (`/api/chat` with tools)
- Tool calling with native support + fallback JSON parsing
- Stateless requests (no history bleeding between requests)
- System prompt includes current canvas state (existing nodes)
- **Queue manager:** Sequential request processing to prevent race conditions

**Graph Agent Tools:**

| Tool | Description |
|------|-------------|
| `create_node(title, content)` | Create a single node |
| `create_nodes_batch(nodes)` | Upsert multiple nodes (updates existing by title, creates new) |
| `create_edge(from_title, to_title)` | Connect two nodes |
| `update_node(title, new_content)` | Update node content |
| `delete_node(title)` | Remove a node |
| `query_nodes(filter)` | Query DB: "all", "empty", "has_content", or search term |
| `for_each_node(filter, action, template)` | Iterator: action="search"\|"set"\|"append", uses {title} |
| `web_search(query)` | Search web with thinking layer (query refinement) |
| `auto_layout(layout)` | Arrange nodes: "grid", "horizontal", "vertical", "force" |
| `think(thought)` | Express reasoning before acting |
| `plan(tasks)` | Create task list for complex operations |
| `remember(memory)` | Save information to per-workspace memory |
| `create_theme(name, description)` | Generate custom YAML theme |
| `update_theme(name, changes)` | Modify existing theme |
| `done(summary)` | Signal completion |

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

### Settings

Settings modal with four tabs: General, Themes, Canvas, LLM.

**General:**
- Language selector (en, de, fr, es, it)
- LLM Features toggle (show/hide AI prompts)
- Workspace diagnostics (scan for node counts per workspace, recovery)

**Themes:**
- Theme selection grid (built-in + custom)
- Delete custom themes

**Canvas:**
- Snap to grid toggle
- Grid size (px)
- Edge style (straight, orthogonal, diagonal, curved, hyperbolic)

**LLM:**
- Provider selection (Ollama, OpenAI, Anthropic, OpenAI-compatible)
- Streaming toggle (optional)
- API key, base URL, model selection
- Max tokens, context window, timeout
- Neighbor context limit
- Web search API key (Tavily)
- System prompt customization

**Content Rules (System Prompt):**
- Title = label, Content = substance
- No meta-commentary
- Be concise: data, definitions, or markdown only

### MCP Server (Future)

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
| Database | **LibSQL** (SQLite fork) | WAL mode, `BEGIN CONCURRENT` for AI+user writes |
| Content | **.md files** | Text content in Markdown files, NOT in SQLite |
| State | Pinia | Vue standard |
| Math | **@myriaddreamin/typst.ts** | Typst WASM, sub-second rendering |
| Editor | TipTap/ProseMirror | Markdown + inline Typst extensions |
| Layout | D3-force | Force-directed auto-layout on import |
| Edge Routing | Custom PCB-style | Lane-based routing with GridTracker, obstacle avoidance |
| File Watch | Rust `notify` crate + **file locking** | Prevent corruption with Obsidian |
| Sync | **Yjs** (CRDTs) | **Canvas positions only**, NOT text content |
| Backend | Rust (Axum) | Sync server, performance |
| Hosting | Hetzner | EU, affordable, GDPR-native |

### Critical Architecture Rule

**Separation of Concerns:**
- **SQLite:** Metadata, canvas positions, edges, tags
- **.md files:** Actual text content (Obsidian compatible)
- **Yjs/CRDTs:** Sync canvas positions across devices only

**Never** store Yjs binary data in the same column as Markdown content.

### Why No "Conflicting Copies" (Unlike OneNote)

OneNote creates duplicates because it syncs at file/section level. Nodus avoids this:

1. **Local-first:** All edits happen locally. No internet needed.
2. **CRDT sync for positions:** Yjs syncs node x,y coordinates, NOT text.
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
| Sync method | Local SQLite + Yjs | Granular CRDT merge, no file-level conflicts |
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
| `y-crdt` | Yjs Rust bindings for position sync |

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

### Yjs ↔ PixiJS Integration

Since Yjs only syncs canvas positions (not text):

```
Yjs Document (Backend)
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
| **CRDTs (Yjs)** | Automatic merge, no data loss | More complex | Collaborative editing |
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

**Problem:** SQLite (data) + Yjs/CRDTs (collab) + Obsidian (.md files) creates conflict risk.

If user edits in Nodus (SQLite) AND Obsidian (.md) simultaneously → **data corruption**.

**Mitigations:**

| Strategy | Implementation |
|----------|----------------|
| **File Locking** | Rust backend acquires lock on .md when open in Nodus |
| **Separation of Concerns** | SQLite for metadata/positions only; .md files for content |
| **CRDTs for Canvas Only** | Yjs syncs node positions, NOT text content |

**Critical Rule:** Do NOT store Yjs binary data in `markdown_content` column. Keep text in .md files.

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
22. [ ] EU sync service (Yjs for positions + Hetzner)
23. [ ] Mobile PWA capture app
24. [ ] User interviews with PhD students

---

## Appendix: Key References

- **Tauri v2:** https://v2.tauri.app
- **PixiJS:** https://pixijs.com (WebGL canvas)
- **Typst:** https://typst.app
- **typst.ts:** https://github.com/myriaddreamin/typst.ts (WASM)
- **Yjs:** https://yjs.dev (CRDTs)
- **LibSQL:** https://libsql.org (SQLite fork)
- **D3-force:** https://d3js.org/d3-force
- **notify (Rust):** https://docs.rs/notify (file watcher)
- **Heptabase:** UX reference
- **Obsidian Canvas:** JSON format for import compatibility

---

*Document: `/docs/PRODUCT_DESIGN.md`*
*Version: 0.16.0 — Added: Zotero integration (BibTeX/CSL-JSON import with collection-to-frame mapping, direct Zotero library access via Settings, ImportOptionsModal). Updated Phase 2 roadmap to reflect Zotero completion.*
