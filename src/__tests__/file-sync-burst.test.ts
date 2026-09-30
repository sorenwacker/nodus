/**
 * A burst of external changes reloads the edges once
 * (PRODUCT_DESIGN.md > File Watcher Logic).
 *
 * Each changed file reloaded every edge, and a reload re-routes and redraws
 * them all. An agent rewriting 150 notes at once kept Nodus at several cores
 * for minutes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  readTextFile: vi.fn(),
  readTextFileWithChecksum: vi.fn(async () => ({ content: 'changed', checksum: 'new' })),
  createNodeFromFile: vi.fn(),
  syncNodeWikilinks: vi.fn(async () => 0),
  getWorkspace: vi.fn(async () => ({ sync_enabled: true })),
  isTauri: () => true,
}))
vi.mock('../composables/useNotifications', () => ({
  notifications$: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

const FILES = Array.from({ length: 20 }, (_, i) => `/vault/Note ${i}.md`)

async function setup() {
  const { useFileSync } = await import('../composables/useFileSync')
  const reloadEdges = vi.fn(async () => {})
  const nodes = FILES.map((file_path, i) => ({ id: `n${i}`, title: `Note ${i}`, file_path, markdown_content: 'old', checksum: 'old' }))
  const sync = useFileSync({
    getNodes: () => nodes,
    updateNodeInPlace: vi.fn(),
    addNode: vi.fn(),
    removeNode: vi.fn(),
    getCurrentWorkspaceId: () => 'ws1',
    getEditingNodeId: () => null,
    reloadEdges,
  } as never)
  return { sync, reloadEdges }
}

describe('a burst of external changes', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('reloads the edges once, after the burst', async () => {
    const { sync, reloadEdges } = await setup()
    for (const path of FILES) await sync.handleFileChange({ change_type: 'Modified', path, new_checksum: 'new' } as never)

    expect(reloadEdges).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(reloadEdges).toHaveBeenCalledTimes(1)
  })

  it('cancels a waiting reload when the watcher stops', async () => {
    const { sync, reloadEdges } = await setup()
    await sync.handleFileChange({ change_type: 'Modified', path: FILES[0], new_checksum: 'new' } as never)
    await sync.stopWatching()
    await vi.advanceTimersByTimeAsync(1000)
    expect(reloadEdges).not.toHaveBeenCalled()
  })
})
