/**
 * Printing the canvas to one PDF page (PRODUCT_DESIGN.md > Printing the canvas).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '../i18n/locales/en.json'
import CanvasContextMenu from '../canvas/components/CanvasContextMenu.vue'
import CanvasControls from '../canvas/components/CanvasControls.vue'
import { nodesToPrint, edgesToPrint, canvasToTypst, borderPoint, PRINT_MARGIN } from '../lib/canvasPrint'
import type { Node, Edge } from '../types'

const node = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node =>
  ({ id, title: `Title ${id}`, node_type: 'note', markdown_content: `Body of ${id}`, canvas_x: x, canvas_y: y, width: 200, height: 120, color_theme: null, ...extra }) as Node
const edge = (id: string, source: string, target: string, extra: Partial<Edge> = {}): Edge =>
  ({ id, source_node_id: source, target_node_id: target, label: null, color: null, directed: true, link_type: 'related', ...extra }) as Edge

const a = node('a', 100, 100)
const b = node('b', 600, 100)
const c = node('c', 100, 500)
const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('aa', 'a', 'a')]

describe('what is printed', () => {
  it('is the selection, or every node when nothing is selected', () => {
    expect(nodesToPrint([a, b, c], ['b', 'gone'])).toEqual([b])
    expect(nodesToPrint([a, b, c], [])).toEqual([a, b, c])
  })

  it('includes only edges with both ends printed, and no edge from a node to itself', () => {
    expect(edgesToPrint([a, b], edges).map(e => e.id)).toEqual(['ab'])
    expect(edgesToPrint([a, b, c], edges).map(e => e.id)).toEqual(['ab', 'bc'])
  })
})

describe('the page', () => {
  it('is the bounding box of the nodes plus a margin, one canvas unit to a point', () => {
    const source = canvasToTypst([a, b, c], [])
    const width = 800 - 100 + 2 * PRINT_MARGIN
    const height = 620 - 100 + 2 * PRINT_MARGIN
    expect(source).toContain(`#set page(width: ${width}pt, height: ${height}pt, margin: 0pt, fill: white)`)
  })

  it('places each card at its position relative to the box, at its size, clipped', () => {
    const source = canvasToTypst([a, b], [])
    expect(source).toContain(`dx: ${PRINT_MARGIN}pt, dy: ${PRINT_MARGIN}pt, block(width: 200pt, height: 120pt`)
    expect(source).toContain(`dx: ${500 + PRINT_MARGIN}pt, dy: ${PRINT_MARGIN}pt, block(width: 200pt, height: 120pt`)
    expect(source).toMatch(/clip: true/)
  })

  it('carries title and content as string literals, so no character of a note is read as markup', () => {
    const tricky = node('t', 0, 0, { title: 'A "quoted" #title', markdown_content: '---\ndoi: 10.1/x\n---\n\nUses #tag, $5, @ref and a \\ backslash' })
    const source = canvasToTypst([tricky], [])
    expect(source).toContain('"A \\"quoted\\" #title"')
    expect(source).toContain('"Uses #tag, $5, @ref and a \\\\ backslash"')
    expect(source).not.toContain('doi: 10.1/x')
  })

  it('keeps headings, bold, italic, code and list items', () => {
    const rich = node('r', 0, 0, { markdown_content: '## Head\n\nSome **bold** and *slanted* and `code`\n- item one' })
    const source = canvasToTypst([rich], [])
    expect(source).toContain('#text(weight: "bold", "Head")')
    expect(source).toContain('#strong("bold")')
    expect(source).toContain('#emph("slanted")')
    expect(source).toContain('#raw("code")')
    expect(source).toContain('"• "')
  })

  it('draws a tag node with its title alone', () => {
    const tag = node('g', 0, 0, { node_type: 'tag', title: '#topic', markdown_content: 'hidden body', width: 70, height: 22 })
    const source = canvasToTypst([tag], [])
    expect(source).toContain('"#topic"')
    expect(source).not.toContain('hidden body')
  })

  it('tints a card with the node colour and falls back to white', () => {
    expect(canvasToTypst([node('k', 0, 0, { color_theme: 'rgba(59, 130, 246, 0.18)' })], [])).toContain('rgb(59, 130, 246, 18%)')
    expect(canvasToTypst([node('k', 0, 0, { color_theme: '#fee2e2' })], [])).toContain('rgb("#fee2e2")')
    expect(canvasToTypst([node('k', 0, 0, { color_theme: 'url(javascript:1)' })], [])).not.toContain('javascript')
  })

  it('prints light text on a dark card, and dark text on a light or tinted one', () => {
    expect(canvasToTypst([node('k', 0, 0, { color_theme: '#3d3d0a' })], [])).toContain('#set text(fill: white);')
    expect(canvasToTypst([node('k', 0, 0, { color_theme: '#fee2e2' })], [])).not.toContain('fill: white);')
    expect(canvasToTypst([node('k', 0, 0, { color_theme: 'rgba(0, 0, 0, 0.18)' })], [])).not.toContain('fill: white);')
  })

  it('drops quote markers, rules and table separator rows', () => {
    const source = canvasToTypst([node('q', 0, 0, { markdown_content: '> Quoted line\n\n---\n\n| a | b |\n|---|---|\nafter' })], [])
    expect(source).toContain('"Quoted line"')
    expect(source).not.toContain('">')
    expect(source).not.toContain('---')
    expect(source).toContain('"after"')
  })

  it('prints no selection, hover or theme state: the same nodes give the same page', () => {
    expect(canvasToTypst([a, b], [edges[0]])).toBe(canvasToTypst([{ ...a }, { ...b }], [{ ...edges[0] }]))
  })
})

describe('edges on the page', () => {
  it('meet the border of a card on the line between the centres', () => {
    expect(borderPoint(a, { x: 700, y: 160 })).toEqual({ x: 300, y: 160 })
    expect(borderPoint(a, { x: 200, y: 1000 })).toEqual({ x: 200, y: 220 })
  })

  it('run from border to border with an arrowhead at the target', () => {
    const source = canvasToTypst([a, b], [edges[0]])
    // a's right border at x=300 and b's left border at x=600, both shifted by -100 + margin
    expect(source).toMatch(new RegExp(`line\\(start: \\(${200 + PRINT_MARGIN}pt, ${60 + PRINT_MARGIN}pt\\)`))
    expect(source).toMatch(/polygon\(/)
    expect(source).toContain(`(${500 + PRINT_MARGIN}pt, ${60 + PRINT_MARGIN}pt)`)
  })

  it('have no arrowhead when undirected, and print their label', () => {
    const source = canvasToTypst([a, b], [edge('ab', 'a', 'b', { directed: false, label: 'supports' })])
    expect(source).not.toMatch(/polygon\(/)
    expect(source).toContain('"supports"')
  })

  it('are drawn before the cards, which cover what runs beneath them', () => {
    const source = canvasToTypst([a, b], [edges[0]])
    expect(source.indexOf('line(')).toBeLessThan(source.indexOf('block('))
  })
})

describe('where the action is', () => {
  const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })

  it('is in the context menu of a node', async () => {
    const wrapper = mount(CanvasContextMenu, {
      props: { visible: true, position: { x: 0, y: 0 }, nodeId: 'a', nodeCount: 1, storylineSubmenu: false, workspaceSubmenu: false, entitySubmenu: false, storylines: [], workspaces: [], entities: [], currentWorkspaceId: null },
      global: { plugins: [i18n()] },
    })
    const item = wrapper.findAll('.context-menu-item').find(el => el.text() === en.contextMenu.printToPdf)
    expect(item).toBeDefined()
    await item!.trigger('click')
    expect(wrapper.emitted('print-to-pdf')).toHaveLength(1)
  })

  it('is in the canvas controls', async () => {
    const source = readFileSync(resolve(__dirname, '../canvas/components/CanvasControls.vue'), 'utf8')
    expect(source).toMatch(/class="print-pdf"[\s\S]*?emit\('printToPdf'\)/)
    expect(CanvasControls).toBeDefined()
  })

  it('is wired to one function in the canvas, which saves what was compiled', () => {
    const canvas = readFileSync(resolve(__dirname, '../canvas/GraphCanvas.vue'), 'utf8')
    expect(canvas).toMatch(/@print-to-pdf="printToPdf\(contextMenu\.affectedNodeIds\.value\)"/)
    expect(canvas).toMatch(/@print-to-pdf="printToPdf\(store\.selectedNodeIds\)"/)
    expect(canvas).toMatch(/const \{ printToPdf \} = useCanvasPrint\(/)
    const print = readFileSync(resolve(__dirname, '../canvas/composables/util/useCanvasPrint.ts'), 'utf8')
    expect(print).toMatch(/printCanvasToPdf\([\s\S]*?saveExportFile\(/)
  })
})
