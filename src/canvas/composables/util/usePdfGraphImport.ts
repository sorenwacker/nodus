/**
 * Expanding an imported PDF into a graph.
 *
 * A paper is already sections, an argument and a bibliography; this offers
 * that structure as nodes and edges once the document import has finished.
 * The structural parts never depend on the model or the network
 * (PRODUCT_DESIGN.md > PDF as a graph).
 */
import { ref } from 'vue'
import {
  splitIntoSections,
  findReferencesSection,
  parseReferenceEntries,
  planGraphImport,
  withVerification,
  verificationFromLookup,
  type GraphImportPlan,
  type ReferenceEntry,
} from '../../../lib/pdfGraph'
import { semanticScholar } from '../../../lib/semanticScholar'

interface GraphImportStore {
  createNode: (data: {
    title: string
    node_type: string
    markdown_content: string
    canvas_x: number
    canvas_y: number
  }) => Promise<{ id: string }>
  createEdge: (data: {
    source_node_id: string
    target_node_id: string
    link_type?: string
  }) => Promise<unknown>
  updateNodeContent: (id: string, content: string) => Promise<void>
  createFrame?: (x: number, y: number, width: number, height: number, title: string) => { id: string }
  assignNodeToFrame?: (nodeId: string, frameId: string | null) => void
  /** Current node content, so verification never overwrites an edit made meanwhile */
  getNode?: (id: string) => { markdown_content?: string | null } | undefined
}

export interface UsePdfGraphImportOptions {
  store: GraphImportStore
  llm: { simpleGenerate: (prompt: string) => Promise<string> }
  pushCreationUndo?: (nodeIds: string[]) => void
}

/** A dropped PDF whose structure can become a graph, awaiting the choice */
export interface PendingGraphImport {
  filename: string
  documentNodeId: string
  plan: GraphImportPlan
  references: ReferenceEntry[]
  sectionCount: number
}

export interface GraphImportChoices {
  sections: boolean
  references: boolean
  verify: boolean
  semantic: boolean
}

export interface GraphImportResult {
  createdNodeIds: string[]
  citationNodeIds: string[]
  semanticSkipped: number
}

const FRAME_PADDING = 60
const FRAME_TITLE_HEIGHT = 50

