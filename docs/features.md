# Features

## Canvas

### Infinite Canvas
Pan and zoom freely across an infinite workspace. Semantic zooming adjusts detail level based on zoom:
- Zoomed in: Full content, edit handles
- Zoomed out: Titles only, performance-optimized rendering

### Node Types
- **Note**: General purpose markdown notes
- **Citation**: Academic references with DOI support
- **Tag**: Organizational nodes for categorization

### Frames
Group related nodes visually. Frames act as containers that can be moved together.

## Connections

### Edge Types
| Type | Color | Meaning |
|------|-------|---------|
| Related | Gray | General association |
| Cites | Blue | Academic citation |
| Supports | Green | Supporting evidence |
| Contradicts | Orange | Opposing viewpoint |
| Blocks | Red | Dependency blocker |

### Edge Routing
Automatic orthogonal routing avoids node overlaps. Multiple routing styles:
- Orthogonal (90-degree angles)
- Curved (Bezier)
- Straight
- Hyperbolic

## Math with Typst

Native Typst integration for fast mathematical typesetting:
- Sub-second rendering (no LaTeX compile times)
- Modern syntax
- Full equation support

Example:
```
$integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2$
```

## Obsidian Integration

### Vault Import
Import existing Obsidian vaults with:
- Markdown content preserved
- Wiki-links converted to edges
- Automatic force-directed layout

### Bi-directional Sync
Changes sync between Nodus and your vault folder:
- Edit in Nodus, see changes in Obsidian
- Edit in Obsidian, see changes in Nodus

## Citation Management

### Zotero Integration
Connect to local Zotero database:
- Import collections as nodes
- DOI extraction and linking
- BibTeX export

### BibTeX Import
Import `.bib` files directly to create citation nodes.

## LLM Integration

Connect local or cloud LLMs for:
- Research assistance
- Content summarization
- Smart node connections

Supported providers:
- Ollama (local)
- OpenAI
- Anthropic
- OpenAI-compatible APIs

## Data Storage

### Local-First
All data stored locally:
- SQLite database for metadata
- Markdown files for content
- No cloud dependency

### Export Options
- Typst document export
- PDF generation
- Markdown export
