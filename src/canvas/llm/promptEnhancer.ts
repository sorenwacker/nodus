/**
 * Prompt Enhancer
 *
 * Pre-processes user prompts to:
 * 1. Detect graph type intent (mindmap, hierarchy, concept map, etc.)
 * 2. Apply established standards and best practices for that type
 * 3. Inject specific instructions for edge labels, node quality
 *
 * Based on:
 * - Novak & Cañas (2008) - Concept Mapping theory
 * - Buzan - Mind Map principles
 * - UML/flowchart standards for technical diagrams
 */

export type GraphType =
  | 'mindmap'
  | 'hierarchy'
  | 'concept_map'
  | 'flowchart'
  | 'network'
  | 'timeline'
  | 'comparison'
  | 'unknown'

export type Domain =
  | 'anatomy'
  | 'biology'
  | 'software'
  | 'organization'
  | 'process'
  | 'knowledge'
  | 'general'

interface DetectedIntent {
  graphType: GraphType
  domain: Domain
  centralTopic: string
  keywords: string[]
}

/**
 * Graph type detection patterns
 */
const GRAPH_TYPE_PATTERNS: Record<GraphType, RegExp[]> = {
  mindmap: [
    /mind\s*map/i,
    /brainstorm/i,
    /ideas?\s+about/i,
    /explore\s+(the\s+)?topic/i,
    /map\s+out/i,
  ],
  hierarchy: [
    /hierarch/i,
    /tree\s+(structure|diagram)/i,
    /organization\s*(chart|structure)/i,
    /taxonomy/i,
    /classification/i,
    /breakdown/i,
    /parts\s+of/i,
    /structure\s+of/i,
    /anatomy/i,
  ],
  concept_map: [
    /concept\s*map/i,
    /knowledge\s*(map|graph)/i,
    /relationships?\s+between/i,
    /how\s+.+\s+relate/i,
    /connections?\s+between/i,
  ],
  flowchart: [
    /flow\s*chart/i,
    /process\s*(flow|diagram)/i,
    /workflow/i,
    /steps?\s+(to|for|in)/i,
    /sequence\s+of/i,
    /procedure/i,
  ],
  network: [
    /network/i,
    /graph\s+of/i,
    /connections/i,
    /links?\s+between/i,
  ],
  timeline: [
    /timeline/i,
    /chronolog/i,
    /history\s+of/i,
    /evolution\s+of/i,
    /over\s+time/i,
  ],
  comparison: [
    /compar/i,
    /contrast/i,
    /difference/i,
    /versus|vs\.?/i,
    /pros?\s+(and|&)\s+cons?/i,
  ],
  unknown: [],
}

/**
 * Domain detection patterns
 */
const DOMAIN_PATTERNS: Record<Domain, RegExp[]> = {
  anatomy: [
    /brain/i,
    /body/i,
    /organ/i,
    /muscle/i,
    /bone/i,
    /nerve/i,
    /anatom/i,
    /physiolog/i,
    /cell/i,
    /tissue/i,
  ],
  biology: [
    /species/i,
    /ecosystem/i,
    /evolution/i,
    /genetic/i,
    /organism/i,
    /plant/i,
    /animal/i,
    /microb/i,
  ],
  software: [
    /software/i,
    /code/i,
    /system\s+architecture/i,
    /database/i,
    /api/i,
    /module/i,
    /class/i,
    /component/i,
  ],
  organization: [
    /company/i,
    /team/i,
    /department/i,
    /organization/i,
    /management/i,
    /role/i,
    /responsibilit/i,
  ],
  process: [
    /process/i,
    /workflow/i,
    /procedure/i,
    /method/i,
    /step/i,
    /phase/i,
    /stage/i,
  ],
  knowledge: [
    /concept/i,
    /theory/i,
    /principle/i,
    /idea/i,
    /topic/i,
    /subject/i,
    /learn/i,
  ],
  general: [],
}

/**
 * Best practices by graph type
 * Based on established visualization standards
 */
