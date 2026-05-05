/**
 * Batch classification for semantic operations
 *
 * Classifies multiple nodes in a single LLM call instead of one-by-one,
 * significantly reducing latency for large graphs.
 */

import type { LLMQueueInterface } from '../canvas/composables/agent/useLLMTools'

export interface ClassificationResult {
  nodeId: string
  title: string
  category: string
}

export interface BatchClassifierOptions {
  /** Maximum nodes per batch (default: 15) */
  batchSize?: number
  /** Log function for progress updates */
  log?: (msg: string) => void
  /** Check if operation was cancelled */
  isCancelled?: () => boolean
}

/**
 * Batch classify nodes into categories
 *
 * Instead of calling LLM per-node, batches multiple nodes into single requests.
 * Example: 100 nodes with batch size 15 = 7 LLM calls instead of 100.
 */
export async function batchClassifyNodes(
  nodes: Array<{ id: string; title: string; markdown_content?: string | null }>,
  categories: string[],
  llmQueue: LLMQueueInterface,
  options: BatchClassifierOptions = {}
): Promise<Map<string, string>> {
  const { batchSize = 15, log, isCancelled } = options
  const results = new Map<string, string>()

  if (nodes.length === 0 || categories.length === 0) {
    return results
  }

  // First pass: check for explicit tag matches (fast path)
  const nodesNeedingLLM: typeof nodes = []
  for (const node of nodes) {
    if (isCancelled?.()) break

    const content = (node.markdown_content || '').toLowerCase()
    let matched = false

    for (const cat of categories) {
      const tagPattern = `#${cat.toLowerCase()}`
      if (content.includes(tagPattern)) {
        results.set(node.id, cat.toLowerCase())
        matched = true
        break
      }
    }

    if (!matched) {
      nodesNeedingLLM.push(node)
    }
  }

  if (nodesNeedingLLM.length === 0) {
    log?.(`> All ${nodes.length} nodes matched by tags`)
    return results
  }

  log?.(`> ${results.size} tag matches, ${nodesNeedingLLM.length} need LLM classification`)

  // Batch LLM classification
  const batches = chunkArray(nodesNeedingLLM, batchSize)
  const totalBatches = batches.length

  for (let i = 0; i < batches.length; i++) {
    if (isCancelled?.()) {
      log?.(`> Stopped after ${i}/${totalBatches} batches`)
      break
    }

    const batch = batches[i]
    log?.(`> Classifying batch ${i + 1}/${totalBatches} (${batch.length} nodes)`)

    try {
      const batchResults = await classifyBatch(batch, categories, llmQueue)
      for (const [nodeId, category] of batchResults) {
        results.set(nodeId, category)
      }
    } catch (e) {
      log?.(`> Batch ${i + 1} failed: ${e}`)
      // Fall back to individual classification for this batch
      for (const node of batch) {
        if (isCancelled?.()) break
        try {
          const category = await classifySingle(node, categories, llmQueue)
          if (category) {
            results.set(node.id, category)
          }
        } catch {
          // Skip node on error
        }
      }
    }
  }

  return results
}

/**
 * Classify a batch of nodes in a single LLM call
 */
async function classifyBatch(
  nodes: Array<{ id: string; title: string }>,
  categories: string[],
  llmQueue: LLMQueueInterface
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  // Build batch prompt
  const nodeList = nodes.map((n, i) => `${i + 1}. "${n.title}"`).join('\n')
  const categoryList = categories.join(', ')

  const prompt = `Classify each item into one of these categories: ${categoryList}
If an item doesn't fit any category, respond with NONE.

Items:
${nodeList}

Respond with ONLY a numbered list like:
1. category
2. category
3. NONE
...`

  const response = await llmQueue.generate(prompt)
  if (!response) return results

  // Parse response
  const lines = response.trim().split('\n')
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/i)
    if (match) {
      const index = parseInt(match[1]) - 1
      const category = match[2].trim().toLowerCase()

      if (index >= 0 && index < nodes.length) {
        // Check if category is valid
        const validCategory = categories.find(c => c.toLowerCase() === category)
        if (validCategory && category !== 'none') {
          results.set(nodes[index].id, validCategory.toLowerCase())
        }
      }
    }
  }

  return results
}

/**
 * Classify a single node (fallback)
 */
async function classifySingle(
  node: { id: string; title: string },
  categories: string[],
  llmQueue: LLMQueueInterface
): Promise<string | null> {
  const prompt = `What is "${node.title}"? Classify as: ${categories.join(', ')}, or NONE.

Think: What type of thing is this? Which category does it belong to?
Answer with ONE word only (${categories.join('/')} or NONE):`

  const response = await llmQueue.generate(prompt)
  const responseLower = (response || 'none').toLowerCase()

  for (const cat of categories) {
    if (responseLower.includes(cat.toLowerCase())) {
      return cat.toLowerCase()
    }
  }

  return null
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Batch classify nodes for smart_move (extract categories first, then classify)
 */
export async function batchClassifyForMove(
  nodes: Array<{ id: string; title: string; markdown_content?: string | null }>,
  instruction: string,
  llmQueue: LLMQueueInterface,
  options: BatchClassifierOptions = {}
): Promise<Map<string, string>> {
  const { log } = options

  // Extract categories from instruction
  let categories: string[] = []
  try {
    const prompt = `Extract category names from: "${instruction}"\nList ONLY categories separated by comma:`
    const response = await llmQueue.generate(prompt)
    categories = (response || '')
      .toLowerCase()
      .split(/[,\n]+/)
      .map(c => c.trim())
      .filter(c => c.length > 1)
  } catch {
    // Fallback categories
  }

  if (categories.length < 2) {
    categories = ['left', 'right']
  }

  log?.(`> Categories: ${categories.join(', ')}`)

  return batchClassifyNodes(nodes, categories, llmQueue, options)
}

/**
 * Batch classify nodes for smart_connect (classify into groups)
 */
export async function batchClassifyForConnect(
  nodes: Array<{ id: string; title: string; markdown_content?: string | null }>,
  groups: string,
  llmQueue: LLMQueueInterface,
  options: BatchClassifierOptions = {}
): Promise<Map<string, string>> {
  const categories = groups.split(/[,\s]+/).map(g => g.trim()).filter(g => g.length > 0)

  if (categories.length === 0) {
    return new Map()
  }

  return batchClassifyNodes(nodes, categories, llmQueue, options)
}
