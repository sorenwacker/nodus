#!/bin/bash
# Bump version in all project files
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' "$ROOT_DIR/package.json" | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Determine bump type
BUMP_TYPE="${1:-patch}"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    # If argument looks like a version number, use it directly
    if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      NEW_VERSION="$1"
    else
      echo "Usage: $0 [patch|minor|major|x.y.z]"
      exit 1
    fi
    ;;
esac

NEW_VERSION="${NEW_VERSION:-$MAJOR.$MINOR.$PATCH}"

echo "$CURRENT_VERSION -> $NEW_VERSION"

# Update package.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/package.json"

# Update package-lock.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/g" "$ROOT_DIR/package-lock.json"

# Update src-tauri/Cargo.toml
sed -i '' "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"

# Update src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/src-tauri/tauri.conf.json"

echo "$NEW_VERSION"
