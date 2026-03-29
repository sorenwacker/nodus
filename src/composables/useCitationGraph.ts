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
 * Extract DOI from node content (frontmatter or body)
 */
export function extractDOI(content: string | null): string | null {
  if (!content) return null

  // Check YAML frontmatter first
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const doiMatch = frontmatterMatch[1].match(/^doi:\s*(.+)$/m)
    if (doiMatch) {
      return doiMatch[1].trim()
    }
  }

  // Check for DOI in body text (various formats)
  const patterns = [
    /doi\.org\/([^\s\])"']+)/i,
    /DOI:\s*([^\s\])"']+)/i,
    /10\.\d{4,}\/[^\s\])"']+/,
  ]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match) {
      // Clean up the DOI
      let doi = match[1] || match[0]
      doi = doi.replace(/[.,;:)\]]+$/, '') // Remove trailing punctuation
      return doi
    }
  }

  return null
}

/**
 * Extract Zotero key from node content
 */
export function extractZoteroKey(content: string | null): string | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const keyMatch = frontmatterMatch[1].match(/^zotero_key:\s*(.+)$/m)
    if (keyMatch) {
      return keyMatch[1].trim()
    }
  }

  return null
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
    authors: ref.authors?.map(a => ({ name: a.name })),
  })
}


/**
 * Extract Semantic Scholar ID from node content
 */
function extractSemanticScholarId(content: string | null): string | null {
  if (!content) return null

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const idMatch = frontmatterMatch[1].match(/^semantic_scholar_id:\s*(.+)$/m)
    if (idMatch) {
      return idMatch[1].trim()
    }
  }

  return null
}

