/**
 * Color Tool Handlers
 *
 * Handles node coloring operations including smart color, regex matching,
 * and semantic classification.
 */

import type { ToolHandler, ToolContext } from './types'
import { parseToolArgs, getStringArg, extractJSONArray } from '../../../lib/parsing'
import { batchClassifyNodes } from '../../batchClassifier'

interface ColorMapping {
  category: string
  color: string
}

/**
 * Smart color: classify nodes and apply colors based on semantic categories
 */
export const smartColorHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const instruction = getStringArg(parsed, 'instruction', '')

  const nodes = ctx.store.getFilteredNodes()
  if (nodes.length === 0) return 'No nodes to color'

  ctx.log(`> Smart color: ${nodes.length} nodes (batch classification)`)

  // Step 1: Extract category-to-color mappings from instruction
  let colorMappings: ColorMapping[] = []
  try {
    const prompt = `Extract category-to-color mappings from: "${instruction}"
Output as JSON array: [{"category":"name","color":"#hex"}]
Available colors: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink), #6b7280 (gray)
Example: "departments red, people blue" -> [{"category":"departments","color":"#ef4444"},{"category":"people","color":"#3b82f6"}]
Output ONLY the JSON array:`

    const response = await ctx.llmQueue.generate(prompt)
    colorMappings = extractJSONArray<ColorMapping>(response || '') || []
  } catch {
    /* ignore LLM errors */
  }

  if (colorMappings.length === 0) return 'Could not parse color instruction'

  const categories = colorMappings.map((m) => m.category)
  const categoryToColor = new Map(
    colorMappings.map((m) => [m.category.toLowerCase(), m.color])
  )
  ctx.log(`> Categories: ${categories.join(', ')}`)

  // Step 2: Use batch classification
  const nodeClassifications = await batchClassifyNodes(
    nodes.map((n) => ({
      id: n.id,
      title: n.title,
      markdown_content: n.markdown_content,
    })),
    categories,
    ctx.llmQueue,
    { log: ctx.log, isCancelled: ctx.isCancelled }
  )

  // Step 3: Apply colors based on classifications
  let colored = 0
  for (const node of nodes) {
    if (ctx.isCancelled()) {
      ctx.log(`> Stopped after ${colored} nodes`)
      return `Stopped. Colored ${colored}/${nodes.length} nodes.`
    }

    const matchedCategory = nodeClassifications.get(node.id)
    if (matchedCategory && categoryToColor.has(matchedCategory)) {
      const color = categoryToColor.get(matchedCategory)!
      await ctx.store.updateNodeColor(node.id, color)
      ctx.log(`> ${node.title} -> ${matchedCategory}`)
      colored++
    }
  }

  return `Colored ${colored}/${nodes.length} nodes based on semantic classification`
}

/**
 * Color nodes matching a criterion (text or semantic)
 */
