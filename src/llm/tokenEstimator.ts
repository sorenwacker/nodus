/**
 * Token estimation utilities for context budget pre-checks
 *
 * Provides rough token estimates to warn users before starting
 * operations that would exceed model context limits.
 */

/** Average characters per token (rough estimate for English text) */
const CHARS_PER_TOKEN = 4

/** Overhead tokens for system prompt structure */
const SYSTEM_PROMPT_OVERHEAD = 500

/** Tokens per node in system prompt (title + coordinates + overhead) */
const TOKENS_PER_NODE = 25

/** Tokens per edge in system prompt */
const TOKENS_PER_EDGE = 15

/** Safety margin (reserve 20% for response) */
const SAFETY_MARGIN = 0.8

export interface TokenEstimate {
  /** Estimated total tokens for the operation */
  totalTokens: number
  /** Breakdown by category */
  breakdown: {
    systemPrompt: number
    nodes: number
    edges: number
    userRequest: number
    conversationHistory: number
  }
  /** Whether this fits within the context limit */
  fitsInContext: boolean
  /** Context limit being used */
  contextLimit: number
  /** Percentage of context that would be used */
  usagePercent: number
  /** Warning message if approaching limit */
  warning?: string
}

/**
 * Estimate tokens for a given text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total tokens for an agent operation
 */
export function estimateAgentTokens(
  nodes: Array<{ title: string; markdown_content?: string | null }>,
  edges: Array<{ source_node_id: string; target_node_id: string }>,
  userRequest: string,
  conversationHistory: Array<{ content?: string }>,
  contextLimit: number
): TokenEstimate {
  // System prompt base overhead
  const systemPromptTokens = SYSTEM_PROMPT_OVERHEAD

  // Node tokens (title + some content preview in certain operations)
  const nodeTokens = nodes.reduce((sum, node) => {
    return sum + TOKENS_PER_NODE + estimateTokens(node.title)
  }, 0)

  // Edge tokens
  const edgeTokens = edges.length * TOKENS_PER_EDGE

  // User request tokens
  const userRequestTokens = estimateTokens(userRequest)

  // Conversation history tokens
  const historyTokens = conversationHistory.reduce((sum, msg) => {
    return sum + estimateTokens(msg.content || '')
  }, 0)

  const totalTokens = systemPromptTokens + nodeTokens + edgeTokens +
                      userRequestTokens + historyTokens

  const effectiveLimit = Math.floor(contextLimit * SAFETY_MARGIN)
  const fitsInContext = totalTokens <= effectiveLimit
  const usagePercent = Math.round((totalTokens / contextLimit) * 100)

  let warning: string | undefined
  if (usagePercent > 90) {
    warning = `Context usage at ${usagePercent}% - operation may fail. Consider selecting fewer nodes.`
  } else if (usagePercent > 70) {
    warning = `Context usage at ${usagePercent}% - approaching limit.`
  }

  return {
    totalTokens,
    breakdown: {
      systemPrompt: systemPromptTokens,
      nodes: nodeTokens,
      edges: edgeTokens,
      userRequest: userRequestTokens,
      conversationHistory: historyTokens,
    },
    fitsInContext,
    contextLimit,
    usagePercent,
    warning,
  }
}

/**
 * Estimate tokens for batch node classification
 * Used by smart_color, smart_move, etc.
 */
export function estimateBatchClassificationTokens(
  nodes: Array<{ title: string }>,
  categories: string[],
  contextLimit: number
): { batchSize: number; totalBatches: number } {
  // Each node in a batch needs: prompt overhead + title + category list
  const categoryListTokens = estimateTokens(categories.join(', '))
  const promptOverhead = 50 // "Classify each:" + formatting

  // Response tokens: node title + category for each
  const responseTokensPerNode = 10

  // Total tokens per node in a batch
  const tokensPerNode = estimateTokens('') + responseTokensPerNode + 5

  // Reserve tokens for prompt structure
  const reservedTokens = promptOverhead + categoryListTokens + 100

  // Available tokens for node data
  const availableTokens = Math.floor(contextLimit * 0.5) - reservedTokens

  // Calculate optimal batch size
  const avgTitleTokens = nodes.reduce((sum, n) => sum + estimateTokens(n.title), 0) / nodes.length
  const batchSize = Math.max(1, Math.floor(availableTokens / (avgTitleTokens + tokensPerNode)))

  // Cap batch size for reliability
  const effectiveBatchSize = Math.min(batchSize, 20)
  const totalBatches = Math.ceil(nodes.length / effectiveBatchSize)

  return { batchSize: effectiveBatchSize, totalBatches }
}

/**
 * Pre-flight check before starting agent
 * Returns null if OK, or an error message if context would overflow
 */
export function preflightCheck(
  nodes: Array<{ title: string; markdown_content?: string | null }>,
  edges: Array<{ source_node_id: string; target_node_id: string }>,
  userRequest: string,
  contextLimit: number
): string | null {
  const estimate = estimateAgentTokens(nodes, edges, userRequest, [], contextLimit)

  if (!estimate.fitsInContext) {
    return `Context would exceed limit (${estimate.usagePercent}% of ${contextLimit} tokens). ` +
           `Reduce selection to ~${Math.floor(nodes.length * 0.7)} nodes or less.`
  }

  return null
}
