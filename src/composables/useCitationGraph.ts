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
 * Format a stub node's markdown content
 */
function formatStubContent(ref: SemanticScholarReference): string {
  const lines: string[] = ['---']

  if (ref.externalIds?.DOI) {
    lines.push(`doi: ${ref.externalIds.DOI}`)
  }
  lines.push(`semantic_scholar_id: ${ref.paperId}`)
  lines.push('node_type: citation-stub')
  lines.push('---')
  lines.push('')
  lines.push(`# ${ref.title || 'Untitled'}`)
  lines.push('')

  if (ref.authors && ref.authors.length > 0) {
    const authorNames = ref.authors.slice(0, 5).map(a => a.name).join(', ')
    if (ref.authors.length > 5) {
      lines.push(`**Authors:** ${authorNames}, et al.`)
    } else {
      lines.push(`**Authors:** ${authorNames}`)
    }
    lines.push('')
  }

  if (ref.year) {
    lines.push(`**Year:** ${ref.year}`)
    lines.push('')
  }

  if (ref.externalIds?.DOI) {
    lines.push(`**DOI:** [${ref.externalIds.DOI}](https://doi.org/${ref.externalIds.DOI})`)
    lines.push('')
  }

  lines.push('*This is a citation stub. Import from Zotero to get full metadata.*')

  return lines.join('\n')
}

export function useCitationGraph(ctx: UseCitationGraphContext) {
  const progress = ref<CitationGraphProgress | null>(null)
  const isBuilding = ref(false)

  // Build DOI -> Node ID index from current nodes
  function buildDOIIndex(): Map<string, string> {
    const index = new Map<string, string>()
    const nodes = ctx.getNodes()

    for (const node of nodes) {
      const doi = extractDOI(node.markdown_content)
      if (doi) {
        // Normalize DOI to lowercase for matching
        index.set(doi.toLowerCase(), node.id)
      }
    }

    return index
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
   * Fetch citations for a single node
   */
  async function fetchCitationsForNode(nodeId: string): Promise<number> {
    const nodes = ctx.getNodes()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return 0

    const doi = extractDOI(node.markdown_content)
    if (!doi) return 0

    // Get paper from Semantic Scholar
    const paper = await semanticScholar.getPaperByDOI(doi)
    if (!paper) return 0

    // Build DOI index for matching
    const doiIndex = buildDOIIndex()

    // Get references and citations
    const [references, citations] = await Promise.all([
      semanticScholar.getReferences(paper.paperId),
      semanticScholar.getCitations(paper.paperId),
    ])

    let edgesCreated = 0

    // Create edges for references (this paper cites them)
    for (const ref of references) {
      if (ref.externalIds?.DOI) {
        const targetNodeId = doiIndex.get(ref.externalIds.DOI.toLowerCase())
        if (targetNodeId && !edgeExists(nodeId, targetNodeId, 'cites')) {
          await ctx.createEdge({
            source_node_id: nodeId,
            target_node_id: targetNodeId,
            link_type: 'cites',
          })
          edgesCreated++
        }
      }
    }

    // Create edges for citations (they cite this paper)
    for (const cit of citations) {
      if (cit.externalIds?.DOI) {
        const sourceNodeId = doiIndex.get(cit.externalIds.DOI.toLowerCase())
        if (sourceNodeId && !edgeExists(sourceNodeId, nodeId, 'cites')) {
          await ctx.createEdge({
            source_node_id: sourceNodeId,
            target_node_id: nodeId,
            link_type: 'cites',
          })
          edgesCreated++
        }
      }
    }

    return edgesCreated
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

    // Find all nodes with DOIs
    const nodesWithDOI = nodes.filter(n =>
      extractDOI(n.markdown_content) !== null &&
      n.node_type !== 'citation-stub'
    )

    if (nodesWithDOI.length === 0) {
      isBuilding.value = false
      return { edgesCreated: 0, stubNodesCreated: 0, errors: ['No nodes with DOI found'] }
    }

    progress.value = {
      phase: 'scanning',
      current: 0,
      total: nodesWithDOI.length,
      currentPaper: '',
      errors: [],
    }

    // Build initial DOI index
    const doiIndex = buildDOIIndex()

    // Process each node
    for (let i = 0; i < nodesWithDOI.length; i++) {
      const node = nodesWithDOI[i]
      const doi = extractDOI(node.markdown_content)!

      progress.value = {
        phase: 'fetching',
        current: i + 1,
        total: nodesWithDOI.length,
        currentPaper: node.title,
        errors,
      }

      try {
        // Get paper from Semantic Scholar
        const paper = await semanticScholar.getPaperByDOI(doi)
        if (!paper) {
          errors.push(`Paper not found: ${node.title}`)
          continue
        }

        // Get references and citations
        const [references, citations] = await Promise.all([
          semanticScholar.getReferences(paper.paperId),
          semanticScholar.getCitations(paper.paperId),
        ])

        progress.value = {
          phase: 'creating',
          current: i + 1,
          total: nodesWithDOI.length,
          currentPaper: node.title,
          errors,
        }

        // Process references (papers this node cites)
        let stubsCreated = 0
        for (const ref of references) {
          if (ref.externalIds?.DOI) {
            const targetDOI = ref.externalIds.DOI.toLowerCase()
            let targetNodeId = doiIndex.get(targetDOI)

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
              doiIndex.set(targetDOI, stubNode.id)
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
        }

        // Process citations (papers that cite this node)
        for (const cit of citations) {
          if (cit.externalIds?.DOI) {
            const sourceDOI = cit.externalIds.DOI.toLowerCase()
            const sourceNodeId = doiIndex.get(sourceDOI)

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
        }
      } catch (error) {
        errors.push(`Error processing ${node.title}: ${error}`)
      }
    }

    progress.value = {
      phase: 'done',
      current: nodesWithDOI.length,
      total: nodesWithDOI.length,
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

  return {
    // State
    progress: computed(() => progress.value),
    isBuilding: computed(() => isBuilding.value),

    // Actions
    buildCitationGraph,
    fetchCitationsForNode,
    cancelBuild,

    // Utilities
    extractDOI,
    extractZoteroKey,
  }
}
