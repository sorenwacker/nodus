/**
 * Import composable
 * Handles vault, citation, and ontology imports
 */
import { ref } from 'vue'
import { relativeFolder } from '../lib/vaultPaths'
import { fileNameFromPath } from '../lib/pdfGraph'
import { invoke, readTextFile, refreshWorkspace as refreshWorkspaceApi, setWorkspaceSync } from '../lib/tauri'
import { parseReferences, citationToMarkdown } from '../lib/bibtex'
import { storeLogger } from '../lib/logger'
import { handleAsyncError } from '../lib/errorHandling'
import { notifications$ } from '../composables/useNotifications'
import type { Node, Edge, OntologyImportResult } from '../types'

export interface ImportDeps {
  getCurrentWorkspaceId: () => string | null
  setNodes: (nodes: Node[]) => void
  addNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  /** The edges store's deduplication, so the import does not carry a second rule */
  deduplicateEdges: (edges: Edge[]) => Edge[]
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
  updateNodePosition?: (id: string, x: number, y: number) => void
}

/** Clusters are laid out in rows of this many, left to right */
const CLUSTERS_PER_ROW = 3
const NODES_PER_ROW = 3
const NODE_SPACING = 30
const CLUSTER_SPACING = 150
const ORIGIN = 100

/**
 * Place each folder's nodes as a cluster: a small grid per folder, the
 * clusters themselves in rows. The folder stays in each node's file path, so
 * nothing else records the grouping (docs/design/remove-frames.md).
 * Returns the number of clusters placed.
 */
function placeFoldersAsClusters(nodes: Node[], vaultPath: string, deps: ImportDeps): number {
  if (!deps.updateNodePosition) return 0

  const byFolder = new Map<string, Node[]>()
  for (const node of nodes) {
    if (!node.file_path) continue
    const folder = relativeFolder(node.file_path, vaultPath)
    if (!folder) continue // Root-level files keep the position the import gave them
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), node])
  }

  const folders = Array.from(byFolder.keys()).sort()
  let rowTop = ORIGIN
  let rowHeight = 0
  let left = ORIGIN

  folders.forEach((folder, i) => {
    if (i > 0 && i % CLUSTERS_PER_ROW === 0) {
      rowTop += rowHeight + CLUSTER_SPACING
      rowHeight = 0
      left = ORIGIN
    }
    let x = left
    let y = rowTop
    let lineHeight = 0
    let right = left
    byFolder.get(folder)!.forEach((node, j) => {
      if (j > 0 && j % NODES_PER_ROW === 0) {
        x = left
        y += lineHeight + NODE_SPACING
        lineHeight = 0
      }
      deps.updateNodePosition!(node.id, x, y)
      const width = node.width || 200
      lineHeight = Math.max(lineHeight, node.height || 120)
      right = Math.max(right, x + width)
      x += width + NODE_SPACING
    })
    rowHeight = Math.max(rowHeight, y + lineHeight - rowTop)
    left = right + CLUSTER_SPACING
  })

  return folders.length
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

      const result = await invoke<{ nodes: Node[]; skipped: Array<{ path: string; reason: string }> }>(
        'import_vault',
        { path, workspaceId, deleteOriginals: deleteOriginals ?? false }
      )
      const importedNodes = result.nodes

      storeLogger.info(`Imported ${importedNodes.length} nodes`)
      deps.addNodes(importedNodes)

      // A file the import could not take is named, rather than left unsaid
      // (PRODUCT_DESIGN.md > Importing a vault)
      if (result.skipped.length > 0) {
        const names = result.skipped.map(s => `${fileNameFromPath(s.path)}: ${s.reason}`)
        notifications$.warning(
          `Imported ${importedNodes.length} notes, skipped ${result.skipped.length}`,
          names.join('; ')
        )
      }

      const clusters = placeFoldersAsClusters(importedNodes, path, deps)
      if (clusters > 0) storeLogger.info(`Placed ${clusters} folders as clusters`)

      // Fetch all edges to include newly created wikilink edges
      const fetchedEdges = await invoke<Edge[]>('get_edges', { workspaceId })

      // The edges store's rule, so an import cannot hide an edge the store
      // would keep (PRODUCT_DESIGN.md > One rule, one place)
      deps.setEdges(deps.deduplicateEdges(fetchedEdges))

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
        rethrow: false,
      })(e)
      // Rethrown here, in plain sight: the caller decides what a failure means
      throw e
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
        rethrow: false,
      })(e)
      // Rethrown here, in plain sight: the caller decides what a failure means
      throw e
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
        rethrow: false,
      })(e)
      // Rethrown here, in plain sight: the caller decides what a failure means
      throw e
    } finally {
      loading.value = false
    }
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
        rethrow: false,
      })(e)
      // Rethrown here, in plain sight: the caller decides what a failure means
      throw e
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
  }
}
