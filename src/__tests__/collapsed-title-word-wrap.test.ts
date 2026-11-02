/**
 * A collapsed title fits the way the browser wraps it: whole words, measured
 * at the title's font (PRODUCT_DESIGN.md > Collapsed node titles).
 */
import { describe, it, expect } from 'vitest'
import { computed, ref } from 'vue'
import { useCanvasNodeStyle } from '../canvas/composables/nodes/useCanvasNodeStyle'
import { wrappedLineCount } from '../canvas/utils/collapsedTitleFit'

/** Bold capitals are wider than the 0.52em average the character count assumed */
const measureTitle = (text: string, size: number) => text.length * 0.62 * size

function titleStyle(title: string, measure = measureTitle) {
  const { getNodeStyle } = useCanvasNodeStyle({
    resizingNode: ref(null),
    resizePreview: ref({ x: 0, y: 0, width: 0, height: 0 }),
    nodeZOrder: ref(new Map()),
    nodeBorderWidth: computed(() => 2),
    isSemanticZoomCollapsed: computed(() => true),
    selectedNodeIds: computed(() => []),
    highlightedNodeIds: computed(() => new Set<string>()),
    currentTheme: ref('dark'),
    measureTitle: measure,
  } as never)
  const style = getNodeStyle({
    id: 'n1',
    title,
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    node_type: 'note',
    color_theme: null,
  } as never)
  return { size: parseFloat(style['--title-size']), lines: Number(style['--title-lines']) }
}

/** Greedy word wrap, as the browser lays out the header */
function wrappedLines(title: string, size: number): number {
  const width = 200 - 2 * 10 - 2 * 2
  let lines = 1
  let line = ''
  for (const word of title.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (line && measureTitle(candidate, size) > width) {
      lines++
      line = word
    } else {
      line = candidate
    }
  }
  return lines
}

describe('collapsed title fit', () => {
  it('shrinks a title of three medium words until the words fit the lines', () => {
    const { size, lines } = titleStyle('DataCite Metadata Schema')
    expect(size).toBeLessThan(28)
    expect(wrappedLines('DataCite Metadata Schema', size)).toBeLessThanOrEqual(lines)
  })

  it('keeps a short title at full size', () => {
    expect(titleStyle('Ontology').size).toBe(28)
  })

  it('counts a word wider than the line as broken across lines', () => {
    // 10 px a character into a 40 px line: "Abcdefghij" fills three lines, "x" joins the last
    const measure = (text: string) => text.length * 10
    expect(wrappedLineCount('Abcdefghij x', 40, 10, measure)).toBe(3)
    expect(wrappedLineCount('ab cd', 40, 10, measure)).toBe(2)
  })
})
