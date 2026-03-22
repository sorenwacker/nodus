import { type Ref, type ComputedRef } from 'vue'
import { writeText as writeClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { NODE_DEFAULTS } from '../../constants'

export interface GraphNode {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface EdgeLine {
  id: string
  source_node_id: string
  target_node_id: string
  path: string
  style: string
}

export interface GraphExportDeps {
  getSelectedNodeIds: () => string[]
  displayNodes: ComputedRef<GraphNode[]>
  edgeLines: ComputedRef<EdgeLine[]>
  neighborhoodMode: Ref<boolean>
  showToast?: (message: string, type: 'error' | 'success' | 'info') => void
}

/**
 * Composable for exporting graph data as YAML
 * Used for debugging and data export
 */
export function useGraphExport(deps: GraphExportDeps) {
  /**
   * Export current graph/subgraph as YAML for debugging
   */
  function exportGraphAsYaml() {
    const selectedIds = deps.getSelectedNodeIds()
    const selectedSet = new Set(selectedIds)
    const hasSelection = selectedIds.length > 0

    // Export selected nodes only, or all if no selection
    const nodesToExport = hasSelection
      ? deps.displayNodes.value.filter(n => selectedSet.has(n.id))
      : deps.displayNodes.value

    const nodes = nodesToExport.map(n => ({
      id: n.id,
      title: n.title,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: n.height || NODE_DEFAULTS.HEIGHT,
    }))

    // Export edges where both endpoints are in the export set
    const nodeIdSet = new Set(nodesToExport.map(n => n.id))
    const edges = deps.edgeLines.value
      .filter(e => nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id))
      .map(e => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        path: e.path,
        style: e.style,
      }))

    const yaml = `# Graph Export - ${new Date().toISOString()}
# Nodes: ${nodes.length}, Edges: ${edges.length}
# Selection: ${hasSelection ? 'subgraph' : 'all'}
# Neighborhood mode: ${deps.neighborhoodMode.value}

nodes:
${nodes.map(n => `  - id: "${n.id}"
    title: "${n.title?.replace(/"/g, '\\"') || 'Untitled'}"
    x: ${n.x}
    y: ${n.y}
    width: ${n.width}
    height: ${n.height}`).join('\n')}

edges:
${edges.map(e => `  - id: "${e.id}"
    source: "${e.source}"
    target: "${e.target}"
    style: "${e.style}"
    path: "${e.path}"`).join('\n')}
`

    // Copy to clipboard
    writeClipboard(yaml).then(() => {
      deps.showToast?.(`Copied ${nodes.length} nodes, ${edges.length} edges as YAML`, 'success')
    }).catch(err => {
      console.error('[EXPORT] Clipboard failed:', err)
      deps.showToast?.('Failed to copy to clipboard', 'error')
    })
  }

  return {
    exportGraphAsYaml,
  }
}
