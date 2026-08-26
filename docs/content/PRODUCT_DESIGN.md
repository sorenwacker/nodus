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
- **Both agent surfaces state the format.** The in-app agent's prompt and the MCP server's tool documentation name OKF, because a model that does not know the target format writes content that has to be corrected afterwards. Naming it once, in the same words on both surfaces, is what keeps the two from drifting.
- **Backfill:** existing vault files that lack frontmatter can be brought to OKF in place. The operation adds a frontmatter block and never touches the body, so wikilinks and prose survive unchanged - the Obsidian bridge is a pillar, and OKF is a specification of Markdown with frontmatter, not a replacement for it. A file that already has a frontmatter block is left alone rather than merged into, because merging risks losing fields the user set by hand.

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

### Streaming responses

**Required behavior:** A response that arrives as one buffered body is indistinguishable from a stalled connection while the model is still generating, and gateways cut it. Streaming keeps bytes flowing.

- Generation requests ask the provider to stream, and the backend forwards each chunk to the interface as it arrives rather than accumulating the whole body.
- A provider or endpoint that does not stream still works: the response is read whole, as before.
- A stream that ends mid-message is an error, not a short answer. Silently returning a truncated generation would corrupt the text it was cleaning.

### Provider status

**Required behavior:** The status light beside a provider must report whether the application can get an answer from it, because that is the only thing the user consults it for. Probing a different endpoint from the one the work uses - a model listing rather than a completion - reports a route that can succeed while every real request fails on authorisation, gateway routing or timeout, and a green light next to a failing provider is worse than no light at all.

- Availability is tested with a minimal request of the same kind the application makes: the completions endpoint, one token.
- A provider that answers is online. A provider that refuses, times out, or cannot be reached is offline, whatever its model listing does.
- The reason a check failed is kept and shown, since "cannot be reached" and "refused the key" call for different fixes from the user.

### PDF text cleanup

**Required behavior:** Cleaning up extracted PDF text is a long generation - the model rewrites everything it is sent - and a request whose response takes minutes is cut by the idle timeout of any gateway between the application and the model. The failure looks like an unreachable endpoint while the endpoint is answering other requests in milliseconds.

- Responses are streamed. Tokens arriving continuously keep the connection active, so a generation of any length cannot be mistaken for an idle connection and cut. This is the fix; section size only limits how much is lost when something else fails.
- Text is cleaned in sections small enough that a lost section costs little, rather than in the largest sections the context window allows.
- A section the model does not return is imported as extracted; the sections around it keep their cleanup. Cleanup improves the text, so losing it must never cost the text itself.
- The node says how many sections were imported as extracted, and why, so the result is not silently worse than it looks.

### Reading files the user dropped

**Required behavior:** Commands that read a file refuse paths outside a workspace vault, so that a path invented by an agent or arriving over the MCP connection cannot read arbitrary disk. A file the user drags onto the window is the opposite case: they chose it themselves, and the files worth dropping - a paper in Downloads, a PDF in Zotero's storage - are almost never inside a vault.

- A path the user dropped on the window is readable for the rest of the session, whether or not it lies in a vault.
- The grant comes from the operating system's drop event as the backend receives it, never from a path handed over by the interface. A caller that can name a path could otherwise grant itself access to it, which is the check this guard exists to make.
- Everything else is unchanged: a path that was neither dropped nor inside a vault is still refused.

### File paths across platforms

**Required behavior:** Windows separates path components with a backslash, macOS and Linux with a forward slash. Code that splits on `/` alone turns a dropped `C:\\Users\\dana\\paper.pdf` into a node titled with its whole path. One helper extracts the file name, and it accepts both separators. A gate test fails on any source that splits a path on `/` alone, and on any multi-select or modifier check that accepts `metaKey` without `ctrlKey`: the Command key does not exist on Windows or Linux, so a Command-only check is a feature those users cannot reach.

### Drop position

**Required behavior:** A file dropped on the canvas lands where the cursor released it. The drop event's position arrives in physical pixels on Windows and Linux but in logical pixels on macOS, while the canvas works in logical pixels throughout. Dividing by the display scale factor on macOS therefore halves the coordinates and places the node up and left of the cursor on any HiDPI display. The conversion is platform-aware and covered by unit tests per platform.

### PDF as a graph

**Required behavior:** A paper is already a structure - sections, an argument, a bibliography - and flattening it into one node discards exactly what a graph tool is for. Dropping a PDF offers a choice of how it lands:

| Mode | What is built | Needs |
|------|---------------|-------|
| Single node | The whole document in one node, as before | Nothing |
| Section graph | One node per top-level section - headings deeper than two levels fold into their parent's node, so a paper becomes its chapters, not every sub-subsection - edges following the document tree, all in a frame named after the paper | Nothing - structural, deterministic |
| + References | Entries in the references section become citation nodes with `cites` edges from the paper | Nothing to parse; a lookup service to verify |
| + Semantic graph | An LLM pass per section extracts claims and findings as nodes with typed edges (`supports`, `contradicts`, `related`) | The configured language model |