export function useCitationGraph(ctx: UseCitationGraphContext) {
  const progress = ref<CitationGraphProgress | null>(null)
  const isBuilding = ref(false)
  const isFetchingCitations = ref(false)
  const fetchCancelled = ref(false)
  const fetchProgress = ref<{ current: number; total: number; paperTitle: string; paperIndex?: number; paperCount?: number } | null>(null)

  // Build paper index from current nodes (by DOI and Semantic Scholar ID)
  function buildPaperIndex(): { byDOI: Map<string, string>; bySSId: Map<string, string> } {
    const byDOI = new Map<string, string>()
    const bySSId = new Map<string, string>()
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
    }

    return { byDOI, bySSId }
  }

  // Find existing node by DOI or Semantic Scholar ID
  function findExistingNode(
    doi: string | undefined,
    ssId: string,
    index: { byDOI: Map<string, string>; bySSId: Map<string, string> }
  ): string | undefined {
    if (doi) {
      const byDoi = index.byDOI.get(doi.toLowerCase())
      if (byDoi) return byDoi
    }
    return index.bySSId.get(ssId)
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
   * Fetch citations for a single node
   * Creates full paper nodes for papers that cite this paper
   */
  async function fetchCitationsForNode(
    nodeId: string,
    options?: { maxCitations?: number; paperIndex?: number; paperCount?: number }
  ): Promise<{ edgesCreated: number; papersCreated: number }> {
    // No limit by default - fetch all citing papers
    const maxCitations = options?.maxCitations ?? Infinity
    const batchPaperIndex = options?.paperIndex
    const batchPaperCount = options?.paperCount
    const nodes = ctx.getNodes()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return { edgesCreated: 0, papersCreated: 0 }

    const doi = extractDOI(node.markdown_content)
    if (!doi) return { edgesCreated: 0, papersCreated: 0 }

    // Check if already cancelled before starting
    if (fetchCancelled.value) {
      return { edgesCreated: 0, papersCreated: 0 }
    }

    // Reset progress state (but NOT fetchCancelled - that persists across papers)
    isFetchingCitations.value = true
    fetchProgress.value = { current: 0, total: 0, paperTitle: node.title, paperIndex: batchPaperIndex, paperCount: batchPaperCount }

    console.log(`[CitationGraph] Fetching citations for: "${node.title}" (DOI: ${doi})`)

    // Get paper from Semantic Scholar
    const paper = await semanticScholar.getPaperByDOI(doi)
    if (!paper) {
      console.log(`[CitationGraph] Paper not found in Semantic Scholar: ${doi}`)
      // Don't clear progress - let caller handle it for batch operations
      return { edgesCreated: 0, papersCreated: 0 }
    }

    // Build paper index for duplicate detection (by DOI and Semantic Scholar ID)
    const paperIndex = buildPaperIndex()
    const workspaceId = ctx.getCurrentWorkspaceId()

    // Get references and citations (sequential to respect rate limits)
    const references = await semanticScholar.getReferences(paper.paperId)
    const citations = await semanticScholar.getCitations(paper.paperId)

    console.log(`[CitationGraph] Found ${references.length} references, ${citations.length} citations for "${node.title}"`)

    let edgesCreated = 0
    let papersCreated = 0

    // Create edges for references (this paper cites them)
    // Only connect to existing nodes, don't create nodes for references
    for (const ref of references) {
      const targetNodeId = findExistingNode(ref.externalIds?.DOI, ref.paperId, paperIndex)
      if (targetNodeId && !edgeExists(nodeId, targetNodeId, 'cites')) {
        await ctx.createEdge({
          source_node_id: nodeId,
          target_node_id: targetNodeId,
          link_type: 'cites',
        })
        edgesCreated++
      }
    }

    // Update progress with total
    fetchProgress.value = { current: 0, total: citations.length, paperTitle: node.title, paperIndex: batchPaperIndex, paperCount: batchPaperCount }

    // Create paper nodes for citations (papers that cite this paper)
    for (let i = 0; i < citations.length; i++) {
      // Check for cancellation
      if (fetchCancelled.value) break
      if (papersCreated >= maxCitations) break

      const cit = citations[i]

      // Update progress
      fetchProgress.value = { current: i + 1, total: citations.length, paperTitle: cit.title || 'Unknown', paperIndex: batchPaperIndex, paperCount: batchPaperCount }

      // Check if paper already exists (by DOI or Semantic Scholar ID)
      let sourceNodeId = findExistingNode(cit.externalIds?.DOI, cit.paperId, paperIndex)

      // Create paper node if not found
      // Note: We use stub content (from citation list) to avoid extra API calls
      // Full details can be fetched later when user expands the node
      if (!sourceNodeId && cit.title) {
        const content = formatStubContent(cit)

        // Calculate position in a fan/arc layout above the source node
        const radius = 500
        const angleStep = 0.12 // ~7 degrees between each paper
        const startAngle = Math.PI / 2 // Start from directly above
        // Alternate left/right for symmetric fan: 0, -1, +1, -2, +2, ...
        const side = papersCreated % 2 === 0 ? 1 : -1
        const level = Math.floor((papersCreated + 1) / 2)
        const angle = startAngle + side * level * angleStep

        const offsetX = Math.cos(angle) * radius
        const offsetY = -Math.sin(angle) * radius // Negative because canvas Y increases downward

        const newNode = await ctx.createNode({
          title: cit.title,
          markdown_content: content,
          canvas_x: node.canvas_x + node.width / 2 + offsetX - 160,
          canvas_y: node.canvas_y + offsetY,
          width: 320,
          height: 220,
          workspace_id: workspaceId || undefined,
        })
        sourceNodeId = newNode.id
        // Update index to prevent duplicates in this run
        if (cit.externalIds?.DOI) {
          paperIndex.byDOI.set(cit.externalIds.DOI.toLowerCase(), newNode.id)
        }
        paperIndex.bySSId.set(cit.paperId, newNode.id)
        papersCreated++
      }

      // Create edge: citing paper -> cited paper (the node we're fetching citations FOR)
      if (sourceNodeId && !edgeExists(sourceNodeId, nodeId, 'cites')) {
        const citingTitle = cit.title || 'Unknown'
        console.log(`[CitationGraph] Edge: "${citingTitle}" cites "${node.title}" (${sourceNodeId} -> ${nodeId})`)
        await ctx.createEdge({
          source_node_id: sourceNodeId,
          target_node_id: nodeId,
          link_type: 'cites',
        })
        edgesCreated++
      }
    }

    // Don't clear progress state here - let the caller (handleFetchCitations) do it
    // This keeps the progress bar visible between papers in a batch

    return { edgesCreated, papersCreated }
  }

  /**
   * Build citation graph for all citation nodes
   * Creates edges between existing nodes and optionally creates stub nodes
   */
  async function buildCitationGraph(options?: {
    createStubs?: boolean
    maxStubsPerPaper?: number
  }): Promise<CitationGraphResult> {
    const createStubs = options?.createStubs ?? true
    const maxStubsPerPaper = options?.maxStubsPerPaper ?? 10

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
        let paper = null
        if (doi) {
          paper = await semanticScholar.getPaperByDOI(doi)
        } else if (ssId) {
          paper = await semanticScholar.getPaperById(ssId)
        }
        if (!paper) {
          errors.push(`Paper not found: ${node.title}`)
          continue
        }

        // Get references and citations (sequential to respect rate limits)
        const references = await semanticScholar.getReferences(paper.paperId)
        const citations = await semanticScholar.getCitations(paper.paperId)

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
          // Find existing node by DOI or Semantic Scholar ID
          let targetNodeId = findExistingNode(ref.externalIds?.DOI, ref.paperId, paperIndex)

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
            stubNodesCreated++
            stubsCreated++
          }

          // Create edge
          if (targetNodeId && !edgeExists(node.id, targetNodeId, 'cites')) {
            await ctx.createEdge({
              source_node_id: node.id,
              target_node_id: targetNodeId,
              link_type: 'cites',
            })
            edgesCreated++
          }
        }

        // Process citations (papers that cite this node)
        for (const cit of citations) {
          // Find existing node by DOI or Semantic Scholar ID
          const sourceNodeId = findExistingNode(cit.externalIds?.DOI, cit.paperId, paperIndex)

          // Only connect to existing nodes for citations
          // (we don't create stubs for papers that cite us)
          if (sourceNodeId && !edgeExists(sourceNodeId, node.id, 'cites')) {
            await ctx.createEdge({
              source_node_id: sourceNodeId,
              target_node_id: node.id,
              link_type: 'cites',
            })
            edgesCreated++
          }
        }
      } catch (error) {
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
    cancelBuild,
    cancelFetch,
    resetFetchState,

    // Utilities
    extractDOI,
    extractZoteroKey,
  }
}
