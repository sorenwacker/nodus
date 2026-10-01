/**
 * A layout animation frame moves its nodes in one batch
 * (PRODUCT_DESIGN.md > Persisting animated positions).
 */
import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/tauri', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))

import { invoke } from '../lib/tauri'
import { useNodesStore } from '../stores/nodes'
import type { Node } from '../types'

function seed(count: number) {
  setActivePinia(createPinia())
  const store = useNodesStore()
  store.nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`, title: `Node ${i}`, canvas_x: 0, canvas_y: 0, width: 200, height: 120, markdown_content: '',
  })) as unknown as Node[]
  return store
}

describe('moving nodes in memory as one batch', () => {
  it('sets every position and changes the layout version once', () => {
    const store = seed(1000)
    const before = store.nodeLayoutVersion
    const frame = new Map(Array.from({ length: 333 }, (_, i) => [`n${i}`, { x: i, y: 2 * i }] as const))
    store.setNodePositionsInMemory(frame)
    expect(store.nodeLayoutVersion).toBe(before + 1)
    expect(store.getNode('n5')).toMatchObject({ canvas_x: 5, canvas_y: 10 })
    expect(store.getNode('n400')).toMatchObject({ canvas_x: 0, canvas_y: 0 })
  })

  it('writes nothing to the backend', () => {
    const store = seed(10)
    vi.mocked(invoke).mockClear()
    store.setNodePositionsInMemory(new Map([['n1', { x: 7, y: 8 }]]))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('skips ids that are not in the workspace', () => {
    const store = seed(3)
    expect(() => store.setNodePositionsInMemory(new Map([['gone', { x: 1, y: 1 }]]))).not.toThrow()
  })
})