const GRAPH_TYPE_PRACTICES: Record<GraphType, string> = {
  mindmap: `MINDMAP BEST PRACTICES (Buzan):
- Central topic in the middle, branches radiate outward
- Use single keywords or short phrases for nodes (not sentences)
- Main branches = major themes, sub-branches = details
- Edge labels: use associative words ("triggers", "inspires", "leads to")
- Limit to 5-7 main branches from center
- Each branch should have a distinct focus`,

  hierarchy: `HIERARCHY BEST PRACTICES:
- Root node at top, children below (or center with radial layout)
- Use "contains", "includes", "has" for parent→child edges
- Use "part of", "belongs to" for child→parent edges
- Each level should be same type of thing (don't mix categories and instances)
- Leaf nodes are concrete items, internal nodes are groupings
- Maximum 7±2 children per parent for readability`,

  concept_map: `CONCEPT MAP BEST PRACTICES (Novak & Cañas):
- Nodes = concepts (nouns), Edges = relationships (verbs/linking phrases)
- EVERY edge MUST have a label forming a proposition: "Node1 - label → Node2"
- Read as sentences: "The brain contains the cerebrum"
- Cross-links between branches show deep understanding
- Hierarchical with most general concepts at top
- Use specific labels: "causes", "requires", "produces", "is a", "has"`,

  flowchart: `FLOWCHART BEST PRACTICES:
- Start/End nodes clearly marked
- Decision nodes (diamonds) have Yes/No branches
- Process nodes (rectangles) describe actions
- Edge labels: "yes", "no", "if X", "then", "next"
- Flow direction: top-to-bottom or left-to-right
- One entry, one exit per process block`,

  network: `NETWORK GRAPH BEST PRACTICES:
- Nodes = entities, Edges = relationships
- Edge labels describe relationship type
- Use bidirectional edges for mutual relationships
- Cluster related nodes visually
- Weight edges by strength if applicable`,

  timeline: `TIMELINE BEST PRACTICES:
- Nodes arranged chronologically (left-to-right or top-to-bottom)
- Edge labels: dates, durations, "followed by", "preceded"
- Group by era or period
- Include key dates in node content`,

  comparison: `COMPARISON BEST PRACTICES:
- Parallel structure: same attributes for each item being compared
- Use "differs from", "similar to", "unlike", "shares with" for edges
- Group by attribute, not by item
- Highlight key differences and similarities`,

  unknown: `GENERAL GRAPH PRACTICES:
- Use descriptive edge labels (never leave blank)
- Keep node titles short and specific
- Only create nodes for concrete entities
- Avoid category/meta nodes`,
}

/**
 * Domain-specific guidance
 */
const DOMAIN_GUIDANCE: Record<Domain, string> = {
  anatomy: `ANATOMY STANDARDS:
- Use established anatomical hierarchy: System → Organ → Tissue → Cell
- Edge labels: "contains", "connects to", "innervates", "supplies blood to"
- Include functional relationships: "controls", "regulates", "responds to"
- Reference: Terminologia Anatomica (TA) for standard naming`,

  biology: `BIOLOGY STANDARDS:
- Use taxonomic hierarchy: Kingdom → Phylum → Class → Order → Family → Genus → Species
- Edge labels: "evolves from", "preys on", "symbiotic with", "produces"
- Include ecological relationships: "habitat", "food source", "predator"`,

  software: `SOFTWARE ARCHITECTURE STANDARDS:
- Use UML-style relationships: "uses", "implements", "extends", "depends on"
- Edge labels: "calls", "returns", "contains", "imports"
- Separate concerns: UI, Logic, Data layers
- Reference: C4 model for system context`,

  organization: `ORGANIZATIONAL STANDARDS:
- Use reporting hierarchy: "reports to", "manages", "supervises"
- Edge labels: "responsible for", "collaborates with", "delegates to"
- Include functional relationships: "advises", "supports"`,

  process: `PROCESS STANDARDS:
- Use BPMN-style relationships: "triggers", "follows", "parallel with"
- Edge labels: "leads to", "requires", "produces", "validates"
- Include decision points and branches`,

  knowledge: `KNOWLEDGE MAPPING STANDARDS:
- Use epistemological relationships: "is a", "has property", "exemplifies"
- Edge labels: "defines", "contradicts", "supports", "derives from"
- Connect theories to evidence and applications`,

  general: ``,
}

