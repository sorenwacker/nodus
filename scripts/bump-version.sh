#!/bin/bash
# Bump version in package.json and Cargo.toml
# Usage: ./scripts/bump-version.sh patch|minor|major|X.Y.Z

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <patch|minor|major|version>"
  echo "Examples:"
  echo "  $0 patch   # 0.5.0 -> 0.5.1"
  echo "  $0 minor   # 0.5.0 -> 0.6.0"
  echo "  $0 major   # 0.5.0 -> 1.0.0"
  echo "  $0 0.5.1   # explicit version"
  exit 1
fi

# Get current version from package.json
CURRENT=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$1" in
  patch)
    PATCH=$((PATCH + 1))
    VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  *)
    VERSION="$1"
    # Validate version format
    if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
      echo "Error: Version must be in format X.Y.Z or X.Y.Z-tag (e.g., 0.5.1 or 0.5.1-rc.1)"
      exit 1
    fi
    ;;
esac

# Update package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json

# Update Cargo.toml
sed -i '' "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

# Output ONLY the new version (used by Makefile)
echo "$VERSION"
