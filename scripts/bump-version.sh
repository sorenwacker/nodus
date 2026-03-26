#!/bin/bash
# Bump version in all project files
# Usage: ./scripts/bump-version.sh 0.4.8

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 0.4.8"
  exit 1
fi

NEW_VERSION="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping version to $NEW_VERSION..."

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' "$ROOT_DIR/package.json" | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"

# Update package.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/package.json"

# Update package-lock.json (first two occurrences)
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/g" "$ROOT_DIR/package-lock.json"

# Update src-tauri/Cargo.toml
sed -i '' "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"

# Update src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/src-tauri/tauri.conf.json"

echo "Updated files:"
grep -l "$NEW_VERSION" "$ROOT_DIR/package.json" "$ROOT_DIR/src-tauri/Cargo.toml" "$ROOT_DIR/src-tauri/tauri.conf.json"

echo ""
echo "Done. Next steps:"
echo "  git add -A && git commit -m 'Bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push && git push --tags"
