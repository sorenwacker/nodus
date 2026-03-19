/**
 * Node clipboard composable
 * Handles copy/paste of nodes with their edges
 */
import { writeText as writeClipboard, readText as readClipboard } from '@tauri-apps/plugin-clipboard-manager'

export interface ClipboardNodeData {
  type: 'nodus-nodes'
  nodes: Array<{
    title: string
    markdown_content: string
    canvas_x: number
    canvas_y: number
    width: number
    height: number
    color_theme: string | null
  }>
  edges?: Array<{
    source_index: number
    target_index: number
    label: string | null
    link_type: string
    color?: string | null
  }>
}

export interface UseNodeClipboardOptions {
  store: {
    selectedNodeIds: string[]
    getNode: (id: string) => { id: string; title: string; markdown_content: string | null; canvas_x: number; canvas_y: number; width: number; height: number; color_theme: string | null } | undefined
    getFilteredEdges: () => Array<{ id: string; source_node_id: string; target_node_id: string; label: string | null; link_type: string; color?: string | null }>
    createNode: (data: { title: string; markdown_content?: string; canvas_x: number; canvas_y: number; width?: number; height?: number; color_theme?: string | null }) => Promise<{ id: string }>
    createEdge: (data: { source_node_id: string; target_node_id: string; label?: string; link_type?: string; color?: string }) => Promise<unknown>
    setSelectedNodeIds: (ids: string[]) => void
  }
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
  getViewportSize: () => { width: number; height: number }
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

export function useNodeClipboard(options: UseNodeClipboardOptions) {
  const { store, screenToCanvas, getViewportSize, showToast } = options

  async function copySelectedNodes(): Promise<void> {
    const selectedNodes = store.selectedNodeIds
      .map(id => store.getNode(id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)

    if (selectedNodes.length === 0) return

    // Find bounding box to compute relative positions
    const minX = Math.min(...selectedNodes.map(n => n.canvas_x))
    const minY = Math.min(...selectedNodes.map(n => n.canvas_y))

    // Create index map for edge references
    const nodeIdToIndex = new Map(selectedNodes.map((n, i) => [n.id, i]))
    const selectedIdSet = new Set(store.selectedNodeIds)

    // Find edges where both endpoints are in the selection
    const allEdges = store.getFilteredEdges()
    const selectedEdges = allEdges.filter(e =>
      selectedIdSet.has(e.source_node_id) && selectedIdSet.has(e.target_node_id)
    )

    const clipboardData: ClipboardNodeData = {
      type: 'nodus-nodes',
      nodes: selectedNodes.map(n => ({
        title: n.title,
        markdown_content: n.markdown_content || '',
        canvas_x: n.canvas_x - minX,
        canvas_y: n.canvas_y - minY,
        width: n.width,
        height: n.height,
        color_theme: n.color_theme,
      })),
      edges: selectedEdges.map(e => ({
        source_index: nodeIdToIndex.get(e.source_node_id)!,
        target_index: nodeIdToIndex.get(e.target_node_id)!,
        label: e.label,
        link_type: e.link_type,
        color: e.color,
      }))
    }

    try {
      await writeClipboard(JSON.stringify(clipboardData, null, 2))
      const edgeCount = selectedEdges.length
      const msg = edgeCount > 0
        ? `Copied ${selectedNodes.length} node(s) and ${edgeCount} edge(s)`
        : `Copied ${selectedNodes.length} node(s)`
      showToast?.(msg, 'success')
    } catch (e) {
      console.error('Failed to copy to clipboard:', e)
      showToast?.('Failed to copy to clipboard', 'error')
    }
  }

  async function pasteNodes(): Promise<string[]> {
    try {
      const text = await readClipboard()
      let data: ClipboardNodeData

      try {
        data = JSON.parse(text)
      } catch {
        return []
      }

      if (data.type !== 'nodus-nodes' || !Array.isArray(data.nodes)) {
        return []
      }

      const viewportSize = getViewportSize()
      const viewportCenter = screenToCanvas(
        viewportSize.width / 2,
        viewportSize.height / 2
      )

      // Offset slightly from center to avoid exact overlap
      const offset = (Math.random() * 50) + 20

      const newNodeIds: string[] = []

      for (const nodeData of data.nodes) {
        const newNode = await store.createNode({
          title: nodeData.title,
          markdown_content: nodeData.markdown_content,
          canvas_x: viewportCenter.x + nodeData.canvas_x + offset,
          canvas_y: viewportCenter.y + nodeData.canvas_y + offset,
          width: nodeData.width,
          height: nodeData.height,
          color_theme: nodeData.color_theme,
        })
        newNodeIds.push(newNode.id)
      }

      // Create edges between the pasted nodes
      let edgesCreated = 0
      if (data.edges && data.edges.length > 0) {
        for (const edgeData of data.edges) {
          const sourceId = newNodeIds[edgeData.source_index]
          const targetId = newNodeIds[edgeData.target_index]
          if (sourceId && targetId) {
            await store.createEdge({
              source_node_id: sourceId,
              target_node_id: targetId,
              label: edgeData.label ?? undefined,
              link_type: edgeData.link_type,
              color: edgeData.color ?? undefined,
            })
            edgesCreated++
          }
        }
      }

      // Select the newly pasted nodes
      store.setSelectedNodeIds(newNodeIds)

      const msg = edgesCreated > 0
        ? `Pasted ${data.nodes.length} node(s) and ${edgesCreated} edge(s)`
        : `Pasted ${data.nodes.length} node(s)`
      showToast?.(msg, 'success')

      return newNodeIds
    } catch (e) {
      console.debug('Paste failed:', e)
      return []
    }
  }

  return {
    copySelectedNodes,
    pasteNodes,
  }
}

export type UseNodeClipboardReturn = ReturnType<typeof useNodeClipboard>
