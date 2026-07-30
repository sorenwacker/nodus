import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePanelReveal } from '../composables/usePanelReveal'

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('usePanelReveal', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('opens when the pointer reaches the edge and closes when it leaves the panel', () => {
    const reveal = usePanelReveal()
    expect(reveal.isOpen.value).toBe(false)

    reveal.onEdgeEnter()
    expect(reveal.isOpen.value).toBe(true)

    reveal.onPanelLeave()
    expect(reveal.isOpen.value).toBe(false)
  })

  it('stays open while pinned, even when the pointer leaves', () => {
    const reveal = usePanelReveal()
    reveal.togglePin()
    expect(reveal.isOpen.value).toBe(true)

    reveal.onPanelLeave()
    expect(reveal.isOpen.value).toBe(true)

    reveal.togglePin()
    expect(reveal.isOpen.value).toBe(false)
  })

  it('does not close while the close guard is active (e.g. node drag)', () => {
    let dragging = true
    const reveal = usePanelReveal({ closeGuard: () => dragging })

    reveal.onEdgeEnter()
    reveal.onPanelLeave()
    expect(reveal.isOpen.value).toBe(true)

    dragging = false
    reveal.onPanelLeave()
    expect(reveal.isOpen.value).toBe(false)
  })

  it('clamps the width to the configured range', () => {
    const reveal = usePanelReveal({ minWidth: 200, maxWidth: 480 })

    reveal.setWidth(100)
    expect(reveal.width.value).toBe(200)

    reveal.setWidth(9999)
    expect(reveal.width.value).toBe(480)

    reveal.setWidth(300)
    expect(reveal.width.value).toBe(300)
  })

  it('persists the width and restores it on the next instance', () => {
    const first = usePanelReveal({ storageKey: 'test-panel-width' })
    first.setWidth(333)

    const second = usePanelReveal({ storageKey: 'test-panel-width' })
    expect(second.width.value).toBe(333)
  })

  it('ignores an invalid persisted width', () => {
    localStorageMock.store['test-panel-width'] = 'not-a-number'
    const reveal = usePanelReveal({ storageKey: 'test-panel-width', defaultWidth: 260 })
    expect(reveal.width.value).toBe(260)
  })
})
