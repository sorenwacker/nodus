import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasEdgesSVG from '../canvas/components/CanvasEdgesSVG.vue'
import type { VisibleEdgeLine } from '../canvas/composables/edges'
import { displayStorage } from '../lib/storage'

function makeEdge(overrides: Partial<VisibleEdgeLine> = {}): VisibleEdgeLine {
  return {
    id: 'e1',
    source_node_id: 'a',
    target_node_id: 'b',
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 100,
    labelX: 50,
    labelY: 50,
    path: 'M0,0 L100,100',
    style: 'straight',
    strokeWidth: 2,
    hitX1: 0,
    hitY1: 0,
    hitX2: 100,
    hitY2: 100,
    link_type: 'related',
    color: '#888888',
    label: 'supports',
    isBidirectional: false,
    isShortEdge: false,
    isHighlighted: false,
    isSelected: false,
    isNeighborEdge: false,
    opacity: 1,
    edgeHighlightColor: '#3b82f6',
    renderStrokeWidth: 2,
    glowStrokeWidth: 6,
    arrowMarkerId: 'arrow-888888',
    ...overrides,
  }
}

function mountEdges(zoom: number, edgeLabelZoomThreshold: number) {
  return mount(CanvasEdgesSVG, {
    props: {
      edges: [makeEdge()],
      simplified: false,
      edgeStrokeWidth: 2,
      edgeLabelSize: 12,
      zoom,
      edgeLabelZoomThreshold,
      lassoPoints: [],
      isLassoSelecting: false,
      currentTheme: 'light',
      highlightColor: '#3b82f6',
      isCreatingEdge: false,
      edgePreviewStart: null,
      edgePreviewEnd: { x: 0, y: 0 },
    },
  })
}

describe('edge label zoom threshold', () => {
  it('renders the label when zoom is at or above the threshold', () => {
    expect(mountEdges(0.5, 0.5).find('.edge-label').exists()).toBe(true)
    expect(mountEdges(1.0, 0.5).find('.edge-label').exists()).toBe(true)
  })

  it('hides the label when zoom is below the threshold', () => {
    expect(mountEdges(0.4, 0.5).find('.edge-label').exists()).toBe(false)
  })

  it('always renders the label when the threshold is 0', () => {
    expect(mountEdges(0.05, 0).find('.edge-label').exists()).toBe(true)
  })

  it('defaults the stored threshold to 0.5 and persists changes', () => {
    localStorage.removeItem('nodus-edge-label-zoom-threshold')
    expect(displayStorage.getEdgeLabelZoomThreshold()).toBe(0.5)
    displayStorage.setEdgeLabelZoomThreshold(0.3)
    expect(displayStorage.getEdgeLabelZoomThreshold()).toBe(0.3)
    localStorage.removeItem('nodus-edge-label-zoom-threshold')
  })
})
