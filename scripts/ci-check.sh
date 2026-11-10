#!/bin/bash
# Local CI check - runs every check GitHub Actions runs, on the whole tree.
# src/__tests__/local-checks-mirror-ci.test.ts fails when this script stops
# running a check CI runs.

set -e

echo "=== Running CI checks locally ==="
echo ""

cd "$(git rev-parse --show-toplevel)"

echo "[1/9] Frontend tests..."
npm test -- --run

echo ""
echo "[2/9] Frontend lint..."
npm run lint

echo ""
echo "[3/9] Frontend types..."
npm run typecheck

echo ""
echo "[4/9] Frontend build..."
npm run build

echo ""
echo "[5/9] Rust formatting..."
cd src-tauri
cargo fmt --check

echo ""
echo "[6/9] Rust tests..."
cargo test --verbose
cd ..

echo ""
echo "[7/9] Tauri build..."
# Checks that the npm Tauri packages and the Rust crates share minor versions, as CI does
npx tauri build --debug --no-bundle --config '{"build":{"beforeBuildCommand":""}}'

cd src-tauri

echo ""
echo "[8/9] Rust clippy..."
# --all-targets so test code is linted too, as CI does
cargo clippy --all-targets -- -D warnings
cd ..

echo ""
echo "[9/9] MCP server build..."
(cd packages/nodus-mcp-server && npm ci && npm run build)

echo ""
echo "=== All CI checks passed ==="
