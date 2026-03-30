# Nodus

[![Release](https://img.shields.io/github/v/release/sorenwacker/nodus?style=flat-square)](https://github.com/sorenwacker/nodus/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/sorenwacker/nodus/ci.yml?branch=main&style=flat-square)](https://github.com/sorenwacker/nodus/actions)

Local-first knowledge graph with EU sovereignty. A canvas-based visual thinking tool where research nodes, Typst math, and Obsidian vaults live on a single workspace.

## Download

| Platform | Download |
|----------|----------|
| macOS | [Universal DMG](https://github.com/sorenwacker/nodus/releases/latest) |
| Windows | [Installer (exe)](https://github.com/sorenwacker/nodus/releases/latest) |
| Linux | [AppImage](https://github.com/sorenwacker/nodus/releases/latest) / [deb](https://github.com/sorenwacker/nodus/releases/latest) |

## Features

- **Single Canvas** - The document and whiteboard are the same thing
- **Native Typst** - Sub-second math rendering (no LaTeX compile times)
- **Obsidian Bridge** - Seamless vault compatibility with bi-directional sync
- **Local-First** - Your data stays on your device
- **Graph Visualization** - Force-directed layouts, edge routing, semantic zooming
- **Citation Management** - Zotero integration and BibTeX import
- **LLM Integration** - Connect local or cloud LLMs for research assistance

## Documentation

- [Getting Started](docs/getting-started.md)
- [Features](docs/features.md)
- [Typst Math Reference](docs/typst-math-reference.md)

## Development

### Prerequisites

- Node.js 20+
- Rust (latest stable)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Quick Start

```bash
npm install
npm run tauri:dev
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Start development server |
| `npm test` | Run tests |
| `npm run tauri:build` | Build for production |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri v2 |
| Frontend | Vue 3 + TypeScript |
| Canvas | PixiJS + DOM hybrid |
| Database | LibSQL (SQLite) |
| Math | Typst WASM |

## License

All rights reserved. License to be determined.
