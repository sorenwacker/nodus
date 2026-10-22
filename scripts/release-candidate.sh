#!/bin/bash
# Cut the next release candidate: X.Y.Z-rc.N -> X.Y.Z-rc.N+1, commit, tag, push.
# Refuses unless CHANGELOG.md has a section for the new version, because that
# section becomes the release notes (development.md > Continuous integration
# and releases).
set -e

cd "$(git rev-parse --show-toplevel)"

if [ "$(git branch --show-current)" != "main" ]; then
  echo "Error: release candidates are cut from main" >&2
  exit 1
fi
if ! git diff --quiet HEAD -- . ':!CHANGELOG.md'; then
  echo "Error: uncommitted changes outside CHANGELOG.md" >&2
  exit 1
fi

CURRENT=$(node -p "require('./package.json').version")
if ! [[ "$CURRENT" =~ ^([0-9]+\.[0-9]+\.[0-9]+)-rc\.([0-9]+)$ ]]; then
  echo "Error: $CURRENT is not a release candidate; set X.Y.Z-rc.1 with scripts/bump-version.sh" >&2
  exit 1
fi
VERSION="${BASH_REMATCH[1]}-rc.$((BASH_REMATCH[2] + 1))"

if ! grep -qF "## [$VERSION]" CHANGELOG.md; then
  echo "Error: CHANGELOG.md has no section '## [$VERSION]'" >&2
  exit 1
fi

./scripts/bump-version.sh "$VERSION" >/dev/null
npm install --package-lock-only --silent
(cd src-tauri && cargo update -p nodus --offline --quiet)

git add CHANGELOG.md package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Release v$VERSION"
git tag "v$VERSION"
git push origin main "v$VERSION"
echo "Pushed v$VERSION"
