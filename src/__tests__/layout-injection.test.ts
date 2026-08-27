/**
 * A composable moves nodes through the collaborator it was given.
 *
 * `pushOverlappingNodes` mutated node objects and called `invoke` itself, while
 * the same file used the injected `updateNodePosition` two functions further
 * down. Whatever the store's own path does - coordinate clamping, layout
 * bookkeeping, persistence policy - was skipped for pushed nodes only
 * (PRODUCT_DESIGN.md > Depending on what is supplied).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node } from '../types'

const invoke = vi.fn()
vi.mock('../lib/tauri', () => ({
  invoke: (...a: unknown[]) => invoke(...a),
  isTauri: () => true,
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

function node(id: string, x: number, y: number): Node {
  return {
    id,
    title: id,
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: x,
    canvas_y: y,
    width: 200,
    height: 120,
    frame_id: null,
    workspace_id: null,
    created_at: 0,
    updated_at: 0,
  } as Node
}

describe('pushing overlapping nodes apart', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  it('moves them through the injected updateNodePosition', async () => {
    const { useNodeLayout } = await import('../composables/useNodeLayout')
    // Two nodes at the same point, so at least one must be pushed
    const nodes = [node('a', 0, 0), node('b', 10, 10)]
    const updateNodePosition = vi.fn(async (id: string, x: number, y: number) => {
      const target = nodes.find(n => n.id === id)
      if (target) {
        target.canvas_x = x
        target.canvas_y = y
      }
    })

    const layout = useNodeLayout({
      getNodes: () => nodes,
      getEdges: () => [],
      updateNodePosition,
      pushUndo: vi.fn(),
    } as never)

    layout.pushOverlappingNodes(nodes[0])

    expect(updateNodePosition).toHaveBeenCalled()
    // Nothing reaches the backend directly, bypassing the store's own path
    expect(invoke).not.toHaveBeenCalled()
  })
})
