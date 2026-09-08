/**
 * A composable that runs work during setup cannot be handed a getter for a
 * `const` declared further down the file.
 *
 * `useGraphMetrics` stages card mounts through a watcher with `immediate: true`,
 * so it calls `getEditingNodeId()` while the canvas is still setting up. With
 * the editor created below it, that call reached `editingNodeId` inside its
 * temporal dead zone and the canvas failed to start with "Cannot access
 * 'editingNodeId' before initialization". The production bundle rewrites the
 * declaration and hid this; the dev server does not, so it broke only where the
 * code is read as written.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/canvas/GraphCanvas.vue'), 'utf8')

describe('canvas setup order', () => {
  it('creates the node editor before the consumers that read it during setup', () => {
    const editor = source.indexOf('const nodeEditor = useNodeEditor(')
    const metrics = source.indexOf('const graphMetrics = useGraphMetrics(')
    const renderer = source.indexOf('const contentRenderer = useContentRenderer(')

    expect(editor).toBeGreaterThan(-1)
    expect(metrics).toBeGreaterThan(-1)
    expect(renderer).toBeGreaterThan(-1)

    expect(editor, 'useGraphMetrics reads editingNodeId while it sets up').toBeLessThan(metrics)
    expect(editor, 'useContentRenderer reads editingNodeId').toBeLessThan(renderer)
  })

  it('destructures editingNodeId with that call, not later', () => {
    const editor = source.indexOf('const nodeEditor = useNodeEditor(')
    const destructured = source.indexOf('  editingNodeId,\n  editContent,')
    const metrics = source.indexOf('const graphMetrics = useGraphMetrics(')

    expect(destructured).toBeGreaterThan(editor)
    expect(destructured, 'the binding must exist before setup-time readers').toBeLessThan(metrics)
  })
})
