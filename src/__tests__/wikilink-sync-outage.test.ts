/**
 * A backend failure is not the same as no backend.
 *
 * `updateNodeContent` treated any rejection from `sync_node_wikilinks` as
 * "running without a backend" and fell back to a title-only local diff. That
 * resolver cannot see folder path links or `#section` anchors, so it read the
 * edges the backend had created for them as removed and deleted them. One
 * transient failure destroyed real edges, with nothing reported
 * (PRODUCT_DESIGN.md > Syncing wikilink edges).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const isTauri = vi.fn(() => true)

vi.mock('../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => isTauri(),
}))

const notifyError = vi.fn()
vi.mock('../composables/useNotifications', () => ({
  useNotifications: () => ({ notifyError }),
}))

describe('wikilink sync when the backend is present', () => {
  beforeEach(() => {
    invoke.mockReset()
    notifyError.mockReset()
    isTauri.mockReturnValue(true)
  })

  it('does not run the lossy local fallback when the backend call fails', async () => {
    const { syncWikilinks } = await import('../stores/nodes/wikilinkSync')

    invoke.mockImplementation((command: string) => {
      if (command === 'sync_node_wikilinks') return Promise.reject(new Error('database is locked'))
      return Promise.resolve(null)
    })
    const localFallback = vi.fn()

    const outcome = await syncWikilinks('n1', 'body with [[folder/note]]', {
      reloadEdges: vi.fn(),
      localFallback,
    })

    expect(localFallback).not.toHaveBeenCalled()
    expect(outcome).toBe('not_synced')
  })

  it('uses the local fallback only when there is no backend at all', async () => {
    const { syncWikilinks } = await import('../stores/nodes/wikilinkSync')
    isTauri.mockReturnValue(false)
    const localFallback = vi.fn()

    const outcome = await syncWikilinks('n1', 'body', {
      reloadEdges: vi.fn(),
      localFallback,
    })

    expect(localFallback).toHaveBeenCalledOnce()
    expect(outcome).toBe('synced_locally')
  })

  it('reloads edges after a successful backend sync', async () => {
    const { syncWikilinks } = await import('../stores/nodes/wikilinkSync')
    invoke.mockResolvedValue(2)
    const reloadEdges = vi.fn()

    const outcome = await syncWikilinks('n1', 'body', {
      reloadEdges,
      localFallback: vi.fn(),
    })

    expect(reloadEdges).toHaveBeenCalledOnce()
    expect(outcome).toBe('synced')
  })
})
