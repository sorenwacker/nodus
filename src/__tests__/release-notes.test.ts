/**
 * The release workflow builds each GitHub release body from the CHANGELOG
 * section for the tag being released, so published releases say what changed
 * instead of carrying an identical placeholder.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve(__dirname, '../../scripts/release-notes.sh')

function notesFor(version: string): string {
  return execFileSync(SCRIPT, [version], { encoding: 'utf8' })
}

describe('release notes extraction', () => {
  it('extracts the section for a released version', () => {
    const notes = notesFor('1.2.0')
    expect(notes).toContain('Edge labels have their own zoom threshold')
    expect(notes).toContain('### Fixed')
  })

  it('accepts the tag form as well as the bare version', () => {
    expect(notesFor('v1.2.0')).toBe(notesFor('1.2.0'))
  })

  it('stops at the next version heading', () => {
    const notes = notesFor('1.2.0')
    expect(notes).not.toContain('## [1.1.0]')
    // 1.1.0's entries must not bleed into 1.2.0's notes
    expect(notes).not.toContain('Settings modal reorganized into six tabs')
  })

  it('does not repeat the version heading itself', () => {
    expect(notesFor('1.2.0')).not.toContain('## [1.2.0]')
  })

  it('falls back to a changelog pointer for a version with no entry', () => {
    const notes = notesFor('99.9.9')
    expect(notes).toContain('CHANGELOG.md')
    expect(notes.trim().length).toBeGreaterThan(0)
  })

  it('always points at the download page', () => {
    for (const version of ['1.2.0', '99.9.9']) {
      expect(notesFor(version)).toContain('sorenwacker.net/nodus')
    }
  })
})
