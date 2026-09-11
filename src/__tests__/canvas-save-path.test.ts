/**
 * Saving from the canvas editor keeps the frontmatter and ends the edit
 * (PRODUCT_DESIGN.md > Saving from the canvas editor).
 *
 * The canvas bound the save of its event handlers, which wrote the editor's
 * body alone and cleared the editing node without telling the store. Every
 * canvas save dropped the node's frontmatter, and the file watcher kept
 * ignoring changes to the last edited node for the rest of the session.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useNodeEditor } from '../canvas/composables/nodes/useNodeEditor'
import { useCanvasEventHandlers } from '../canvas/composables/util/useCanvasEventHandlers'
import type { Node } from '../types'

function makeNode(content: string, autoFit = false): Node {
  return {
    id: 'n1',
    title: 'Alpha',
    file_path: null,
    markdown_content: content,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
    frame_id: null,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: null,
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    auto_fit: autoFit,
  } as Node
}

/** The node editor and the canvas event handlers, wired as GraphCanvas wires them */
function wireCanvas(content: string, autoFit = false) {
  const node = makeNode(content, autoFit)
  const updateNodeContent = vi.fn().mockResolvedValue(undefined)
  const setEditingNode = vi.fn()
  const renderMermaidDiagrams = vi.fn()
  const fitNodeToContent = vi.fn()
  const editor = useNodeEditor({
    store: {
      getNode: () => node,
      updateNodeContent,
      updateNodeTitle: vi.fn().mockResolvedValue(undefined),
      setEditingNode,
    },
  })
  const handlers = useCanvasEventHandlers({
    editingNodeId: editor.editingNodeId,
    showNodeSearch: editor.showNodeSearch,
    closeNodeSearch: editor.closeNodeSearch,
    openNodeSearch: editor.openNodeSearch,
    saveEditor: editor.saveEditing,
    getNode: () => node,
    renderMermaidDiagrams,
    fitNodeToContent,
    navigateToNode: vi.fn(),
    openExternal: vi.fn(),
    screenToCanvas: (x: number, y: number) => ({ x, y }),
    snapToGrid: (v: number) => v,
    createNode: vi.fn().mockResolvedValue(undefined),
    lastDragEndTime: () => 0,
    contextMenu: { open: vi.fn(), close: vi.fn() },
    suppressPreviewPanel: vi.fn(),
    getSelectedNodeIds: () => [],
    selectNode: vi.fn(),
  })
  return { editor, handlers, updateNodeContent, setEditingNode, renderMermaidDiagrams, fitNodeToContent }
}

const HEADER = '---\ndate: 20 BC\n---\n'

type Wired = ReturnType<typeof wireCanvas>
const WAYS_OF_LEAVING: Array<[string, (w: Wired) => void]> = [
  ['clicking away', w => w.handlers.saveEditing(new FocusEvent('blur'))],
  ['Escape', w => w.handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))],
  ['Cmd+Enter', w => w.handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }))],
]

describe.each(WAYS_OF_LEAVING)('leaving the canvas editor by %s', (_, leave) => {
  it('writes the frontmatter back with the body', () => {
    const wired = wireCanvas(`${HEADER}The body`)
    wired.editor.startEditing('n1')
    expect(wired.editor.editContent.value).toBe('The body')

    wired.editor.editContent.value = 'Edited body'
    leave(wired)

    expect(wired.updateNodeContent).toHaveBeenCalledWith('n1', `${HEADER}Edited body`)
    expect(wired.updateNodeContent).not.toHaveBeenCalledWith('n1', 'Edited body')
  })

  it('tells the store the edit has ended, so the watcher reconciles the file again', () => {
    const wired = wireCanvas(`${HEADER}The body`)
    wired.editor.startEditing('n1')
    expect(wired.setEditingNode).toHaveBeenLastCalledWith('n1')

    leave(wired)

    expect(wired.setEditingNode).toHaveBeenLastCalledWith(null)
  })
})

describe('after a canvas save', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('still renders diagrams and fits an auto-fit node to its content', () => {
    vi.useFakeTimers()
    const wired = wireCanvas('Body', true)
    wired.editor.startEditing('n1')
    wired.handlers.saveEditing()

    vi.advanceTimersByTime(500)
    expect(wired.renderMermaidDiagrams).toHaveBeenCalled()
    expect(wired.fitNodeToContent).toHaveBeenCalledWith('n1')
  })
})

describe('GraphCanvas wiring', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/canvas/GraphCanvas.vue'), 'utf8')
  const start = source.indexOf('useCanvasEventHandlers({')
  const block = source.slice(start, source.indexOf('})', start))

  it('hands the event handlers the node editor save, not a store writer', () => {
    expect(start).toBeGreaterThan(-1)
    expect(block).toContain('saveEditor: nodeEditor.saveEditing')
    expect(block).not.toContain('updateNodeContent')
  })
})
