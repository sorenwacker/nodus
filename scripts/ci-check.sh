#!/bin/bash
# Local CI check - runs the same checks as GitHub Actions
# Run this before committing to catch issues early

set -e

echo "=== Running CI checks locally ==="
echo ""

cd "$(git rev-parse --show-toplevel)"

echo "[1/5] Frontend tests..."
npm test -- --run

echo ""
echo "[2/5] Frontend lint..."
npm run lint

echo ""
echo "[3/5] Frontend build..."
npm run build

echo ""
echo "[4/5] Rust tests..."
cd src-tauri
cargo test --verbose

echo ""
echo "[5/5] Rust clippy..."
cargo clippy -- -D warnings

echo ""
echo "=== All CI checks passed ==="
