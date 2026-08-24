import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useCanvasNodeStyle, type UseCanvasNodeStyleContext } from '../useCanvasNodeStyle'

function makeContext(scale: number): UseCanvasNodeStyleContext {
  return {
    resizingNode: ref(null),
    resizePreview: ref({ x: 0, y: 0, width: 0, height: 0 }),
    nodeZOrder: ref(new Map()),
    nodeBorderWidth: computed(() => Math.max(1, 2 / scale)),
    isSemanticZoomCollapsed: computed(() => false),
    selectedNodeIds: computed(() => []),
    currentTheme: ref('light'),
  }
}

describe('useCanvasNodeStyle.getNodeStyle (container-transform scaling)', () => {
  it('renders the card at logical size in canvas coordinates', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(2))
    const style = getNodeStyle({ id: 'n1', canvas_x: 10, canvas_y: 20, width: 180, height: 90 })

    // Box stays at logical size; the nodes-layer container supplies pan and
    // zoom, so the card's style never changes during either
    // (PRODUCT_DESIGN.md > Canvas rendering)
    expect(style.width).toBe('180px')
    expect(style.height).toBe('90px')
    expect(style['--zoom-scale']).toBe('1')
    expect(style.transform).toBe('translate(10px, 20px)')
    expect(style.transformOrigin).toBe('0 0')
  })

  it('keeps a constant 2px on-screen border across zoom levels', () => {
    // logical border * scale (applied by the container transform) reproduces
    // the constant on-screen width
    for (const scale of [0.5, 1, 2]) {
      const { getNodeStyle } = useCanvasNodeStyle(makeContext(scale))
      const style = getNodeStyle({ id: 'n1', canvas_x: 0, canvas_y: 0, width: 180, height: 90 })
      const logicalBorder = parseFloat(style.borderWidth)
      expect(logicalBorder * scale).toBeCloseTo(2, 5)
    }
  })

  it('lets tag nodes fit their content', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(1.5))
    const style = getNodeStyle({ id: 't1', canvas_x: 0, canvas_y: 0, node_type: 'tag' })
    expect(style.width).toBe('fit-content')
    expect(style.height).toBe('fit-content')
  })
})

describe('collapsed title line budget', () => {
  // A fixed line count cuts a long title mid-line on a tall card and wastes
  // space on a short one (PRODUCT_DESIGN.md > Collapsed node titles)
  it('gives a default-height card two lines', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(1))
    const style = getNodeStyle({ id: 'n1', canvas_x: 0, canvas_y: 0, width: 200, height: 120 })

    expect(style['--title-lines']).toBe('2')
  })

  it('gives a taller card more lines', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(1))
    const style = getNodeStyle({ id: 'n1', canvas_x: 0, canvas_y: 0, width: 400, height: 300 })

    expect(Number(style['--title-lines'])).toBeGreaterThan(2)
  })

  it('never drops below one line, however short the card', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(1))
    const style = getNodeStyle({ id: 'n1', canvas_x: 0, canvas_y: 0, width: 200, height: 30 })

    expect(style['--title-lines']).toBe('1')
  })
})

describe('line budget accounts for what actually consumes the card', () => {
  // Assuming the base type size and ignoring the border overestimates the
  // budget, and the overestimate is a line cut through the middle
  // (PRODUCT_DESIGN.md > Collapsed node titles)
  function budgetFor(height: number, fontScale: number): number {
    const ctx = makeContext(1)
    const { getNodeStyle } = useCanvasNodeStyle({ ...ctx, fontScale: ref(fontScale) })
    return Number(
      getNodeStyle({ id: 'n1', canvas_x: 0, canvas_y: 0, width: 200, height })['--title-lines']
    )
  }

  it('gives fewer lines when the user enlarges the font', () => {
    expect(budgetFor(200, 1.4)).toBeLessThan(budgetFor(200, 1))
  })

  it('never budgets more lines than the card can show', () => {
    const BORDER = 4
    const PADDING = 28
    for (const scale of [0.8, 1, 1.25, 1.5]) {
      for (const height of [80, 120, 160, 240, 400]) {
        const lines = budgetFor(height, scale)
        const needed = lines * 28 * scale * 1.2 + PADDING + BORDER
        // One line is the floor even when nothing fits, so only check above it
        if (lines > 1) {
          expect(needed, `h=${height} scale=${scale} lines=${lines}`).toBeLessThanOrEqual(height)
        }
      }
    }
  })
})