- The section graph and references never depend on the LLM: they must work offline and when the model is down.
- **Verification states are three, not two.** A parsed reference checked against the lookup service is `verified` (found), `not_found` (the service answered and has no match), or `not_checked` (the service could not be reached). An outage must never mark a reference as missing: someone else's downtime must not invalidate the user's bibliography. The state is stored in the citation node's frontmatter and shown on the node.
- References with a DOI are checked by DOI; those without are matched by title. A title match below the service's own confidence is `not_found`, not a guess.
- **Zotero is opt-in per import.** When the Zotero integration is configured, the import dialog offers to add the extracted references to Zotero; nothing is written without that choice. Verified references carry their resolved DOI into Zotero.
- The semantic graph is a choice in the same dialog, never a default: it spends model time and its quality depends on the model. Sections whose extraction fails are skipped with a notice, and the structural graph is never held up by it.

### PDF highlights as nodes

**Required behavior:** A researcher's reading already happened somewhere else. The highlights in a PDF are the parts they judged worth keeping, so re-typing them onto the canvas is work they have already done once.

- Dropping a PDF that carries highlights offers them for import instead of importing them silently. Which passages are worth a node is the reader's judgement, not the application's.
- Each imported highlight becomes a node holding the highlighted passage and the reader's own comment if there is one, linked to the node created for the source document. The link is what makes the passage traceable back to what it came from.
- Highlight colour is carried onto the node, because readers who colour-code assign meaning to the colours.
- Import is additive: a highlight that has already been imported is not imported twice.

**Known limitation:** a highlight can only be imported when the PDF stores the highlighted text with the annotation, which annotators such as Zotero and Acrobat do and some, notably macOS Preview, do not. Recovering the text for the rest means locating it geometrically in the page content stream, which is not implemented. Highlights whose text cannot be recovered are reported as such rather than imported as empty nodes.

### Document export

**Required behavior:** Everything in Nodus moves thinking onto the canvas; export is the only path that takes finished work back off it. Without it a completed argument has to be retyped somewhere else to become a document, which is where the tool stops being useful and the user goes back to a word processor.

Two formats, one code path: the Typst source is generated first and PDF is that source compiled by the Typst WASM the application already loads for math.

| Format | Purpose |
|--------|---------|
| PDF | A finished document to send or submit |
| Typst source | A starting point to keep editing outside Nodus |

Scope is whatever the user is looking at when they ask:

- **A storyline** exports in storyline order. The sequence is the argument the user built; reordering it by canvas geometry would destroy the one thing that makes a storyline a document.
- **A selection** exports in reading order - top to bottom, left to right - because a loose set of nodes has no order of its own.

The export dialog collects title, author, paper size and whether to append the connections between exported nodes. The backend then opens the save dialog and writes the file, so the chosen path never round-trips through the interface: a path the interface names is not a path the user chose, and only the second may be written to. This mirrors how dropped files are granted for reading - from the operating system's own event rather than a caller-supplied string. Compilation failures are reported in the dialog; a PDF that failed to compile must never be written as an empty or partial file.

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

**Tooltip placement (required behavior):** A tooltip is placed by measuring, never by a rule written per container. The previous approach - a default direction plus an override for each edge-anchored container - required whoever added a control to predict whether its label would fit, and every container that nobody thought about clipped its tooltips at the window edge. That is a defect the mechanism produces, not one its users forget to prevent.

- One tooltip element for the whole application, positioned from the trigger's measured rectangle and its own measured size.
- The preferred side is below the trigger; when the tooltip would leave the viewport it flips to the opposite side, and if neither side fits it is clamped to stay fully inside. Placement therefore cannot depend on which container the trigger happens to sit in.
- An element may request a preferred side, but the request is honoured only when the result stays on screen. A preference that would clip is overruled.
- Tooltip text always comes from the locale files - a literal string cannot be translated.
- Gate tests hold both rules: the placement function must return a rectangle inside the viewport for a trigger at any position including every corner, and no stylesheet may position a tooltip through a `[data-tooltip]` pseudo-element again.

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
- [x] PDF import with highlights
- [x] PDF highlight → canvas node
- [x] Typst math rendering (WASM)
- [x] Live-rendered equations
- [ ] "Modernize My Math" import
- [x] Export to Typst
- [x] Export to PDF (journal-quality)
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

