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
      console.log('[Ontology] Calling import_ontology with:', {
        filePath,
        workspaceId: options?.workspaceId ?? deps.getCurrentWorkspaceId(),
        createClassNodes: options?.createClassNodes ?? true,
      })

      const result = await invoke<OntologyImportResult>('import_ontology', {
        input: {
          filePath,
          workspaceId: options?.workspaceId ?? deps.getCurrentWorkspaceId(),
          createClassNodes: options?.createClassNodes ?? true,
          createIndividualNodes: options?.createIndividualNodes ?? false,
          layout: options?.layout ?? 'grid',
        },
      })

      console.log('[Ontology] import_ontology returned:', result)

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
   * Refresh workspace files from disk
   */
  async function refreshWorkspace(): Promise<number> {
    loading.value = true
    try {
      const workspaceId = deps.getCurrentWorkspaceId()
      storeLogger.info(`Refreshing workspace: ${workspaceId || 'default'}`)

      const updated = await refreshWorkspaceApi(workspaceId)

      if (updated > 0) {
        // Reload nodes to get updated content
        const fetchedNodes = await invoke<Node[]>('get_nodes')
        deps.setNodes(fetchedNodes)
        storeLogger.info(`Refreshed ${updated} nodes from files`)
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
  }
}
