# Nodus

Local-first knowledge graph with EU sovereignty. A canvas-based visual thinking tool where research nodes, Typst math, and Obsidian vaults live on a single workspace.

## Features

- **Single Canvas**: The document and whiteboard are the same thing
- **Native Typst**: Sub-second math rendering (no LaTeX compile times)
- **Obsidian Bridge**: Seamless vault compatibility with bi-directional sync
- **Local-First**: Your data stays on your device
- **Graph Visualization**: Force-directed layouts, edge routing, and semantic zooming
- **Citation Management**: Zotero integration and BibTeX import
- **LLM Integration**: Connect local or cloud LLMs for research assistance

## Installation

Download the latest release for your platform:

- **macOS**: `.dmg` (Universal - Intel + Apple Silicon)
- **Windows**: `.msi` or `.exe` installer
- **Linux**: `.AppImage` or `.deb`

## Development

### Prerequisites

- Node.js 20+
- Rust (latest stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run tauri:dev

# Run tests
npm test

# Build for production
npm run tauri:build
```

### Project Structure

```
nodus/
├── src/                    # Vue frontend
│   ├── canvas/             # Canvas rendering (PixiJS + DOM)
│   ├── components/         # Vue components
│   ├── composables/        # Vue composables
│   ├── stores/             # Pinia state management
│   ├── llm/                # LLM integration
│   └── lib/                # Utility libraries
├── src-tauri/              # Rust backend
│   └── src/
│       ├── database.rs     # SQLite operations
│       ├── watcher.rs      # File system watcher
│       └── commands.rs     # Tauri commands
└── docs/                   # Documentation
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri v2 |
| Frontend | Vue 3 + TypeScript |
| Canvas | PixiJS + DOM hybrid |
| Database | LibSQL (SQLite fork) |
| Math | Typst WASM |
| Sync | Yjs CRDTs |

## License

[MIT](LICENSE)
