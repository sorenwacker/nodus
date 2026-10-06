/**
 * The line stops under its arrowhead (PRODUCT_DESIGN.md > The line under an
 * arrowhead).
 *
 * The head was drawn over the last 20 canvas units of a line that widens as
 * the view zooms out, so the line's square end showed through the tip.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasEdgesSVG from '../canvas/components/CanvasEdgesSVG.vue'
import { ARROW_OFFSET } from '../canvas/routing'
import {
  ARROW_HEAD_OVERLAP,
  HIGHLIGHT_WIDTH_FACTOR,
  arrowHeadLength,
  lineUnderArrowHead,
  shortenPathEnd,
} from '../canvas/routing/arrowHead'
import { strokedPath } from '../canvas/composables/edges/useEdgeVisibility'
import type { VisibleEdgeLine } from '../canvas/composables/edges'

/** The last point of a path */
function endOf(d: string): { x: number; y: number } {
  const numbers = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number)
  return { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] }
}

describe('shortening the end of a path', () => {
  it('moves the end of a line back along the line', () => {
    expect(endOf(shortenPathEnd('M0,0 L100,0', 30))).toEqual({ x: 70, y: 0 })
    const diagonal = endOf(shortenPathEnd('M0,0 L30,40', 10))
    expect(diagonal.x).toBeCloseTo(24)
    expect(diagonal.y).toBeCloseTo(32)
  })

  it('shortens only the last segment of a routed path', () => {
    const d = 'M0,0 L94,0 Q100,0 100,6 L100,200'
    const shortened = shortenPathEnd(d, 50)
    expect(shortened.startsWith('M0,0 L94,0 Q100,0 100,6 L')).toBe(true)
    expect(endOf(shortened)).toEqual({ x: 100, y: 150 })
  })

  it('moves the end of a curve back toward its last control point', () => {
    const shortened = shortenPathEnd('M0,0 C50,0 50,100 100,100', 20)
    expect(shortened.startsWith('M0,0 C50,0 50,100 ')).toBe(true)
    expect(endOf(shortened)).toEqual({ x: 80, y: 100 })
  })

  it('keeps a stub of a segment shorter than the cut, so the direction survives', () => {
    const end = endOf(shortenPathEnd('M0,0 L50,0 L50,10', 30))
    expect(end.x).toBe(50)
    expect(end.y).toBeGreaterThan(0)
    expect(end.y).toBeLessThan(1)
  })

  it('leaves a path alone when there is nothing to cut', () => {
    expect(shortenPathEnd('M0,0 L100,0', 0)).toBe('M0,0 L100,0')
    expect(shortenPathEnd('', 10)).toBe('')
  })
})

describe('the size of an arrowhead', () => {
  it('is 20 canvas units at normal zoom', () => {
    expect(arrowHeadLength(1.5)).toBe(20)
  })

  it.each([0.5, 1.5, 3.75, 7.5, 15, 30])('covers the end of a highlighted line %d units wide', strokeWidth => {
    const head = arrowHeadLength(strokeWidth)
    const line = strokeWidth * HIGHLIGHT_WIDTH_FACTOR
    expect(head).toBeGreaterThanOrEqual(4 * line)
    // A triangle as wide as it is long: its half-width where the line ends
    const halfWidthAtLineEnd = (head / 2) * (1 - ARROW_HEAD_OVERLAP)
    expect(halfWidthAtLineEnd).toBeGreaterThan(line)
  })

  it.each([1.5, 7.5])('puts the tip the arrow offset beyond the routed end, at a line width of %d', strokeWidth => {
    const lineEnd = endOf(lineUnderArrowHead('M0,0 L400,0', strokeWidth))
    const tip = lineEnd.x + arrowHeadLength(strokeWidth) * (1 - ARROW_HEAD_OVERLAP)
    expect(tip).toBeCloseTo(400 + ARROW_OFFSET)
    expect(lineEnd.y).toBe(0)
  })
})

describe('the path that is stroked', () => {
  const routed = { path: 'M0,0 L400,0', isBidirectional: false, isShortEdge: false }

  it('ends under the head of an edge that carries one', () => {
    expect(strokedPath(routed, 1.5)).toBe(lineUnderArrowHead(routed.path, 1.5))
    expect(endOf(strokedPath(routed, 1.5)).x).toBeLessThan(400)
  })

  it('is the full path of an edge without a head', () => {
    expect(strokedPath({ ...routed, isBidirectional: true }, 1.5)).toBe(routed.path)
    expect(strokedPath({ ...routed, isShortEdge: true }, 1.5)).toBe(routed.path)
  })
})

describe('the edge layer', () => {
  function edge(overrides: Partial<VisibleEdgeLine>): VisibleEdgeLine {
    return {
      id: 'e',
      path: 'M0,0 L400,0',
      linePath: 'M0,0 L387,0',
      color: '#111111',
      edgeHighlightColor: '#222222',
      arrowMarkerId: 'arrow-111111',
      isHighlighted: false,
      isSelected: false,
      isBidirectional: false,
      isShortEdge: false,
      isNeighborEdge: false,
      opacity: 1,
      renderStrokeWidth: 7.5,
      glowStrokeWidth: 30,
      ...overrides,
    } as VisibleEdgeLine
  }

  function mountLayer(edges: VisibleEdgeLine[], simplified: boolean, edgeStrokeWidth: number) {
    return mount(CanvasEdgesSVG, {
      props: {
        edges,
        simplified,
        edgeStrokeWidth,
        edgeLabelSize: 12,
        zoom: 1,
        edgeLabelZoomThreshold: 0,
        lassoPoints: [],
        isLassoSelecting: false,
        currentTheme: 'light',
        highlightColor: '#222222',
        isCreatingEdge: false,
        edgePreviewStart: null,
        edgePreviewEnd: { x: 0, y: 0 },
      },
    })
  }

  it('sizes the head by the line and anchors it where the line ends', () => {
    const marker = mountLayer([edge({})], false, 7.5).find('marker')
    expect(Number(marker.attributes('markerWidth'))).toBe(arrowHeadLength(7.5))
    expect(Number(marker.attributes('markerHeight'))).toBe(arrowHeadLength(7.5))
    expect(Number(marker.attributes('refX'))).toBe(10 * ARROW_HEAD_OVERLAP)
  })

  it('strokes the shortened line under a head and keeps the full path to click on', () => {
    const wrapper = mountLayer([edge({})], false, 7.5)
    expect(wrapper.find('.edge-line-visible').attributes('d')).toBe('M0,0 L387,0')
    expect(wrapper.find('.edge-line-visible').attributes('marker-end')).toBe('url(#arrow-111111)')
    expect(wrapper.find('.edge-hit-area').attributes('d')).toBe('M0,0 L400,0')
  })

  it('gives an edge without a head no marker', () => {
    const wrapper = mountLayer([edge({ isBidirectional: true, linePath: 'M0,0 L400,0' })], false, 7.5)
    expect(wrapper.find('.edge-line-visible').attributes('marker-end')).toBeUndefined()
  })

  it('does the same in the simplified layer, where only highlighted edges carry a head', () => {
    const wrapper = mountLayer([edge({ id: 'plain' }), edge({ id: 'lit', isHighlighted: true })], true, 7.5)
    const [plain, lit] = wrapper.findAll('.edge-line-fast')
    expect(plain.attributes('d')).toBe('M0,0 L400,0')
    expect(plain.attributes('marker-end')).toBeUndefined()
    expect(lit.attributes('d')).toBe('M0,0 L387,0')
    expect(lit.attributes('marker-end')).toBeDefined()
  })
})