**Chat transcript (required behavior):** The agent is a chat window occupying the full height of the canvas's left edge, not a band across the header: a transcript needs vertical room, and a header strip can give it none. The left edge is deliberate - the right one belongs to the storyline overview, reader, and timelines. Within the panel the conversation takes the free space at the top and scrolls, while the context line and the input row are pinned at the bottom, in that order, since the input belongs at the foot of the conversation it feeds. Every canvas overlay anchored to the left edge - node preview, edge filters, hover tooltip, citation progress, the status bar and the agent log - is offset by the panel's width through `--canvas-chat-inset`, mirroring how `--canvas-right-inset` clears the storyline layers. The gate deriving this scans the canvas stylesheets rather than naming the overlays: a list has to be added to, and the overlay nobody adds is the one that ends up under the panel, as the status bar did - taking the agent log button with it. Anything genuinely exempt is named in the gate with its reason; right-anchored overlays such as the minimap and zoom controls are unaffected and must not carry that inset.

The panel folds away like the storyline panel, on the shared step easing, and the folded state persists across sessions. It starts folded: the canvas is what the application opens for, and a panel covering its left edge before anyone asked for it takes that space by default. A stored choice always wins, so a user who leaves it open finds it open.

**Only a deliberate control records that choice.** The corner toggle and Settings persist the fold state; an edge push reveals or dismisses the panel for the session and writes nothing. An edge push is a gesture that fires from ordinary pointer travel, and recording it as a preference meant one accidental brush against the left edge changed every future startup. Values written by that path are cleared once on upgrade, since they record an accident rather than an intent. Its single toggle sits in the canvas's top-left corner, outside the panel: a control that travels with the panel disappears exactly when it is needed. The toggle reads as active while the panel is open and as inactive while it is folded, matching every other toggle in the application; the reverse tells the user the panel is open when it is not. A left-edge push also reveals it, mirroring the right-edge push that reveals the storyline overview - but only once no storyline layer is left to step back through, so the left edge dismisses the reader and overview first. While folded the panel contributes no inset and the left-anchored overlays reclaim the space - on the same easing and duration as the panel itself, timed by `--chat-inset-duration` (`0s` while the panel's separator is being dragged, mirroring `--inset-duration` on the right). A panel that slides while everything beside it teleports reads as a glitch, not an animation. A second left-edge push while the panel is open folds it away again: the push that revealed it is also the push that dismisses it, as with the storyline layers on the right. The panel's bottom follows `--canvas-bottom-inset`, so it ends above an open timelines sheet rather than disappearing behind it. The transcript shows the exchange in order: each prompt the user sent, and each answer the agent gave in full. Whenever the bar is visible the transcript area is visible too: before the first exchange it holds a placeholder naming itself as where answers appear, because an area that materializes only once output exists leaves the same question - where does the output go - unanswered. An answer that arrives as plain text is displayed as written - never truncated - because otherwise a reply that performs no canvas action leaves no visible trace at all. The mirror case binds equally: **every way a run can end leaves a line in the transcript**. A run that finishes in tool calls, pauses for plan approval, stops on the user's command, hits its iteration limit, or fails, says so where the conversation is. Otherwise the panel shows a tool-call count and then silence, and the user cannot tell a finished task from a hung one - which is exactly what a question answered entirely by canvas actions looked like.

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

*Frames and storylines*

| Tool | Description |
|------|-------------|
| `create_frame(title, node_titles?)` | Create a frame, sized around the named nodes and enclosing them |
| `assign_node_to_frame(frame_title, node_titles)` | Move existing nodes into an existing frame |
| `list_frames()` | List the frames with the number of nodes in each |
| `create_storyline(title, description?, node_titles?)` | Create a storyline and thread the named nodes into it, in order |
| `add_node_to_storyline(storyline_title, node_titles)` | Append existing nodes to an existing storyline |
| `list_storylines()` | List the storylines in this workspace |

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

### Contents sidebar

**Required behavior:** The contents sidebar is a table of contents, not just a node list. Sections imported from a paper carry their subsections inside their markdown, and a contents list that hides them makes a chapter opaque.

- Under each node entry, the markdown headings inside that node's content are listed, indented by heading level.
- Clicking a subheading scrolls the reader to that heading within its section, exactly as clicking a node entry scrolls to the section.
- Headings inside fenced code blocks are not headings and never appear.

### Editing in the reader

**Required behavior:** Reading is where the gaps show, so the reader is where the fix should happen. Leaving the reader to edit a paragraph and coming back loses the place and the flow.

- Double-click a section's text to edit that node's markdown in place. Save with **Cmd/Ctrl+Enter** or by clicking away; cancel with **Escape**.
- Saving writes through the same store path as canvas editing, so file sync, undo and the anchored-wikilink rendering behave identically. The section re-renders on save.
- Editing acquires the node's file lock first, exactly as the canvas does. If the file is locked by another program, the reader says so and the text stays read-only; it must never silently fork a locked file.
- One section edits at a time. Starting an edit in another section saves the current one first.

### Reader opening and switching

