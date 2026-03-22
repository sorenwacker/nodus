# Nodus - Implementation Notes

## Project Overview

**Nodus** — Local-first knowledge graph with EU sovereignty. Canvas-based visual thinking tool.

Design document: `/docs/PRODUCT_DESIGN.md` (v0.9.0)

---

## Development Methodology

### Document-Driven Development

1. **Spec first:** All features documented in `/docs/` before implementation
2. **Update docs:** When implementation diverges, update docs first
3. **Version docs:** Increment version on significant changes
4. **Reference docs:** Code comments should reference doc sections

### Documentation Standard: ISO/IEC 26514

All user-facing documentation follows ISO/IEC 26514 (Systems and software engineering — Design and development of information for users).

**Structure requirements:**

| Information Type | Purpose | Format |
|------------------|---------|--------|
| Conceptual | Explain what and why | Short paragraphs, diagrams |
| Procedural | Step-by-step tasks | Numbered lists, prerequisites stated |
| Reference | Quick lookup | Tables, alphabetical/logical order |

**Style requirements:**

- Task-oriented: Focus on user goals, not features
- Active voice, imperative mood for procedures
- Consistent terminology (define terms on first use)
- One instruction per step
- State prerequisites before procedures
- Include expected results for verification

**Minimalism principles:**

- Omit information users do not need
- Support error recognition and recovery
- Use realistic examples from actual use cases

### Test-Driven Development (TDD)

1. **Write test first:** Define expected behavior before implementation
2. **Red → Green → Refactor:** Fail, pass, clean up
3. **Integration tests:** Critical for file sync and canvas rendering
4. **Integrity tests:** Required for all file operations

---

## Architecture Rules

### Data Separation (Critical)

| Storage | Content | Sync Method |
|---------|---------|-------------|
| `.md` files | Text content | File system |
| SQLite | Metadata, positions, edges | Local DB |
| Yjs | Canvas positions only | CRDTs |

**Never** store text content in SQLite. **Never** store Yjs binary in text columns.

### File Locking

- Use `fs2` crate for cross-platform locks
- Shared lock on read, exclusive on write
- No locking during batch operations (import scan)
- Graceful failure with user notification

### Rendering

- PixiJS (WebGL) for canvas, edges, backgrounds
- DOM overlay for text editing
- Zoom < 0.5 → hide DOM, render as texture

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri v2 |
| Frontend | Vue 3 + TypeScript |
| Canvas | PixiJS + DOM hybrid |
| Database | LibSQL (SQLite fork) |
| Math | Typst WASM (@myriaddreamin/typst.ts) |
| File watch | Rust `notify` + `fs2` |
| Sync | Yjs (positions only) |

---

## Week 1 Priorities

### Data Integrity First

1. File watcher with checksum detection
2. File locking mechanism
3. Integrity test suite (concurrent edit test)

### Success Metrics

| Task | Metric |
|------|--------|
| File detection | <200ms latency |
| Lock handling | Graceful failure |
| Canvas performance | 500 nodes @ 60fps |

---

## Testing Strategy

### Unit Tests (Rust)

```
src-tauri/src/
├── watcher.rs      → test file change detection
├── database.rs     → test CRUD operations
├── commands.rs     → test lock acquire/release
└── checksum.rs     → test SHA-256 calculation
```

### Integration Tests

1. **Concurrent edit test:** Edit in Nodus + Obsidian simultaneously
2. **Import test:** 1000 node vault import + auto-layout
3. **Sync test:** Position change propagates via Yjs

### Frontend Tests (Vitest)

1. **Canvas render:** 500 nodes at 60fps
2. **DOM sync:** Text overlay follows PixiJS coordinates
3. **Zoom transition:** DOM → texture at threshold

---

## File Structure

