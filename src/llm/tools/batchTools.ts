/**
 * Batch operation tool registrations
 *
 * Handles: generate_sequence, create_nodes_batch, for_each_node
 */

import { defineTool } from '../registry'
import { cleanContent } from '../utils'

export function registerBatchTools(): void {
  defineTool<{ count: number; title_pattern: string; content_pattern?: string; layout?: string; connect?: boolean }>(
    'generate_sequence',
    'Generate N nodes with a pattern. Use for large batches (100+). Pattern uses {n} for number.',
    {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of nodes to create' },
        title_pattern: { type: 'string', description: 'Title pattern, e.g., "Node {n}" or "Item {n}"' },
        content_pattern: { type: 'string', description: 'Content pattern, e.g., "{n}" or empty' },
        layout: { type: 'string', description: '"grid" (default), "horizontal", or "vertical"' },
        connect: { type: 'boolean', description: 'If true, connect nodes sequentially (1->2->3...)' },
      },
      required: ['count', 'title_pattern'],
    },
    async (args, ctx) => {
      const count = Math.min(args.count || 10, 10000)
      const titlePattern = args.title_pattern || 'Node {n}'
      const contentPattern = args.content_pattern || ''
      const layout = args.layout || 'grid'
      const connect = args.connect || false

      const pos = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const cols = layout === 'horizontal' ? count : layout === 'vertical' ? 1 : Math.ceil(Math.sqrt(count))
      const spacing = 250

      ctx.log(`> Generating ${count} nodes${connect ? ' (connected)' : ''}...`)

      const createdNodes: { id: string; title: string }[] = []

      for (let i = 1; i <= count; i++) {
        const title = titlePattern.replace(/\{n\}/g, String(i))
        const content = contentPattern.replace(/\{n\}/g, String(i))

        const col = (i - 1) % cols
        const row = Math.floor((i - 1) / cols)
        const x = pos.x + col * spacing
        const y = pos.y + row * 180

        const node = await ctx.store.createNode({
          title,
          node_type: 'note',
          markdown_content: content,
          canvas_x: ctx.snapToGrid(x),
          canvas_y: ctx.snapToGrid(y),
        })

        createdNodes.push({ id: node.id, title })

        if (i % 100 === 0) {
          ctx.log(`> Created ${i}/${count}...`)
        }
      }

      if (connect && createdNodes.length > 1) {
        ctx.log(`> Connecting ${createdNodes.length - 1} edges...`)
        for (let i = 0; i < createdNodes.length - 1; i++) {
          await ctx.store.createEdge({
            source_node_id: createdNodes[i].id,
            target_node_id: createdNodes[i + 1].id,
          })
        }
      }

      return `Generated ${count} nodes${connect ? ` with ${count - 1} edges` : ''}`
    },
    { category: 'batch' }
  )

  defineTool<{ nodes: Array<{ title?: string; content?: string; mode?: string }> }>(
    'create_nodes_batch',
    'Create or update multiple nodes. Handles any size array by processing in chunks.',
    {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          description: 'Array of {title, content, mode?} objects. mode="append" adds to existing content.',
        },
      },
      required: ['nodes'],
    },
    async (args, ctx) => {
      let nodesList = args.nodes || []
      if (typeof nodesList === 'string') {
        try {
          nodesList = JSON.parse(nodesList)
        } catch {
          try {
            const fixed = (nodesList as unknown as string)
              .replace(/'/g, '"')
              .replace(/(\w+):/g, '"$1":')
            nodesList = JSON.parse(fixed)
          } catch {
            return 'Error: could not parse nodes array'
          }
        }
      }
      if (!Array.isArray(nodesList) || nodesList.length === 0) {
        return 'Error: nodes must be a non-empty array'
      }

      const CHUNK_SIZE = 30
      const totalNodes = nodesList.length
      const pos = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const created: string[] = []
      const updated: string[] = []
      let globalIndex = 0

      ctx.log(`> Processing ${totalNodes} nodes in chunks of ${CHUNK_SIZE}...`)

      for (let chunkStart = 0; chunkStart < totalNodes; chunkStart += CHUNK_SIZE) {
        const chunk = nodesList.slice(chunkStart, chunkStart + CHUNK_SIZE)
        const chunkNum = Math.floor(chunkStart / CHUNK_SIZE) + 1
        const totalChunks = Math.ceil(totalNodes / CHUNK_SIZE)

        ctx.log(`> Chunk ${chunkNum}/${totalChunks} (${chunk.length} nodes)...`)

        // Refresh existing nodes map for each chunk to catch newly created ones
        const existingByTitle = new Map(
          ctx.store.filteredNodes.map(n => [n.title.toLowerCase(), n])
        )

        for (const n of chunk) {
          const title = n.title || `Node ${globalIndex + 1}`
          const existing = existingByTitle.get(title.toLowerCase())

          if (existing) {
            const newContent = n.mode === 'append'
              ? (existing.markdown_content || '') + '\n\n' + cleanContent(n.content || '')
              : cleanContent(n.content || '')
            await ctx.store.updateNodeContent(existing.id, newContent)
            updated.push(title)
          } else {
            const cols = Math.ceil(Math.sqrt(totalNodes))
            const x = pos.x + (globalIndex % cols) * 250
            const y = pos.y + Math.floor(globalIndex / cols) * 180

            await ctx.store.createNode({
              title,
              node_type: 'note',
              markdown_content: cleanContent(n.content || ''),
              canvas_x: ctx.snapToGrid(x),
              canvas_y: ctx.snapToGrid(y),
            })
            created.push(title)
            globalIndex++
          }
        }
      }

      ctx.log(`> Done: ${created.length} created, ${updated.length} updated`)

      const parts = []
      if (created.length) parts.push(`created ${created.length}`)
      if (updated.length) parts.push(`updated ${updated.length}`)
      return parts.join(', ') || 'No changes'
    },
    { category: 'batch' }
  )

  defineTool<{ filter?: string; action: string; template: string }>(
    'for_each_node',
    'Process nodes: set/append content with templates, or use LLM to generate/transform content.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '"all", "empty", "has_content", or search term' },
        action: { type: 'string', description: '"set", "append", or "llm" (LLM generates content)' },
        template: { type: 'string', description: 'Template with {title}, {content}, {n}. Examples: "What is {title}? 100 words max" or "Summarize: {content}"' },
      },
      required: ['action', 'template'],
    },
    async (args, ctx) => {
      let nodes = [...ctx.store.filteredNodes]
      const filter = args.filter || 'all'

      if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n => n.title.toLowerCase().includes(term))
      }

      if (nodes.length === 0) return `No nodes match filter "${filter}"`

      const template = args.template
      const action = args.action

      // LLM action - use LLM to generate/transform content
      if (action === 'llm') {
        const { providerRegistry } = await import('../providers')
        const provider = providerRegistry.getActiveProvider()
        let processed = 0

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          const n = i + 1
          ctx.log(`> Processing "${node.title}"...`)

          // Apply template variables to the instruction
          const instruction = template
            .replace(/\{title\}/g, node.title)
            .replace(/\{content\}/g, node.markdown_content || '')
            .replace(/\{n\}/g, String(n))

          // Use existing content if available, otherwise use title for generation
          const hasContent = !!node.markdown_content?.trim()

          try {
            // Build prompt - if template has {title}, use it directly; otherwise add context
            const hasTemplateVars = /\{title\}|\{content\}/.test(template)
            let prompt: string
            if (hasTemplateVars) {
              // User provided explicit template like "What is {title}?"
              prompt = instruction
            } else if (hasContent) {
              // Transform existing content
              prompt = `${instruction}\n\nContent:\n${node.markdown_content}`
            } else {
              // Generate from title
              prompt = `Write about "${node.title}". ${instruction}`
            }

            const result = await provider.generate({
              prompt,
              system: `Write about "${node.title}" only. No preamble.`,
            })

            if (result.content?.trim()) {
              await ctx.store.updateNodeContent(node.id, cleanContent(result.content))
              processed++
            }
          } catch (err) {
            ctx.log(`> Error processing "${node.title}": ${err}`)
          }
        }

        return `Processed ${processed}/${nodes.length} nodes with LLM`
      }

      // Template-based actions (set/append)
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const n = i + 1

        // Evaluate template
        let content = template
          .replace(/\{title\}/g, node.title)
          .replace(/\{content\}/g, node.markdown_content || '')
          .replace(/\{n\}/g, String(n))
          .replace(/\{n\^2\}/g, String(n * n))
          .replace(/\{n\+1\}/g, String(n + 1))
          .replace(/\{n-1\}/g, String(n - 1))
          .replace(/\{n\*2\}/g, String(n * 2))

        if (action === 'append') {
          content = (node.markdown_content || '') + '\n\n' + content
        }

        await ctx.store.updateNodeContent(node.id, content)
      }

      return `Updated ${nodes.length} nodes with template`
    },
    { category: 'batch' }
  )

  defineTool<{ topic: string; target_count: number; batch_size?: number }>(
    'research_topic',
    'Research a topic and create many nodes. Makes multiple LLM calls to avoid truncation.',
    {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The topic to research (e.g., "the brain", "machine learning")' },
        target_count: { type: 'number', description: 'Target number of nodes to create' },
        batch_size: { type: 'number', description: 'Nodes per batch (default 20)' },
      },
      required: ['topic', 'target_count'],
    },
    async (args, ctx) => {
      const { providerRegistry } = await import('../providers')
      const provider = providerRegistry.getActiveProvider()

      const topic = args.topic
      const targetCount = Math.min(args.target_count || 100, 2000)
      const batchSize = args.batch_size || 20
      const batches = Math.ceil(targetCount / batchSize)

      const pos = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const createdTitles = new Set<string>()
      let totalCreated = 0

      ctx.log(`> Researching "${topic}" - target: ${targetCount} nodes in ${batches} batches`)

      for (let batch = 0; batch < batches && totalCreated < targetCount; batch++) {
        const remaining = targetCount - totalCreated
        const thisCount = Math.min(batchSize, remaining)

        ctx.log(`> Batch ${batch + 1}/${batches}: generating ${thisCount} subtopics...`)

        // Build prompt that asks for unique subtopics not already created
        const existingList = Array.from(createdTitles).slice(-50).join(', ')
        const avoidClause = existingList
          ? `\nAVOID these already covered: ${existingList}`
          : ''

        try {
          const result = await provider.generate({
            prompt: `List exactly ${thisCount} specific subtopics about "${topic}".
Return ONLY a JSON array of objects with "title" and "content" keys.
Each content should be 2-3 sentences.
Be specific and diverse - cover different aspects.${avoidClause}

Example format:
[{"title": "Subtopic Name", "content": "Brief description..."}]`,
            system: 'You are a research assistant. Return only valid JSON, no markdown.',
          })

          // Parse the response
          let nodes: Array<{ title: string; content: string }> = []
          try {
            const jsonMatch = result.content.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              nodes = JSON.parse(jsonMatch[0])
            }
          } catch {
            ctx.log(`> Batch ${batch + 1}: failed to parse response`)
            continue
          }

          // Create the nodes
          const cols = Math.ceil(Math.sqrt(targetCount))
          for (const n of nodes) {
            if (totalCreated >= targetCount) break
            if (createdTitles.has(n.title.toLowerCase())) continue

            const x = pos.x + (totalCreated % cols) * 250
            const y = pos.y + Math.floor(totalCreated / cols) * 180

            await ctx.store.createNode({
              title: n.title,
              node_type: 'note',
              markdown_content: cleanContent(n.content || ''),
              canvas_x: ctx.snapToGrid(x),
              canvas_y: ctx.snapToGrid(y),
            })

            createdTitles.add(n.title.toLowerCase())
            totalCreated++
          }

          ctx.log(`> Batch ${batch + 1}: created ${nodes.length} nodes (total: ${totalCreated})`)
        } catch (err) {
          ctx.log(`> Batch ${batch + 1} error: ${err}`)
        }
      }

      return `Created ${totalCreated} nodes about "${topic}"`
    },
    { category: 'batch' }
  )
}