**Required behavior:** The reader's slide animation and its content rendering compete for the same main thread. Rendering every node's markdown in one synchronous pass during the slide starves the animation frames, so the panel judders exactly when the user is watching it most closely.

- The reader stays mounted after its first open and slides with a transform, exactly as the storyline overview, the chat panel and the timelines sheet do. A panel that mounts fresh on every open loads and paints during its own entrance; a mounted panel slides as one already-painted surface, and its scroll position and sidebar state survive closing.
- While the reader is open, the minimap and zoom controls fade out instead of following the right inset to mid-screen. The inset keeps overlays beside a panel the user works alongside; the reader is a panel the user works *in*, and graph navigation chrome floating at the centre of the window during reading is noise, not navigation.
- The first screenful of content renders before the slide begins, in one pass small enough not to delay it. The remaining sections wait until the slide has settled, then fill in batch by batch with an animation frame between batches - below the fold, where filling in is invisible. Content that pops in while the panel is moving reads as flicker, which is the artifact this ordering exists to prevent.
- Switching to another storyline while the reader is open keeps the current content visible until the new storyline's nodes have loaded. The loading state appears only when the reader has nothing to show; replacing readable content with a spinner is a flash, not feedback.

### Rendering node content

**Required behavior:** A node's markdown is rendered when it is on screen, not because it exists. Rendering every node in the workspace in one synchronous pass costs about half a millisecond per node - 157ms measured for 300 nodes - and that time is spent on nodes nobody is looking at, in a burst that blocks the frame.

- The rendering pass covers the nodes the viewport shows, plus any node being edited, and it caches by content so an unchanged node is never rendered twice.
- A node that scrolls into view renders then. Culling already tracks what is visible, so the set is available without new bookkeeping.
- **A card renders a preview, not a document.** A node holding an imported paper can carry tens of kilobytes of markdown; rendering 73KB measured at 82ms, five dropped frames for one click, into a card a few hundred pixels tall. Cards render the leading portion of the content, and the card says the text continues. The full document renders where it is read - the fullscreen view and the storyline reader, which render independently - so nothing is lost, only deferred to the surface that shows it.

### Selected nodes in bubble mode

**Required behavior:** Above the level-of-detail threshold, nodes are circles on a 2D canvas, except selected ones, which render as real cards so their text is readable. A selected node must stay draggable across that swap.

- The card layer sits above the circle canvas while bubble mode is on. The circle canvas covers the viewport and takes pointer events, and a selected node is deliberately absent from its hit test - so with the card underneath, a press on a selected node reached neither: not the canvas, which no longer knows about the node, and not the card, which was covered. The node became undraggable the moment it was selected.

### Collapsed node titles

**Required behavior:** A title shown at semantic zoom must fit the card it is drawn in. Two ways it did not: a single word longer than the card - a product name, a surname - could not wrap because word breaks were disallowed, so it was clipped at the border; and three wrapped lines at the collapsed type size were taller than the default card, so the text spilled past its own outline.

- A word that cannot fit the card's width breaks rather than being clipped. Breaking mid-word is worse than breaking at a space and better than losing the end of the word.
- The line limit follows the card's height rather than being a fixed number. A count chosen for the default card cuts a long title mid-line on a taller one and wastes space on a shorter one, so the card computes how many lines of the collapsed type size it can hold and clamps to that.
- The computation uses the type size as rendered, which includes the user's font scale, and subtracts the card's border as well as its padding. Assuming the base size and ignoring the border overestimates the budget, and the overestimate shows up as a line cut through the middle - the very artifact the budget exists to prevent.

### Storyline chain edges

A storyline's sequence is carried by edges belonging to that storyline. Adding a node links it to its neighbours in the sequence, and removing one reconnects the neighbours it sat between.

Whether such an edge already exists is decided by source, target, **and** storyline. Matching source and target alone let any other edge between the two nodes - a wikilink, a `supports` edge the user drew - stand in for the chain edge, so none was created and the sequence had a gap.

### Persisting an interrupted drag

A drag updates positions in memory and stores them once when it ends, so a drag costs one write per node rather than one per frame.

A drag can end without a pointer release: the pointer is cancelled, the window loses focus, or the button comes up unseen. Those paths store the positions reached, the same as a normal release. Clearing the drag state without storing left the node where it was dropped on screen and back at its origin on the next load.

### Syncing wikilink edges

The backend resolver understands folder path links and `#section` anchors as well as plain titles. The local resolver matches exact titles only, so it is a fallback for running without a backend, never for a backend that failed.

Treating any rejection as "no backend" ran the local resolver against edges the backend had created, which it could not see and therefore deleted. A single transient failure destroyed real edges, with nothing reported. Whether a backend exists is checked directly, and a backend that fails leaves the edges exactly as they were.

### Changing an edge's type

