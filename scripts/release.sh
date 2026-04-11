#!/bin/bash
# Release script - only creates a release if CI passes
set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/release.sh <version>"
    echo "Example: ./scripts/release.sh 0.4.25"
    exit 1
fi

VERSION="$1"
TAG="v$VERSION"

echo "=== Preparing release $TAG ==="

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: Uncommitted changes. Commit or stash them first."
    exit 1
fi

# Check we're on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
    echo "ERROR: Must be on main branch (currently on $BRANCH)"
    exit 1
fi

# Pull latest
echo "[1/6] Pulling latest..."
git pull origin main

# Check CI status for current commit
echo "[2/6] Checking CI status..."
COMMIT=$(git rev-parse HEAD)
CI_STATUS=$(gh run list --commit "$COMMIT" --workflow=ci.yml --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "none")

if [ "$CI_STATUS" != "success" ]; then
    echo "ERROR: CI has not passed for commit $COMMIT"
    echo "Status: $CI_STATUS"
    echo "Wait for CI to pass or fix the issues first."
    exit 1
fi

echo "CI passed for commit $COMMIT"

# Update version in all files
echo "[3/6] Updating version to $VERSION..."
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/g" package.json src-tauri/tauri.conf.json
sed -i '' "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

# Commit version bump
echo "[4/6] Committing version bump..."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Bump version to $VERSION"

# Push to main
echo "[5/6] Pushing to main..."
git push origin main

# Wait for CI on the version bump commit
echo "[6/6] Waiting for CI on version bump..."
echo "This may take a few minutes..."
sleep 10

NEW_COMMIT=$(git rev-parse HEAD)
for i in {1..30}; do
    CI_STATUS=$(gh run list --commit "$NEW_COMMIT" --workflow=ci.yml --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "pending")
    if [ "$CI_STATUS" = "success" ]; then
        echo "CI passed!"
        break
    elif [ "$CI_STATUS" = "failure" ]; then
        echo "ERROR: CI failed on version bump commit"
        echo "Fix the issues before releasing."
        exit 1
    fi
    echo "  CI status: $CI_STATUS (attempt $i/30)"
    sleep 10
done

if [ "$CI_STATUS" != "success" ]; then
    echo "ERROR: CI did not complete in time. Check manually and tag if passing:"
    echo "  git tag $TAG && git push origin $TAG"
    exit 1
fi

# Create and push tag
echo "Creating tag $TAG..."
git tag "$TAG"
git push origin "$TAG"

echo ""
echo "=== Release $TAG triggered ==="
echo "Monitor: https://github.com/sorenwacker/nodus/actions"
