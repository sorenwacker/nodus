import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke, getWorkspace } from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import { getStarterTemplates, getStarterTitles, getStarterNodeConfigs, getStarterEdgeConfigs, getEdgeLabel } from '../lib/templates'
import { canvasStorage, tagStorage } from '../lib/storage'
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
import { useNodeLayout } from '../composables/useNodeLayout'
import { useEntityOperations } from '../composables/useEntityOperations'
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
  EntityNodeType,
} from '../types'
import { clampCoord, clampNodeSize } from '../lib/geometry'
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
    reloadEdges: () => edgesStore.loadEdges(workspaceStore.currentWorkspaceId),
    // Frame sync dependencies for folder-frame sync
    getFrames: () => framesStore.frames,
    assignNodeToFrame: (nodeId: string, frameId: string | null) => {
      const node = nodes.value.find((n) => n.id === nodeId)
      if (node && node.frame_id !== frameId) {
        node.frame_id = frameId
        invoke('assign_node_to_frame', { nodeId, frameId }).catch((e) =>
          storeLogger.error('Failed to assign node to frame:', e)
        )
      }
    },
    getVaultPath: () => workspaceStore.currentVaultPath,
    // Frontmatter sync
    updateNodeTitle: async (id: string, title: string) => {
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        node.title = title
        node.updated_at = Date.now()
        await invoke('update_node_title', { id, title })
      }
    },
    updateNodeTags: async (id: string, tags: string[]) => {
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        node.tags = JSON.stringify(tags)
        node.updated_at = Date.now()
        await invoke('update_node_tags', { id, tags })
      }
    },
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
      storeLogger.debug(`[Nodes] Current workspace after init: ${currentWorkspace} (backend: ${workspaceForBackend})`)

      await Promise.all([
        edgesStore.initialize(workspaceForBackend),
        framesStore.initialize(),
      ])

      // Load nodes
      const fetchedNodes = await invoke<Node[]>('get_nodes')
      nodes.value = fetchedNodes

      // Debug: log node sizes from database
      console.log('[Nodes] Node sizes from DB:', fetchedNodes.slice(0, 5).map(n => ({ id: n.id.slice(0, 8), title: n.title, width: n.width, height: n.height })))

      storeLogger.debug(`[Nodes] Loaded ${fetchedNodes.length} total nodes`)
      const workspaceIds = [...new Set(fetchedNodes.map(n => n.workspace_id))]
      storeLogger.debug(`[Nodes] Workspace IDs in nodes: ${JSON.stringify(workspaceIds)}`)
      storeLogger.debug(`[Nodes] Filtered nodes count: ${filteredNodes.value.length}`)

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

  async function updateNodePosition(
    id: string,
    x: number,
    y: number,
    options?: { enforceFrame?: boolean; skipLayoutTrigger?: boolean }
  ) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      let finalX = clampCoord(x)
      let finalY = clampCoord(y)

      // Enforce frame containment if requested and node is in a frame
      if (options?.enforceFrame && node.frame_id) {
        const frame = framesStore.frames.find(f => f.id === node.frame_id)
        if (frame) {
          const padding = 20
          const titleHeight = 50
          const nodeWidth = node.width || 200
          const nodeHeight = node.height || 120
          // Clamp to frame bounds
          finalX = Math.max(
            frame.canvas_x + padding,
            Math.min(frame.canvas_x + frame.width - nodeWidth - padding, finalX)
          )
          finalY = Math.max(
            frame.canvas_y + padding + titleHeight,
            Math.min(frame.canvas_y + frame.height - nodeHeight - padding, finalY)
          )
        }
      }

      node.canvas_x = finalX
      node.canvas_y = finalY
      node.updated_at = Date.now()
      // Skip layout trigger during drag for performance - caller should trigger once at drag end
      if (!options?.skipLayoutTrigger) {
        nodeLayoutVersion.value++
      }
      try {
        await invoke('update_node_position', { id, x: finalX, y: finalY })
      } catch (e) {
        console.error('Failed to update position:', e)
      }
    }
  }

  /**
   * Manually trigger layout version update (call after drag ends)
   */
  function triggerLayoutUpdate() {
    nodeLayoutVersion.value++
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

      // Push overlapping nodes away using layout composable
      if (pushOthers && layoutComposable) {
        layoutComposable.pushOverlappingNodes(node)
      }

      try {
        console.log(`[Nodes] Saving size for ${id}: ${clampedWidth}x${clampedHeight}`)
        await invoke('update_node_size', { id, width: clampedWidth, height: clampedHeight })
        console.log(`[Nodes] Size saved successfully for ${id}`)
      } catch (e) {
        console.error('Failed to update size:', e)
      }
    }
  }

  // Layout composable (initialized after dependencies are available)
  let layoutComposable: ReturnType<typeof useNodeLayout> = undefined!
  // Entity operations composable
  let entityOpsComposable: ReturnType<typeof useEntityOperations> = undefined!

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
    if (!node || !node.file_path) return false

    try {
      const content = await invoke<string>('read_file_content', { path: node.file_path })
      if (content !== node.markdown_content) {
        node.markdown_content = content
        node.updated_at = Date.now()
        const newChecksum = await invoke<string | null>('update_node_content', { id, content })
        if (newChecksum) node.checksum = newChecksum
        return true
      }
    } catch (e) {
      const errorMsg = String(e)
      if (errorMsg.includes('No such file') || errorMsg.includes('not found')) {
        node.file_path = null
        node.checksum = null
        node.updated_at = Date.now()
        try { await invoke('update_node_file_path', { id, filePath: '' }) } catch { /* ignore */ }
      } else {
        storeLogger.error('Failed to read file:', e)
      }
    }
    return false
  }

  async function updateNodeContent(id: string, content: string) {
    // Remove trailing whitespace from each line, then trim the whole content
    const trimmedContent = content
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .trim()
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.markdown_content = trimmedContent
      node.updated_at = Date.now()
      try {
        const newChecksum = await invoke<string | null>('update_node_content', { id, content: trimmedContent })
        // Update checksum if file was written (prevents watcher reload loop)
        if (newChecksum) {
          node.checksum = newChecksum
        }
      } catch (e) {
        console.error('Failed to update content:', e)
      }

      // Extract hashtags and update tags
      const extractedTags = extractHashtags(trimmedContent)
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

        // Create tag nodes if setting is enabled
        if (tagStorage.getShowTagNodes() && tagNodesComposable) {
          try {
            await tagNodesComposable.createTagEdges(id, extractedTags)
          } catch (e) {
            console.error('Failed to create tag edges:', e)
          }
        }
      }

      // Extract wikilinks and sync edges
      const links = extractWikilinks(trimmedContent)

      // Build set of target node IDs from current wikilinks
      const currentTargetIds = new Set<string>()
      for (const linkTitle of links) {
        const targetNode = findNodeByTitle(linkTitle)
        if (targetNode && targetNode.id !== id) {
          currentTargetIds.add(targetNode.id)
        }
      }

      // Find existing wikilink edges from this node
      const existingWikilinkEdges = edges.value.filter(e =>
        e.source_node_id === id && e.link_type === 'wikilink'
      )

      // Delete edges that no longer have corresponding wikilinks
      for (const edge of existingWikilinkEdges) {
        if (!currentTargetIds.has(edge.target_node_id)) {
          await edgesStore.deleteEdge(edge.id)
        }
      }

      // Create edges for new wikilinks (or make existing reverse edges non-directional)
      for (const targetId of currentTargetIds) {
        // Check if edge already exists in this direction
        const existsForward = edges.value.some(e =>
          e.source_node_id === id &&
          e.target_node_id === targetId &&
          e.link_type === 'wikilink'
        )
        if (existsForward) continue

        // Check if reverse edge exists (target→source)
        const reverseEdge = edges.value.find(e =>
          e.source_node_id === targetId &&
          e.target_node_id === id &&
          e.link_type === 'wikilink'
        )

        if (reverseEdge) {
          // Reverse edge exists - make it non-directional instead of creating duplicate
          if (reverseEdge.directed !== false) {
            await edgesStore.updateEdgeDirected(reverseEdge.id, false)
          }
        } else {
          // No edge in either direction - create new one
          await createEdge({
            source_node_id: id,
            target_node_id: targetId,
            link_type: 'wikilink',
          })
        }
      }
    }
  }

  async function updateNodeTitle(id: string, title: string) {
    const trimmedTitle = title.trim()
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.title = trimmedTitle
      node.updated_at = Date.now()
      try {
        await invoke('update_node_title', { id, title: trimmedTitle })
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
      title: data.title.trim(),
      markdown_content: data.markdown_content?.trim() || null,
      workspace_id: validWorkspaceId,
    }

    try {
      const node = await invoke<Node>('create_node', { input: inputWithWorkspace })
      nodes.value.push(node)
      nodeLayoutVersion.value++ // Trigger reactivity for displayNodes/visibleNodes
      return node
    } catch (e) {
      console.error('Failed to create node:', e)
      // Fallback for development
      const node: Node = {
        id: crypto.randomUUID(),
        title: data.title.trim(),
        file_path: data.file_path || null,
        markdown_content: data.markdown_content?.trim() || null,
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
      nodeLayoutVersion.value++ // Trigger reactivity for displayNodes/visibleNodes
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
    // Clear selection if deleted node was selected
    selectedNodeIds.value = selectedNodeIds.value.filter(nid => nid !== id)
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
    // Clear selection for deleted nodes
    selectedNodeIds.value = selectedNodeIds.value.filter(nid => !idSet.has(nid))
    // Remove edges connected to deleted nodes
    edgesStore.cleanupOrphanEdges(new Set(nodes.value.map(n => n.id)))
  }

  // Edge functions - forwarded to edges store
  const createEdge = (data: CreateEdgeInput) => edgesStore.createEdge(data)

  /**
   * Delete an edge. If it's a wikilink edge, convert the [[...]] to plain text in the source node.
   */
  async function deleteEdge(id: string): Promise<void> {
    const edge = edgesStore.getEdge(id)

    // If it's a wikilink edge, convert the wikilink to plain text in source node
    if (edge && edge.link_type === 'wikilink') {
      const sourceNode = nodes.value.find(n => n.id === edge.source_node_id)
      const targetNode = nodes.value.find(n => n.id === edge.target_node_id)

      if (sourceNode && targetNode && sourceNode.markdown_content) {
        // Replace [[Target Title]] or [[Target Title|display]] with just the display text
        const targetTitle = targetNode.title
        const wikilinkRegex = new RegExp(
          `\\[\\[${escapeRegex(targetTitle)}(?:\\|([^\\]]+))?\\]\\]`,
          'gi'
        )
        const newContent = sourceNode.markdown_content.replace(wikilinkRegex, (_match, display) => {
          return display || targetTitle
        })

        if (newContent !== sourceNode.markdown_content) {
          // Update content without triggering edge sync (would cause infinite loop)
          sourceNode.markdown_content = newContent
          sourceNode.updated_at = Date.now()
          try {
            await invoke<string | null>('update_node_content', { id: sourceNode.id, content: newContent })
          } catch (e) {
            console.error('Failed to update content after wikilink removal:', e)
          }
        }
      }
    }

    await edgesStore.deleteEdge(id)
  }

  /** Escape special regex characters in a string */
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  const restoreEdge = (edge: Edge) => edgesStore.restoreEdge(edge)
  const updateEdgeLinkType = (id: string, linkType: string) => edgesStore.updateEdgeLinkType(id, linkType)
  const updateEdgeColor = (id: string, color: string | null) => edgesStore.updateEdgeColor(id, color)
  const updateEdgeDirected = (id: string, directed: boolean) => edgesStore.updateEdgeDirected(id, directed)

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
    // Frame-folder sync: create frames from folder structure during import
    createFrame: (x, y, width, height, title, wsId, folderPath, parentFrameId) =>
      framesStore.createFrame(x, y, width, height, title, wsId, folderPath, parentFrameId),
    createFrameAsync: (x, y, width, height, title, wsId, folderPath, parentFrameId) =>
      framesStore.createFrameAsync(x, y, width, height, title, wsId, folderPath, parentFrameId),
    assignNodesToFrame: (nodeIds, frameId) => {
      for (const node of nodes.value) {
        if (nodeIds.includes(node.id) && node.frame_id !== frameId) {
          node.frame_id = frameId
          // Persist to backend
          invoke('assign_node_to_frame', { nodeId: node.id, frameId }).catch((e) =>
            storeLogger.error('Failed to assign node to frame:', e)
          )
        }
      }
    },
    updateNodePosition: (id, x, y) => {
      const node = nodes.value.find((n) => n.id === id)
      if (node) {
        node.canvas_x = x
        node.canvas_y = y
        // Persist to database
        invoke('update_node_position', { id, x, y }).catch((e) =>
          storeLogger.error('Failed to update node position:', e)
        )
      }
    },
    getFrames: () => framesStore.frames,
    getVaultPath: () => workspaceStore.currentVaultPath,
  })

  tagNodesComposable = useTagNodes({
    getNodes: () => nodes.value,
    getCurrentWorkspaceId: () => workspaceStore.currentWorkspaceId,
    createNode,
    getEdges: () => edgesStore.edges,
    createEdge,
  })

  // Initialize layout composable
  layoutComposable = useNodeLayout({
    getNodes: () => nodes.value,
    getFilteredNodes: () => filteredNodes.value,
    getFilteredEdges: () => filteredEdges.value,
    getFilteredFrames: () => filteredFrames.value,
    updateNodePosition,
    updateNodeSize: async (id, width, height) => {
      // Update without push to avoid infinite recursion
      await updateNodeSize(id, width, height, false)
    },
    incrementLayoutVersion: () => { nodeLayoutVersion.value++ },
  })

  // Initialize entity operations composable
  entityOpsComposable = useEntityOperations({
    getNodes: () => nodes.value,
    getFilteredNodes: () => filteredNodes.value,
    getNode,
    createNode,
    createEdge,
    getEntityEdgesForNode: (nodeId, direction) => edgesStore.getEntityEdgesForNode(nodeId, direction),
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
  const syncFramesFromFolders = () => importComposable.syncFramesFromFolders()

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
        color_theme: config.color_theme,
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
          label: getEdgeLabel(config.labelKey, locale),
          directed: config.directed,
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
      if (nodeIds.includes(node.id) && node.frame_id !== frameId) {
        node.frame_id = frameId
        // Persist to backend
        invoke('assign_node_to_frame', { nodeId: node.id, frameId }).catch((e) =>
          storeLogger.error('Failed to assign node to frame:', e)
        )
      }
    }
  }

  /**
   * Check if moving a node's file would cause a collision
   * Returns the conflicting filename if collision exists, null otherwise
   */
  async function checkFileCollision(nodeId: string, targetFolder: string): Promise<string | null> {
    const result = await invoke<string | null>('check_file_collision', { nodeId, targetFolder })
    return result
  }

  /**
   * Move a node's file to a different folder
   * Used for folder-frame sync when nodes are dragged between frames
   * @param collisionResolution - 'auto' (auto-rename), 'replace' (overwrite), or a custom filename
   */
  async function moveNodeFile(
    nodeId: string,
    targetFolder: string,
    collisionResolution?: string
  ): Promise<string> {
    const node = nodes.value.find((n) => n.id === nodeId)
    const oldPath = node?.file_path

    const newPath = await invoke<string>('move_node_file', {
      nodeId,
      targetFolder,
      collisionResolution: collisionResolution ?? 'auto',
    })

    // Update local node state
    if (node) {
      node.file_path = newPath
    }

    // Update backlinks in other nodes that reference this node
    if (oldPath && newPath !== oldPath) {
      const vaultPath = workspaceStore.currentVaultPath
      await updateBacklinksForMovedNode(nodeId, oldPath, newPath, vaultPath)
    }

    return newPath
  }

  /**
   * Update wikilinks in other nodes when a node moves
   */
  async function updateBacklinksForMovedNode(
    nodeId: string,
    oldPath: string,
    newPath: string,
    vaultPath: string | null
  ): Promise<void> {
    const movedNode = nodes.value.find((n) => n.id === nodeId)
    if (!movedNode) return

    // Calculate new wikilink target
    let newTarget = movedNode.title
    if (newPath && vaultPath) {
      const normalizedNewPath = newPath.replace(/\\/g, '/')
      const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/$/, '')
      if (normalizedNewPath.startsWith(normalizedVault)) {
        const relativePath = normalizedNewPath.slice(normalizedVault.length + 1)
        newTarget = relativePath.replace(/\.md$/, '')
      }
    }

    // Find and update nodes with wikilinks to the moved node
    for (const node of nodes.value) {
      if (node.id === nodeId || !node.markdown_content) continue

      // Check if this node has wikilinks that might reference the moved node
      const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
      let match
      let updatedContent = node.markdown_content
      let hasChanges = false

      // Collect all matches first to avoid issues with index shifting
      const matches: Array<{ target: string; display: string | null; fullMatch: string; index: number }> = []
      while ((match = wikilinkRegex.exec(node.markdown_content)) !== null) {
        matches.push({
          target: match[1],
          display: match[2] || null,
          fullMatch: match[0],
          index: match.index,
        })
      }

      // Process matches in reverse order to preserve indices
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        const targetLower = m.target.toLowerCase()

        // Check if this wikilink matches the moved node
        let isMatch = false

        // Match by title
        if (movedNode.title.toLowerCase() === targetLower) {
          isMatch = true
        }

        // Match by old path
        if (!isMatch && oldPath) {
          const pathParts = oldPath.replace(/\\/g, '/').split('/')
          const filename = pathParts[pathParts.length - 1].replace(/\.md$/, '')
          if (targetLower === filename.toLowerCase()) {
            isMatch = true
          }
          // Check folder/filename pattern
          if (!isMatch && pathParts.length >= 2) {
            const folderAndFile = pathParts.slice(-2).join('/').replace(/\.md$/, '')
            if (targetLower === folderAndFile.toLowerCase()) {
              isMatch = true
            }
          }
        }

        if (isMatch && m.target !== newTarget) {
          const newWikilink = m.display ? `[[${newTarget}|${m.display}]]` : `[[${newTarget}]]`
          updatedContent =
            updatedContent.slice(0, m.index) +
            newWikilink +
            updatedContent.slice(m.index + m.fullMatch.length)
          hasChanges = true
        }
      }

      if (hasChanges) {
        try {
          await updateNodeContent(node.id, updatedContent)
          storeLogger.info(`Updated backlinks in node: ${node.title}`)
        } catch (e) {
          storeLogger.error(`Failed to update backlinks in node ${node.id}:`, e)
        }
      }
    }
  }

  /**
   * Update a node's file path in local state (for use by node dragging)
   */
  function updateNodeFilePath(nodeId: string, filePath: string) {
    const node = nodes.value.find((n) => n.id === nodeId)
    if (node) {
      node.file_path = filePath
    }
  }

  /**
   * Get the current workspace vault path
   */
  function getVaultPath(): string | null {
    return workspaceStore.currentVaultPath
  }

  // Layout nodes - forwarded to layout composable
  const layoutNodes = (
    nodeIds?: string[],
    options?: {
      centerX?: number
      centerY?: number
      chargeStrength?: number
      linkDistance?: number
      frameId?: string
      fitToFrame?: boolean
    }
  ) => layoutComposable.layoutNodes(nodeIds, options)

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

  // Sync all existing hashtags to tag nodes
  async function syncAllTagNodes() {
    if (!tagNodesComposable) return
    for (const node of nodes.value) {
      if (node.node_type === 'tag') continue // Skip tag nodes themselves
      if (!node.tags) continue
      try {
        const tags = JSON.parse(node.tags)
        if (Array.isArray(tags) && tags.length > 0) {
          await tagNodesComposable.createTagEdges(node.id, tags)
        }
      } catch {
        // Invalid JSON in tags
      }
    }
  }

  // Remove all tag nodes
  async function removeAllTagNodes() {
    const tagNodes = nodes.value.filter(n => n.node_type === 'tag')
    for (const tagNode of tagNodes) {
      await deleteNode(tagNode.id)
    }
  }

  // Listen for tag nodes setting change
  const handleTagNodesChange = async (e: Event) => {
    const enabled = (e as CustomEvent).detail
    if (enabled) {
      await syncAllTagNodes()
    } else {
      await removeAllTagNodes()
    }
  }
  window.addEventListener('nodus-tag-nodes-change', handleTagNodesChange)

  // Entity functions - forwarded to entity operations composable
  const getEntities = () => entityOpsComposable.getEntities()
  const getEntitiesByType = (entityType: EntityNodeType) => entityOpsComposable.getEntitiesByType(entityType)
  const getLinkedEntities = (nodeId: string) => entityOpsComposable.getLinkedEntities(nodeId)
  const getNodesReferencingEntity = (entityId: string) => entityOpsComposable.getNodesReferencingEntity(entityId)
  const createEntityNode = (
    entityType: EntityNodeType,
    title: string,
    options?: { canvas_x?: number; canvas_y?: number; markdown_content?: string; color_theme?: string | null }
  ) => entityOpsComposable.createEntityNode(entityType, title, options)
  const linkToEntity = (sourceNodeId: string, entityNodeId: string, linkType?: string) =>
    entityOpsComposable.linkToEntity(sourceNodeId, entityNodeId, linkType)

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
    triggerLayoutUpdate,
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
    updateEdgeDirected,
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
    syncFramesFromFolders,
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
    loadEdges: () => edgesStore.loadEdges(workspaceStore.currentWorkspaceId),
    loadNodes: async () => {
      const fetchedNodes = await invoke<Node[]>('get_nodes')
      nodes.value = fetchedNodes
    },
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
    syncAllTagNodes,
    removeAllTagNodes,
    // Entity management
    getEntities,
    getEntitiesByType,
    getLinkedEntities,
    getNodesReferencingEntity,
    createEntityNode,
    linkToEntity,
    // File-folder sync
    checkFileCollision,
    moveNodeFile,
    updateNodeFilePath,
    getVaultPath,
    markProgrammaticMove: fileSync.markProgrammaticMove,
  }
})
