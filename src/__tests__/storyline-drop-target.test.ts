/**
 * The drag handler and the storyline panel share a declared value.
 *
 * It used to be `window.__storylinePanelDropTarget`: the panel wrote it, the
 * drag handler read it back through a structural cast, and neither declared a
 * dependency on the other. No boundary test could express the contract, and the
 * ordering held only because the panel cleared the flag in a deferred callback
 * that happened to run after the drag ended
 * (PRODUCT_DESIGN.md > Dropping a node on the storyline panel).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isOverStorylinePanel, setOverStorylinePanel } from '../canvas/composables/util/dragDropTarget'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '__tests__'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, found)
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) found.push(path)
  }
  return found
}

describe('the storyline drop target', () => {
  beforeEach(() => setOverStorylinePanel(false))

  it('reports what the panel set', () => {
    setOverStorylinePanel(true)
    expect(isOverStorylinePanel.value).toBe(true)

    setOverStorylinePanel(false)
    expect(isOverStorylinePanel.value).toBe(false)
  })

  it('is not carried on the window object anywhere', () => {
    const offenders = sourceFiles(SRC)
      .filter(f => !f.endsWith('dragDropTarget.ts'))
      .filter(f => readFileSync(f, 'utf-8').includes('__storylinePanelDropTarget'))

    expect(
      offenders,
      'a window property neither side declares cannot be checked by any boundary test'
    ).toEqual([])
  })

  it('is read by the drag handler through the module', () => {
    const source = readFileSync(
      resolve(SRC, 'canvas/composables/nodes/useNodeDragging.ts'),
      'utf-8'
    )
    expect(source).toContain("from '../util/dragDropTarget'")
  })
})