```
nodus/
├── docs/
│   └── PRODUCT_DESIGN.md       # Main spec
├── src/                        # Vue frontend
│   ├── components/
│   ├── canvas/                 # PixiJS logic, composables
│   │   ├── composables/        # Canvas-specific composables
│   │   ├── components/         # Canvas sub-components
│   │   ├── layout/             # Layout algorithms
│   │   └── PixiCanvas.vue      # Main canvas component
│   ├── llm/                    # LLM module (app-level)
│   │   ├── providers/          # Provider adapters
│   │   ├── tools/              # Agent tools
│   │   └── *.ts                # Core LLM logic
│   ├── composables/            # App-level composables
│   ├── stores/                 # Pinia state
│   ├── lib/                    # Utility libraries
│   ├── types/                  # TypeScript types
│   └── __tests__/
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── watcher.rs
│   │   ├── database.rs
│   │   ├── commands.rs
│   │   └── checksum.rs
│   └── tests/
└── .claude/
    └── CLAUDE.md               # This file
```

---

## LLM Agent Rules

- **No regex for natural language.** Use LLM to extract semantic meaning from user instructions. Regex is fragile and fails on varied phrasing.
- Agent tools should be composable and simple
- Per-node LLM reasoning for semantic categorization (smart_move)
- Per-pair LLM reasoning for connections (smart_connect) - handles any instruction type
- smart_connect returns edge types: related, cites, blocks, supports, contradicts
- Removed tools: connect_matching, move_matching (too rigid, replaced by smart_* tools)

---

## Key Decisions

### Why Tauri over Electron?

- Smaller binary (~10MB vs ~150MB)
- Rust security model
- Aligns with "local-first" brand

### Why LibSQL over SQLite?

- WAL mode for concurrent access
- `BEGIN CONCURRENT` for AI + user writes
- Better suited for local-first sync

### Why PixiJS + DOM hybrid?

- WebGL can't do editable text well
- DOM overlay for editing, PixiJS for performance
- Texture fallback on zoom-out

### Why Yjs only for positions?

- Text sync in CRDTs is complex
- .md files are source of truth for content
- Positions are safe to merge automatically

---

## Obsidian Compatibility

### Bridge, Not Migration

- Watch Obsidian vault folder
- Index .md files in SQLite (metadata only)
- Bi-directional sync via checksums
- Canvas positions stored separately

### Future: Obsidian Plugin

Required to sync x,y coordinates between Nodus canvas and Obsidian Canvas (.canvas files).

---

## Monetization Notes

### Free Tier Limits

- 3 canvas boards
- Local only (no sync)
- No mobile access

### Pro Value Prop

"Cross-device intelligence" — not just sync:
- Desktop LLM summarizes → appears on phone
- Mobile capture → lands on desktop canvas

---

## Commands

```bash
# Development
npm run dev              # Start Tauri dev
npm run test             # Run Vitest
cargo test               # Run Rust tests

# Build
npm run build            # Production build
npm run tauri build      # Create installer
```

---

## Design & Styling

### Philosophy: "Graph-First"

Canvas with document capabilities, NOT document manager with side-canvas.

### Visual Hierarchy

| Element | Renderer | Purpose |
|---------|----------|---------|
| Canvas grid | PixiJS | Background |
| Nodes | PixiJS Container + DOM overlay | Draggable boxes |
| Edges | PixiJS Graphics (BezierCurve) | Relationships |
| Frames | PixiJS Container | Spatial grouping |
| Node text | HTML textarea/TipTap | Editing |

### Semantic Zooming

| Zoom Level | Display |
|------------|---------|
| 100% | Full title, content snippet, edit handles |
| <50% | Collapsed cards, titles only, thinner edges |

### CSS Variables (Theme)

```css
:root {
  --bg-canvas: #f4f4f5;
  --bg-node: #ffffff;
  --text-main: #18181b;
  --border-node: #e4e4e7;
  --primary-color: #3b82f6;
}

[data-theme='dark'] {
  --bg-canvas: #18181b;
  --bg-node: #27272a;
  --text-main: #f4f4f5;
  --border-node: #3f3f46;
}
```

### Edge Colors by Link Type

| Type | Color |
|------|-------|
| `related` | Gray |
| `cites` | Blue |
| `blocks` | Red |
| `supports` | Green |
| `contradicts` | Orange |

### Layout

- **Import:** d3-force auto-layout
- **User:** Snap-to-grid toggle
- **Nodes:** Auto-resize vertically based on content

---

## References

- Design doc: `/docs/PRODUCT_DESIGN.md`
- Tauri v2: https://v2.tauri.app
- PixiJS: https://pixijs.com
- Typst: https://typst.app
- Yjs: https://yjs.dev
- LibSQL: https://libsql.org
