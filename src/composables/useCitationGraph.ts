/**
 * Citation graph builder composable
 *
 * Builds citation relationships between papers using Semantic Scholar.
 * Creates edges between existing nodes and stub nodes for external citations.
 */
import { ref, computed } from 'vue'
import { semanticScholar } from '../lib/semanticScholar'
import type { SemanticScholarReference } from '../lib/semanticScholar'
import type { Node, CreateNodeInput, CreateEdgeInput } from '../types'
import { formatStubCitation } from '../lib/citationFormat'
import { extractDOI, extractZoteroKey, extractSemanticScholarId } from '../lib/extraction'

// Re-export for backwards compatibility
export { extractDOI, extractZoteroKey, extractSemanticScholarId }

// Layout constants for fan positioning
const LAYOUT_RADIUS = 500
const LAYOUT_ANGLE_STEP = 0.12
const STUB_NODE_WIDTH = 320
const STUB_NODE_HEIGHT = 220

/**
 * Calculate fan layout position for a paper relative to source node
 * @param sourceX - Source node X position
 * @param sourceY - Source node Y position
 * @param sourceWidth - Source node width
 * @param index - Index of paper being positioned
 * @param direction - 'above' for citations, 'below' for references
 */
function calculateFanPosition(
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  index: number,
  direction: 'above' | 'below'
): { x: number; y: number } {
  const startAngle = direction === 'above' ? Math.PI / 2 : -Math.PI / 2
  const side = index % 2 === 0 ? 1 : -1
  const level = Math.floor((index + 1) / 2)
  const angle = startAngle + side * level * LAYOUT_ANGLE_STEP

  const offsetX = Math.cos(angle) * LAYOUT_RADIUS
  const offsetY = -Math.sin(angle) * LAYOUT_RADIUS

  return {
    x: sourceX + sourceWidth / 2 + offsetX - STUB_NODE_WIDTH / 2,
    y: sourceY + offsetY,
  }
}

export interface CitationGraphProgress {
  phase: 'scanning' | 'fetching' | 'creating' | 'done'
  current: number
  total: number
  currentPaper: string
  errors: string[]
}

export interface CitationGraphResult {
  edgesCreated: number
  stubNodesCreated: number
  errors: string[]
}

export interface UseCitationGraphContext {
  getNodes: () => Node[]
  getEdges: () => Array<{ source_node_id: string; target_node_id: string; link_type: string }>
  createNode: (data: CreateNodeInput) => Promise<{ id: string }>
  createEdge: (data: CreateEdgeInput) => Promise<{ id: string }>
  getCurrentWorkspaceId: () => string | null
}

/**
 * Format a stub node's markdown content (minimal, from reference data)
 */
function formatStubContent(ref: SemanticScholarReference): string {
  return formatStubCitation({
    title: ref.title || 'Untitled',
    doi: ref.externalIds?.DOI,
    semanticScholarId: ref.paperId,
    year: ref.year,
    venue: ref.venue,
    authors: ref.authors?.map(a => ({ name: a.name })),
  })
}

