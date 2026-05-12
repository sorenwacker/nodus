/**
 * Import composable
 * Handles vault, citation, and ontology imports
 */
import { ref } from 'vue'
import { invoke, readTextFile, refreshWorkspace as refreshWorkspaceApi, setWorkspaceSync } from '../lib/tauri'
import { parseReferences, citationToMarkdown } from '../lib/bibtex'
import { storeLogger } from '../lib/logger'
import { handleAsyncError } from '../lib/errorHandling'
import { notifications$ } from '../composables/useNotifications'
import type { Node, Edge, OntologyImportResult } from '../types'

export interface ImportDeps {
  getCurrentWorkspaceId: () => string | null
  getNodes: () => Node[]
  setNodes: (nodes: Node[]) => void
  addNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  reloadFrames: () => Promise<void>
  createNode: (data: {
    title: string
    markdown_content?: string
    node_type?: string
    canvas_x: number
    canvas_y: number
    width?: number
    height?: number
    tags?: string[]
    color_theme?: string
  }) => Promise<Node>
  watchVault: (path: string) => Promise<void>
  // Frame-folder sync dependencies
  createFrame?: (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    workspaceId: string | null,
    folderPath: string | null,
    parentFrameId: string | null
  ) => { id: string }
  /** Async version of createFrame that waits for database persistence */
  createFrameAsync?: (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    workspaceId: string | null,
    folderPath: string | null,
    parentFrameId: string | null
  ) => Promise<{ id: string }>
  assignNodesToFrame?: (nodeIds: string[], frameId: string | null) => void
  updateNodePosition?: (id: string, x: number, y: number) => void
  getFrames?: () => Array<{ id: string; folder_path: string | null; canvas_x: number; canvas_y: number; width: number; height: number }>
  getVaultPath?: () => string | null
}

/**
 * Layout nodes inside a frame in a grid, using actual node sizes
 */
function layoutNodesInFrame(
  nodes: Node[],
  frame: { canvas_x: number; canvas_y: number; width: number; height: number },
  padding: number,
  spacing: number,
  nodesPerRow: number,
  deps: ImportDeps
): void {
  if (!deps.updateNodePosition || nodes.length === 0) return

  // Calculate positions row by row, accounting for actual node heights
  let currentX = frame.canvas_x + padding
  let currentY = frame.canvas_y + padding + 40 // +40 for frame title
  let rowMaxHeight = 0
  let colIndex = 0

  for (const node of nodes) {
    const nodeWidth = node.width || 200
    const nodeHeight = node.height || 120

    // Check if we need to wrap to next row
    if (colIndex >= nodesPerRow) {
      currentX = frame.canvas_x + padding
      currentY += rowMaxHeight + spacing
      rowMaxHeight = 0
      colIndex = 0
    }

    // Position the node
    deps.updateNodePosition(node.id, currentX, currentY)

    // Track max height in this row
    rowMaxHeight = Math.max(rowMaxHeight, nodeHeight)

    // Move X for next node
    currentX += nodeWidth + spacing
    colIndex++
  }
}

/**
 * Calculate frame size needed to fit nodes in a grid layout
 */
function calculateFrameSizeForNodes(
  nodes: Node[],
  padding: number,
  spacing: number,
  nodesPerRow: number
): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: 300, height: 200 }
  }

  // Group nodes into rows and calculate dimensions
  const rows: Node[][] = []
  for (let i = 0; i < nodes.length; i += nodesPerRow) {
    rows.push(nodes.slice(i, i + nodesPerRow))
  }

  // Calculate width based on widest row
  let maxRowWidth = 0
  for (const row of rows) {
    let rowWidth = 0
    for (const node of row) {
      rowWidth += (node.width || 200) + spacing
    }
    rowWidth -= spacing // Remove trailing spacing
    maxRowWidth = Math.max(maxRowWidth, rowWidth)
  }

  // Calculate height based on sum of row heights
  let totalHeight = 0
  for (const row of rows) {
    let rowMaxHeight = 0
    for (const node of row) {
      rowMaxHeight = Math.max(rowMaxHeight, node.height || 120)
    }
    totalHeight += rowMaxHeight + spacing
  }
  totalHeight -= spacing // Remove trailing spacing

  return {
    width: Math.max(300, maxRowWidth + padding * 2),
    height: Math.max(200, totalHeight + padding * 2 + 40), // +40 for frame title
  }
}

