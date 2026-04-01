/**
 * Citation fetch UI composable
 *
 * Handles fetching citations for selected nodes and building cross-references.
 * Wraps the useCitationGraph composable with UI concerns.
 * Uses a queue to allow adding papers while fetching is in progress.
 */
import { ref, computed, onUnmounted, type Ref } from 'vue'
import { useCitationGraph, extractDOI } from '../../../composables/useCitationGraph'
import { semanticScholar, type WaitStatus } from '../../../lib/semanticScholar'
import type { Node, CreateNodeInput, CreateEdgeInput } from '../../../types'

export interface UseCitationFetchOptions {
  store: {
    getFilteredNodes: () => Node[]
    getFilteredEdges: () => Array<{ source_node_id: string; target_node_id: string; link_type: string }>
    getCurrentWorkspaceId: () => string | null
    getNode: (id: string) => Node | undefined
    createNode: (data: CreateNodeInput) => Promise<{ id: string }>
    createEdge: (data: CreateEdgeInput) => Promise<{ id: string }>
  }
  // Get affected node IDs from context menu (captured when menu opens)
  getAffectedNodeIds: () => string[]
  contextMenuNodeId: Ref<string | null>
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

export function useCitationFetch(options: UseCitationFetchOptions) {
  const { store, getAffectedNodeIds, contextMenuNodeId, showToast } = options

  // Paper queue for sequential processing
  const paperQueue = ref<string[]>([])
  const isProcessingQueue = ref(false)
  const queueTotalPapers = ref(0)
  const queueProcessedPapers = ref(0)

  // Wait status for countdown display
  const waitStatus = ref<WaitStatus>({
    isWaiting: false,
    remainingSeconds: 0,
    reason: null,
  })

  // Set up callback for wait status updates from Semantic Scholar API
  semanticScholar.setWaitStatusCallback((status) => {
    waitStatus.value = status
  })

  // Clean up callback on unmount
  onUnmounted(() => {
    semanticScholar.setWaitStatusCallback(null)
  })

  // Initialize citation graph composable
  const citationGraph = useCitationGraph({
    getNodes: () => store.getFilteredNodes(),
    getEdges: () => store.getFilteredEdges(),
    createNode: data => store.createNode(data),
    createEdge: data => store.createEdge(data),
    getCurrentWorkspaceId: () => store.getCurrentWorkspaceId(),
  })

  // Computed: does the context menu node have a DOI?
  const contextMenuNodeHasDOI = computed(() => {
    if (!contextMenuNodeId.value) return false
    const node = store.getNode(contextMenuNodeId.value)
    if (!node) return false
    return extractDOI(node.markdown_content) !== null
  })

  // Computed: count of affected nodes with DOIs (uses context menu's snapshot)
  const contextMenuDOICount = computed(() => {
    const affectedIds = getAffectedNodeIds()
    if (affectedIds.length === 0) {
      return 0
    }
    let count = 0
    for (const id of affectedIds) {
      const node = store.getNode(id)
      if (node && extractDOI(node.markdown_content)) {
        count++
      }
    }
    return count
  })

  /**
   * Process the paper queue - fetches citations for each paper sequentially
   */
  async function processQueue(): Promise<void> {
    if (isProcessingQueue.value) return
    if (paperQueue.value.length === 0) return

    isProcessingQueue.value = true
    citationGraph.resetFetchState()

    let totalPapers = 0
    let totalEdges = 0

    try {
      while (paperQueue.value.length > 0) {
        // Check for cancellation
        if (citationGraph.isCancelled.value) {
          console.log('[CitationFetch] Cancelled by user')
          showToast?.('Citation fetch cancelled', 'info')
          paperQueue.value = []
          break
        }

        const nodeId = paperQueue.value[0]
        const node = store.getNode(nodeId)
        queueProcessedPapers.value++

        console.log(`[CitationFetch] Processing paper ${queueProcessedPapers.value}/${queueTotalPapers.value}: "${node?.title || 'Unknown'}" (${nodeId})`)

        const result = await citationGraph.fetchCitationsForNode(nodeId, {
          paperIndex: queueProcessedPapers.value,
          paperCount: queueTotalPapers.value,
        })

        console.log(`[CitationFetch] Result for "${node?.title || nodeId}": ${result.papersCreated} papers, ${result.edgesCreated} edges`)
        totalPapers += result.papersCreated
        totalEdges += result.edgesCreated

        // Remove processed paper from queue
        paperQueue.value.shift()
      }

      // Build cross-reference edges between all papers on canvas (if not cancelled)
      // Use cacheOnly to avoid additional API calls - only use already-cached data
      if (totalPapers > 0 && !citationGraph.isCancelled.value) {
        showToast?.('Building cross-references...', 'info')
        const crossRefResult = await citationGraph.buildCitationGraph({ createStubs: false, cacheOnly: true })
        totalEdges += crossRefResult.edgesCreated
      }

      if (!citationGraph.isCancelled.value) {
        if (totalPapers > 0 || totalEdges > 0) {
          const parts: string[] = []
          if (totalPapers > 0) parts.push(`${totalPapers} paper(s)`)
          if (totalEdges > 0) parts.push(`${totalEdges} edge(s)`)
          showToast?.(`Created ${parts.join(' and ')}`, 'success')
        } else {
          showToast?.('No new citations found', 'info')
        }
      }
    } catch (error) {
      console.error('Failed to fetch citations:', error)
      showToast?.('Failed to fetch citations', 'error')
    } finally {
      // Brief delay before clearing progress so user sees completion
      await new Promise(resolve => setTimeout(resolve, 500))
      isProcessingQueue.value = false
      queueTotalPapers.value = 0
      queueProcessedPapers.value = 0
      citationGraph.resetFetchState()
    }
  }

  /**
   * Add papers to the fetch queue
   * Papers are fetched sequentially, new papers can be added while fetching
   */
  async function handleFetchCitations(): Promise<void> {
    // Get nodes to process from context menu's affected nodes snapshot
    const nodeIds: string[] = []
    const affectedIds = getAffectedNodeIds()

    console.log('[CitationFetch] affectedIds:', affectedIds.length, affectedIds)

    for (const id of affectedIds) {
      const node = store.getNode(id)
      const doi = node ? extractDOI(node.markdown_content) : null
      if (node && doi) {
        // Only add if not already in queue
        if (!paperQueue.value.includes(id)) {
          nodeIds.push(id)
        }
      }
    }

    console.log('[CitationFetch] nodeIds with DOIs to add:', nodeIds.length)

    if (nodeIds.length === 0) {
      if (affectedIds.length > 0 && paperQueue.value.length > 0) {
        showToast?.('Papers already in queue', 'info')
      } else {
        showToast?.('No papers with DOI found in selection', 'info')
      }
      return
    }

    // Add to queue
    paperQueue.value.push(...nodeIds)
    queueTotalPapers.value = paperQueue.value.length + queueProcessedPapers.value

    showToast?.(`Added ${nodeIds.length} paper(s) to queue (${paperQueue.value.length} pending)`, 'info')

    // Start processing if not already running
    if (!isProcessingQueue.value) {
      processQueue()
    }
  }

  // Combined fetching state (queue processing or citation fetching)
  const isFetchingCitations = computed(() =>
    isProcessingQueue.value || citationGraph.isFetchingCitations.value
  )

  // Queue size for UI display
  const queueSize = computed(() => paperQueue.value.length)

  return {
    // State
    isFetchingCitations,
    fetchProgress: citationGraph.fetchProgress,
    queueSize,
    waitStatus: computed(() => waitStatus.value),

    // Actions
    cancelFetch: citationGraph.cancelFetch,
    handleFetchCitations,

    // UI computed
    contextMenuNodeHasDOI,
    contextMenuDOICount,

    // Re-export extractDOI for convenience
    extractDOI,
  }
}
