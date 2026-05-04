#!/bin/bash
# Bump version in package.json and Cargo.toml
# Usage: ./scripts/bump-version.sh 0.4.33

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.4.33"
  exit 1
fi

VERSION="$1"

# Validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in format X.Y.Z (e.g., 0.4.33)"
  exit 1
fi

echo "Bumping version to $VERSION..."

# Update package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
echo "Updated package.json"

# Update Cargo.toml
sed -i '' "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
echo "Updated src-tauri/Cargo.toml"

# Verify changes
echo ""
echo "Verification:"
grep '"version"' package.json | head -1
grep '^version' src-tauri/Cargo.toml

echo ""
echo "Done. Now run: git add -A && git commit -m 'Bump version to $VERSION'"