export const colorMatchingHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const criterion = getStringArg(parsed, 'pattern', '').trim()
  const color = getStringArg(parsed, 'color', '#ef4444')

  if (!criterion) return 'Criterion required'

  const nodes = ctx.store.getFilteredNodes()
  let colored = 0
  const matchedTitles: string[] = []

  // Detect if this is a literal text pattern vs semantic criterion
  const isLiteralPattern =
    criterion.includes('...') ||
    criterion.includes('"') ||
    criterion.includes("'") ||
    /^[A-Z][a-z]/.test(criterion) ||
    / of\b/.test(criterion) ||
    / and\b/.test(criterion)

  if (isLiteralPattern) {
    // Simple text matching
    const searchText = criterion
      .replace(/\.{2,}/g, '')
      .replace(/['"]/g, '')
      .trim()
      .toLowerCase()
    ctx.log(`> color_matching: text search for "${searchText}" in ${nodes.length} nodes`)

    for (const node of nodes) {
      if (ctx.isCancelled()) {
        ctx.log(`> Stopped after ${colored} nodes`)
        return `Stopped. Colored ${colored}/${nodes.length} nodes.`
      }

      if (node.title.toLowerCase().includes(searchText)) {
        await ctx.store.updateNodeColor(node.id, color)
        matchedTitles.push(node.title)
        colored++
        ctx.log(`> ${node.title} -> match`)
      }
    }
  } else {
    // Semantic evaluation
    ctx.log(`> color_matching: semantic evaluation of ${nodes.length} nodes for "${criterion}"`)

    for (const node of nodes) {
      if (ctx.isCancelled()) {
        ctx.log(`> Stopped after ${colored} nodes`)
        return `Stopped. Colored ${colored}/${nodes.length} nodes.`
      }

      try {
        // Check for explicit tag match first
        const content = node.markdown_content || ''
        const tagPattern = `#${criterion.replace(/^#/, '').toLowerCase()}`
        if (content.toLowerCase().includes(tagPattern)) {
          await ctx.store.updateNodeColor(node.id, color)
          matchedTitles.push(node.title)
          colored++
          ctx.log(`> ${node.title} -> tag`)
          continue
        }

        // Semantic evaluation via LLM
        const prompt = `Is "${node.title}" a ${criterion}? Answer only YES or NO.`
        const response = await ctx.llmQueue.generate(prompt)
        const answer = (response || '').toUpperCase().trim()

        if (answer === 'YES' || answer.startsWith('YES')) {
          await ctx.store.updateNodeColor(node.id, color)
          matchedTitles.push(node.title)
          colored++
          ctx.log(`> ${node.title} -> YES`)
        } else {
          ctx.log(`> ${node.title} -> NO`)
        }
      } catch (e) {
        ctx.log(`> ${node.title}: failed - ${e}`)
      }
    }
  }

  if (colored === 0) {
    return `No nodes match "${criterion}"`
  }

  const preview = matchedTitles.slice(0, 5).join(', ')
  return `Colored ${colored}/${nodes.length} nodes: ${preview}${colored > 5 ? '...' : ''}`
}

/**
 * Color nodes matching a regex pattern
 */
export const colorRegexHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const regexStr = getStringArg(parsed, 'regex', '').trim()
  const color = getStringArg(parsed, 'color', '#ef4444')
  const field = getStringArg(parsed, 'field', 'title')

  if (!regexStr) return 'Regex pattern required'

  let regex: RegExp
  try {
    regex = new RegExp(regexStr, 'i')
  } catch (e) {
    return `Invalid regex: ${e}`
  }

  const nodes = ctx.store.getFilteredNodes()
  const matchedTitles: string[] = []
  let colored = 0

  ctx.log(`> color_regex: matching /${regexStr}/i on ${field} in ${nodes.length} nodes`)

  for (const node of nodes) {
    const text = field === 'content' ? node.markdown_content || '' : node.title
    if (regex.test(text)) {
      await ctx.store.updateNodeColor(node.id, color)
      matchedTitles.push(node.title)
      colored++
    }
  }

  if (colored === 0) {
    return `No nodes match regex /${regexStr}/`
  }

  const preview = matchedTitles.slice(0, 5).join(', ')
  ctx.log(`> Colored ${colored} nodes: ${preview}${colored > 5 ? '...' : ''}`)
  return `Colored ${colored}/${nodes.length} nodes matching /${regexStr}/: ${preview}${colored > 5 ? '...' : ''}`
}

/**
 * Reset all edge colors to default
 */
export const resetEdgeColorsHandler: ToolHandler = async (
  _args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  if (!ctx.store.updateEdgeColor) {
    return 'Edge operations not available'
  }

  const edges = ctx.store.getFilteredEdges()
  let reset = 0

  for (const edge of edges) {
    if (edge.color) {
      await ctx.store.updateEdgeColor(edge.id, null)
      reset++
    }
  }

  return `Reset ${reset}/${edges.length} edge colors to default`
}
