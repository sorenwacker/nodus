import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Node {
  id: string
  title: string
  file_path: string | null
  markdown_content: string
  node_type: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  z_index: number
  color_theme: string | null
  is_collapsed: boolean
  tags: string[]
  workspace_id: string | null
  checksum: string | null
  created_at: number
  updated_at: number
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  link_type: string
  weight: number
}

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])
  const selectedNodeId = ref<string | null>(null)

  const selectedNode = computed(() =>
    nodes.value.find((n) => n.id === selectedNodeId.value)
  )

  function initialize() {
    // TODO: Load from Tauri backend
    // For now, create mock data
    nodes.value = [
      {
        id: '1',
        title: 'Welcome to Nodus',
        file_path: null,
        markdown_content: '# Welcome\n\nThis is your first node.',
        node_type: 'note',
        canvas_x: 100,
        canvas_y: 100,
        width: 200,
        height: 120,
        z_index: 0,
        color_theme: null,
        is_collapsed: false,
        tags: [],
        workspace_id: null,
        checksum: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: '2',
        title: 'Getting Started',
        file_path: null,
        markdown_content: '## Getting Started\n\nDrag nodes to arrange them.',
        node_type: 'note',
        canvas_x: 400,
        canvas_y: 150,
        width: 200,
        height: 120,
        z_index: 0,
        color_theme: null,
        is_collapsed: false,
        tags: [],
        workspace_id: null,
        checksum: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ]

    edges.value = [
      {
        id: 'e1',
        source_node_id: '1',
        target_node_id: '2',
        label: null,
        link_type: 'related',
        weight: 1,
      },
    ]
  }

  function getNode(id: string): Node | undefined {
    return nodes.value.find((n) => n.id === id)
  }

  function updateNodePosition(id: string, x: number, y: number) {
    const node = nodes.value.find((n) => n.id === id)
    if (node) {
      node.canvas_x = x
      node.canvas_y = y
      node.updated_at = Date.now()
      // TODO: Persist to backend
    }
  }

  function selectNode(id: string | null) {
    selectedNodeId.value = id
  }

  function createNode(data: Partial<Node>): Node {
    const node: Node = {
      id: crypto.randomUUID(),
      title: data.title || 'Untitled',
      file_path: data.file_path || null,
      markdown_content: data.markdown_content || '',
      node_type: data.node_type || 'note',
      canvas_x: data.canvas_x || 0,
      canvas_y: data.canvas_y || 0,
      width: data.width || 200,
      height: data.height || 120,
      z_index: data.z_index || 0,
      color_theme: data.color_theme || null,
      is_collapsed: false,
      tags: data.tags || [],
      workspace_id: data.workspace_id || null,
      checksum: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    nodes.value.push(node)
    return node
  }

  function deleteNode(id: string) {
    nodes.value = nodes.value.filter((n) => n.id !== id)
    edges.value = edges.value.filter(
      (e) => e.source_node_id !== id && e.target_node_id !== id
    )
  }

  return {
    nodes,
    edges,
    selectedNodeId,
    selectedNode,
    initialize,
    getNode,
    updateNodePosition,
    selectNode,
    createNode,
    deleteNode,
  }
})