/**
 * Detect the intent from user prompt
 */
export function detectIntent(prompt: string): DetectedIntent {
  // Detect graph type
  let graphType: GraphType = 'unknown'
  for (const [type, patterns] of Object.entries(GRAPH_TYPE_PATTERNS)) {
    if (patterns.some((p) => p.test(prompt))) {
      graphType = type as GraphType
      break
    }
  }

  // Detect domain
  let domain: Domain = 'general'
  for (const [d, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    if (patterns.some((p) => p.test(prompt))) {
      domain = d as Domain
      break
    }
  }

  // Extract central topic (simple heuristic: longest capitalized phrase or noun after "of/about")
  const topicMatch =
    prompt.match(/(?:of|about|for)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Za-z]+)*)/i) ||
    prompt.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) ||
    prompt.match(/(\w+)\s*(?:mind\s*map|hierarchy|graph|diagram)/i)
  const centralTopic = topicMatch?.[1] || 'Topic'

  // Extract keywords
  const keywords = prompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .filter((w) => !['create', 'make', 'build', 'about', 'without', 'based'].includes(w))

  return {
    graphType,
    domain,
    centralTopic,
    keywords,
  }
}

/**
 * Enhance user prompt with best practices and standards
 */
export function enhancePrompt(userPrompt: string): string {
  const intent = detectIntent(userPrompt)

  const practices = GRAPH_TYPE_PRACTICES[intent.graphType]
  const domainGuidance = DOMAIN_GUIDANCE[intent.domain]

  // Build enhanced prompt with MANDATORY instructions at TOP
  const sections: string[] = []

  // CRITICAL: Put mandatory workflow at TOP so model sees it first
  sections.push(`=== MANDATORY GRAPH CREATION STEPS ===
This is a GRAPH task. You MUST include ALL these steps:

1. CREATE NODES: Use create_nodes_batch to create all nodes
2. CREATE EDGES: Use create_edges_batch to connect nodes with LABELED edges
   - This step is REQUIRED - a graph without edges is incomplete
   - Every node should connect to at least one other node
3. LAYOUT: Use auto_layout("force") to arrange the graph
4. DONE: Call done() only after edges are created

If in plan mode: Your plan MUST include a step for edge creation.
If executing: Call create_edges_batch BEFORE calling done().
=====================================`)
  sections.push('')

  sections.push(`USER REQUEST: ${userPrompt}`)
  sections.push('')
  sections.push(`DETECTED: ${intent.graphType} graph about ${intent.centralTopic} (${intent.domain} domain)`)
  sections.push('')

  if (practices) {
    sections.push(practices)
    sections.push('')
  }

  if (domainGuidance) {
    sections.push(domainGuidance)
    sections.push('')
  }

  sections.push(`EDGE REQUIREMENTS:
- Every edge MUST have a semantic label (never "related" or blank)
- Use labels like: "contains", "part of", "connects to", "regulates", "produces"

NODE REQUIREMENTS:
- Only create nodes for specific, concrete entities
- Do NOT create category nodes like "Overview", "Types", "Functions"
- Node titles = proper names, not descriptions`)

  return sections.join('\n')
}

/**
 * Quick check if prompt needs enhancement
 */
export function shouldEnhancePrompt(prompt: string): boolean {
  // Enhance prompts that are creating graphs/maps
  const graphKeywords = [
    /mind\s*map/i,
    /graph/i,
    /diagram/i,
    /hierarchy/i,
    /map\s+(of|out|about)/i,
    /visuali[sz]e/i,
    /structure/i,
    /connect.*nodes/i,
    /create.*nodes/i,
  ]

  return graphKeywords.some((p) => p.test(prompt))
}