An edge's type is stored before the change is shown. The unique constraint covers source, target, and link type together, so setting a type that already connects the same two nodes fails, and the message says so.

Showing the change without storing it left the edge reverting on the next reload.

### Reading frontmatter on either line ending

A file written on Windows, or by any tool that writes CRLF, opens with `---\r\n`. Testing for `---\n` alone read such a file as having no frontmatter, which had two consequences: writing the file back dropped its metadata, and content that carried its own block was given a second one. One function answers "does this open with a frontmatter block", and every caller uses it.

The closing fence is a line that is exactly `---`, so a `---` inside a value does not end the block early.

### Exporting an OKF bundle

An exported document carries exactly one frontmatter block: the one built for the export, from the node's current metadata.

A file-backed node's content already holds a block, because Nodus writes one into the file. Prepending without removing it produced two, and every reader treats the second as body text. The export strips whatever block the content opens with, then writes the block it built.

### One schema, however you got there

A database created by a fresh install and one upgraded through every migration must end up with the same schema. Two mechanisms broke that:

- Migration 008 rebuilds the `edges` table with a three-column unique constraint and a `storyline_id` foreign key. Its guard checked only the constraint. A fresh install gets that constraint from 001, which cannot reference `storylines` because 002 creates that table afterwards, so 008 was skipped and the foreign key and `idx_edges_storyline` were never created. The guard now requires both, so 008 runs wherever either is missing.
- The `frames` table was defined in 001 and again in 007. Only the first definition applies: `CREATE TABLE IF NOT EXISTS` finds the table already there and does nothing. The two disagreed on nullability, default sizes, and the delete behaviour of the workspace foreign key, so 007 described a schema no database has ever had.

A dangling storyline reference follows from the first of those. Without the foreign key, deleting a storyline leaves edges pointing at a row that is gone, and storyline-filtered queries return them.

Two gates hold this: no table may be defined by two migrations, and no migration file may go unapplied.

### Splitting text into chunks

Long text is split into overlapping chunks for the model, breaking at a paragraph, sentence or word boundary so a chunk does not end mid-thought. Each chunk starts a little before the previous one ended, so context carries across the boundary.

The start of the next chunk must advance by at least one character. An overlap at least as large as the break point resolved to a start of zero, which left the remaining text unchanged and the loop running forever - a hang rather than a slowdown, with no output and no error.

### Validating caller-supplied paths

A path the interface names is not a path the user chose. Commands that act on the filesystem using a path from the webview must check it against the workspace vaults before touching it, using `validate_path_in_workspace` for an existing path or `validate_target_dir_in_workspace` for a directory that may not exist yet.

The rule applies to the path a command *stores* as well as the path it reads: a command that records a node's file path without validation hands an unchecked path to every later command that trusts it.

Three cases are exempt, because the vault path is the thing being chosen:

- Registering, importing or refreshing a vault takes the folder the user picked. Validating it against the vault list it is about to define is circular.
- These commands are reachable only from a folder dialog.

The exemptions are listed with their reasons in the gate, so a new command cannot join them silently. Everything else fails the gate: a command with a caller-supplied path parameter that performs a filesystem operation must call a validator.

### Dependency advisories

Dependencies are checked against the RustSec advisory database as a release gate. The dependency bounds already cover day-to-day drift, so a per-push check would spend CI minutes on a constraint that is already enforced statically.

- The gate fails on any advisory that is not listed in `src-tauri/.cargo/audit.toml`.
- Each accepted advisory records why it cannot be fixed here. An entry kept after its dependency is upgraded hides a real advisory behind a stale exception, so the list is reviewed on upgrade.
- The advisory database is fetched from an outside service. When the fetch fails the gate reports "not checked" and passes: someone else's downtime is not a finding about this code.

### A created plan is presented

Whether the user sees a plan must not depend on the model making a second call. The prompt asks for `request_approval()` after `create_plan()`, and when the model skipped it - or called `create_plan` twice and then described the plan in prose - the plan existed in state with no dialog and nothing to approve, so the user was asked "would you like me to proceed?" in chat text they could not edit.

- Creating a plan opens the approval dialog, where its steps can be edited, added to, removed, approved or rejected.
- `request_approval()` remains for the model to call and opens nothing that is already open.
- Creating a second plan replaces what the dialog shows rather than opening another.

### One creator per plan

A plan is created once, by whoever handled the `create_plan` call. The marker processed after the call must not create it again: the second creation replaced the real plan with one holding no steps, `requestApproval` refuses a plan with no steps, and so no approval dialog appeared. The agent reported that it was waiting for approval on a plan the user was never shown, then retried and wrote the plan into the chat as prose instead.

- A `__CREATE_PLAN__` payload that names an existing plan is passed through untouched.
- A payload carrying steps and no plan identifier is created, which is the path where nothing has created it yet.
- Requesting approval twice for the same plan opens one dialog.

