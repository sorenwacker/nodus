#!/bin/bash
# Install git hooks for the project

set -e

SCRIPT_DIR=$(dirname "$0")
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

echo "Installing git hooks..."

cp "$SCRIPT_DIR/pre-commit" "$ROOT_DIR/.git/hooks/pre-commit"
chmod +x "$ROOT_DIR/.git/hooks/pre-commit"

echo "Git hooks installed successfully."
