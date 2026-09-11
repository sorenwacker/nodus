#!/bin/bash
# Local CI check - runs every check GitHub Actions runs, on the whole tree.
# src/__tests__/local-checks-mirror-ci.test.ts fails when this script stops
# running a check CI runs.

set -e

echo "=== Running CI checks locally ==="
echo ""

cd "$(git rev-parse --show-toplevel)"

echo "[1/8] Frontend tests..."
npm test -- --run

echo ""
echo "[2/8] Frontend lint..."
npm run lint

echo ""
echo "[3/8] Frontend types..."
npm run typecheck

echo ""
echo "[4/8] Frontend build..."
npm run build

echo ""
echo "[5/8] Rust formatting..."
cd src-tauri
cargo fmt --check

echo ""
echo "[6/8] Rust tests..."
cargo test --verbose

echo ""
echo "[7/8] Rust clippy..."
# --all-targets so test code is linted too, as CI does
cargo clippy --all-targets -- -D warnings
cd ..

echo ""
echo "[8/8] MCP server build..."
(cd packages/nodus-mcp-server && npm ci && npm run build)

echo ""
echo "=== All CI checks passed ==="
