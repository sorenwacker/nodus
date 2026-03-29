import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke, getWorkspace } from '../lib/tauri'
import { applyForceLayout } from '../canvas/layout'
import { storeLogger } from '../lib/logger'
import { getStarterTemplates, getStarterTitles, getStarterNodeConfigs, getStarterEdgeConfigs } from '../lib/templates'
import { canvasStorage } from '../lib/storage'
import { extractHashtags, extractWikilinks } from '../lib/contentParser'
import { notifications$ } from '../composables/useNotifications'
import { useStorylinesStore } from './storylines'
import { useEdgesStore } from './edges'
import { useFramesStore } from './frames'
import { useWorkspaceStore } from './workspaces'
import { useFileSync } from '../composables/useFileSync'
import { useImport } from '../composables/useImport'
import { useTagNodes } from '../composables/useTagNodes'
import { useNodeEditLocking } from '../composables/useNodeEditLocking'
import type {
  Node,
  Edge,
  Frame,
  Workspace,
  CreateNodeInput,
  CreateEdgeInput,
  FileChangeEvent,
  Storyline,
  StorylineNode,
} from '../types'
import { clampCoord, clampNodeSize } from '../lib/geometry'
import { pushOverlappingNodes as pushNodesApart } from '../lib/nodeCollision'
import { createMockNodes } from '../lib/mockData'

// Re-export types for consumers
export type { Node, Edge, Frame, Workspace, CreateNodeInput, CreateEdgeInput, FileChangeEvent, Storyline, StorylineNode }

