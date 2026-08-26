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
│   ├── canvas/             # Canvas rendering (DOM, SVG, Canvas 2D)
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
| Canvas | DOM cards, SVG edges, and a 2D canvas above the level-of-detail threshold |
| Database | SQLite via `sqlx` |
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

## Known dependency advisory

`glib` 0.18 carries a medium-severity unsoundness advisory (`VariantStrIter`). It
cannot be upgraded from this repository: Tauri 2.11.5, the latest release, pins
it transitively through `gtk` 0.18 and `muda`. Nodus contains no direct `glib`
usage and never calls the affected API, and the issue is Linux-only. The alert is
dismissed as tolerable risk and should be revisited when Tauri's gtk stack moves
to `glib` 0.20.

## Release signing

Two independent signatures matter, and neither is configured in this repository
because both require credentials the maintainer holds.

### Update signatures (required for auto-update)

The updater refuses any payload whose signature does not verify, so the release
pipeline needs a keypair:

1. `npm run tauri signer generate -- -w ~/.nodus-updater.key`
2. Put the **public** key in `src-tauri/tauri.conf.json` under
   `plugins.updater.pubkey`, replacing the placeholder.
3. Add the **private** key and its password as the repository secrets
   `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Until the keypair exists, `bundle.createUpdaterArtifacts` stays `false` and
`plugins.updater.pubkey` stays empty. A placeholder public key is worse than no
key: Tauri finds it, demands the matching private key, and fails the build.
Set both when you add the key:

- `bundle.createUpdaterArtifacts` to `true`
- `plugins.updater.pubkey` to the generated public key

The release then publishes a signed `latest.json`; without them it publishes
installers only, and the in-app update check stays silent.

### Distribution signatures (removes the install warnings)

Unsigned builds are the largest avoidable loss of users: macOS reports an
unidentified developer and Windows SmartScreen warns before the first run.

- **macOS** needs an Apple Developer account. Add `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD` and `APPLE_TEAM_ID` as repository secrets, then add the same
  names to the `env` block of the release job. Add them together: declaring the
  variables while the secrets are unset makes `tauri-action` attempt a
  certificate import with an empty value, which fails the macOS build.
- **Windows** needs a code-signing certificate; set
  `bundle.windows.certificateThumbprint` in `tauri.conf.json`, or supply the
  certificate to the signing step.
