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

  it('opens on an edge push and stays open until closed', () => {
    const reveal = usePanelReveal()
    expect(reveal.isOpen.value).toBe(false)

    reveal.onEdgeEnter()
    expect(reveal.isOpen.value).toBe(true)

    reveal.close()
    expect(reveal.isOpen.value).toBe(false)
  })

  it('close releases a pin as well', () => {
    const reveal = usePanelReveal()
    reveal.togglePin()
    expect(reveal.isOpen.value).toBe(true)

    reveal.close()
    expect(reveal.isOpen.value).toBe(false)
    expect(reveal.pinned.value).toBe(false)
  })

  it('unpinning via toggle closes the panel', () => {
    const reveal = usePanelReveal()
    reveal.togglePin()
    reveal.togglePin()
    expect(reveal.isOpen.value).toBe(false)
  })

  it('clamps the size to the configured range', () => {
    const reveal = usePanelReveal({ minSize: 200, maxSize: 480 })

    reveal.setSize(100)
    expect(reveal.size.value).toBe(200)

    reveal.setSize(9999)
    expect(reveal.size.value).toBe(480)

    reveal.setSize(300)
    expect(reveal.size.value).toBe(300)
  })

  it('persists the size and restores it on the next instance', () => {
    const first = usePanelReveal({ storageKey: 'test-panel-width' })
    first.setSize(333)

    const second = usePanelReveal({ storageKey: 'test-panel-width' })
    expect(second.size.value).toBe(333)
  })

  it('ignores an invalid persisted size', () => {
    localStorageMock.store['test-panel-width'] = 'not-a-number'
    const reveal = usePanelReveal({ storageKey: 'test-panel-width', defaultSize: 260 })
    expect(reveal.size.value).toBe(260)
  })
})

describe('usePanelReveal vertical panels', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function drag(panel: ReturnType<typeof usePanelReveal>, from: number, to: number, axis: 'x' | 'y') {
    const down = new PointerEvent('pointerdown', { clientX: axis === 'x' ? from : 0, clientY: axis === 'y' ? from : 0 })
    panel.beginResize(down)
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: axis === 'x' ? to : 0, clientY: axis === 'y' ? to : 0 })
    )
    document.dispatchEvent(new PointerEvent('pointerup'))
  }

  it('grows a bottom sheet when its separator is dragged upward', () => {
    const sheet = usePanelReveal({ side: 'bottom', minSize: 100, maxSize: 800, defaultSize: 200 })
    // Dragging up means a smaller clientY, and a taller sheet
    drag(sheet, 600, 500, 'y')
    expect(sheet.size.value).toBe(300)
  })

  it('shrinks a bottom sheet when its separator is dragged downward', () => {
    const sheet = usePanelReveal({ side: 'bottom', minSize: 100, maxSize: 800, defaultSize: 300 })
    drag(sheet, 500, 560, 'y')
    expect(sheet.size.value).toBe(240)
  })

  it('widens a left panel dragged right and a right panel dragged left', () => {
    const left = usePanelReveal({ side: 'left', minSize: 100, maxSize: 800, defaultSize: 300 })
    drag(left, 300, 380, 'x')
    expect(left.size.value).toBe(380)

    const right = usePanelReveal({ side: 'right', minSize: 100, maxSize: 800, defaultSize: 300 })
    drag(right, 300, 220, 'x')
    expect(right.size.value).toBe(380)
  })

  it('reports whether the user has chosen a size, so callers can size to content until then', () => {
    const sheet = usePanelReveal({ side: 'bottom', storageKey: 'test-sheet-height', defaultSize: 200 })
    expect(sheet.hasStoredSize.value).toBe(false)

    sheet.setSize(320)
    expect(sheet.hasStoredSize.value).toBe(true)

    const reopened = usePanelReveal({ side: 'bottom', storageKey: 'test-sheet-height', defaultSize: 200 })
    expect(reopened.hasStoredSize.value).toBe(true)
    expect(reopened.size.value).toBe(320)
  })

  it('clamps a dragged size to the configured range', () => {
    const sheet = usePanelReveal({ side: 'bottom', minSize: 150, maxSize: 400, defaultSize: 200 })
    drag(sheet, 600, 100, 'y') // far beyond the maximum
    expect(sheet.size.value).toBe(400)
    drag(sheet, 300, 900, 'y') // far below the minimum
    expect(sheet.size.value).toBe(150)
  })
})
