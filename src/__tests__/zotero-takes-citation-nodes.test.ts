/**
 * "Add to Zotero" takes citation nodes, and fetched papers are citation nodes
 * (PRODUCT_DESIGN.md > Zotero takes citation nodes).
 *
 * The action took any node carrying a DOI, because the papers fetched from
 * Semantic Scholar were created without a type and stored as notes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import CanvasContextMenu from '../canvas/components/CanvasContextMenu.vue'
import { isCitationNode } from '../lib/citationNodes'
import { useCanvasZotero } from '../canvas/composables/util/useCanvasZotero'
import type { Node } from '../types'

const addNodesToLibrary = vi.hoisted(() => vi.fn())
vi.mock('../composables/useZotero', () => ({
  useZotero: () => ({ addNodesToZotero: addNodesToLibrary }),
}))

const getPaperByDOI = vi.hoisted(() => vi.fn())
const getReferences = vi.hoisted(() => vi.fn())
const getCitations = vi.hoisted(() => vi.fn())
vi.mock('../lib/semanticScholar', () => ({
  semanticScholar: { getPaperByDOI, getPaperById: vi.fn(), getReferences, getCitations },
}))

import { useCitationGraph } from '../composables/useCitationGraph'

const node = (id: string, node_type: string): Node =>
  ({ id, title: `Title of ${id}`, node_type, markdown_content: '---\ndoi: 10.1/x\n---\n', canvas_x: 0, canvas_y: 0, width: 300, height: 200 }) as unknown as Node

const paper = node('paper', 'citation')
const stub = node('stub', 'citation-stub')
const note = node('note', 'note')
const all = [paper, note, stub]
const added = (count: number) => ({ added: count, duplicates: 0, skipped: 0, errors: [], cancelled: false })

describe('what counts as a citation node', () => {
  it('is a citation or a citation stub, and no other type', () => {
    expect(isCitationNode(paper)).toBe(true)
    expect(isCitationNode(stub)).toBe(true)
    expect(isCitationNode(note)).toBe(false)
    expect(isCitationNode(node('t', 'tag'))).toBe(false)
  })
})

describe('adding to Zotero', () => {
  function canvasZotero(affected: string[]) {
    const showToast = vi.fn()
    const zotero = useCanvasZotero({
      store: { getNode: (id: string) => all.find(n => n.id === id) },
      getAffectedNodeIds: () => affected,
      showToast,
    })
    return { zotero, showToast }
  }

  beforeEach(() => addNodesToLibrary.mockReset())

  it('sends the citation nodes and names every other node as not one', async () => {
    addNodesToLibrary.mockResolvedValueOnce(added(2))
    const { zotero } = canvasZotero([])
    const report = await zotero.addNodesToZotero(all)
    expect(addNodesToLibrary).toHaveBeenCalledWith([paper, stub])
    expect(report).toEqual({ added: 2, duplicates: 0, skipped: 0, errors: ['Not a citation node: Title of note'] })
  })

  it('sends nothing when no node is a citation node', async () => {
    const { zotero } = canvasZotero([])
    const report = await zotero.addNodesToZotero([note])
    expect(addNodesToLibrary).not.toHaveBeenCalled()
    expect(report).toEqual({ added: 0, duplicates: 0, skipped: 0, errors: ['Not a citation node: Title of note'] })
  })

  it('counts the citation nodes of the selection for the menu', () => {
    expect(canvasZotero(['paper', 'note', 'stub']).zotero.citationNodeCount.value).toBe(2)
    expect(canvasZotero(['note']).zotero.citationNodeCount.value).toBe(0)
  })

  it('adds the citation nodes of the selection from the menu, without complaining about the notes in it', async () => {
    addNodesToLibrary.mockResolvedValueOnce(added(1))
    const { zotero, showToast } = canvasZotero(['paper', 'note'])
    await zotero.handleAddToZotero()
    expect(addNodesToLibrary).toHaveBeenCalledWith([paper])
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Added 1 item(s) to Zotero', 'success')
  })
})

describe('the context menu', () => {
  function menu(props: { doiCount: number; citationNodeCount: number }) {
    return mount(CanvasContextMenu, {
      props: {
        visible: true,
        position: { x: 10, y: 10 },
        nodeId: 'paper',
        nodeCount: 1,
        storylineSubmenu: false,
        workspaceSubmenu: false,
        entitySubmenu: false,
        storylines: [],
        workspaces: [],
        entities: [],
        currentWorkspaceId: null,
        hasDOI: props.doiCount > 0,
        ...props,
      },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
  }
  const label = en.contextMenu.addToZotero

  it('offers "Add to Zotero" for a citation node, with or without a DOI', () => {
    expect(menu({ doiCount: 0, citationNodeCount: 1 }).text()).toContain(label)
    expect(menu({ doiCount: 2, citationNodeCount: 2 }).text()).toContain(`${label} (2)`)
  })

  it('does not offer it for a note that carries a DOI', () => {
    const wrapper = menu({ doiCount: 1, citationNodeCount: 0 })
    expect(wrapper.text()).not.toContain(label)
    expect(wrapper.text()).toContain(en.contextMenu.fetchCitations)
  })
})

describe('papers fetched from Semantic Scholar', () => {
  beforeEach(() => {
    getPaperByDOI.mockReset().mockResolvedValue({ paperId: 'seed' })
    getReferences.mockReset().mockResolvedValue([{ paperId: 'r1', title: 'A cited paper', externalIds: { DOI: '10.1/r1' } }])
    getCitations.mockReset().mockResolvedValue([{ paperId: 'c1', title: 'A citing paper', externalIds: { DOI: '10.1/c1' } }])
  })

  it('are created as citation nodes, in both directions', async () => {
    const createNode = vi.fn(async () => ({ id: 'new' }))
    const graph = useCitationGraph({
      getNodes: () => [paper],
      getEdges: () => [],
      createNode,
      createEdge: vi.fn(async () => ({ id: 'e' })),
      getCurrentWorkspaceId: () => null,
    })
    await graph.fetchBothForNode('paper')
    expect(createNode).toHaveBeenCalledTimes(2)
    for (const [created] of createNode.mock.calls as unknown as Array<[{ title: string; node_type?: string }]>) {
      expect(created.node_type, created.title).toBe('citation')
    }
  })
})
