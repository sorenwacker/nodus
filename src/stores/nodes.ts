import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  invoke,
  acquireEditLock,
  releaseEditLock,
  checkFileAvailable,
} from '../lib/tauri'
import { applyForceLayout } from '../canvas/layout'
import { storeLogger } from '../lib/logger'
import { notifications$ } from '../composables/useNotifications'
import { useStorylinesStore } from './storylines'
import { useEdgesStore } from './edges'
import { useFramesStore } from './frames'
import { useWorkspaceStore } from './workspaces'
import { useFileSync } from '../composables/useFileSync'
import { useImport } from '../composables/useImport'
import { useTagNodes } from '../composables/useTagNodes'
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

// Maximum canvas coordinate bounds
const MAX_CANVAS_COORD = 100_000
const MIN_NODE_SIZE = 50
const MAX_NODE_SIZE = 5_000

/**
 * Validate and clamp a coordinate value
 */
function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-MAX_CANVAS_COORD, Math.min(MAX_CANVAS_COORD, value))
}

/**
 * Validate and clamp a node size value
 */
function clampNodeSize(value: number): number {
  if (!Number.isFinite(value)) return 200 // Default node width
  return Math.max(MIN_NODE_SIZE, Math.min(MAX_NODE_SIZE, value))
}

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
  // Track which nodes have edit locks held by this session
  const lockedNodeIds = ref<Set<string>>(new Set())

  // Separate stores with their own state
  const storylinesStore = useStorylinesStore()
  const edgesStore = useEdgesStore()
  const framesStore = useFramesStore()
  const workspaceStore = useWorkspaceStore()

  // File sync composable
  const fileSync = useFileSync({
    getNodes: () => nodes.value,
    updateNodeInPlace: (id: string, updates: Partial<Node>) => {
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        Object.assign(node, updates)
      }
    },
  })

  // Import composable (initialized after createNode is defined)
  // eslint-disable-next-line prefer-const
  let importComposable: ReturnType<typeof useImport>

  // Tag nodes composable (initialized after dependencies are available)
  // eslint-disable-next-line prefer-const
  let tagNodesComposable: ReturnType<typeof useTagNodes>

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
    if (!wsId) {
      // Default workspace: show nodes with no workspace_id
      return nodes.value.filter(n => !n.workspace_id)
    }
    return nodes.value.filter(n => n.workspace_id === wsId)
  })

  const filteredFrames = computed(() => {
    return framesStore.getFramesForWorkspace(workspaceStore.currentWorkspaceId)
  })

  const filteredEdges = computed(() => {
    const nodeIds = new Set(filteredNodes.value.map(n => n.id))
    return edgesStore.getEdgesForNodes(nodeIds)
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

      // Initialize edges and frames stores
      await Promise.all([
        edgesStore.initialize(),
        framesStore.initialize(),
      ])

      // Load nodes
      const fetchedNodes = await invoke<Node[]>('get_nodes')
      nodes.value = fetchedNodes

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
  function pushOverlappingNodes(sourceNode: Node, processed = new Set<string>()) {
    const PADDING = 15 // Minimum gap between nodes
    const MAX_ITERATIONS = 50 // Prevent infinite loops

    if (processed.size > MAX_ITERATIONS) return
    processed.add(sourceNode.id)

    const sw = sourceNode.width || 200
    const sh = sourceNode.height || 120
    const sx = sourceNode.canvas_x
    const sy = sourceNode.canvas_y
    const scx = sx + sw / 2
    const scy = sy + sh / 2

    const pushedNodes: Node[] = []

    for (const node of nodes.value) {
      if (node.id === sourceNode.id) continue
      if (node.workspace_id !== sourceNode.workspace_id) continue
      if (processed.has(node.id)) continue

      const nw = node.width || 200
      const nh = node.height || 120
      const nx = node.canvas_x
      const ny = node.canvas_y

      // Check for overlap (with padding)
      const overlapX = sx < nx + nw + PADDING && sx + sw + PADDING > nx
      const overlapY = sy < ny + nh + PADDING && sy + sh + PADDING > ny

      if (overlapX && overlapY) {
        // Calculate push direction (away from source node center)
        const ncx = nx + nw / 2
        const ncy = ny + nh / 2
        const dx = ncx - scx
        const dy = ncy - scy

        // Calculate how much to push
        let pushX = 0, pushY = 0
        if (Math.abs(dx) > Math.abs(dy)) {
          // Push horizontally
          if (dx > 0) {
            pushX = (sx + sw + PADDING) - nx
          } else {
            pushX = (sx - PADDING) - (nx + nw)
          }
        } else {
          // Push vertically
          if (dy > 0) {
            pushY = (sy + sh + PADDING) - ny
          } else {
            pushY = (sy - PADDING) - (ny + nh)
          }
        }

        // Apply push
        node.canvas_x += pushX
        node.canvas_y += pushY
        node.updated_at = Date.now()

        // Persist position
        invoke('update_node_position', {
          id: node.id,
          x: node.canvas_x,
          y: node.canvas_y
        }).catch(e => console.error('Failed to update pushed node position:', e))

        pushedNodes.push(node)
      }
    }

    // Recursively push nodes that the pushed nodes now overlap with
    for (const pushedNode of pushedNodes) {
      pushOverlappingNodes(pushedNode, processed)
    }
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
      console.error('[refresh] Failed to read file:', e)
    }
    return false
  }

  // Hashtag extraction limits
  const MAX_HASHTAG_COUNT = 50
  const MAX_HASHTAG_LENGTH = 50

  /**
   * Extract hashtags from content
   * Matches: #word, #multi-word-tag, #CamelCase, #123numeric
   * Limited to prevent abuse
   */
  function extractHashtags(content: string): string[] {
    const hashtagRegex = /#([a-zA-Z0-9][\w-]*)/g
    const tags = new Set<string>()
    let match
    let count = 0
    while ((match = hashtagRegex.exec(content)) !== null && count < MAX_HASHTAG_COUNT) {
      const tag = match[1]
      // Skip tags that are too long
      if (tag.length <= MAX_HASHTAG_LENGTH) {
        tags.add(tag)
        count++
      }
    }
    return Array.from(tags)
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
      const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
      const links = new Set<string>()
      let match
      while ((match = wikilinkRegex.exec(content)) !== null) {
        links.add(match[1].trim().toLowerCase())
      }

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
    // Only use workspace_id if it exists in known workspaces, otherwise use null
    const validWorkspaceId = data.workspace_id
      ?? (currentWorkspaceId.value && workspaces.value.some(w => w.id === currentWorkspaceId.value)
          ? currentWorkspaceId.value
          : null)

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
    setEdges: (e) => { edgesStore.edges.length = 0; edgesStore.edges.push(...e) },
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
  const importVault = (path: string, targetWorkspaceId?: string) => importComposable.importVault(path, targetWorkspaceId)
  const importCitations = (filePath: string) => importComposable.importCitations(filePath)
  const importOntology = (filePath: string, options?: { createClassNodes?: boolean; createIndividualNodes?: boolean; workspaceId?: string; layout?: 'grid' | 'hierarchical' }) =>
    importComposable.importOntology(filePath, options)
  const refreshWorkspace = () => importComposable.refreshWorkspace()

  // File sync functions - forwarded to composable
  const watchVault = (path: string) => fileSync.watchVault(path)
  const stopWatching = () => fileSync.stopWatching()

  // Workspace functions - forwarded to workspace store
  const createWorkspace = (name: string) => workspaceStore.createWorkspace(name)
  const switchWorkspace = (workspaceId: string | null) => workspaceStore.switchWorkspace(workspaceId)
  const deleteWorkspace = (id: string) => workspaceStore.deleteWorkspace(id)
  const recoverWorkspace = (id: string) => workspaceStore.recoverWorkspace(id)
  const getOrphanedWorkspaceIds = () => workspaceStore.getOrphanedWorkspaceIds(nodes.value)
  const renameWorkspace = (id: string, newName: string) => workspaceStore.renameWorkspace(id, newName)

  function clearCanvas() {
    nodes.value = []
    edgesStore.edges.length = 0
    selectedNodeIds.value = []
  }

  // Edge cleanup functions - forwarded to edges store
  const cleanupOrphanEdges = () => edgesStore.cleanupOrphanEdges(new Set(nodes.value.map(n => n.id)))
  const deduplicateEdges = () => edgesStore.deduplicateEdges()

  // Frame functions - forwarded to frames store (with node cleanup for delete)
  const createFrame = (x: number, y: number, width = 400, height = 300, title = 'Frame') =>
    framesStore.createFrame(x, y, width, height, title, workspaceStore.currentWorkspaceId)
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
   * Nodes inside frames are excluded from layout
   */
  async function layoutNodes(
    nodeIds?: string[],
    options?: {
      centerX?: number
      centerY?: number
      chargeStrength?: number
      linkDistance?: number
    }
  ) {
    // Helper to check if a node is inside any frame (50%+ overlap)
    const isNodeInFrame = (node: Node): boolean => {
      if (node.frame_id) return true

      const nodeWidth = node.width || 200
      const nodeHeight = node.height || 120
      const nodeArea = nodeWidth * nodeHeight

      for (const frame of filteredFrames.value) {
        const overlapX = Math.max(0,
          Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) -
          Math.max(node.canvas_x, frame.canvas_x))
        const overlapY = Math.max(0,
          Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) -
          Math.max(node.canvas_y, frame.canvas_y))
        if (overlapX * overlapY > nodeArea * 0.5) return true
      }
      return false
    }

    const allTargetNodes = nodeIds
      ? filteredNodes.value.filter(n => nodeIds.includes(n.id))
      : filteredNodes.value

    // Exclude nodes inside frames from layout
    const targetNodes = allTargetNodes.filter(n => !isNodeInFrame(n))
    const excludedCount = allTargetNodes.length - targetNodes.length

    console.log('[Layout] Frames:', filteredFrames.value.length)
    console.log('[Layout] All nodes:', allTargetNodes.length, 'Excluded:', excludedCount, 'To layout:', targetNodes.length)

    if (targetNodes.length === 0) return

    const layoutNodesList = targetNodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
    }))

    // Calculate centroid based on nodes being laid out
    const centroidX = layoutNodesList.reduce((sum, n) => sum + n.x, 0) / layoutNodesList.length
    const centroidY = layoutNodesList.reduce((sum, n) => sum + n.y, 0) / layoutNodesList.length

    // Only include edges where BOTH endpoints are outside frames
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

    const positions = await applyForceLayout(layoutNodesList, layoutEdges, {
      centerX: options?.centerX ?? centroidX,
      centerY: options?.centerY ?? centroidY,
      chargeStrength: options?.chargeStrength,
      linkDistance: options?.linkDistance,
      iterations,
    })

    // Update positions
    const updates: Promise<void>[] = []
    for (const [id, pos] of positions) {
      updates.push(updateNodePosition(id, pos.x, pos.y))
    }
    await Promise.all(updates)

    nodeLayoutVersion.value++
  }

  /**
   * Check if a node's file is available for editing
   * Returns true if available, false if locked by another process
   */
  async function isNodeEditable(nodeId: string): Promise<boolean> {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node?.file_path) return true // No file = always editable

    try {
      return await checkFileAvailable(node.file_path)
    } catch (e) {
      storeLogger.error('Failed to check file availability:', e)
      return true // Assume editable on error
    }
  }

  /**
   * Acquire an edit lock for a node before editing
   * Shows notification if the file is locked by another application
   * Returns false if lock could not be acquired
   */
  async function startEditing(nodeId: string): Promise<boolean> {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node?.file_path) return true // No file to lock

    try {
      await acquireEditLock(nodeId)
      lockedNodeIds.value.add(nodeId)
      storeLogger.debug(`Acquired edit lock for node: ${node.title}`)
      return true
    } catch (e) {
      const errorMsg = String(e)
      if (errorMsg.includes('being edited')) {
        notifications$.error(
          `Cannot edit "${node.title}"`,
          'File is open in another application'
        )
        return false
      }
      notifications$.error('Failed to acquire edit lock', String(e))
      return false
    }
  }

  /**
   * Release an edit lock after editing is complete
   */
  async function stopEditing(nodeId: string): Promise<void> {
    if (!lockedNodeIds.value.has(nodeId)) return

    try {
      await releaseEditLock(nodeId)
      lockedNodeIds.value.delete(nodeId)
      storeLogger.debug(`Released edit lock for node: ${nodeId}`)
    } catch (e) {
      storeLogger.error('Failed to release edit lock:', e)
    }
  }

  /**
   * Check if we currently hold an edit lock for a node
   */
  function hasEditLock(nodeId: string): boolean {
    return lockedNodeIds.value.has(nodeId)
  }

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
