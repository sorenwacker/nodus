# Nodus

[![Release](https://img.shields.io/github/v/release/sorenwacker/nodus?style=flat-square)](https://github.com/sorenwacker/nodus/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/sorenwacker/nodus/ci.yml?branch=main&style=flat-square)](https://github.com/sorenwacker/nodus/actions)

Nodus puts your notes on a canvas and keeps them as plain Markdown files on your disk.

Notes are stored in [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) - Markdown with a YAML frontmatter block - so the same folder opens in Obsidian, in a text editor, or in anything else that reads Markdown. Nodus adds the canvas: where each note sits, what connects it to what, and the reading order through it.

## Download

| Platform | Download |
|----------|----------|
| macOS | [Universal DMG](https://github.com/sorenwacker/nodus/releases/latest) |
| Windows | [Installer (exe)](https://github.com/sorenwacker/nodus/releases/latest) |
| Linux | [AppImage](https://github.com/sorenwacker/nodus/releases/latest) / [deb](https://github.com/sorenwacker/nodus/releases/latest) |

## What it does

- **One canvas** - The document and the whiteboard are the same surface. Notes are editable where they sit.
- **Your files** - Markdown in Open Knowledge Format, in a folder you choose. Edits made outside Nodus are picked up; edits made inside are written back.
- **Typst math** - Math renders through Typst compiled to WebAssembly, with no LaTeX toolchain to install.
- **Papers as graphs** - A dropped PDF can become one note or a graph of them: sections along the document outline, bibliography entries as citation notes, each reference checked against Semantic Scholar. A reference the service cannot be asked about is reported as unchecked rather than missing.
- **Highlights** - Highlights in a dropped PDF become notes, coloured to match and linked to the document they came from.
- **Storylines** - Order a subset of notes into a sequence and read it as a continuous document, or export it as PDF or Typst source.
- **Citations** - Zotero library sync and BibTeX import.
- **Language models** - Local models through Ollama, or a cloud provider. The model works through the same tools you do, and asks before changing the graph.
- **MCP server** - Other AI tools can read and edit the graph over the Model Context Protocol.
- **Local only** - No account, no sync service. The data is on your disk.

## Documentation

**[Read the docs](https://sorenwacker.github.io/nodus/)**

- [Getting Started](https://sorenwacker.github.io/nodus/getting-started)
- [Features](https://sorenwacker.github.io/nodus/features)
- [Typst Math Reference](https://sorenwacker.github.io/nodus/typst-math-reference)
- [Development](https://sorenwacker.github.io/nodus/development)

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
| `npm run tauri:dev` | Start the app in development mode |
| `npm test` | Run the frontend test suite |
| `npm run typecheck` | Type-check the frontend |
| `npm run lint` | Lint the frontend |
| `npm run tauri:build` | Build the installers |
| `cargo test` | Run the Rust test suite (from `src-tauri`) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri v2 |
| Frontend | Vue 3 + TypeScript |
| Canvas | DOM cards, SVG edges, and a 2D canvas above the level-of-detail threshold |
| Database | LibSQL (SQLite) |
| Math | Typst WASM |

## Disclaimer

This software is provided "as-is" without warranty of any kind. The author is not liable for any data loss, corruption, API costs (including LLM provider charges), or other damages arising from the use of this software. Use at your own risk.

## License

Copyright (c) 2024 Soren Wacker. All rights reserved.

You may download, install, and use this software for personal and commercial purposes. Redistribution of the source code is not permitted without explicit permission.
