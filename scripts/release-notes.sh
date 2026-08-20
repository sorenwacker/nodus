#!/bin/bash
# Print the CHANGELOG section for a version, for use as a GitHub release body.
# Usage: ./scripts/release-notes.sh <version|vVersion>
set -euo pipefail

VERSION="${1#v}"
CHANGELOG="$(dirname "$0")/../CHANGELOG.md"
DOWNLOADS="https://sorenwacker.net/nodus/"

# Lines between this version's heading and the next version heading
SECTION=$(awk -v ver="$VERSION" '
  index($0, "## [" ver "]") == 1 { found = 1; next }
  found && index($0, "## [") == 1 { exit }
  found { print }
' "$CHANGELOG" | sed -e '/./,$!d')

if [ -z "$(printf '%s' "$SECTION" | tr -d '[:space:]')" ]; then
  # No entry for this version: point at the changelog rather than ship a
  # body that claims nothing changed
  SECTION="See [CHANGELOG.md](https://github.com/sorenwacker/nodus/blob/main/CHANGELOG.md) for details."
fi

printf '%s\n\nDownloads for macOS, Windows, and Linux: %s\n' "$SECTION" "$DOWNLOADS"