export function usePdfGraphImport(options: UsePdfGraphImportOptions) {
  const { store, llm, pushCreationUndo } = options

  const pendingGraphImport = ref<PendingGraphImport | null>(null)
  const importStatus = ref('')

  /**
   * Offer to expand the document into a graph when it has the structure for
   * one. The offer, not the expansion: which shape the paper takes is the
   * reader's choice.
   */
  function offerGraph(
    markdown: string,
    filename: string,
    documentNodeId: string,
    x: number,
    y: number
  ) {
    const sections = splitIntoSections(markdown)
    const referencesSection = findReferencesSection(sections)
    const references = referencesSection ? parseReferenceEntries(referencesSection.content) : []
    const contentSections = sections.filter(s => s !== referencesSection)

    // One heading is no structure; nothing to offer
    if (contentSections.length < 3 && references.length === 0) return

    const plan = planGraphImport(sections, references, { x: x + 380, y })
    pendingGraphImport.value = {
      filename,
      documentNodeId,
      plan,
      references,
      sectionCount: contentSections.length,
    }
  }

  /**
   * Materialise the planned graph: frame, section nodes, citation nodes and
   * edges. Verification runs afterwards and updates the citation nodes as
   * results arrive, so the structure never waits on the network.
   */
  async function confirmGraphImport(choices: GraphImportChoices): Promise<GraphImportResult> {
    const pending = pendingGraphImport.value
    pendingGraphImport.value = null
    if (!pending) return { createdNodeIds: [], citationNodeIds: [], semanticSkipped: 0 }

    const { plan } = pending
    const idByKey = new Map<string, string>()
    const created: string[] = []
    const citationIds: string[] = []

    const wanted = plan.nodes.filter(n =>
      n.nodeType === 'citation' ? choices.references : choices.sections
    )

    for (const planned of wanted) {
      const node = await store.createNode({
        title: planned.title,
        node_type: planned.nodeType,
        markdown_content: planned.content,
        canvas_x: planned.x,
        canvas_y: planned.y,
      })
      idByKey.set(planned.key, node.id)
      created.push(node.id)
      if (planned.nodeType === 'citation') citationIds.push(node.id)
    }

    for (const edge of plan.edges) {
      const from = idByKey.get(edge.fromKey)
      const to = idByKey.get(edge.toKey)
      if (from && to) {
        await store.createEdge({
          source_node_id: from,
          target_node_id: to,
          link_type: edge.linkType,
        })
      }
    }

    // The document node cites the citation column when sections were skipped
    if (!choices.sections && choices.references) {
      for (const id of citationIds) {
        await store.createEdge({
          source_node_id: pending.documentNodeId,
          target_node_id: id,
          link_type: 'cites',
        })
      }
    }

    if (choices.sections) {
      frameSections(plan, idByKey)
    }

    if (created.length > 0 && pushCreationUndo) pushCreationUndo(created)

    // Verification after the structure exists: three states, and an outage is
    // "not checked", never "not found"
    if (choices.verify && choices.references) {
      void verifyCitations(pending.references, plan, idByKey)
    }

    // The semantic pass spends model time per section and its quality depends
    // on the model, so it is a choice; a failed section is skipped, never a
    // reason to lose the structural graph
    let semanticSkipped = 0
    if (choices.semantic && choices.sections) {
      const semantic = await extractClaims(plan, idByKey)
      created.push(...semantic.createdIds)
      if (semantic.createdIds.length > 0 && pushCreationUndo) {
        pushCreationUndo(semantic.createdIds)
      }
      semanticSkipped = semantic.skipped
    }

    return { createdNodeIds: created, citationNodeIds: citationIds, semanticSkipped }
  }

  /** Group the section nodes in a frame named after the paper */
  function frameSections(plan: GraphImportPlan, idByKey: Map<string, string>) {
    if (!store.createFrame || !store.assignNodeToFrame) return
    const sections = plan.nodes.filter(n => n.nodeType === 'note' && idByKey.has(n.key))
    if (sections.length === 0) return

    const minX = Math.min(...sections.map(n => n.x))
    const minY = Math.min(...sections.map(n => n.y))
    const maxX = Math.max(...sections.map(n => n.x + 260))
    const maxY = Math.max(...sections.map(n => n.y + 160))

    const frame = store.createFrame(
      minX - FRAME_PADDING,
      minY - FRAME_PADDING - FRAME_TITLE_HEIGHT,
      maxX - minX + FRAME_PADDING * 2,
      maxY - minY + FRAME_PADDING * 2 + FRAME_TITLE_HEIGHT,
      plan.frameTitle
    )
    for (const section of sections) {
      store.assignNodeToFrame(idByKey.get(section.key)!, frame.id)
    }
  }

  /** LLM pass per section: claims become nodes linked to their section */
  async function extractClaims(
    plan: GraphImportPlan,
    idByKey: Map<string, string>
  ): Promise<{ createdIds: string[]; skipped: number }> {
    const createdIds: string[] = []
    let skipped = 0
    const sections = plan.nodes.filter(n => n.nodeType === 'note' && n.content.length > 200)

    for (const section of sections) {
      const sectionId = idByKey.get(section.key)
      if (!sectionId) continue
      importStatus.value = `Extracting claims: ${section.title}...`

      try {
        const raw = await llm.simpleGenerate(
          `Extract the distinct claims or findings from this text. Reply with ONLY a JSON array, no other text: [{"claim": "...", "relation": "supports"|"contradicts"|null}] where relation says how the claim relates to the section's main argument. At most 4 claims; an empty array if the text argues nothing.

Text:
${section.content.slice(0, 4000)}`
        )
        const match = raw.match(/\[[\s\S]*\]/)
        if (!match) {
          skipped++
          continue
        }
        const claims = JSON.parse(match[0]) as Array<{ claim?: string; relation?: string | null }>

        for (let i = 0; i < claims.length; i++) {
          const text = claims[i]?.claim?.trim()
          if (!text) continue
          const node = await store.createNode({
            title: text.length > 60 ? `${text.slice(0, 57)}...` : text,
            node_type: 'note',
            markdown_content: text,
            canvas_x: section.x + 40,
            canvas_y: section.y + 260 + i * 120,
          })
          createdIds.push(node.id)
          const relation = claims[i].relation
          await store.createEdge({
            source_node_id: sectionId,
            target_node_id: node.id,
            link_type: relation === 'supports' || relation === 'contradicts' ? relation : 'related',
          })
        }
      } catch {
        skipped++
      }
    }

    importStatus.value = ''
    return { createdIds, skipped }
  }

  async function verifyCitations(
    references: ReferenceEntry[],
    plan: GraphImportPlan,
    idByKey: Map<string, string>
  ) {
    for (let i = 0; i < references.length; i++) {
      const nodeId = idByKey.get(`r${i}`)
      if (!nodeId) continue
      const outcome = await semanticScholar.lookupForVerification(references[i])
      const verification = verificationFromLookup(outcome)
      // Base on the node as it is now: the user may have edited it while the
      // lookups ran, and verification must annotate, not overwrite
      const current = store.getNode?.(nodeId)?.markdown_content
      const planned = plan.nodes.find(n => n.key === `r${i}`)
      let content = withVerification(current ?? planned?.content ?? '', verification)
      if (outcome.paper?.externalIds?.DOI && !references[i].doi) {
        content = `${content.trimEnd()}\n\nDOI: ${outcome.paper.externalIds.DOI}`
      }
      await store.updateNodeContent(nodeId, content)
    }
  }

  function cancelGraphImport() {
    pendingGraphImport.value = null
  }

  return {
    pendingGraphImport,
    importStatus,
    offerGraph,
    confirmGraphImport,
    cancelGraphImport,
  }
}
