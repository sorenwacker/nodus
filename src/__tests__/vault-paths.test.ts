/**
 * A path is inside the vault only when it is the vault or lies below it
 * (PRODUCT_DESIGN.md > Walking a vault).
 *
 * Containment was decided by a string prefix, so a sibling folder whose name
 * begins with the vault's name, such as `notes-archive` next to `notes`, read
 * as inside it: its files were given folders like `-archive/sub`, and frames
 * were created for folders of another vault.
 */
import { describe, it, expect } from 'vitest'
import { relativeFolder } from '../lib/vaultPaths'

describe('the folder a file sits in, relative to its vault', () => {
  it('is empty for a file at the vault root', () => {
    expect(relativeFolder('/v/notes/a.md', '/v/notes')).toBe('')
  })

  it('names the folders below the vault', () => {
    expect(relativeFolder('/v/notes/sub/deep/a.md', '/v/notes')).toBe('sub/deep')
  })

  it('reads a Windows path the same way', () => {
    expect(relativeFolder('C:\\v\\notes\\sub\\a.md', 'C:\\v\\notes')).toBe('sub')
  })

  it('ignores a trailing separator on the vault', () => {
    expect(relativeFolder('/v/notes/sub/a.md', '/v/notes/')).toBe('sub')
  })

  it('is empty without a vault', () => {
    expect(relativeFolder('/v/notes/sub/a.md', null)).toBe('')
  })

  it('treats a sibling folder that shares the vault name as outside', () => {
    expect(relativeFolder('/v/notes-archive/sub/a.md', '/v/notes')).toBe('')
    expect(relativeFolder('/v/notesty.md', '/v/notes')).toBe('')
  })
})