/**
 * Extract relative folder path from a file path and vault path
 */
function getRelativeFolder(filePath: string, vaultPath: string): string {
  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (!normalizedFile.startsWith(normalizedVault)) return ''

  const relativePath = normalizedFile.slice(normalizedVault.length + 1)
  const lastSlash = relativePath.lastIndexOf('/')
  return lastSlash > 0 ? relativePath.slice(0, lastSlash) : ''
}

/**
 * Create frames from folder structure based on imported nodes
 * Moves nodes into their frames in a grid layout
 * Returns the number of frames created
 */
async function createFramesFromFolders(
  nodes: Node[],
  vaultPath: string,
  workspaceId: string | null,
  deps: ImportDeps
): Promise<number> {
  // Need either createFrame or createFrameAsync
  const hasFrameCreation = deps.createFrame || deps.createFrameAsync
  if (!hasFrameCreation || !deps.assignNodesToFrame) return 0

  // Build map of existing frames by folder path
  const existingFramesByPath = new Map<string, { id: string; canvas_x: number; canvas_y: number; width: number; height: number }>()
  const existingFrames = deps.getFrames?.() || []
  for (const f of existingFrames) {
    if (f.folder_path) {
      existingFramesByPath.set(f.folder_path, f as { id: string; canvas_x: number; canvas_y: number; width: number; height: number })
    }
  }

  // Build a map of nodes by ID for quick lookup
  const nodeMap = new Map<string, Node>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // Extract unique folder paths from nodes
  const folderToNodeIds = new Map<string, string[]>()

  for (const node of nodes) {
    if (!node.file_path) continue
    const folder = getRelativeFolder(node.file_path, vaultPath)
    if (!folder) continue // Skip root-level files

    if (!folderToNodeIds.has(folder)) {
      folderToNodeIds.set(folder, [])
    }
    folderToNodeIds.get(folder)!.push(node.id)
  }

  // Sort folders to process parent folders first (for nesting)
  const sortedFolders = Array.from(folderToNodeIds.keys()).sort((a, b) => {
    const depthA = a.split('/').length
    const depthB = b.split('/').length
    return depthA - depthB
  })

  // Create frames for each folder
  const folderToFrameId = new Map<string, string>()
  let framesCreated = 0

  // Layout configuration
  const FRAME_PADDING = 60
  const NODE_SPACING = 30
  const NODES_PER_ROW = 3
  const FRAME_SPACING = 150
  const FRAMES_PER_ROW = 3
  const START_X = 100
  const START_Y = 100

  // Track frame sizes for proper row/column positioning
  const frameSizes: Array<{ width: number; height: number }> = []

  for (let i = 0; i < sortedFolders.length; i++) {
    const folderPath = sortedFolders[i]
    const nodeIds = folderToNodeIds.get(folderPath) || []

    // Check if frame already exists for this folder
    const existingFrame = existingFramesByPath.get(folderPath)
    if (existingFrame) {
      // Frame exists - move nodes into it using actual node sizes
      if (deps.updateNodePosition && nodeIds.length > 0) {
        const folderNodes = nodeIds.map((id) => nodeMap.get(id)).filter((n): n is Node => !!n)
        layoutNodesInFrame(folderNodes, existingFrame, FRAME_PADDING, NODE_SPACING, NODES_PER_ROW, deps)
      }
      if (nodeIds.length > 0) {
        deps.assignNodesToFrame(nodeIds, existingFrame.id)
      }
      continue
    }

    const parts = folderPath.split('/')
    const title = parts[parts.length - 1] // Use folder name as frame title

    // Find parent frame if this is a nested folder
    let parentFrameId: string | null = null
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('/')
      parentFrameId = folderToFrameId.get(parentPath) ?? null
    }

    // Get actual nodes for this folder
    const folderNodes = nodeIds.map((id) => nodeMap.get(id)).filter((n): n is Node => !!n)

    // Calculate frame size based on actual node sizes
    const { width: frameWidth, height: frameHeight } = calculateFrameSizeForNodes(
      folderNodes,
      FRAME_PADDING,
      NODE_SPACING,
      NODES_PER_ROW
    )

    // Calculate frame position using cumulative positioning
    // Track row heights for proper vertical spacing
    const frameIndex = framesCreated
    const frameCol = frameIndex % FRAMES_PER_ROW
    const frameRow = Math.floor(frameIndex / FRAMES_PER_ROW)

    // Calculate X position based on previous frames in this row
    let frameX = START_X
    for (let c = 0; c < frameCol; c++) {
      const prevIndex = frameRow * FRAMES_PER_ROW + c
      if (prevIndex < frameSizes.length) {
        frameX += frameSizes[prevIndex].width + FRAME_SPACING
      } else {
        frameX += 400 + FRAME_SPACING // Default width
      }
    }

    // Calculate Y position based on max height of previous rows
    let frameY = START_Y
    for (let r = 0; r < frameRow; r++) {
      let maxRowHeight = 300 // Default height
      for (let c = 0; c < FRAMES_PER_ROW; c++) {
        const idx = r * FRAMES_PER_ROW + c
        if (idx < frameSizes.length) {
          maxRowHeight = Math.max(maxRowHeight, frameSizes[idx].height)
        }
      }
      frameY += maxRowHeight + FRAME_SPACING
    }

    // Store this frame's size for future calculations
    frameSizes.push({ width: frameWidth, height: frameHeight })

    // Use createFrameAsync if available for proper database persistence
    let frame: { id: string }
    if (deps.createFrameAsync) {
      frame = await deps.createFrameAsync(
        frameX,
        frameY,
        frameWidth,
        frameHeight,
        title,
        workspaceId,
        folderPath,
        parentFrameId
      )
    } else {
      frame = deps.createFrame!(
        frameX,
        frameY,
        frameWidth,
        frameHeight,
        title,
        workspaceId,
        folderPath,
        parentFrameId
      )
    }

    folderToFrameId.set(folderPath, frame.id)
    framesCreated++

    // Move nodes into the frame in a grid layout using actual node sizes
    if (deps.updateNodePosition && folderNodes.length > 0) {
      layoutNodesInFrame(
        folderNodes,
        { canvas_x: frameX, canvas_y: frameY, width: frameWidth, height: frameHeight },
        FRAME_PADDING,
        NODE_SPACING,
        NODES_PER_ROW,
        deps
      )
    }

    // Assign nodes to this frame
    if (nodeIds.length > 0) {
      deps.assignNodesToFrame(nodeIds, frame.id)
    }
  }

  return framesCreated
}