export const useNodesStore = defineStore('nodes', () => {
  // Node-specific state
  const nodes = ref<Node[]>([])
  const selectedNodeIds = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Version counter to trigger edge re-routing when node positions/sizes change
  const nodeLayoutVersion = ref(0)

  // Separate stores with their own state
  const storylinesStore = useStorylinesStore()
  const edgesStore = useEdgesStore()
  const framesStore = useFramesStore()
  const workspaceStore = useWorkspaceStore()

  // File sync composable
  const fileSync = useFileSync({
    getNodes: () => nodes.value,
    updateNodeInPlace: (id: string, updates: Partial<Node>) => {
      const node = nodes.value.find((n) => n.id === id)
      if (node) {
        Object.assign(node, updates)
      }
    },
    addNode: (node: Node) => {
      nodes.value.push(node)
    },
    removeNode: (id: string) => {
      // Remove connected edges first
      const connectedEdges = edgesStore.edges.filter(
        (e) => e.source_node_id === id || e.target_node_id === id
      )
      for (const edge of connectedEdges) {
        edgesStore.deleteEdge(edge.id)
      }
      // Remove from local state
      nodes.value = nodes.value.filter((n) => n.id !== id)
      // Delete from database
      invoke('delete_node', { id }).catch((e) => {
        storeLogger.error('Failed to delete node:', e)
      })
    },
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
  })

  // Import composable (initialized after createNode is defined)
  let importComposable: ReturnType<typeof useImport> = undefined!

  // Tag nodes composable (initialized after dependencies are available)
  let tagNodesComposable: ReturnType<typeof useTagNodes> = undefined!

  // Expose edges and frames from their stores for backwards compatibility
  const edges = computed(() => edgesStore.edges)
  const frames = computed(() => framesStore.frames)
  const selectedFrameId = computed(() => framesStore.selectedFrameId)
  const workspaces = computed(() => workspaceStore.workspaces)
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspaceId)

  // For backwards compatibility
  const selectedNodeId = computed(() => selectedNodeIds.value[0] || null)
  const selectedNode = computed(() =>
    nodes.value.find(n => n.id === selectedNodeId.value)
  )

  // Filtered nodes/edges for current workspace
  const filteredNodes = computed(() => {
    const wsId = workspaceStore.currentWorkspaceId
    // Treat null, undefined, and "default" as the default workspace
    // Default workspace shows nodes with no workspace_id (null)
    if (!wsId || wsId === 'default') {
      return nodes.value.filter(n => !n.workspace_id)
    }
    return nodes.value.filter(n => n.workspace_id === wsId)
  })

  const filteredFrames = computed(() => {
    const wsId = workspaceStore.currentWorkspaceId
    // Filter frames by workspace, treating null/undefined/"default" as the default workspace
    if (!wsId || wsId === 'default') {
      return framesStore.frames.filter(f => !f.workspace_id || f.workspace_id === 'default')
    }
    return framesStore.frames.filter(f => f.workspace_id === wsId)
  })

  const filteredEdges = computed(() => {
    const nodeIds = new Set(filteredNodes.value.map(n => n.id))
    // Filter edges to only include those connecting nodes in the current workspace
    return edgesStore.edges.filter(
      e => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    )
  })

  // Storylines are managed by separate store - expose computed for compatibility
  const storylines = computed(() => storylinesStore.storylines)
  const storylineNodes = computed(() => storylinesStore.storylineNodes)
  const storylineNodesVersion = computed(() => storylinesStore.storylineNodesVersion)
  const filteredStorylines = computed(() => storylinesStore.filteredStorylines)

  async function initialize() {
    loading.value = true
    error.value = null
    try {
      // Initialize workspace store (syncs localStorage with database)
      await workspaceStore.initialize()

      // Initialize edges and frames stores with current workspace
      // Convert "default" to null for backend compatibility
      const currentWorkspace = workspaceStore.currentWorkspaceId
      const workspaceForBackend = currentWorkspace === 'default' ? null : currentWorkspace
      storeLogger.info(`[Nodes] Current workspace after init: ${currentWorkspace} (backend: ${workspaceForBackend})`)

      await Promise.all([
        edgesStore.initialize(workspaceForBackend),
        framesStore.initialize(),
      ])

      // Load nodes
      const fetchedNodes = await invoke<Node[]>('get_nodes')
      nodes.value = fetchedNodes

      storeLogger.info(`[Nodes] Loaded ${fetchedNodes.length} total nodes`)
      const workspaceIds = [...new Set(fetchedNodes.map(n => n.workspace_id))]
      storeLogger.info(`[Nodes] Workspace IDs in nodes: ${JSON.stringify(workspaceIds)}`)
      storeLogger.info(`[Nodes] Filtered nodes count: ${filteredNodes.value.length}`)

      // Set up node existence callback for edge validation
      edgesStore.setNodeExistsCallback((id) => nodes.value.some(n => n.id === id))

      // Initialize storylines store with dependencies
      storylinesStore.setDependencies({
        getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
        getEdges: () => edgesStore.edges,
        getNodes: () => nodes.value,
        createEdge: (data) => edgesStore.createEdge(data),
        deleteEdge: (id) => edgesStore.deleteEdge(id),
      })

      // Load storylines separately (may fail if migration hasn't run)
      try {
        await storylinesStore.loadStorylines()
      } catch (e) {
        storeLogger.warn('Failed to load storylines (migration may not have run yet):', e)
      }
    } catch (e) {
      error.value = String(e)
      storeLogger.error('Failed to load nodes:', e)
      notifications$.error('Failed to load data', 'Using offline mode with sample data')
      nodes.value = createMockNodes()
    } finally {
      loading.value = false
    }
  }

  function getNode(id: string): Node | undefined {
    return nodes.value.find(n => n.id === id)
  }

  /**
   * Get IDs of all nodes directly connected to the given node
   */
  function getNeighborIds(nodeId: string): string[] {
    const neighbors: string[] = []
    for (const edge of edgesStore.edges) {
      if (edge.source_node_id === nodeId) {
        neighbors.push(edge.target_node_id)
      } else if (edge.target_node_id === nodeId) {
        neighbors.push(edge.source_node_id)
      }
    }
    return neighbors
  }

  async function updateNodePosition(id: string, x: number, y: number) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      const clampedX = clampCoord(x)
      const clampedY = clampCoord(y)
      node.canvas_x = clampedX
      node.canvas_y = clampedY
      node.updated_at = Date.now()
      nodeLayoutVersion.value++ // Trigger edge re-routing
      try {
        await invoke('update_node_position', { id, x: clampedX, y: clampedY })
      } catch (e) {
        console.error('Failed to update position:', e)
      }
    }
  }

  async function updateNodeSize(id: string, width: number, height: number, pushOthers = false) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      const clampedWidth = clampNodeSize(width)
      const clampedHeight = clampNodeSize(height)
      node.width = clampedWidth
      node.height = clampedHeight
      node.updated_at = Date.now()
      nodeLayoutVersion.value++ // Trigger edge re-routing

      // Push overlapping nodes away
      if (pushOthers) {
        pushOverlappingNodes(node)
      }

      try {
        await invoke('update_node_size', { id, width: clampedWidth, height: clampedHeight })
      } catch (e) {
        console.error('Failed to update size:', e)
      }
    }
  }

  /**
   * Push nodes that overlap with the given node away (ripples through graph)
   */
  function pushOverlappingNodes(sourceNode: Node) {
    const collisionNode = {
      id: sourceNode.id,
      canvas_x: sourceNode.canvas_x,
      canvas_y: sourceNode.canvas_y,
      width: sourceNode.width || 200,
      height: sourceNode.height || 120,
      workspace_id: sourceNode.workspace_id,
    }

    const collisionNodes = nodes.value.map(n => ({
      id: n.id,
      canvas_x: n.canvas_x,
      canvas_y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
      workspace_id: n.workspace_id,
    }))

    pushNodesApart(collisionNode, {
      nodes: collisionNodes,
      updatePosition: (id, x, y) => {
        const node = nodes.value.find(n => n.id === id)
        if (node) {
          node.canvas_x = x
          node.canvas_y = y
          node.updated_at = Date.now()
          invoke('update_node_position', { id, x, y })
            .catch(e => console.error('Failed to update pushed node position:', e))
        }
      },
    })
  }

  function selectNode(id: string | null, addToSelection = false) {
    if (id === null) {
      selectedNodeIds.value = []
    } else if (addToSelection) {
      // Toggle selection
      const idx = selectedNodeIds.value.indexOf(id)
      if (idx >= 0) {
        selectedNodeIds.value.splice(idx, 1)
      } else {
        selectedNodeIds.value.push(id)
      }
    } else {
      selectedNodeIds.value = [id]
    }
  }

  // Find a node by title (case-insensitive)
  function findNodeByTitle(title: string): Node | undefined {
    const lowerTitle = title.toLowerCase()
    return nodes.value.find(n => n.title.toLowerCase() === lowerTitle)
  }

  // Check if node's file has changed and refresh content if needed
  async function refreshNodeFromFile(id: string): Promise<boolean> {
    const node = nodes.value.find(n => n.id === id)
    if (!node) {
      console.log('[refresh] Node not found:', id)
      return false
    }
    if (!node.file_path) {
      console.log('[refresh] No file_path for node:', node.title)
      return false
    }

    try {
      console.log('[refresh] Reading:', node.file_path)
      const content = await invoke<string>('read_file_content', { path: node.file_path })
      console.log('[refresh] File read, length:', content.length, 'stored:', node.markdown_content?.length)
      if (content !== node.markdown_content) {
        console.log('[refresh] Content changed, updating node')
        node.markdown_content = content
        node.updated_at = Date.now()
        // Update in backend too
        const newChecksum = await invoke<string | null>('update_node_content', { id, content })
        if (newChecksum) {
          node.checksum = newChecksum
        }
        return true
      } else {
        console.log('[refresh] Content unchanged')
      }
    } catch (e) {
      const errorMsg = String(e)
      // If file doesn't exist, clear the file_path
      if (errorMsg.includes('No such file') || errorMsg.includes('not found')) {
        console.warn('[refresh] File not found, clearing file_path:', node.file_path)
        node.file_path = null
        node.checksum = null
        node.updated_at = Date.now()
        // Persist the change
        try {
          await invoke('update_node_file_path', { id, filePath: '' })
        } catch {
          // Ignore - just log
        }
      } else {
        console.error('[refresh] Failed to read file:', e)
      }
    }
    return false
  }

  async function updateNodeContent(id: string, content: string) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.markdown_content = content
      node.updated_at = Date.now()
      try {
        const newChecksum = await invoke<string | null>('update_node_content', { id, content })
        // Update checksum if file was written (prevents watcher reload loop)
        if (newChecksum) {
          node.checksum = newChecksum
        }
      } catch (e) {
        console.error('Failed to update content:', e)
      }

      // Extract hashtags and update tags
      const extractedTags = extractHashtags(content)
      if (extractedTags.length > 0) {
        // Merge with existing tags (deduplicate)
        let existingTags: string[] = []
        if (node.tags) {
          try {
            const parsed = JSON.parse(node.tags)
            existingTags = Array.isArray(parsed) ? parsed : []
          } catch {
            // Malformed JSON in tags field - reset to empty array
            storeLogger.warn(`Invalid JSON in tags for node ${id}, resetting`)
            existingTags = []
          }
        }
        const mergedTags = Array.from(new Set([...existingTags, ...extractedTags]))
        node.tags = JSON.stringify(mergedTags)
        try {
          await invoke('update_node_tags', { id, tags: mergedTags })
        } catch (e) {
          console.error('Failed to update tags:', e)
        }
      }

      // Extract wikilinks and create edges
      const links = extractWikilinks(content)

      // Create edges for each wikilink
      for (const linkTitle of links) {
        const targetNode = findNodeByTitle(linkTitle)
        if (targetNode && targetNode.id !== id) {
          // Check if edge already exists
          const exists = edges.value.some(e =>
            e.source_node_id === id &&
            e.target_node_id === targetNode.id &&
            e.link_type === 'wikilink'
          )
          if (!exists) {
            await createEdge({
              source_node_id: id,
              target_node_id: targetNode.id,
              link_type: 'wikilink',
            })
          }
        }
      }
    }
  }

  async function updateNodeTitle(id: string, title: string) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.title = title
      node.updated_at = Date.now()
      try {
        await invoke('update_node_title', { id, title })
      } catch (e) {
        console.error('Failed to update title:', e)
      }
    }
  }

  async function updateNodeColor(id: string, color: string | null) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.color_theme = color
      node.updated_at = Date.now()
      try {
        await invoke('update_node_color', { id, color })
      } catch (e) {
        console.error('Failed to update color:', e)
      }
    }
  }

  async function moveNodesToWorkspace(nodeIds: string[], workspaceId: string | null) {
    for (const id of nodeIds) {
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        node.workspace_id = workspaceId
        node.updated_at = Date.now()
        try {
          await invoke('update_node_workspace', { id, workspaceId })
        } catch (e) {
          console.error('Failed to move node to workspace:', e)
        }
      }
    }
  }

  async function createNode(data: CreateNodeInput): Promise<Node> {
    // Determine workspace_id for the new node
    // "default" maps to null (the default workspace uses null in the database)
    let validWorkspaceId: string | null = data.workspace_id ?? null
    if (data.workspace_id === undefined) {
      // Use current workspace, but convert "default" to null
      if (currentWorkspaceId.value === 'default') {
        validWorkspaceId = null
      } else if (currentWorkspaceId.value && workspaces.value.some(w => w.id === currentWorkspaceId.value)) {
        validWorkspaceId = currentWorkspaceId.value
      } else {
        validWorkspaceId = null
      }
    } else if (data.workspace_id === 'default') {
      validWorkspaceId = null
    }

    const inputWithWorkspace = {
      ...data,
      workspace_id: validWorkspaceId,
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
        node_type: data.node_type || 'note',
        canvas_x: data.canvas_x,
        canvas_y: data.canvas_y,
        width: data.width || 200,
        height: data.height || 120,
        z_index: 0,
        frame_id: null,
        color_theme: data.color_theme ?? null,
        is_collapsed: false,
        tags: data.tags ? JSON.stringify(data.tags) : null,
        workspace_id: validWorkspaceId,
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
    // Remove edges connected to deleted node
    edgesStore.cleanupOrphanEdges(new Set(nodes.value.map(n => n.id)))
  }

  async function deleteNodes(ids: string[]) {
    if (ids.length === 0) return
    try {
      await invoke('delete_nodes', { ids })
    } catch (e) {
      console.error('Failed to delete nodes:', e)
    }
    const idSet = new Set(ids)
    nodes.value = nodes.value.filter(n => !idSet.has(n.id))
    // Remove edges connected to deleted nodes
    edgesStore.cleanupOrphanEdges(new Set(nodes.value.map(n => n.id)))
  }

  // Edge functions - forwarded to edges store
  const createEdge = (data: CreateEdgeInput) => edgesStore.createEdge(data)
  const deleteEdge = (id: string) => edgesStore.deleteEdge(id)
  const restoreEdge = (edge: Edge) => edgesStore.restoreEdge(edge)
  const updateEdgeLinkType = (id: string, linkType: string) => edgesStore.updateEdgeLinkType(id, linkType)
  const updateEdgeColor = (id: string, color: string | null) => edgesStore.updateEdgeColor(id, color)

  // Initialize composables that depend on functions defined above
  importComposable = useImport({
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
    getNodes: () => nodes.value,
    setNodes: (n) => { nodes.value = n },
    addNodes: (n) => { nodes.value.push(...n) },
    setEdges: (e) => { edgesStore.edges.splice(0, edgesStore.edges.length, ...e) },
    reloadFrames: () => framesStore.initialize(),
    createNode,
    watchVault: (path) => fileSync.watchVault(path),
  })

  tagNodesComposable = useTagNodes({
    getNodes: () => nodes.value,
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
    createNode,
    getEdges: () => edgesStore.edges,
    createEdge,
  })

  // Restore a deleted node (for undo)
  async function restoreNode(node: Node) {
    try {
      await invoke('restore_node', { node })
    } catch (e) {
      console.error('Failed to restore node:', e)
    }
    // Add back to local state if not already present
    if (!nodes.value.find(n => n.id === node.id)) {
      nodes.value.push(node)
    }
  }

  /**
   * Update colors of all edges belonging to a storyline - forwarded to storylines store
   */
  const updateStorylineEdgeColors = (storylineId: string, color: string | null) => storylinesStore.updateStorylineEdgeColors(storylineId, color)

  // Import functions - forwarded to import composable
  const importVault = (path: string, deleteOriginals?: boolean, targetWorkspaceId?: string) => importComposable.importVault(path, deleteOriginals, targetWorkspaceId)
  const importCitations = (filePath: string) => importComposable.importCitations(filePath)
  const importOntology = (filePath: string, options?: { createClassNodes?: boolean; createIndividualNodes?: boolean; workspaceId?: string; layout?: 'grid' | 'hierarchical' }) =>
    importComposable.importOntology(filePath, options)
  const refreshWorkspace = () => importComposable.refreshWorkspace()

  // File sync functions - forwarded to composable
  const watchVault = (path: string) => fileSync.watchVault(path)
  const stopWatching = () => fileSync.stopWatching()

  // Workspace functions - forwarded to workspace store
  const createWorkspace = (name: string) => workspaceStore.createWorkspace(name)
  const switchWorkspace = async (workspaceId: string | null) => {
    // Stop any existing file watcher
    await fileSync.stopWatching()

    workspaceStore.switchWorkspace(workspaceId)
    // Reload edges and frames for the new workspace
    await Promise.all([
      edgesStore.initialize(workspaceId),
      framesStore.initialize(),
    ])

    // Start file watcher if workspace has sync enabled and vault path
    if (workspaceId) {
      try {
        const workspace = await getWorkspace(workspaceId)
        if (workspace?.sync_enabled && workspace?.vault_path) {
          await fileSync.watchVault(workspace.vault_path)
          storeLogger.info(`Started watching vault: ${workspace.vault_path}`)
        }
      } catch (e) {
        storeLogger.error('Failed to start file watcher:', e)
      }
    }
  }
  const deleteWorkspace = (id: string, deleteFiles?: boolean) => workspaceStore.deleteWorkspace(id, deleteFiles)
  const recoverWorkspace = (id: string) => workspaceStore.recoverWorkspace(id)
  const getOrphanedWorkspaceIds = () => workspaceStore.getOrphanedWorkspaceIds(nodes.value)
  const renameWorkspace = (id: string, newName: string) => workspaceStore.renameWorkspace(id, newName)

  function clearCanvas() {
    nodes.value = []
    edgesStore.edges.splice(0, edgesStore.edges.length)
    selectedNodeIds.value = []
  }

  /**
   * Reset the default workspace to initial state with starter nodes
   * Deletes all nodes in the default workspace and creates welcome content
   */
  async function resetDefaultWorkspace(): Promise<void> {
    storeLogger.info('Resetting default workspace to initial state')

    // Delete all nodes in the default workspace (workspace_id = null)
    const defaultNodes = nodes.value.filter(n => n.workspace_id === null)
    for (const node of defaultNodes) {
      try {
        await invoke('delete_node', { id: node.id })
      } catch (e) {
        storeLogger.error(`Failed to delete node ${node.id}:`, e)
      }
    }

    // Clear local state for default workspace
    nodes.value = nodes.value.filter(n => n.workspace_id !== null)
    selectedNodeIds.value = []

    // Get localized content and node configurations
    const locale = localStorage.getItem('nodus-locale') || 'en'
    const templates = getStarterTemplates(locale)
    const titles = getStarterTitles(locale)
    const nodeConfigs = getStarterNodeConfigs()
    const edgeConfigs = getStarterEdgeConfigs()

    // Create starter nodes from configurations
    const createdNodes = new Map<string, Node>()
    for (const config of nodeConfigs) {
      const node = await createNode({
        title: titles[config.key],
        markdown_content: templates[config.key],
        canvas_x: config.canvas_x,
        canvas_y: config.canvas_y,
        width: config.width,
        height: config.height,
      })
      createdNodes.set(config.key, node)
    }

    // Create demo edges from configurations
    for (const config of edgeConfigs) {
      const source = createdNodes.get(config.sourceKey)
      const target = createdNodes.get(config.targetKey)
      if (source && target) {
        await createEdge({
          source_node_id: source.id,
          target_node_id: target.id,
          link_type: config.linkType,
          label: config.label,
        })
      }
    }

    // Set hyperbolic edge style for starter content
    canvasStorage.setEdgeStyle('hyperbolic')

    storeLogger.info('Default workspace reset complete')
  }

  // Edge cleanup functions - forwarded to edges store
  const cleanupOrphanEdges = () => edgesStore.cleanupOrphanEdges(new Set(nodes.value.map(n => n.id)))
  const deduplicateEdges = () => edgesStore.deduplicateEdges()

  // Frame functions - forwarded to frames store (with node cleanup for delete)
  // Convert "default" to null for backend compatibility
  const createFrame = (x: number, y: number, width = 400, height = 300, title = 'Frame') => {
    const wsId = workspaceStore.currentWorkspaceId
    const workspaceForBackend = wsId === 'default' ? null : wsId
    return framesStore.createFrame(x, y, width, height, title, workspaceForBackend)
  }
  const updateFramePosition = (id: string, x: number, y: number) => framesStore.updateFramePosition(id, x, y)
  const updateFrameSize = (id: string, width: number, height: number) => framesStore.updateFrameSize(id, width, height)
  const updateFrameTitle = (id: string, title: string) => framesStore.updateFrameTitle(id, title)
  const updateFrameColor = (id: string, color: string | null) => framesStore.updateFrameColor(id, color)

  function deleteFrame(id: string) {
    // Unassign nodes from this frame first
    for (const node of nodes.value) {
      if (node.frame_id === id) {
        node.frame_id = null
      }
    }
    framesStore.deleteFrame(id)
  }

  function selectFrame(id: string | null) {
    framesStore.selectFrame(id)
    if (id) {
      selectedNodeIds.value = []
    }
  }

  function assignNodesToFrame(nodeIds: string[], frameId: string | null) {
    for (const node of nodes.value) {
      if (nodeIds.includes(node.id)) {
        node.frame_id = frameId
      }
    }
  }

  /**
   * Apply force-directed layout to all nodes or a subset
   * When frameId is provided, layout only nodes inside that frame
   * Otherwise, nodes inside frames are excluded from layout
   */
  async function layoutNodes(
    nodeIds?: string[],
    options?: {
      centerX?: number
      centerY?: number
      chargeStrength?: number
      linkDistance?: number
      frameId?: string  // If provided, layout only nodes inside this frame
      fitToFrame?: boolean  // If true, resize nodes to fit frame
    }
  ) {
    const frameId = options?.frameId
    const fitToFrame = options?.fitToFrame ?? true

    // Helper to check if a node is inside a specific frame (50%+ overlap)
    const isNodeInSpecificFrame = (node: Node, frame: Frame): boolean => {
      if (node.frame_id === frame.id) return true

      const nodeWidth = node.width || 200
      const nodeHeight = node.height || 120
      const nodeArea = nodeWidth * nodeHeight

      const overlapX = Math.max(0,
        Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) -
        Math.max(node.canvas_x, frame.canvas_x))
      const overlapY = Math.max(0,
        Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) -
        Math.max(node.canvas_y, frame.canvas_y))
      return overlapX * overlapY > nodeArea * 0.5
    }

    // Helper to check if a node is inside any frame
    const isNodeInAnyFrame = (node: Node): boolean => {
      for (const frame of filteredFrames.value) {
        if (isNodeInSpecificFrame(node, frame)) return true
      }
      return false
    }

    let targetNodes: Node[]
    let targetFrame: Frame | undefined

    if (frameId) {
      // Frame-scoped layout: only nodes inside the selected frame
      targetFrame = filteredFrames.value.find(f => f.id === frameId)
      if (!targetFrame) {
        console.log('[Layout] Frame not found:', frameId)
        return
      }

      targetNodes = filteredNodes.value.filter(n => isNodeInSpecificFrame(n, targetFrame!))
      console.log('[Layout] Frame-scoped layout:', targetFrame.title, 'Nodes:', targetNodes.length)
    } else {
      // Canvas layout: exclude nodes inside frames
      const allTargetNodes = nodeIds
        ? filteredNodes.value.filter(n => nodeIds.includes(n.id))
        : filteredNodes.value

      targetNodes = allTargetNodes.filter(n => !isNodeInAnyFrame(n))
      const excludedCount = allTargetNodes.length - targetNodes.length

      console.log('[Layout] Frames:', filteredFrames.value.length)
      console.log('[Layout] All nodes:', allTargetNodes.length, 'Excluded:', excludedCount, 'To layout:', targetNodes.length)
    }

    if (targetNodes.length === 0) return

    const layoutNodesList = targetNodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
    }))

    // Calculate layout center
    let centerX: number, centerY: number

    if (targetFrame) {
      // Center within frame
      centerX = targetFrame.canvas_x + targetFrame.width / 2
      centerY = targetFrame.canvas_y + targetFrame.height / 2
    } else {
      // Use centroid of nodes being laid out
      centerX = layoutNodesList.reduce((sum, n) => sum + n.x, 0) / layoutNodesList.length
      centerY = layoutNodesList.reduce((sum, n) => sum + n.y, 0) / layoutNodesList.length
    }

    // Get edges between target nodes
    const layoutNodeIds = new Set(targetNodes.map(n => n.id))
    const layoutEdges = filteredEdges.value
      .filter(e => layoutNodeIds.has(e.source_node_id) && layoutNodeIds.has(e.target_node_id))
      .map(e => ({
        source: e.source_node_id,
        target: e.target_node_id,
      }))

    // Adaptive iterations based on graph size
    const nodeCount = layoutNodesList.length
    const iterations = nodeCount > 300 ? 150 : nodeCount > 100 ? 250 : 400

    // Adjust charge and link distance for frame-scoped layout
    let chargeStrength = options?.chargeStrength
    let linkDistance = options?.linkDistance

    if (targetFrame && !chargeStrength && !linkDistance) {
      // Tighter layout for frame-scoped
      const frameArea = targetFrame.width * targetFrame.height
      const nodeArea = nodeCount * 200 * 120 // Approximate average node size
      const density = nodeArea / frameArea

      // Stronger repulsion and shorter links for denser layouts
      chargeStrength = density > 0.5 ? -200 : -300
      linkDistance = density > 0.5 ? 80 : 120
    }

    const positions = await applyForceLayout(layoutNodesList, layoutEdges, {
      centerX: options?.centerX ?? centerX,
      centerY: options?.centerY ?? centerY,
      chargeStrength,
      linkDistance,
      iterations,
    })

    // If frame-scoped, constrain positions to frame bounds and optionally resize nodes
    if (targetFrame && fitToFrame) {
      const padding = 30
      const frameLeft = targetFrame.canvas_x + padding
      const frameTop = targetFrame.canvas_y + padding + 30 // Extra space for title
      const frameRight = targetFrame.canvas_x + targetFrame.width - padding
      const frameBottom = targetFrame.canvas_y + targetFrame.height - padding

      // Calculate available space and optimal node size
      const availableWidth = frameRight - frameLeft
      const availableHeight = frameBottom - frameTop
      const cols = Math.ceil(Math.sqrt(nodeCount * availableWidth / availableHeight))
      const rows = Math.ceil(nodeCount / cols)

      const nodeWidth = Math.min(200, Math.max(100, (availableWidth - (cols - 1) * 20) / cols))
      const nodeHeight = Math.min(120, Math.max(60, (availableHeight - (rows - 1) * 20) / rows))

      // Resize nodes and constrain positions
      const updates: Promise<void>[] = []
      for (const [id, pos] of positions) {
        // Constrain position to frame bounds
        const constrainedX = Math.max(frameLeft, Math.min(frameRight - nodeWidth, pos.x))
        const constrainedY = Math.max(frameTop, Math.min(frameBottom - nodeHeight, pos.y))

        updates.push(updateNodePosition(id, constrainedX, constrainedY))
        updates.push(updateNodeSize(id, nodeWidth, nodeHeight))
      }
      await Promise.all(updates)
    } else {
      // Standard position update
      const updates: Promise<void>[] = []
      for (const [id, pos] of positions) {
        updates.push(updateNodePosition(id, pos.x, pos.y))
      }
      await Promise.all(updates)
    }

    nodeLayoutVersion.value++
  }

  // Edit locking composable
  const editLocking = useNodeEditLocking({
    getNode: (id: string) => nodes.value.find(n => n.id === id),
  })
  const { isNodeEditable, startEditing, stopEditing, hasEditLock } = editLocking

  // Storyline functions - forwarded to storylines store
  const loadStorylines = () => storylinesStore.loadStorylines()
  const createStoryline = (title: string, description?: string, color?: string) => storylinesStore.createStoryline(title, description, color)
  const updateStoryline = (id: string, title: string, description?: string, color?: string) => storylinesStore.updateStoryline(id, title, description, color)
  const deleteStoryline = (id: string) => storylinesStore.deleteStoryline(id)
  const addNodeToStoryline = (storylineId: string, nodeId: string, position?: number) => storylinesStore.addNodeToStoryline(storylineId, nodeId, position)
  const removeNodeFromStoryline = (storylineId: string, nodeId: string) => storylinesStore.removeNodeFromStoryline(storylineId, nodeId)
  const reorderStorylineNodes = (storylineId: string, nodeIds: string[]) => storylinesStore.reorderStorylineNodes(storylineId, nodeIds)
  const getStorylineNodes = (storylineId: string) => storylinesStore.getStorylineNodes(storylineId)
  const getStorylinesForNode = (nodeId: string) => storylinesStore.getStorylinesForNode(nodeId)
  const repairStorylineEdges = (storylineId: string) => storylinesStore.repairStorylineEdges(storylineId)

  // Tag node functions - forwarded to tag nodes composable
  const getOrCreateTagNode = (tagName: string, nearNodeId?: string) => tagNodesComposable.getOrCreateTagNode(tagName, nearNodeId)
  const createTagEdges = (nodeId: string, tagNames: string[]) => tagNodesComposable.createTagEdges(nodeId, tagNames)
  const getTagNodes = () => tagNodesComposable.getTagNodes()

  return {
    nodes,
    edges,
    frames,
    filteredNodes,
    filteredEdges,
    filteredFrames,
    nodeLayoutVersion,
    selectedNodeIds,
    selectedNodeId,
    selectedNode,
    selectedFrameId,
    loading,
    error,
    workspaces,
    currentWorkspaceId,
    storylines,
    filteredStorylines,
    storylineNodes,
    storylineNodesVersion,
    initialize,
    getNode,
    getNeighborIds,
    findNodeByTitle,
    updateNodePosition,
    updateNodeSize,
    updateNodeContent,
    updateNodeTitle,
    updateNodeColor,
    moveNodesToWorkspace,
    selectNode,
    refreshNodeFromFile,
    createNode,
    deleteNode,
    deleteNodes,
    restoreNode,
    createEdge,
    deleteEdge,
    restoreEdge,
    updateEdgeLinkType,
    updateEdgeColor,
    updateStorylineEdgeColors,
    createFrame,
    updateFramePosition,
    updateFrameSize,
    updateFrameTitle,
    updateFrameColor,
    deleteFrame,
    selectFrame,
    assignNodesToFrame,
    importVault,
    importCitations,
    importOntology,
    refreshWorkspace,
    watchVault,
    stopWatching,
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    recoverWorkspace,
    getOrphanedWorkspaceIds,
    renameWorkspace,
    clearCanvas,
    resetDefaultWorkspace,
    cleanupOrphanEdges,
    deduplicateEdges,
    layoutNodes,
    isNodeEditable,
    startEditing,
    stopEditing,
    hasEditLock,
    loadStorylines,
    createStoryline,
    updateStoryline,
    deleteStoryline,
    addNodeToStoryline,
    removeNodeFromStoryline,
    reorderStorylineNodes,
    getStorylineNodes,
    getStorylinesForNode,
    repairStorylineEdges,
    // Tag management
    extractHashtags,
    getOrCreateTagNode,
    createTagEdges,
    getTagNodes,
  }
})
