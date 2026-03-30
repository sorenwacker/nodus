# Development

## Prerequisites

- Node.js 20+
- Rust (latest stable)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Setup

```bash
# Clone the repo
git clone https://github.com/sorenwacker/nodus.git
cd nodus

# Install dependencies
npm install

# Start development server
npm run tauri:dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Start development server |
| `npm test` | Run tests |
| `npm run lint` | Lint code |
| `npm run tauri:build` | Build for production |

## Project Structure

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
| Database | LibSQL (SQLite) |
| Math | Typst WASM |
