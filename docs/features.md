# Features

## Canvas

### Infinite Canvas
Pan and zoom freely across an infinite workspace. Semantic zooming adjusts detail level:

- **Zoomed in**: Full content, edit handles, detailed view
- **Zoomed out**: Titles only, bubble mode for performance

### Node Types

| Type | Description |
|------|-------------|
| **Note** | General purpose markdown notes |
| **Citation** | Academic references with DOI support |
| **Tag** | Organizational nodes for categorization |
| **File** | Linked external files |

### Frames
Group related nodes visually. Frames act as containers that can be moved together with all contained nodes.

### Selection & Multi-Select
- Click to select single node
- Cmd/Ctrl+Click to add to selection
- Lasso selection for multiple nodes
- Bulk operations on selection

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

### Edge Routing
Multiple routing styles for visual clarity:

- **Orthogonal** - 90-degree angles, clean diagrams
- **Curved** - Bezier curves, organic flow
- **Straight** - Direct lines
- **Hyperbolic** - Smooth curves avoiding nodes

### Neighbor Highlighting
When selecting a node, connected neighbors are highlighted for context.

---

## Storylines

Create linear narratives through your knowledge graph:

- Order nodes into a sequence
- Navigate through storyline in reader mode
- Export storylines as documents
- Color-code storyline edges

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

### Workspace Separation
Each imported vault becomes a separate workspace, keeping projects organized.

---

## Citation Management

### Zotero Integration
Connect to your local Zotero database:

- Browse and import collections
- DOI extraction and linking
- Create citation nodes with metadata

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

---

## Layout Algorithms

Automatic arrangement of nodes:

| Algorithm | Best For |
|-----------|----------|
| Force-directed | General graphs, organic layout |
| Grid | Structured content |
| Hierarchical | Trees and DAGs |
| Circular | Relationship diagrams |

---

## Export Options

### Typst Export
Export canvas as Typst document for further editing.

### PDF Generation
Generate PDFs directly using Typst compilation.

### Markdown Export
Export nodes as standard Markdown files.

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
| New node | `N` | `N` |
| Delete | `Backspace` | `Delete` |
| Select all | `Cmd+A` | `Ctrl+A` |
| Undo | `Cmd+Z` | `Ctrl+Z` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Shift+Z` |
| Zoom in | `Cmd+=` | `Ctrl+=` |
| Zoom out | `Cmd+-` | `Ctrl+-` |
| Fit view | `Cmd+0` | `Ctrl+0` |
| Zoom to node | `Cmd+Click` | `Ctrl+Click` |
| Search | `Cmd+F` | `Ctrl+F` |
| Settings | `Cmd+,` | `Ctrl+,` |

See Settings → Keyboard Shortcuts for full list.

---

## Themes

- **Light mode** - Clean, bright interface
- **Dark mode** - Easy on the eyes
- **System** - Follows OS preference

Node colors can be customized individually.
