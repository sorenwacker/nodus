import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useCanvasNodeStyle, type UseCanvasNodeStyleContext } from '../useCanvasNodeStyle'

function makeContext(scale: number): UseCanvasNodeStyleContext {
  return {
    scale: ref(scale),
    offsetX: ref(0),
    offsetY: ref(0),
    resizingNode: ref(null),
    resizePreview: ref({ x: 0, y: 0, width: 0, height: 0 }),
    nodeZOrder: ref(new Map()),
    nodeBorderWidth: computed(() => Math.max(1, 2 / scale)),
    isSemanticZoomCollapsed: computed(() => false),
    selectedNodeIds: computed(() => []),
    currentTheme: ref('light'),
  }
}

describe('useCanvasNodeStyle.getNodeStyle (anti-wiggle scaling)', () => {
  it('renders the card at logical size and scales it with a single transform', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(2))
    const style = getNodeStyle({ id: 'n1', canvas_x: 10, canvas_y: 20, width: 180, height: 90 })

    // Box stays at logical size; the transform supplies the zoom, so text and
    // box scale as one unit instead of via independent --zoom-scale rounding.
    expect(style.width).toBe('180px')
    expect(style.height).toBe('90px')
    expect(style['--zoom-scale']).toBe('1')
    expect(style.transform).toContain('scale(2)')
    expect(style.transformOrigin).toBe('0 0')
  })

  it('positions the top-left corner in screen space (translate before scale)', () => {
    const { getNodeStyle } = useCanvasNodeStyle(makeContext(2))
    const style = getNodeStyle({ id: 'n1', canvas_x: 10, canvas_y: 20, width: 180, height: 90 })
    // screen corner = canvas * scale + offset = 20, 40
    expect(style.transform).toBe('translate(20px, 40px) scale(2)')
  })

  it('keeps a constant 2px on-screen border across zoom levels', () => {
    // logical border * scale (applied by transform) reproduces the old constant width
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