### Saving edits when the open node changes

Both editors debounce writes, so a write can still be pending when the node being edited changes - clicking a wikilink in the fullscreen view swaps the open node within the debounce window. A pending write belongs to the node whose keystrokes armed it, not to whichever node is open when it fires.

- A scheduled write records the node it was armed for, along with the title and body to store.
- Changing the open node flushes the pending write first, then loads the new node.
- Closing the editor flushes rather than drops.

Without this, the write compares the new node's stored text against the previous node's buffer, finds no difference to make, and the previous node's last keystrokes are lost with nothing reported.

### Enforcing the file size limit

The 1000-line limit existed only as prose in the project rules, and seven files had grown past it. A rule with no gate erodes silently, so the limit is enforced as a ratchet: the files already over it are recorded with the line count they had when the gate was added, and the gate fails when any of them grows or when a new file crosses the limit.

- A recorded file may shrink freely; shrinking past 1000 lines removes it from the list.
- A recorded file that grows fails the gate, so splitting is the only way forward.
- A file not on the list may not cross 1000 lines at all.

This enforces the limit from where the codebase actually is rather than blocking every commit until seven files are split.

### Log level

Twenty-five call sites called `logger.debug()`. None could ever emit: the threshold was `info` in development and `warn` in release, and nothing could set it lower, so every one of those messages was written and never seen. Detail nobody can turn on is not logging.

- The threshold defaults to `info` in development and `warn` in a release build.
- **Settings > General > Advanced** selects the threshold, including `debug`.
- The choice persists across restarts, so a user reproducing a problem is not re-selecting it after every relaunch.
- Changing the threshold takes effect for subsequent messages without a reload.

### Persisting animated positions

**Required behavior:** A layout animation moves nodes for the duration of the animation; only where they land needs storing. Writing every intermediate position issued one database write and one IPC call per node per frame - roughly 18,000 for a 600ms animation of 500 nodes, of which 500 mattered. This is the same defect the drag path already solved with `skipPersist`, and the animation must use it too.

- Frames update in-memory positions only.
- The final positions are persisted once, when the animation completes.
- An animation superseded by another persists what it reached, so a position is never left unsaved.

### Workspace scoping for MCP connections

**Required behavior:** A connection scoped to a workspace sees that workspace, consistently. Scoping only the list getters produced a store that contradicted itself: `list_frames` returned the target workspace's frames while `get_frame` on those same ids failed, because it resolved against whichever workspace the user happened to have open.

- Single-entity lookups resolve within the connection's scope, exactly as the list getters do. An id a scoped listing returned must be usable by every operation that takes an id.
- A scoped store derives its lookups from its own scoped collections rather than from the application's, so the two cannot drift.

### Deleting a merged wikilink edge

**Required behavior:** A merged wikilink edge is undirected because both nodes link to each other; it stands for two wikilinks, one in each file. Deleting it removed the link from the source's content only, so the next wikilink sync saw the surviving link in the other file and recreated the edge - the user deleted it and it came back.

- Deleting an undirected wikilink edge removes the wikilink from both nodes' content.
- Deleting a directed one removes it from the source only, as before.

### Agent log contents

**Required behavior:** The log is where the user looks to see what the agent actually did, so every tool call appears there: its name, a short summary of its arguments, and whether it succeeded. Recording tool calls only in the chat transcript left the log showing prompts and warnings but never the actions between them.

- One line per call, with arguments summarised rather than dumped, so a run of fifty calls stays readable.
- A failed call is marked as failed with its error, since a silent line reads as success.

### Tool reachability

**Required behavior:** A registered tool that no mode exposes is dead code, and a prompt that documents such a tool is worse - it instructs the model to call something the request does not contain. Both existed: 27 of 71 registered tools reached no agent surface, and the system prompt described five of them to the model in detail.

- Every registered tool is reachable from at least one agent mode, or is listed as deliberately unexposed with the reason.
- A tool the system prompt documents must be reachable, without exception: promising a capability that cannot be called is the defect the ledger exists to prevent.
- A gate compares the registry against the mode whitelists and the ledger, so a tool added without exposure fails the build rather than sitting unused.

### Plan approval summary

**Required behavior:** The approval dialog exists so the user can see a plan's effect on the graph before consenting to it. A summary that understates that effect is worse than none, because it invites consent the user would otherwise withhold.

- A count of nodes is only stated when the plan names them. A step that names its targets contributes those targets; the summary says how many and can list them.
- A step that names no targets has an unknown scope: it may touch one node or every node in the workspace. The summary says the scope is unstated rather than counting the step as one node - counting steps and labelling them nodes is how a step rewriting 317 nodes was presented as editing one.
- Counts and scope warnings are derived from the same source the executor uses, so the summary cannot drift from what the plan does.

### Anchored nodes

