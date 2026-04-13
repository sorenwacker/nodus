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
make dev
```

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development server |
| `npm test` | Run tests |
| `npm run lint` | Lint code |
| `npm run build` | Build frontend |
| `npm run tauri build` | Build for production |
| `cargo test` | Run Rust tests (in src-tauri/) |
| `cargo clippy` | Lint Rust code |

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

## Logging

The application uses a structured logging system with namespace prefixes.

### Log Levels

| Environment | Default Level | Shows |
|-------------|---------------|-------|
| Development | `info` | info, warn, error |
| Production | `warn` | warn, error |

### Namespaces

| Logger | Prefix | Usage |
|--------|--------|-------|
| `appLogger` | `[Nodus]` | General application logs |
| `storeLogger` | `[Store]` | Pinia store operations |
| `canvasLogger` | `[Canvas]` | Canvas rendering |
| `agentLogger` | `[Agent]` | LLM agent operations |

### Usage

```typescript
import { storeLogger } from '../lib/logger'

storeLogger.debug('Verbose debugging info')  // Only in development
storeLogger.info('General information')       // Development only
storeLogger.warn('Warning message')           // Always shown
storeLogger.error('Error occurred', error)    // Always shown
```
