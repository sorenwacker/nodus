/**
 * RPM refuses a '-' in its version, so the release workflow bundles a release
 * candidate for Linux without it (docs/content/development.md > release
 * candidates); a full release keeps every bundle.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

describe('release candidate Linux bundles', () => {
  it('limits a suffixed tag on Linux to AppImage and deb', () => {
    expect(workflow).toMatch(/ubuntu-22\.04' && contains\(github\.ref_name, '-'\) && '--bundles appimage,deb'/)
  })
})
