import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke, listen, readTextFile } from '../lib/tauri'
import { applyForceLayout } from '../canvas/layout'
import { workspaceStorage } from '../lib/storage'
import { storeLogger } from '../lib/logger'
import type {
  Node,
  Edge,
  Frame,
  Workspace,
  CreateNodeInput,
  CreateEdgeInput,
  FileChangeEvent,
} from '../types'

// Re-export types for consumers
export type { Node, Edge, Frame, Workspace, CreateNodeInput, CreateEdgeInput, FileChangeEvent }

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])
  const frames = ref<Frame[]>([])
  const selectedNodeIds = ref<string[]>([])
  const selectedFrameId = ref<string | null>(null)
  const workspaces = ref<Workspace[]>(workspaceStorage.getAll())
  const currentWorkspaceId = ref<string | null>(workspaceStorage.getCurrent())
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Version counter to trigger edge re-routing when node positions/sizes change
  const nodeLayoutVersion = ref(0)

  // For backwards compatibility
  const selectedNodeId = computed(() => selectedNodeIds.value[0] || null)
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

  const filteredFrames = computed(() => {
    if (!currentWorkspaceId.value) {
      return frames.value.filter(f => !f.workspace_id)
    }
    return frames.value.filter(f => f.workspace_id === currentWorkspaceId.value)
  })

  const filteredEdges = computed(() => {
    const nodeIds = new Set(filteredNodes.value.map(n => n.id))
    return edges.value.filter(e =>
      nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    )
  })

  // Sync localStorage workspaces to the database
  // This ensures foreign key constraints are satisfied
  async function syncWorkspacesToDatabase() {
    interface DbWorkspace {
      id: string
      name: string
      color: string | null
      vault_path: string | null
      created_at: number
      updated_at: number
    }

    const dbWorkspaces = await invoke<DbWorkspace[]>('get_workspaces')
    const dbIds = new Set(dbWorkspaces.map(w => w.id))

    // Create any localStorage workspaces that don't exist in the database
    for (const ws of workspaces.value) {
      if (!dbIds.has(ws.id)) {
        storeLogger.info(`Syncing workspace to database: ${ws.name} (${ws.id})`)
        await invoke('create_workspace', {
          input: {
            id: ws.id,
            name: ws.name,
            color: null,
            vaultPath: null,
          }
        })
      }
    }
  }

  async function initialize() {
    loading.value = true
    error.value = null
    try {
      // Sync localStorage workspaces to database (for foreign key constraints)
      await syncWorkspacesToDatabase()

      const [fetchedNodes, fetchedEdges] = await Promise.all([
        invoke<Node[]>('get_nodes'),
        invoke<Edge[]>('get_edges'),
      ])
      nodes.value = fetchedNodes

      // Deduplicate edges (keep first occurrence of each source-target pair)
      // Also handles bidirectional duplicates (A->B and B->A count as same pair)
      const seenPairs = new Set<string>()
      const beforeCount = fetchedEdges.length
      edges.value = fetchedEdges.filter(e => {
        // Create canonical key (smaller ID first) to catch bidirectional duplicates
        const ids = [e.source_node_id, e.target_node_id].sort()
        const key = `${ids[0]}:${ids[1]}`
        if (seenPairs.has(key)) return false
        seenPairs.add(key)
        return true
      })
      const removed = beforeCount - edges.value.length
      if (removed > 0) {
        storeLogger.info(`Initialize: deduplicated ${removed} edges (${beforeCount} -> ${edges.value.length})`)
      }
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
      nodeLayoutVersion.value++ // Trigger edge re-routing
      try {
        await invoke('update_node_position', { id, x, y })
      } catch (e) {
        console.error('Failed to update position:', e)
      }
    }
  }

  async function updateNodeSize(id: string, width: number, height: number, pushOthers = false) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.width = width
      node.height = height
      node.updated_at = Date.now()
      nodeLayoutVersion.value++ // Trigger edge re-routing

      // Push overlapping nodes away
      if (pushOthers) {
        pushOverlappingNodes(node)
      }

      try {
        await invoke('update_node_size', { id, width, height })
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

  function updateEdgeLinkType(id: string, linkType: string) {
    const idx = edges.value.findIndex(e => e.id === id)
    if (idx !== -1) {
      edges.value = edges.value.map(e =>
        e.id === id ? { ...e, link_type: linkType } : e
      )
    }
  }

  async function importVault(path: string, targetWorkspaceId?: string): Promise<Node[]> {
    loading.value = true
    try {
      const workspaceId = targetWorkspaceId ?? currentWorkspaceId.value
      storeLogger.info(`Importing vault: ${path}`)

      const importedNodes = await invoke<Node[]>('import_vault', {
        path,
        workspaceId
      })

      storeLogger.info(`Imported ${importedNodes.length} nodes`)
      nodes.value.push(...importedNodes)

      // Fetch all edges to include newly created wikilink edges
      const fetchedEdges = await invoke<Edge[]>('get_edges')
      edges.value = fetchedEdges

      // Deduplicate edges (frontend only since backend already ran during import)
      // Also handles bidirectional duplicates (A->B and B->A count as same pair)
      const seenPairs = new Set<string>()
      const beforeCount = edges.value.length
      edges.value = edges.value.filter(e => {
        const ids = [e.source_node_id, e.target_node_id].sort()
        const key = `${ids[0]}:${ids[1]}`
        if (seenPairs.has(key)) return false
        seenPairs.add(key)
        return true
      })
      const removed = beforeCount - edges.value.length
      if (removed > 0) {
        storeLogger.info(`Frontend deduplication removed ${removed} duplicate edges`)
      }

      // Start watching the vault for external changes
      await watchVault(path)
      storeLogger.info(`Started watching vault: ${path}`)

      return importedNodes
    } catch (e) {
      error.value = String(e)
      storeLogger.error('Import failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  let watcherUnlisten: (() => void) | null = null

  async function watchVault(path: string): Promise<void> {
    // Stop any existing watcher
    await stopWatching()

    // Start listening for file change events
    watcherUnlisten = await listen<FileChangeEvent>('vault-file-changed', handleFileChange)

    // Start the vault watcher
    await invoke('watch_vault', { path })
  }

  async function stopWatching(): Promise<void> {
    if (watcherUnlisten) {
      watcherUnlisten()
      watcherUnlisten = null
    }
    try {
      await invoke('stop_watching')
    } catch {
      // Ignore errors if not watching
    }
  }

  async function handleFileChange(event: FileChangeEvent) {
    const filePath = event.path

    switch (event.change_type) {
      case 'Created': {
        storeLogger.debug(`New file detected: ${filePath}`)
        break
      }
      case 'Modified': {
        const node = nodes.value.find(n => n.file_path === filePath)
        if (node && event.new_checksum && node.checksum !== event.new_checksum) {
          storeLogger.debug(`File modified externally: ${filePath}`)
          try {
            const content = await readTextFile(filePath)
            node.markdown_content = content
            node.checksum = event.new_checksum
            node.updated_at = Date.now()
            await invoke<string | null>('update_node_content', { id: node.id, content })
          } catch (e) {
            storeLogger.error('Failed to reload file content:', e)
            node.checksum = event.new_checksum
          }
        }
        break
      }
      case 'Deleted': {
        const node = nodes.value.find(n => n.file_path === filePath)
        if (node) {
          storeLogger.debug(`File deleted externally: ${filePath}`)
          node.file_path = null
          node.updated_at = Date.now()
        }
        break
      }
    }
  }

  // Workspace management
  function saveWorkspacesToStorage() {
    workspaceStorage.setAll(workspaces.value)
    workspaceStorage.setCurrent(currentWorkspaceId.value)
  }

  async function createWorkspace(name: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      created_at: Date.now(),
    }

    // Create workspace in database first (for foreign key constraints)
    await invoke('create_workspace', {
      input: {
        id: workspace.id,
        name: workspace.name,
        color: null,
        vaultPath: null,
      }
    })

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

  function renameWorkspace(id: string, newName: string) {
    const workspace = workspaces.value.find(w => w.id === id)
    if (workspace) {
      workspace.name = newName
      saveWorkspacesToStorage()
    }
  }

  function clearCanvas() {
    nodes.value = []
    edges.value = []
    selectedNodeIds.value = []
  }

  function cleanupOrphanEdges() {
    const nodeIds = new Set(nodes.value.map(n => n.id))
    const before = edges.value.length
    edges.value = edges.value.filter(
      e => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    )
    return before - edges.value.length
  }

  /**
   * Deduplicate edges both in frontend and backend database
   * Returns the number of duplicates removed
   */
  async function deduplicateEdges(): Promise<number> {
    // Backend deduplication
    let backendRemoved = 0
    try {
      backendRemoved = await invoke<number>('deduplicate_edges')
      storeLogger.info(`Backend deduplication removed ${backendRemoved} edges`)
    } catch (e) {
      storeLogger.error('Backend deduplication failed:', e)
    }

    // Frontend deduplication (handles bidirectional duplicates)
    const seenPairs = new Set<string>()
    const beforeCount = edges.value.length
    edges.value = edges.value.filter(e => {
      const ids = [e.source_node_id, e.target_node_id].sort()
      const key = `${ids[0]}:${ids[1]}`
      if (seenPairs.has(key)) return false
      seenPairs.add(key)
      return true
    })
    const frontendRemoved = beforeCount - edges.value.length
    storeLogger.info(`Frontend deduplication removed ${frontendRemoved} edges`)

    return backendRemoved + frontendRemoved
  }

  // Frame management
  function createFrame(x: number, y: number, width = 400, height = 300, title = 'Frame'): Frame {
    const frame: Frame = {
      id: crypto.randomUUID(),
      title,
      canvas_x: x,
      canvas_y: y,
      width,
      height,
      color: null,
      workspace_id: currentWorkspaceId.value,
    }
    frames.value.push(frame)
    return frame
  }

  function updateFramePosition(id: string, x: number, y: number) {
    const frame = frames.value.find(f => f.id === id)
    if (frame) {
      frame.canvas_x = x
      frame.canvas_y = y
    }
  }

  function updateFrameSize(id: string, width: number, height: number) {
    const frame = frames.value.find(f => f.id === id)
    if (frame) {
      frame.width = width
      frame.height = height
    }
  }

  function updateFrameTitle(id: string, title: string) {
    const frame = frames.value.find(f => f.id === id)
    if (frame) {
      frame.title = title
    }
  }

  function updateFrameColor(id: string, color: string | null) {
    const frame = frames.value.find(f => f.id === id)
    if (frame) {
      frame.color = color
    }
  }

  function deleteFrame(id: string) {
    // Unassign nodes from this frame
    for (const node of nodes.value) {
      if (node.frame_id === id) {
        node.frame_id = null
      }
    }
    frames.value = frames.value.filter(f => f.id !== id)
    if (selectedFrameId.value === id) {
      selectedFrameId.value = null
    }
  }

  function selectFrame(id: string | null) {
    selectedFrameId.value = id
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
    const targetNodes = nodeIds
      ? filteredNodes.value.filter(n => nodeIds.includes(n.id))
      : filteredNodes.value

    if (targetNodes.length === 0) return

    const layoutNodes = targetNodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
    }))

    // Calculate centroid of current nodes to use as center
    const centroidX = layoutNodes.reduce((sum, n) => sum + n.x, 0) / layoutNodes.length
    const centroidY = layoutNodes.reduce((sum, n) => sum + n.y, 0) / layoutNodes.length

    const layoutEdges = filteredEdges.value
      .filter(e => {
        const nodeIdSet = new Set(targetNodes.map(n => n.id))
        return nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id)
      })
      .map(e => ({
        source: e.source_node_id,
        target: e.target_node_id,
      }))

    // Adaptive iterations based on graph size
    const nodeCount = layoutNodes.length
    const iterations = nodeCount > 300 ? 150 : nodeCount > 100 ? 250 : 400

    const positions = applyForceLayout(layoutNodes, layoutEdges, {
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
    initialize,
    getNode,
    findNodeByTitle,
    updateNodePosition,
    updateNodeSize,
    updateNodeContent,
    updateNodeTitle,
    selectNode,
    createNode,
    deleteNode,
    createEdge,
    deleteEdge,
    updateEdgeLinkType,
    createFrame,
    updateFramePosition,
    updateFrameSize,
    updateFrameTitle,
    updateFrameColor,
    deleteFrame,
    selectFrame,
    assignNodesToFrame,
    importVault,
    watchVault,
    stopWatching,
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    renameWorkspace,
    clearCanvas,
    cleanupOrphanEdges,
    deduplicateEdges,
    layoutNodes,
  }
})