export function useCitationGraph(ctx: UseCitationGraphContext) {
  const progress = ref<CitationGraphProgress | null>(null)
  const isBuilding = ref(false)
  const isFetchingCitations = ref(false)
  const fetchCancelled = ref(false)
  const fetchProgress = ref<{ current: number; total: number; paperTitle: string; paperIndex?: number; paperCount?: number } | null>(null)

  // Build paper index from current nodes (by DOI, Semantic Scholar ID, and title)
  function buildPaperIndex(): { byDOI: Map<string, string>; bySSId: Map<string, string>; byTitle: Map<string, string> } {
    const byDOI = new Map<string, string>()
    const bySSId = new Map<string, string>()
    const byTitle = new Map<string, string>()
    const nodes = ctx.getNodes()

    for (const node of nodes) {
      const doi = extractDOI(node.markdown_content)
      if (doi) {
        // Normalize DOI to lowercase for matching
        byDOI.set(doi.toLowerCase(), node.id)
      }
      const ssId = extractSemanticScholarId(node.markdown_content)
      if (ssId) {
        bySSId.set(ssId, node.id)
      }
      // Also index by normalized title for fallback matching
      if (node.title) {
        byTitle.set(normalizeTitle(node.title), node.id)
      }
    }

    return { byDOI, bySSId, byTitle }
  }

  // Normalize title for comparison (lowercase, remove punctuation, collapse spaces)
  function normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Find existing node by DOI, Semantic Scholar ID, or title
  function findExistingNode(
    doi: string | undefined,
    ssId: string,
    title: string | undefined,
    index: { byDOI: Map<string, string>; bySSId: Map<string, string>; byTitle: Map<string, string> }
  ): string | undefined {
    if (doi) {
      const byDoi = index.byDOI.get(doi.toLowerCase())
      if (byDoi) return byDoi
    }
    const bySSId = index.bySSId.get(ssId)
    if (bySSId) return bySSId
    // Fallback to title matching
    if (title) {
      const normalizedTitle = normalizeTitle(title)
      const byTitle = index.byTitle.get(normalizedTitle)
      if (byTitle) return byTitle
    }
    return undefined
  }

  // Check if edge already exists
  function edgeExists(sourceId: string, targetId: string, linkType: string): boolean {
    const edges = ctx.getEdges()
    return edges.some(e =>
      e.source_node_id === sourceId &&
      e.target_node_id === targetId &&
      e.link_type === linkType
    )
  }

  /**
   * Cancel ongoing citation fetch
   */
  function cancelFetch() {
    fetchCancelled.value = true
  }

  /**
   * Fetch papers for a single node
   * @param direction - 'citations' (who cites this), 'references' (what this cites), or 'both'
   */
  async function fetchPapersForNode(
    nodeId: string,
    direction: 'citations' | 'references' | 'both',
    options?: { maxPapers?: number; paperIndex?: number; paperCount?: number }
  ): Promise<{ edgesCreated: number; papersCreated: number }> {
    const maxPapers = options?.maxPapers ?? Infinity
    const batchPaperIndex = options?.paperIndex
    const batchPaperCount = options?.paperCount
    const nodes = ctx.getNodes()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return { edgesCreated: 0, papersCreated: 0 }

    const doi = extractDOI(node.markdown_content)
    if (!doi) return { edgesCreated: 0, papersCreated: 0 }

    if (fetchCancelled.value) {
      return { edgesCreated: 0, papersCreated: 0 }
    }

    isFetchingCitations.value = true
    fetchProgress.value = { current: 0, total: 0, paperTitle: node.title, paperIndex: batchPaperIndex, paperCount: batchPaperCount }

    const paper = await semanticScholar.getPaperByDOI(doi)
    if (!paper) {
      return { edgesCreated: 0, papersCreated: 0 }
    }

    const paperIndex = buildPaperIndex()
    const workspaceId = ctx.getCurrentWorkspaceId()

    // Fetch based on direction
    const references = (direction === 'references' || direction === 'both')
      ? await semanticScholar.getReferences(paper.paperId)
      : []
    const citations = (direction === 'citations' || direction === 'both')
      ? await semanticScholar.getCitations(paper.paperId)
      : []

    let edgesCreated = 0
    let papersCreated = 0

    // Process references (papers this node cites) - create stubs + edges
    if (references.length > 0) {
      fetchProgress.value = { current: 0, total: references.length, paperTitle: node.title, paperIndex: batchPaperIndex, paperCount: batchPaperCount }

      for (let i = 0; i < references.length; i++) {
        if (fetchCancelled.value) break
        if (papersCreated >= maxPapers) break

        const ref = references[i]
        fetchProgress.value = { current: i + 1, total: references.length, paperTitle: ref.title || 'Unknown', paperIndex: batchPaperIndex, paperCount: batchPaperCount }

        // Check if paper already exists
        let targetNodeId = findExistingNode(ref.externalIds?.DOI, ref.paperId, ref.title, paperIndex)

        // Create stub node if not found
        if (!targetNodeId && ref.title) {
          const content = formatStubContent(ref)
          const pos = calculateFanPosition(node.canvas_x, node.canvas_y, node.width, papersCreated, 'below')

          const newNode = await ctx.createNode({
            title: ref.title,
            markdown_content: content,
            canvas_x: pos.x,
            canvas_y: pos.y,
            width: STUB_NODE_WIDTH,
            height: STUB_NODE_HEIGHT,
            workspace_id: workspaceId || undefined,
          })
          targetNodeId = newNode.id

          if (ref.externalIds?.DOI) {
            paperIndex.byDOI.set(ref.externalIds.DOI.toLowerCase(), newNode.id)
          }
          paperIndex.bySSId.set(ref.paperId, newNode.id)
          if (ref.title) {
            paperIndex.byTitle.set(normalizeTitle(ref.title), newNode.id)
          }
          papersCreated++
        }

        // Create edge: this node -> reference (this paper cites the reference)
        if (targetNodeId && !edgeExists(nodeId, targetNodeId, 'cites')) {
          await ctx.createEdge({
            source_node_id: nodeId,
            target_node_id: targetNodeId,
            link_type: 'cites',
            label: 'cites',
          })
          edgesCreated++
        }
      }
    }

    // Process citations (papers that cite this node) - create stubs + edges
    if (citations.length > 0) {
      fetchProgress.value = { current: 0, total: citations.length, paperTitle: node.title, paperIndex: batchPaperIndex, paperCount: batchPaperCount }

      for (let i = 0; i < citations.length; i++) {
        if (fetchCancelled.value) break
        if (papersCreated >= maxPapers) break

        const cit = citations[i]
        fetchProgress.value = { current: i + 1, total: citations.length, paperTitle: cit.title || 'Unknown', paperIndex: batchPaperIndex, paperCount: batchPaperCount }

        // Check if paper already exists
        let sourceNodeId = findExistingNode(cit.externalIds?.DOI, cit.paperId, cit.title, paperIndex)

        // Create stub node if not found
        if (!sourceNodeId && cit.title) {
          const content = formatStubContent(cit)
          const pos = calculateFanPosition(node.canvas_x, node.canvas_y, node.width, papersCreated, 'above')

          const newNode = await ctx.createNode({
            title: cit.title,
            markdown_content: content,
            canvas_x: pos.x,
            canvas_y: pos.y,
            width: STUB_NODE_WIDTH,
            height: STUB_NODE_HEIGHT,
            workspace_id: workspaceId || undefined,
          })
          sourceNodeId = newNode.id

          if (cit.externalIds?.DOI) {
            paperIndex.byDOI.set(cit.externalIds.DOI.toLowerCase(), newNode.id)
          }
          paperIndex.bySSId.set(cit.paperId, newNode.id)
          if (cit.title) {
            paperIndex.byTitle.set(normalizeTitle(cit.title), newNode.id)
          }
          papersCreated++
        }

        // Create edge: citing paper -> this node (the citing paper cites this one)
        if (sourceNodeId && !edgeExists(sourceNodeId, nodeId, 'cites')) {
          await ctx.createEdge({
            source_node_id: sourceNodeId,
            target_node_id: nodeId,
            link_type: 'cites',
            label: 'cites',
          })
          edgesCreated++
        }
      }
    }

    return { edgesCreated, papersCreated }
  }

  // Convenience wrappers
  async function fetchCitationsForNode(
    nodeId: string,
    options?: { maxCitations?: number; paperIndex?: number; paperCount?: number }
  ): Promise<{ edgesCreated: number; papersCreated: number }> {
    return fetchPapersForNode(nodeId, 'citations', { ...options, maxPapers: options?.maxCitations })
  }

  async function fetchReferencesForNode(
    nodeId: string,
    options?: { maxReferences?: number; paperIndex?: number; paperCount?: number }
  ): Promise<{ edgesCreated: number; papersCreated: number }> {
    return fetchPapersForNode(nodeId, 'references', { ...options, maxPapers: options?.maxReferences })
  }

  async function fetchBothForNode(
    nodeId: string,
    options?: { maxPapers?: number; paperIndex?: number; paperCount?: number }
  ): Promise<{ edgesCreated: number; papersCreated: number }> {
    return fetchPapersForNode(nodeId, 'both', options)
  }

  /**
   * Build citation graph for all citation nodes
   * Creates edges between existing nodes and optionally creates stub nodes
   * @param cacheOnly - If true, skip API calls for papers without cached data (use after individual fetches)
   */
  async function buildCitationGraph(options?: {
    createStubs?: boolean
    maxStubsPerPaper?: number
    cacheOnly?: boolean
  }): Promise<CitationGraphResult> {
    const createStubs = options?.createStubs ?? true
    const maxStubsPerPaper = options?.maxStubsPerPaper ?? 10
    const cacheOnly = options?.cacheOnly ?? false

    isBuilding.value = true
    const errors: string[] = []
    let edgesCreated = 0
    let stubNodesCreated = 0

    const nodes = ctx.getNodes()
    const workspaceId = ctx.getCurrentWorkspaceId()

    // Find all nodes with DOIs or Semantic Scholar IDs (can be cross-referenced)
    const papersToProcess = nodes.filter(n =>
      (extractDOI(n.markdown_content) !== null ||
       extractSemanticScholarId(n.markdown_content) !== null) &&
      n.node_type !== 'citation-stub'
    )

    if (papersToProcess.length === 0) {
      isBuilding.value = false
      return { edgesCreated: 0, stubNodesCreated: 0, errors: ['No papers with DOI or Semantic Scholar ID found'] }
    }

    progress.value = {
      phase: 'scanning',
      current: 0,
      total: papersToProcess.length,
      currentPaper: '',
      errors: [],
    }

    // Build initial paper index (by DOI and Semantic Scholar ID)
    const paperIndex = buildPaperIndex()

    // Process each node
    for (let i = 0; i < papersToProcess.length; i++) {
      const node = papersToProcess[i]
      const doi = extractDOI(node.markdown_content)
      const ssId = extractSemanticScholarId(node.markdown_content)

      progress.value = {
        phase: 'fetching',
        current: i + 1,
        total: papersToProcess.length,
        currentPaper: node.title,
        errors,
      }

      try {
        // Get paper from Semantic Scholar (by DOI or Semantic Scholar ID)
        // In cacheOnly mode, skip papers without cached data
        let paper = null
        if (cacheOnly) {
          if (doi) {
            paper = semanticScholar.getCachedPaperByDOI(doi)
          } else if (ssId) {
            paper = semanticScholar.getCachedPaperById(ssId)
          }
          if (!paper) {
            // Skip papers without cached data in cacheOnly mode
            continue
          }
        } else {
          if (doi) {
            paper = await semanticScholar.getPaperByDOI(doi)
          } else if (ssId) {
            paper = await semanticScholar.getPaperById(ssId)
          }
          if (!paper) {
            errors.push(`Paper not found: ${node.title}`)
            continue
          }
        }

        // Get references and citations
        // In cacheOnly mode, use cached data only (no API calls)
        let references: SemanticScholarReference[]
        let citations: SemanticScholarReference[]
        if (cacheOnly) {
          references = semanticScholar.getCachedReferences(paper.paperId) || []
          citations = semanticScholar.getCachedCitations(paper.paperId) || []
        } else {
          references = await semanticScholar.getReferences(paper.paperId)
          citations = await semanticScholar.getCitations(paper.paperId)
        }

        progress.value = {
          phase: 'creating',
          current: i + 1,
          total: papersToProcess.length,
          currentPaper: node.title,
          errors,
        }

        // Process references (papers this node cites)
        let stubsCreated = 0
        for (const ref of references) {
          // Find existing node by DOI, Semantic Scholar ID, or title
          let targetNodeId = findExistingNode(ref.externalIds?.DOI, ref.paperId, ref.title, paperIndex)

          // Create stub node if not found and stubs enabled
          if (!targetNodeId && createStubs && stubsCreated < maxStubsPerPaper) {
            const stubContent = formatStubContent(ref)
            const stubNode = await ctx.createNode({
              title: ref.title || 'Untitled',
              markdown_content: stubContent,
              node_type: 'citation-stub',
              canvas_x: node.canvas_x + 400 + stubsCreated * 50,
              canvas_y: node.canvas_y + stubsCreated * 50,
              width: 250,
              height: 150,
              workspace_id: workspaceId || undefined,
            })
            targetNodeId = stubNode.id
            // Update index
            if (ref.externalIds?.DOI) {
              paperIndex.byDOI.set(ref.externalIds.DOI.toLowerCase(), stubNode.id)
            }
            paperIndex.bySSId.set(ref.paperId, stubNode.id)
            if (ref.title) {
              paperIndex.byTitle.set(normalizeTitle(ref.title), stubNode.id)
            }
            stubNodesCreated++
            stubsCreated++
          }

          // Create edge
          if (targetNodeId && !edgeExists(node.id, targetNodeId, 'cites')) {
            await ctx.createEdge({
              source_node_id: node.id,
              target_node_id: targetNodeId,
              link_type: 'cites',
            label: 'cites',
            })
            edgesCreated++
          }
        }

        // Process citations (papers that cite this node)
        for (const cit of citations) {
          // Find existing node by DOI, Semantic Scholar ID, or title
          const sourceNodeId = findExistingNode(cit.externalIds?.DOI, cit.paperId, cit.title, paperIndex)

          // Only connect to existing nodes for citations
          // (we don't create stubs for papers that cite us)
          if (sourceNodeId && !edgeExists(sourceNodeId, node.id, 'cites')) {
            await ctx.createEdge({
              source_node_id: sourceNodeId,
              target_node_id: node.id,
              link_type: 'cites',
            label: 'cites',
            })
            edgesCreated++
          }
        }
      } catch (error) {
        console.error(`[CitationGraph] Error processing ${node.title}:`, error)
        errors.push(`Error processing ${node.title}: ${error}`)
      }
    }

    progress.value = {
      phase: 'done',
      current: papersToProcess.length,
      total: papersToProcess.length,
      currentPaper: '',
      errors,
    }

    isBuilding.value = false

    return {
      edgesCreated,
      stubNodesCreated,
      errors,
    }
  }

  /**
   * Cancel building (best effort)
   */
  function cancelBuild() {
    isBuilding.value = false
    progress.value = null
  }

  /**
   * Reset cancelled state (call before starting a new batch)
   */
  function resetFetchState() {
    fetchCancelled.value = false
    isFetchingCitations.value = false
    fetchProgress.value = null
  }

  return {
    // State
    progress: computed(() => progress.value),
    isBuilding: computed(() => isBuilding.value),
    isFetchingCitations: computed(() => isFetchingCitations.value),
    fetchProgress: computed(() => fetchProgress.value),
    isCancelled: computed(() => fetchCancelled.value),

    // Actions
    buildCitationGraph,
    fetchCitationsForNode,
    fetchReferencesForNode,
    fetchBothForNode,
    cancelBuild,
    cancelFetch,
    resetFetchState,

    // Utilities
    extractDOI,
    extractZoteroKey,
  }
}
