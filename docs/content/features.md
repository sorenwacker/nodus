# Features

## Canvas

### Infinite Canvas
Pan and zoom freely across an infinite workspace. Semantic zooming adjusts detail level:

- **Zoomed in**: Full content, edit handles, detailed view
- **Zoomed out**: Titles only, collapsed cards for performance

### Node Types

| Type | Description |
|------|-------------|
| **Note** | General purpose markdown notes |
| **Citation** | Academic references with DOI support |
| **Comment** | Annotations and commentary |
| **Character** | Entity node for people/characters |
| **Location** | Entity node for places |
| **Term** | Entity node for definitions/concepts |
| **Item** | Entity node for objects/artifacts |

### Tags
Hashtags in node content become node tags:

- `#tag` tokens are extracted whenever content is set: on node creation and on every content edit, from any interface (canvas editor, MCP tools, LLM agent)
- Extracted tags merge with the node's existing tags
- A node's tags appear as chips at the bottom of its card
- With tag nodes enabled in settings, each tag becomes a tag node connected to the notes that use it

YAML frontmatter at the top of a note (OKF or Obsidian metadata) is treated as metadata: its title and tags feed the node, and the block is hidden from the rendered card instead of appearing as raw text.

### Frames
Group related nodes visually. Frames act as containers that can be moved together with all contained nodes.

### Selection & Multi-Select
- Click to select single node
- Shift+Click to add to selection
- Lasso selection for multiple nodes
- Bulk operations on selection

### Fullscreen Editor
Open any node in a fullscreen split-view editor for focused writing:

- **Trigger**: Cmd+Click (Mac) or Ctrl+Click (Windows/Linux) on any node
- **Split view**: Markdown editor on left, live preview on right
- **Auto-save**: Changes save automatically with 500ms debounce
- **Keyboard shortcuts**:
  - `Escape` - Save and close
  - `Cmd/Ctrl+S` - Save immediately
- **Features**:
  - Title editing in header
  - Wikilink autocomplete (type `[[` to trigger)
  - Mermaid diagram preview
  - "Zoom to Node" button to locate node on canvas

---

## Connections

### Edge Types

| Type | Color | Use Case |
|------|-------|----------|
| Related | Gray | General association |
| Cites | Blue | Academic citation |
| Supports | Green | Supporting evidence |
| Contradicts | Orange | Opposing viewpoint |
| Blocks | Red | Dependency or blocker |

### Wikilink Edges
Writing `[[link]]` in a node's content creates a wikilink edge to the referenced node:

- Edges are created whenever content is set: on node creation and on every content edit, from any interface (canvas editor, MCP tools, LLM agent, vault import)
- Links resolve by note title, by relative path (`[[folder/note]]`), and with section anchors (`[[note#section]]`)
- A pair already connected by a manual edge does not receive a parallel wikilink edge
- Removing the link removes the wikilink edge; manual edges are kept

### Edge Routing
Multiple routing styles for visual clarity:

- **Orthogonal** - 90-degree angles, clean diagrams
- **Curved** - Bezier curves, organic flow
- **Straight** - Direct lines
- **Hyperbolic** - Smooth curves avoiding nodes

### Neighbor Highlighting
When selecting a node, connected neighbors are highlighted for context.

### Neighborhood View
Focus on a specific node and its connections:
- Toggle neighborhood mode to hide unrelated nodes
- Adjust depth (1-5 hops) to control how far connections extend
- Useful for exploring dense graphs

---

## Storylines

Create linear narratives through your knowledge graph:

- Order nodes into a sequence
- Navigate through storyline in reader mode
- Export storylines as documents
- Color-code storyline edges

### Storyline Panel
Moving between graph and storylines works in steps along the screen edges: each push of the pointer against the right edge goes one step deeper into storylines, each push against the left edge steps back toward the graph.

- Push right once: the storyline overview slides open on the right
- Push right again: the reader opens at half the window, keeping the graph visible, with the last-read storyline (the first storyline initially)
- Push right a third time: the reader expands to the full window
- Push left: each push steps back down — full reader to half, half to the overview (or the timelines view, if the reader was opened from there), overview to the plain graph
- Open layers stay open while you work in them; only a left-edge push or the toolbar book button steps back
- While a layer is open, stepping deeper requires pressing the pointer against the very edge of the window, so using the panel near the border does not skip ahead
- The reader's left handle still resizes it freely between steps

In the overview:

- Clicking a storyline row opens it in reader mode; the chevron on the row expands its ordered nodes inline instead
- Several storylines can have their item lists expanded at once
- Storyline titles wrap to at most two lines instead of being truncated
- Drag the separator between panel and canvas to set the panel width; the width persists across sessions
- Drag nodes from the canvas onto a storyline section to add them to that storyline

### Timelines
Timelines live along the bottom of the window: a push of the pointer against the bottom edge (or the timelines button in the storyline overview) slides up a sheet showing all storylines; the graph stays visible above it, and it can be open alongside the overview:

- Every storyline is a horizontal lane in its color; its nodes are beads in order
- A node states its point in time with a `date:` frontmatter field — `date: 20 BC`, `date: 1969-07-20`, `date: 1969-07-20 14:30`, `date: 1500`. Dated nodes are placed on a shared time axis (BC dates and minute-precision timestamps supported); undated nodes are interpolated between their dated neighbours
- A node spanning time (an era, a long work) adds `date_end:` and is drawn as a bar from start to end instead of a bead
- The from/to fields in the sheet's header fix the axis range (same date formats); either side left empty fits automatically, and the chosen range persists. Axis labels adapt to the span: years, months, days, or clock times for narratives playing out within hours
- Hovering a bead or bar shows the node's rendered content preview
- Nodes shared between storylines are joined by dashed connectors, and graph edges between timeline nodes are drawn as arcs
- Clicking a lane or bead opens that storyline in the reader; a left-edge push or the close button slides the sheet away

