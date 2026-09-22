/**
 * Semantic tools: smart_move, smart_connect, smart_color, color_matching,
 * color_regex, reset_edge_colors.
 *
 * The first four judge nodes with the model, which arrives as the `llm`
 * context service; the last two need only the store.
 */

import { defineTool, type ToolContext } from '../registry'
import { extractJSONArray } from '../../lib/parsing'
import {
  batchClassifyNodes,
  batchClassifyForMove,
  batchClassifyForConnect,
} from '../batchClassifier'

interface ColorMapping {
  category: string
  color: string
}

const COLOR_HINT =
  'Color hex code: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink)'

function classifiable(ctx: ToolContext) {
  return ctx.store.filteredNodes.map(n => ({
    id: n.id,
    title: n.title,
    markdown_content: n.markdown_content,
  }))
}

export function registerSmartTools(): void {
  defineTool<{ instruction: string }>(
    'smart_move',
    'Move nodes based on semantic criteria. LLM reasons about each node. Use for "move cars left, animals right".',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language: "car brands to x=100, animals to x=600"' },
      },
      required: ['instruction'],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      if (nodes.length === 0) return 'No nodes to move'
      const llm = ctx.llm!
      ctx.log(`> Smart move: ${nodes.length} nodes (batch classification)`)

      const classifications = await batchClassifyForMove(classifiable(ctx), args.instruction || '', llm, {
        log: ctx.log,
        isCancelled: llm.isCancelled,
      })

      const groups = new Map<string, typeof nodes>()
      for (const node of nodes) {
        const group = classifications.get(node.id) || 'other'
        if (!groups.has(group)) groups.set(group, [])
        groups.get(group)!.push(node)
      }

      let moved = 0
      const spacing = 250
      let groupX = 100
      for (const [, groupNodes] of groups) {
        for (let i = 0; i < groupNodes.length; i++) {
          await ctx.store.updateNodePosition(groupNodes[i].id, groupX, 100 + i * 180)
          moved++
        }
        groupX += spacing
      }
      return `Moved ${moved} nodes into ${groups.size} groups`
    },
    { modes: ['execute'], mutates: true, requires: ['llm'] }
  )

  defineTool<{ groups: string }>(
    'smart_connect',
    'Connect nodes within semantic groups. E.g., "connect animals together, connect cars together, but not across".',
    {
      type: 'object',
      properties: {
        groups: { type: 'string', description: 'Group descriptions: "animals, car brands"' },
      },
      required: ['groups'],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      if (nodes.length < 2) return 'Need at least 2 nodes'
      const llm = ctx.llm!
      ctx.log(`> Smart connect: ${nodes.length} nodes (batch classification)`)

      const classifications = await batchClassifyForConnect(classifiable(ctx), args.groups || '', llm, {
        log: ctx.log,
        isCancelled: llm.isCancelled,
      })

      const grouped = new Map<string, string[]>()
      for (const node of nodes) {
        const group = classifications.get(node.id) || 'other'
        if (!grouped.has(group)) grouped.set(group, [])
        grouped.get(group)!.push(node.id)
      }

      let edgeCount = 0
      for (const [, ids] of grouped) {
        for (let i = 0; i < ids.length - 1; i++) {
          await ctx.store.createEdge({ source_node_id: ids[i], target_node_id: ids[i + 1] })
          edgeCount++
        }
      }
      return `Created ${edgeCount} edges in ${grouped.size} groups`
    },
    { modes: ['execute'], mutates: true, requires: ['llm'] }
  )

  defineTool<{ instruction: string }>(
    'smart_color',
    'Color nodes into multiple categories based on what they represent. LLM semantically classifies each node.',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Category-to-color mapping: "faculties blue, departments red" or "people green, organizations orange"' },
      },
      required: ['instruction'],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      if (nodes.length === 0) return 'No nodes to color'
      if (!ctx.store.updateNodeColor) return 'Node colouring is not available in this context'
      const llm = ctx.llm!
      ctx.log(`> Smart color: ${nodes.length} nodes (batch classification)`)

      // Step 1: extract category-to-color mappings from the instruction
      let colorMappings: ColorMapping[] = []
      try {
        const prompt = `Extract category-to-color mappings from: "${args.instruction || ''}"
Output as JSON array: [{"category":"name","color":"#hex"}]
Available colors: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink), #6b7280 (gray)
Example: "departments red, people blue" -> [{"category":"departments","color":"#ef4444"},{"category":"people","color":"#3b82f6"}]
Output ONLY the JSON array:`
        const response = await llm.generate(prompt)
        colorMappings = extractJSONArray<ColorMapping>(response || '') || []
      } catch (e) {
        // A model that could not be reached has not given an unparseable answer.
        // Reporting the outage as a parse failure sent the model back to rephrase
        // an instruction that was never the problem
        // (PRODUCT_DESIGN.md > Lookups that cannot be made)
        return `Could not reach the model to interpret the colour instruction: ${
          e instanceof Error ? e.message : String(e)
        }`
      }
      if (colorMappings.length === 0) return 'Could not parse color instruction'

      const categories = colorMappings.map(m => m.category)
      const categoryToColor = new Map(colorMappings.map(m => [m.category.toLowerCase(), m.color]))
      ctx.log(`> Categories: ${categories.join(', ')}`)

      // Step 2: classify every node in batches
      const classifications = await batchClassifyNodes(classifiable(ctx), categories, llm, {
        log: ctx.log,
        isCancelled: llm.isCancelled,
      })

      // Step 3: apply
      let colored = 0
      for (const node of nodes) {
        if (llm.isCancelled()) {
          ctx.log(`> Stopped after ${colored} nodes`)
          return `Stopped. Colored ${colored}/${nodes.length} nodes.`
        }
        const category = classifications.get(node.id)
        if (category && categoryToColor.has(category)) {
          await ctx.store.updateNodeColor(node.id, categoryToColor.get(category)!)
          ctx.log(`> ${node.title} -> ${category}`)
          colored++
        }
      }
      return `Colored ${colored}/${nodes.length} nodes based on semantic classification`
    },
    { modes: ['explore', 'execute'], mutates: true, requires: ['llm'] }
  )

  defineTool<{ pattern: string; color: string }>(
    'color_matching',
    'Color nodes by SEMANTIC criterion (what nodes represent). Use for categories like "person", "organization", "question". NOT for text patterns - use color_regex instead.',
    {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Semantic type (e.g., "person", "organization", "question", "assumption")' },
        color: { type: 'string', description: COLOR_HINT },
      },
      required: ['pattern', 'color'],
    },
    async (args, ctx) => {
      const criterion = (args.pattern || '').trim()
      const color = args.color || '#ef4444'
      if (!criterion) return 'Criterion required'
      if (!ctx.store.updateNodeColor) return 'Node colouring is not available in this context'
      const llm = ctx.llm!

      const nodes = ctx.store.filteredNodes
      let colored = 0
      const matchedTitles: string[] = []

      // The criterion is judged by the model, whatever its wording. A hidden test
      // for an ellipsis, a quote, a leading capital or the words "of" and "and"
      // sent some criteria down a substring path instead, so two similar requests
      // were answered by different machinery for reasons no user could see. Text
      // matching has its own tool, color_regex, which this tool's description
      // points at (PRODUCT_DESIGN.md > Classifying what the user wrote).
      ctx.log(`> color_matching: semantic evaluation of ${nodes.length} nodes for "${criterion}"`)

      for (const node of nodes) {
        if (llm.isCancelled()) {
          ctx.log(`> Stopped after ${colored} nodes`)
          return `Stopped. Colored ${colored}/${nodes.length} nodes.`
        }
        try {
          // An explicit tag is an explicit answer, and costs no model call
          const content = node.markdown_content || ''
          const tagPattern = `#${criterion.replace(/^#/, '').toLowerCase()}`
          if (content.toLowerCase().includes(tagPattern)) {
            await ctx.store.updateNodeColor(node.id, color)
            matchedTitles.push(node.title)
            colored++
            ctx.log(`> ${node.title} -> tag`)
            continue
          }

          const response = await llm.generate(`Is "${node.title}" a ${criterion}? Answer only YES or NO.`)
          const answer = (response || '').toUpperCase().trim()
          if (answer.startsWith('YES')) {
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

      if (colored === 0) return `No nodes match "${criterion}"`
      const preview = matchedTitles.slice(0, 5).join(', ')
      return `Colored ${colored}/${nodes.length} nodes: ${preview}${colored > 5 ? '...' : ''}`
    },
    { modes: ['explore', 'execute'], mutates: true, requires: ['llm'] }
  )

  defineTool<{ regex: string; color: string; field?: string }>(
    'color_regex',
    'Color nodes by regex pattern on title. Use for "starts with x" (^x), "ends with .md" (\\.md$), "contains foo" (foo). Fast batch operation, no LLM needed.',
    {
      type: 'object',
      properties: {
        regex: { type: 'string', description: 'JavaScript regex pattern: ^x (starts with x), foo$ (ends with foo), \\d+ (contains numbers)' },
        color: { type: 'string', description: COLOR_HINT },
        field: { type: 'string', description: 'Field to match: "title" (default) or "content"' },
      },
      required: ['regex', 'color'],
    },
    async (args, ctx) => {
      const regexStr = (args.regex || '').trim()
      const color = args.color || '#ef4444'
      const field = args.field || 'title'
      if (!regexStr) return 'Regex pattern required'
      if (!ctx.store.updateNodeColor) return 'Node colouring is not available in this context'

      let regex: RegExp
      try {
        regex = new RegExp(regexStr, 'i')
      } catch (e) {
        return `Invalid regex: ${e}`
      }

      const nodes = ctx.store.filteredNodes
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

      if (colored === 0) return `No nodes match regex /${regexStr}/`
      const preview = matchedTitles.slice(0, 5).join(', ')
      ctx.log(`> Colored ${colored} nodes: ${preview}${colored > 5 ? '...' : ''}`)
      return `Colored ${colored}/${nodes.length} nodes matching /${regexStr}/: ${preview}${colored > 5 ? '...' : ''}`
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<Record<string, never>>(
    'reset_edge_colors',
    'Reset all edge colors to default. Removes custom colors from all edges.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      if (!ctx.store.updateEdgeColor) return 'Edge operations not available'
      const edges = ctx.store.filteredEdges
      let reset = 0
      for (const edge of edges) {
        if (edge.color) {
          await ctx.store.updateEdgeColor(edge.id, null)
          reset++
        }
      }
      return `Reset ${reset}/${edges.length} edge colors to default`
    },
    { modes: ['explore', 'execute'], mutates: true }
  )
}
