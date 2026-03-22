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

  // Simple enhancement - just add key reminders
  return `${userPrompt}

Type: ${intent.graphType} (${intent.domain})
Steps: create_nodes_batch → create_edges_batch (with labels) → auto_layout → done`
}

/**
 * Quick check if prompt needs enhancement
 */
export function shouldEnhancePrompt(prompt: string): boolean {
  // Skip maintenance/fix requests - these are NOT graph creation
  const maintenanceKeywords = [
    /fix|repair|correct|remove|delete|disconnected|orphan|broken|wrong/i,
    /link the|connect the|update the/i,
    /for each node/i,
    /add.*summary|add.*content/i,
  ]
  if (maintenanceKeywords.some((p) => p.test(prompt))) {
    return false
  }

  // Only enhance explicit graph CREATION requests
  const creationKeywords = [
    /^create\s+(a\s+)?mind\s*map/i,
    /^create\s+(a\s+)?(graph|diagram|hierarchy)/i,
    /^make\s+(a\s+)?mind\s*map/i,
    /^build\s+(a\s+)?(graph|mindmap|hierarchy)/i,
    /mind\s*map\s+(of|about|for)/i,
    /hierarchy\s+(of|about|for)/i,
    /concept\s*map\s+(of|about|for)/i,
  ]

  return creationKeywords.some((p) => p.test(prompt))
}