**Required behavior:** A note about a passage belongs at that passage. A comment that floats between sections says only which node it concerns, leaving the reader to work out which sentence provoked it - and the position is lost as soon as the text is edited anywhere above it.

- The anchor is a `[[wikilink]]` written at the point in the text it refers to. The text is the anchor, so it survives editing here, in Obsidian, or in any other editor, and needs no stored offsets that a later edit would silently invalidate.
- While reading a node at full width, every wikilink expands into a callout carrying the linked node's title and content, at exactly the point where the link sits. At smaller widths links stay inline, because a callout needs room the half-width reader does not have.
- Expansion is one level deep: the links inside an expanded node stay inline links. A note that expanded its own links would loop on any pair of nodes that reference each other.
- A link whose target does not exist stays an inline link, marked missing, as it is elsewhere.
- Creating a comment writes such a link at the anchor point, so a comment is an anchored node rather than a separate kind of thing.

### Reading a single node

**Required behavior:** Reading is currently only reachable through a storyline, so a node that belongs to no storyline cannot be read at all - and anchored nodes are exactly what one wants to read a single node for.

- Any node can be opened in the reader on its own, showing its text with its anchored nodes expanded, using the same reader the storylines use rather than a second implementation.
- The single-node reader is reachable from the node itself on the canvas.

### Layout of a selection

**Required behavior:** A selection is an instruction. Every node the user selected takes part in the layout, and a node that is silently left where it was reads as the layout being broken - which is how it looked when nodes belonging to a frame were filtered out of a selected layout without a word.

- With a selection, exactly the selected nodes are laid out, including those that belong to a frame.
- A framed node keeps its frame. After the layout settles, each affected frame is re-fitted around its contents and frame overlaps are resolved, so nodes stay inside the frame they belong to instead of escaping it.
- Without a selection, the whole graph is laid out and frame contents are handled by the frame-aware path as before.
- Re-fitting a frame to its contents has one implementation, shared by the layout and the agent's frame tools; a second copy would let the two drift.

### Edge handles

**Required behavior:** An edge that is live along its whole length fires during ordinary mouse travel. In a window that does not fill the screen the pointer crosses a border constantly - reaching for another application, the dock, the desktop - and every crossing opened a panel the user did not ask for. The gesture has to be aimed to count.

- Each edge is active only over a handle centred on that edge, not along its full length. A push registers when the pointer is inside the edge band *and* within the handle's span.
- The handle spans a fraction of the edge, bounded so it stays aimable on a small window and does not become an entire edge on a large one.
- Handles are drawn on screen. A gesture that requires aim must show where to aim, and a visible handle answers the discoverability problem the first-run coach addresses in words.
- The handle geometry has one definition, used by both the gesture and the drawing. A handle drawn anywhere other than where the gesture listens is worse than no handle at all.
- Handles never take pointer events. They mark a region; the canvas underneath stays fully interactive.

### First-run gesture coach

**Required behavior:** The edge-step gestures are the canvas's primary navigation and are invisible: nothing on screen suggests that pushing the pointer against a screen edge reveals the storyline overview, that dwelling at the bottom edge raises the timelines sheet, or that the left edge reveals the agent. A user who never discovers them never finds those features at all.

- After onboarding, a coach teaches one gesture at a time, in the order a new user would need them: storylines (right edge), timelines (bottom edge dwell), agent (left edge).
- A lesson advances only when the user actually performs the gesture, not on a timer or a click. Reading about a gesture is not learning it, and the coach exists precisely because the gesture is hard to guess.
- The coach can be skipped at any point, remembers that it has been completed or skipped, and never appears again.
- It listens to the same edge-step events the application already uses, so it cannot drift from the gestures it teaches: if a gesture stops firing, the lesson stops advancing.

### Updates

**Required behavior:** An installed copy checks for a newer release on startup and tells the user, rather than leaving them frozen on whatever version they first downloaded. Without this, every fix reaches only people who happen to visit the download page again.

- The check runs once per launch, in the background, and never blocks the canvas. A failure to reach the network is silence, not an error: being offline is the normal case for a local-first application, not a fault to report.
- When a newer version exists the user is told what it is and chooses whether to install; nothing downloads or restarts on its own.
- Update manifests and binaries are served from the same R2 bucket the download page uses, and every artifact is signed. An unsigned or mis-signed payload is refused by the updater, so a compromised bucket cannot push code to users.
- The setting is user-controllable and persisted: automatic checks can be turned off entirely in Settings > General, in which case the app never contacts the update endpoint.

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
| Canvas | **DOM + SVG + Canvas 2D** | DOM cards for text and editing, SVG edges, a 2D canvas above the LOD threshold |
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

### Canvas rendering

**As built.** The canvas is drawn with DOM, SVG and a 2D canvas. There is no WebGL renderer, and no GPU rasterisation of nodes or edges.