---

## Math with Typst

Native Typst integration for fast mathematical typesetting:

- **Sub-second rendering** - No LaTeX compile times
- **Modern syntax** - Cleaner than LaTeX
- **Inline and block** - Both supported

### Examples

Inline math: `$x^2 + y^2 = z^2$`

Block math:
```
$$
integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2
$$
```

See [Typst Math Reference](typst-math-reference.md) for complete syntax.

---

## Obsidian Integration

### Vault Import
Import existing Obsidian vaults:

- Markdown content preserved
- Wiki-links `[[link]]` converted to edges
- Folder structure respected
- Automatic force-directed layout

### Bi-directional Sync
Changes sync between Nodus and your vault folder:

- Edit in Nodus → updates Obsidian vault
- Edit in Obsidian → updates Nodus canvas
- File watcher detects external changes
- With sync disabled, edits change only the Nodus database; vault files are never written

### Workspace Separation
Each imported vault becomes a separate workspace, keeping projects organized.

---

## Citation Management

### Zotero Integration
Connect to your local Zotero database:

- Browse and import collections
- DOI extraction and linking
- Create citation nodes with metadata

### Semantic Scholar Integration
Fetch citations for papers with DOIs:

- Right-click citation nodes and select "Fetch Citations"
- Automatically creates nodes for referenced papers
- Builds citation network on your canvas

### BibTeX Import
Import `.bib` files directly to create citation nodes with:

- Author, title, year
- DOI links
- Journal/conference info

---

## LLM Integration

Connect AI assistants for research help:

### Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| Ollama | Local | Privacy-first, no data leaves device |
| OpenAI | Cloud | GPT-4, GPT-3.5 |
| Anthropic | Cloud | Claude models |
| OpenAI-compatible | Cloud | Any compatible API |

### Agent Features

- Research assistance
- Content summarization
- Smart node connections
- Task automation

### Ask AI on the canvas vs. on a node

Two scopes keep AI actions predictable:

- **Canvas "Ask AI" bar** runs the graph agent, which can create and edit nodes,
  add edges, and lay out the graph.
- **Node "Ask" bar** (in the node preview) runs the node agent, which only edits
  the current note. It never creates new nodes.

### Plan-first approval

The graph agent always works in two phases:

1. **Plan.** It researches and reads the graph only; it cannot create, edit,
   delete, or connect nodes in this phase. It then proposes a plan.
2. **Execute.** The plan opens in an approval dialog that states, up front, what
   it will create versus edit (for example, "create 7 new nodes, edit 2"). Each
   step is labeled with its action and lists the affected node titles. Nothing is
   written to the graph until you approve.

This makes node creation predictable: the agent never adds a node you did not see
listed and approve.

---

## Layout Algorithms

Automatic arrangement of nodes:

| Algorithm | Best For |
|-----------|----------|
| Force-directed | General graphs, organic layout |
| Grid | Structured content |
| Hierarchical | Trees and DAGs |

---

## Export Options

### Typst Export
Export canvas as Typst document for further editing.

### PDF Generation
Generate PDFs directly using Typst compilation.

### Markdown Export
Export nodes as standard Markdown files.

### Open Knowledge Format Export
Export a workspace as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF v0.2) bundle so AI agents and other OKF consumers can read it without Nodus:

- Every node with content becomes a Markdown concept document with YAML frontmatter: `type` (from the node type), `title`, `tags`, and `generated` provenance
- Documents are grouped into subdirectories by node type (`notes/`, `citations/`, ...)
- A root `index.md` declares `okf_version: "0.2"` and lists all documents by section with descriptions
- Wikilinks are rewritten to bundle-relative Markdown links in the exported copy; unresolvable links are left unchanged
- The export writes to a folder you choose; the workspace and its vault files are not modified

Files that Nodus itself creates in a vault (via "create file for node" or the export-to-files action) also carry OKF frontmatter, unless the content already starts with its own frontmatter block. Existing vault files are never rewritten to add frontmatter.

---

## Data Storage

### Local-First Architecture
All data stored on your device:

- **SQLite** - Metadata, positions, connections
- **Markdown files** - Content (Obsidian-compatible)
- **No cloud required** - Works fully offline

### Privacy
- No telemetry
- No data collection
- Your data stays yours

---

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New node | Double-click | Double-click |
| Delete | `Backspace` | `Delete` |
| Select all | `Cmd+A` | `Ctrl+A` |
| Undo | `Cmd+Z` | `Ctrl+Z` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Shift+Z` |
| Zoom in | `Cmd+=` | `Ctrl+=` |
| Zoom out | `Cmd+-` | `Ctrl+-` |
| Fit view | `F` | `F` |
| Layout | `L` | `L` |
| Neighborhood view | `N` | `N` |
| Reset node sizes | `Shift+R` | `Shift+R` |
| Help | `?` | `?` |
| Fullscreen edit | `Cmd+Click` | `Ctrl+Click` |
| Find in node | `Cmd+F` | `Ctrl+F` |
| Settings | `Cmd+,` | `Ctrl+,` |

See Settings → Keyboard Shortcuts for full list.

---

## Themes

| Theme | Description |
|-------|-------------|
| **Light** | Clean, bright interface |
| **Dark** | Easy on the eyes |
| **Pitch Black** | OLED-optimized, true black background |
| **Cyber** | Neon cyan/magenta aesthetic |

Node colors can be customized individually.