export function useImport(deps: ImportDeps) {
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Import markdown files from a vault directory
   * @param path - Path to the vault directory
   * @param deleteOriginals - If true, delete original files after import (default: false)
   * @param targetWorkspaceId - Optional workspace to import into
   */
  async function importVault(path: string, deleteOriginals?: boolean, targetWorkspaceId?: string): Promise<Node[]> {
    loading.value = true
    try {
      const workspaceId = targetWorkspaceId ?? deps.getCurrentWorkspaceId()
      storeLogger.info(`Importing vault: ${path}, deleteOriginals: ${deleteOriginals}`)

      const importedNodes = await invoke<Node[]>('import_vault', {
        path,
        workspaceId,
        deleteOriginals: deleteOriginals ?? false,
      })

      storeLogger.info(`Imported ${importedNodes.length} nodes`)
      deps.addNodes(importedNodes)

      // Create frames from folder structure if frame creation is available
      if ((deps.createFrame || deps.createFrameAsync) && deps.assignNodesToFrame && importedNodes.length > 0) {
        const framesCreated = await createFramesFromFolders(importedNodes, path, workspaceId, deps)
        if (framesCreated > 0) {
          storeLogger.info(`Created ${framesCreated} frames from folder structure`)
        }
      }

      // Fetch all edges to include newly created wikilink edges
      const fetchedEdges = await invoke<Edge[]>('get_edges', { workspaceId })

      // Deduplicate edges (handles bidirectional duplicates)
      const seenPairs = new Set<string>()
      const beforeCount = fetchedEdges.length
      const deduplicatedEdges = fetchedEdges.filter((e) => {
        const ids = [e.source_node_id, e.target_node_id].sort()
        const key = `${ids[0]}:${ids[1]}`
        if (seenPairs.has(key)) return false
        seenPairs.add(key)
        return true
      })
      const removed = beforeCount - deduplicatedEdges.length
      if (removed > 0) {
        storeLogger.info(`Frontend deduplication removed ${removed} duplicate edges`)
      }
      deps.setEdges(deduplicatedEdges)

      // Reload frames to include newly created ones
      await deps.reloadFrames()

      // Enable sync mode for this workspace
      if (workspaceId) {
        await setWorkspaceSync(workspaceId, true)
        storeLogger.info(`Enabled sync mode for workspace: ${workspaceId}`)
      }

      // Start watching the vault for external changes
      await deps.watchVault(path)
      storeLogger.info(`Started watching vault: ${path}`)

      return importedNodes
    } catch (e) {
      handleAsyncError({
        context: 'Import',
        error,
        notify: (t, m) => notifications$.error(t, m),
      })(e)
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Import citations from BibTeX or CSL-JSON file
   * Creates citation nodes with formatted markdown content
   */
  async function importCitations(filePath: string): Promise<Node[]> {
    loading.value = true
    try {
      storeLogger.info(`Importing citations from: ${filePath}`)

      const content = await readTextFile(filePath)
      const entries = parseReferences(content)

      if (entries.length === 0) {
        notifications$.warning(
          'No citations found',
          'The file did not contain any valid BibTeX or CSL-JSON entries'
        )
        return []
      }

      storeLogger.info(`Parsed ${entries.length} citation entries`)

      // Create nodes for each citation entry
      const createdNodes: Node[] = []
      const startX = 100
      const startY = 100
      const nodeSpacing = 250
      const nodesPerRow = 4

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const row = Math.floor(i / nodesPerRow)
        const col = i % nodesPerRow

        const node = await deps.createNode({
          title: entry.title || entry.key,
          markdown_content: citationToMarkdown(entry),
          node_type: 'citation',
          canvas_x: startX + col * nodeSpacing,
          canvas_y: startY + row * nodeSpacing,
          width: 220,
          height: 180,
          tags: entry.keywords ? entry.keywords.split(',').map((k) => k.trim()) : undefined,
        })

        createdNodes.push(node)
      }

      storeLogger.info(`Created ${createdNodes.length} citation nodes`)
      notifications$.success(
        'Citations imported',
        `${createdNodes.length} citation${createdNodes.length === 1 ? '' : 's'} added to canvas`
      )

      return createdNodes
    } catch (e) {
      handleAsyncError({
        context: 'Citation import',
        error,
        notify: (t, m) => notifications$.error(t, m),
      })(e)
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Import RDF ontology (Turtle, RDF/XML, OWL, JSON-LD)
   * Creates nodes for individuals and edges for object properties
   */
  async function importOntology(
    filePath: string,
    options?: {
      createClassNodes?: boolean
      createIndividualNodes?: boolean
      workspaceId?: string
      layout?: 'grid' | 'hierarchical'
    }
  ): Promise<OntologyImportResult> {
    loading.value = true
    try {
      storeLogger.info(`Importing ontology from: ${filePath}`)

      const result = await invoke<OntologyImportResult>('import_ontology', {
        input: {
          filePath,
          workspaceId: options?.workspaceId ?? deps.getCurrentWorkspaceId(),
          createClassNodes: options?.createClassNodes ?? true,
          createIndividualNodes: options?.createIndividualNodes ?? false,
          layout: options?.layout ?? 'grid',
        },
      })

      storeLogger.info(
        `Imported ${result.nodesCreated} nodes, ${result.edgesCreated} edges, ${result.classNodesCreated} class nodes`
      )

      // Reload nodes and edges to include the newly created ones
      const workspaceId = deps.getCurrentWorkspaceId()
      const [fetchedNodes, fetchedEdges] = await Promise.all([
        invoke<Node[]>('get_nodes'),
        invoke<Edge[]>('get_edges', { workspaceId: workspaceId ?? null }),
      ])
      deps.setNodes(fetchedNodes)
      deps.setEdges(fetchedEdges)

      notifications$.success(
        'Ontology imported',
        `${result.nodesCreated} nodes and ${result.edgesCreated} edges created`
      )

      return result
    } catch (e) {
      handleAsyncError({
        context: 'Ontology import',
        error,
        notify: (t, m) => notifications$.error(t, m),
      })(e)
      return { nodesCreated: 0, edgesCreated: 0, classNodesCreated: 0, nodeIds: [] }
    } finally {
      loading.value = false
    }
  }

  /**
   * Sync frames from folder structure
   * Creates frames for folders that don't have frames yet
   */
  async function syncFramesFromFolders(): Promise<number> {
    const hasFrameCreation = deps.createFrame || deps.createFrameAsync
    if (!hasFrameCreation || !deps.assignNodesToFrame || !deps.getVaultPath) {
      return 0
    }

    const vaultPath = deps.getVaultPath()
    if (!vaultPath) return 0

    const nodes = deps.getNodes()
    const workspaceId = deps.getCurrentWorkspaceId()

    const framesCreated = await createFramesFromFolders(nodes, vaultPath, workspaceId, deps)
    if (framesCreated > 0) {
      storeLogger.info(`Created ${framesCreated} frames from folder structure`)
      notifications$.success('Frames synced', `Created ${framesCreated} frames from folder structure`)
    }

    return framesCreated
  }

  /**
   * Refresh workspace files from disk
   */
  async function refreshWorkspace(): Promise<number> {
    loading.value = true
    try {
      const workspaceId = deps.getCurrentWorkspaceId()
      storeLogger.info(`Refreshing workspace: ${workspaceId || 'default'}`)

      const updated = await refreshWorkspaceApi(workspaceId)

      // Always sync frames from folder structure
      const vaultPath = deps.getVaultPath?.()
      const hasFrameCreation = deps.createFrame || deps.createFrameAsync
      if (vaultPath && hasFrameCreation && deps.assignNodesToFrame) {
        const nodes = deps.getNodes()
        const framesCreated = await createFramesFromFolders(nodes, vaultPath, workspaceId, deps)
        if (framesCreated > 0) {
          storeLogger.info(`Created ${framesCreated} frames from folder structure`)
        }
      }

      // Reload nodes to get updated content
      const fetchedNodes = await invoke<Node[]>('get_nodes')
      deps.setNodes(fetchedNodes)

      if (updated > 0) {
        storeLogger.info(`Refreshed ${updated} nodes from files`)
      }

      // Always sync wikilinks to create/update/remove edges
      // (refresh_workspace already synced for changed nodes, this catches any missed)
      const { syncAllWikilinks } = await import('../lib/tauri')
      const edgesCreated = await syncAllWikilinks(workspaceId)
      if (edgesCreated > 0) {
        storeLogger.info(`Created ${edgesCreated} edges from wikilinks`)
      }

      // Always reload edges to show current state (including deletions)
      const fetchedEdges = await invoke<Edge[]>('get_edges', { workspaceId })
      deps.setEdges(fetchedEdges)
      storeLogger.info(`Reloaded ${fetchedEdges.length} edges`)

      if (updated > 0 || edgesCreated > 0) {
        notifications$.success('Workspace refreshed', `Updated ${updated} nodes, ${edgesCreated} new edges`)
      } else {
        notifications$.info('Workspace up to date', 'No changes detected')
      }

      return updated
    } catch (e) {
      handleAsyncError({
        context: 'Refresh',
        error,
        notify: (t, m) => notifications$.error(t, m),
      })(e)
      return 0 // Return 0 on error (unreachable due to rethrow, but satisfies TypeScript)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    importVault,
    importCitations,
    importOntology,
    refreshWorkspace,
    syncFramesFromFolders,
  }
}