| Layer | Technology | What it renders |
|-------|------------|-----------------|
| Node cards | DOM components | Text, math, editing affordances |
| Edges | SVG | Connections, arrowheads, hit areas |
| Dense mode (over the LOD threshold) | Canvas 2D | Nodes collapsed to circles |
| Pan and zoom | One CSS transform on each layer, node cards included | Composited by the GPU; per-frame JavaScript is zero |

**Why DOM rather than WebGL:** editable text, text selection, accessibility and the existing math rendering all come free in the DOM and would have to be rebuilt against a WebGL renderer. The cost is that layout and paint run on the main thread, so the work scales with the number of *visible* elements.

**Pan and zoom (required behavior):** Every layer - frames, edges, and the node cards - lives inside a container that carries the single pan-and-zoom transform. A card's own style depends only on its canvas coordinates, never on the current scale or offset, so panning and zooming update one container style and composite on the GPU. The previous arrangement positioned each card in screen coordinates, which recomputed and patched every visible card's style on every frame: 24 ms per frame at 500 nodes, measured, against a 16.7 ms budget. Text crispness is unchanged: cards already applied `scale()` in their own transform, which rasterizes identically to a parent transform. A test holds the invariant that a card's style is independent of scale and offset.

**How it scales instead of using the GPU:**

1. Viewport culling keeps off-screen nodes out of the DOM entirely.
2. Above the LOD threshold (500 visible nodes by default) node cards are replaced by circles drawn into a single 2D context.
3. Edges have a single-path fast mode, and a user-configurable threshold that hides them entirely.

**Required behavior:** this section describes what exists. An earlier version of it specified a PixiJS/WebGL renderer that was never built, while the main canvas component was named after it - and a real zoom optimisation was removed in the belief that the absent renderer made it unnecessary. Documentation that describes an intention as an implementation is worse than no documentation: every later decision reasons from it. A gate test fails if the source claims a WebGL or PixiJS renderer again.

---

## Implementation Roadmap

### Recommended Approach: Hybrid (Bottom-Up + Visual)

Given the priority on data integrity (no OneNote-style conflicts), but also need for momentum:

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Rust backend | File watcher, checksum logic, SQLite writes |
| 2 | Canvas MVP | Canvas with mock nodes (hardcoded JSON) |
| 3 | Integration | Canvas reads from SQLite, displays real nodes |
| 4 | Editing | Inline text editing in nodes |
| 5 | Connections | Draw edges between nodes |
| 6 | Obsidian import | Parse vault, auto-layout, wikilink → edges |

### Development Milestones

| Step | Task | Success Metric |
|------|------|----------------|
| 01 | Initialize Tauri v2 + Vue project | App opens in <0.5s |
| 02 | Implement Rust file-watcher for test folder | Adding `.md` file triggers console log |
| 03 | Basic canvas with draggable nodes | 100 nodes drag at 60fps |
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
| Canvas renderer | DOM + SVG, Canvas 2D above the LOD threshold | Frame time measured by the render benchmark |
| Math renderer | Typst WASM + SVG cache | Sub-second, cached for performance |

### Project Scaffolding

```bash
# Create Tauri v2 project
npm create tauri-app@latest nodus
# Choose: Vite + Vue + TypeScript

# Project structure:
nodus/
├── src/                    # Frontend (Vue)
│   ├── components/
│   ├── canvas/             # Canvas logic
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

### CRDT to canvas integration (planned)

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
The canvas layer updates node positions
```

### Hybrid Rendering Workflow

```
┌─────────────────────────────────────────────┐
│                 CANVAS                      │
│  ┌─────────────────────────────────────┐   │
│  │ Canvas layer (DOM + SVG)                │   │
│  │ - Background grid                   │   │
│  │ - Edges/connections                 │   │
│  │ - Node containers (rectangles)      │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ DOM Layer (HTML overlay)            │   │
│  │ - <textarea> for editing            │   │
│  │ - Positioned via CSS transform      │   │
│  │ - Maps canvas coords -> CSS top/left │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘

Zoom threshold:
  zoom > 0.5 → Show DOM text elements
  zoom < 0.5 -> cards collapse to circles (2D canvas)
```

### Coordinate mapping (canvas -> DOM)

```typescript
function syncDOMToCanvas(nodeId: string, position: { x: number; y: number }) {
  const domElement = document.getElementById(`node-${nodeId}`);
  const screen = canvasToScreen(position, viewport);

  domElement.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
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

#### 3. Text editing

Editable text, selection and accessibility come from the DOM, which is why the canvas renders node cards as DOM elements rather than into a WebGL context. The cost is that layout and paint run on the main thread and scale with the number of visible cards; viewport culling and the LOD threshold are what keep that bounded.

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
6. [x] Canvas with DOM cards, SVG edges and a 2D canvas above the LOD threshold
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
