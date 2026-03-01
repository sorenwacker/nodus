import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'

export interface Node {
  id: string
  title: string
  file_path: string | null
  markdown_content: string | null
  node_type: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  z_index: number
  frame_id: string | null
  color_theme: string | null
  is_collapsed: boolean
  auto_fit: boolean
  tags: string | null
  workspace_id: string | null
  checksum: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  link_type: string
  weight: number
  created_at: number
}

export interface CreateNodeInput {
  title: string
  file_path?: string
  markdown_content?: string
  node_type: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  tags?: string[]
  workspace_id?: string
}

export interface CreateEdgeInput {
  source_node_id: string
  target_node_id: string
  label?: string
  link_type?: string
}

export interface Workspace {
  id: string
  name: string
  created_at: number
}

// Load workspaces from localStorage
function loadWorkspacesFromStorage(): Workspace[] {
  try {
    const stored = localStorage.getItem('nodus-workspaces')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function loadCurrentWorkspaceFromStorage(): string | null {
  return localStorage.getItem('nodus-current-workspace')
}

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])
  const selectedNodeId = ref<string | null>(null)
  const workspaces = ref<Workspace[]>(loadWorkspacesFromStorage())
  const currentWorkspaceId = ref<string | null>(loadCurrentWorkspaceFromStorage())
  const loading = ref(false)
  const error = ref<string | null>(null)

  const selectedNode = computed(() =>
    nodes.value.find(n => n.id === selectedNodeId.value)
  )

  // Filtered nodes/edges for current workspace
  const filteredNodes = computed(() => {
    if (!currentWorkspaceId.value) {
      // Default workspace: show nodes with no workspace_id
      return nodes.value.filter(n => !n.workspace_id)
    }
    return nodes.value.filter(n => n.workspace_id === currentWorkspaceId.value)
  })

  const filteredEdges = computed(() => {
    const nodeIds = new Set(filteredNodes.value.map(n => n.id))
    return edges.value.filter(e =>
      nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    )
  })

  async function initialize() {
    loading.value = true
    error.value = null
    try {
      const [fetchedNodes, fetchedEdges] = await Promise.all([
        invoke<Node[]>('get_nodes'),
        invoke<Edge[]>('get_edges'),
      ])
      nodes.value = fetchedNodes
      edges.value = fetchedEdges
    } catch (e) {
      error.value = String(e)
      console.error('Failed to load nodes:', e)
      // Fallback to mock data for development
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
          frame_id: null,
          color_theme: null,
          is_collapsed: false,
          tags: null,
          workspace_id: null,
          checksum: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          deleted_at: null,
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
          frame_id: null,
          color_theme: null,
          is_collapsed: false,
          tags: null,
          workspace_id: null,
          checksum: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          deleted_at: null,
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
          created_at: Date.now(),
        },
      ]
    } finally {
      loading.value = false
    }
  }

  function getNode(id: string): Node | undefined {
    return nodes.value.find(n => n.id === id)
  }

  async function updateNodePosition(id: string, x: number, y: number) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.canvas_x = x
      node.canvas_y = y
      node.updated_at = Date.now()
      try {
        await invoke('update_node_position', { id, x, y })
      } catch (e) {
        console.error('Failed to update position:', e)
      }
    }
  }

  async function updateNodeSize(id: string, width: number, height: number) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.width = width
      node.height = height
      node.updated_at = Date.now()
      try {
        await invoke('update_node_size', { id, width, height })
      } catch (e) {
        console.error('Failed to update size:', e)
      }
    }
  }

  function selectNode(id: string | null) {
    selectedNodeId.value = id
  }

  async function updateNodeContent(id: string, content: string) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.markdown_content = content
      node.updated_at = Date.now()
      try {
        await invoke('update_node_content', { id, content })
      } catch (e) {
        console.error('Failed to update content:', e)
      }
    }
  }

  async function createNode(data: CreateNodeInput): Promise<Node> {
    // Assign current workspace if not specified
    const inputWithWorkspace = {
      ...data,
      workspace_id: data.workspace_id ?? currentWorkspaceId.value ?? undefined,
    }

    try {
      const node = await invoke<Node>('create_node', { input: inputWithWorkspace })
      nodes.value.push(node)
      return node
    } catch (e) {
      console.error('Failed to create node:', e)
      // Fallback for development
      const node: Node = {
        id: crypto.randomUUID(),
        title: data.title,
        file_path: data.file_path || null,
        markdown_content: data.markdown_content || null,
        node_type: data.node_type,
        canvas_x: data.canvas_x,
        canvas_y: data.canvas_y,
        width: data.width || 200,
        height: data.height || 120,
        z_index: 0,
        frame_id: null,
        color_theme: null,
        is_collapsed: false,
        tags: data.tags ? JSON.stringify(data.tags) : null,
        workspace_id: currentWorkspaceId.value,
        checksum: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        deleted_at: null,
      }
      nodes.value.push(node)
      return node
    }
  }

  async function deleteNode(id: string) {
    try {
      await invoke('delete_node', { id })
    } catch (e) {
      console.error('Failed to delete node:', e)
    }
    nodes.value = nodes.value.filter(n => n.id !== id)
    edges.value = edges.value.filter(
      e => e.source_node_id !== id && e.target_node_id !== id
    )
  }

  async function createEdge(data: CreateEdgeInput): Promise<Edge> {
    try {
      const edge = await invoke<Edge>('create_edge', { input: data })
      edges.value.push(edge)
      return edge
    } catch (e) {
      console.error('Failed to create edge:', e)
      const edge: Edge = {
        id: crypto.randomUUID(),
        source_node_id: data.source_node_id,
        target_node_id: data.target_node_id,
        label: data.label || null,
        link_type: data.link_type || 'related',
        weight: 1,
        created_at: Date.now(),
      }
      edges.value.push(edge)
      return edge
    }
  }

  async function deleteEdge(id: string) {
    try {
      await invoke('delete_edge', { id })
    } catch (e) {
      console.error('Failed to delete edge:', e)
    }
    edges.value = edges.value.filter(e => e.id !== id)
  }

  async function importVault(path: string): Promise<Node[]> {
    loading.value = true
    try {
      const importedNodes = await invoke<Node[]>('import_vault', { path })
      nodes.value.push(...importedNodes)
      return importedNodes
    } catch (e) {
      error.value = String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // Workspace management
  function saveWorkspacesToStorage() {
    localStorage.setItem('nodus-workspaces', JSON.stringify(workspaces.value))
    localStorage.setItem('nodus-current-workspace', currentWorkspaceId.value || '')
  }

  function createWorkspace(name: string): Workspace {
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      created_at: Date.now(),
    }
    workspaces.value.push(workspace)
    saveWorkspacesToStorage()
    return workspace
  }

  function switchWorkspace(workspaceId: string | null) {
    currentWorkspaceId.value = workspaceId
    saveWorkspacesToStorage()
  }

  function deleteWorkspace(id: string) {
    workspaces.value = workspaces.value.filter(w => w.id !== id)
    if (currentWorkspaceId.value === id) {
      currentWorkspaceId.value = null
    }
    saveWorkspacesToStorage()
  }

  function clearCanvas() {
    nodes.value = []
    edges.value = []
    selectedNodeId.value = null
  }

  return {
    nodes,
    edges,
    filteredNodes,
    filteredEdges,
    selectedNodeId,
    selectedNode,
    loading,
    error,
    workspaces,
    currentWorkspaceId,
    initialize,
    getNode,
    updateNodePosition,
    updateNodeSize,
    updateNodeContent,
    selectNode,
    createNode,
    deleteNode,
    createEdge,
    deleteEdge,
    importVault,
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    clearCanvas,
  }
})
