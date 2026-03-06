/**
 * Agent tool executor
 * Executes LLM agent tool calls against the canvas/store
 */
import { cleanContent } from './utils'
import { applyForceLayout } from '../layout'
import type { Ref } from 'vue'

interface Node {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  markdown_content: string | null
  color_theme: string | null
}

interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

interface Store {
  filteredNodes: Node[]
  filteredEdges: Edge[]
  createNode: (data: Partial<Node>) => Promise<Node>
  createEdge: (data: { source_node_id: string; target_node_id: string; label?: string }) => Promise<Edge>
  deleteNode: (id: string) => Promise<void>
  deleteEdge: (id: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
}

export interface ToolContext {
  store: Store
  log: (msg: string) => void
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  snapToGrid: (value: number) => number
  ollamaModel: string
  ollamaContextLength: number
}

// Position counter for new nodes
let nodePositionCounter = 0

export function resetPositionCounter() {
  nodePositionCounter = 0
}

/**
 * Execute a single agent tool
 */
export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<string> {
  // Parse args if string
  let args: Record<string, unknown> = {}
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs)
    } catch {
      args = {}
    }
  } else {
    args = (rawArgs as Record<string, unknown>) || {}
  }

  console.log(`Agent tool: ${name}`, args)
  ctx.log(`> ${name}(${JSON.stringify(args).slice(0, 50)}...)`)

  const { store, snapToGrid, screenToCanvas } = ctx

  switch (name) {
    case 'create_node': {
      const pos = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const offsetX = (nodePositionCounter % 4) * 250
      const offsetY = Math.floor(nodePositionCounter / 4) * 180
      nodePositionCounter++

      const node = await store.createNode({
        title: (args.title as string) || '',
        node_type: 'note',
        markdown_content: cleanContent(args.content as string),
        canvas_x: snapToGrid((args.x as number) ?? pos.x + offsetX),
        canvas_y: snapToGrid((args.y as number) ?? pos.y + offsetY),
      })
      return `Created node "${args.title}" with id ${node.id}`
    }

    case 'create_edge': {
      const fromNode = store.filteredNodes.find(n => n.title === args.from_title)
      const toNode = store.filteredNodes.find(n => n.title === args.to_title)
      if (!fromNode) return `Error: Node "${args.from_title}" not found`
      if (!toNode) return `Error: Node "${args.to_title}" not found`

      await store.createEdge({
        source_node_id: fromNode.id,
        target_node_id: toNode.id,
        label: args.label as string,
      })
      return `Created edge from "${args.from_title}" to "${args.to_title}"`
    }

    case 'delete_node': {
      const node = store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      await store.deleteNode(node.id)
      return `Deleted node "${args.title}"`
    }

    case 'delete_edges': {
      const filter = (args.filter as string) || 'all'
      let edges = [...store.filteredEdges]

      if (filter !== 'all') {
        const node = store.filteredNodes.find(n => n.title.toLowerCase() === filter.toLowerCase())
        if (node) {
          edges = edges.filter(e => e.source_node_id === node.id || e.target_node_id === node.id)
        } else {
          return `Node "${filter}" not found`
        }
      }

      if (edges.length === 0) return 'No edges to delete'

      ctx.log(`> Deleting ${edges.length} edges...`)
      for (const edge of edges) {
        await store.deleteEdge(edge.id)
      }
      return `Deleted ${edges.length} edges`
    }

    case 'delete_matching': {
      const filter = (args.filter as string) || 'all'
      let nodes = [...store.filteredNodes]

      if (filter === 'even') {
        nodes = nodes.filter(n => {
          const num = parseInt(n.title.match(/\d+/)?.[0] || '0')
          return num % 2 === 0
        })
      } else if (filter === 'odd') {
        nodes = nodes.filter(n => {
          const num = parseInt(n.title.match(/\d+/)?.[0] || '0')
          return num % 2 === 1
        })
      } else if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n => n.title.toLowerCase().includes(term))
      }

      if (nodes.length === 0) return `No nodes match filter "${filter}"`

      ctx.log(`> Deleting ${nodes.length} nodes...`)
      for (const node of nodes) {
        await store.deleteNode(node.id)
      }
      return `Deleted ${nodes.length} nodes (${filter})`
    }

    case 'update_node': {
      const node = store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      await store.updateNodeContent(node.id, cleanContent(args.new_content as string))
      return `Updated node "${args.title}"`
    }

    case 'move_node': {
      const node = store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      const x = Number(args.x)
      const y = Number(args.y)
      if (isNaN(x) || isNaN(y)) return `Error: Invalid position (${args.x}, ${args.y})`
      await store.updateNodePosition(node.id, x, y)
      return `Moved "${args.title}" to (${x}, ${y})`
    }

    case 'generate_sequence': {
      const count = Math.min((args.count as number) || 10, 10000)
      const titlePattern = (args.title_pattern as string) || 'Node {n}'
      const contentPattern = (args.content_pattern as string) || ''
      const layout = (args.layout as string) || 'grid'
      const connect = args.connect as boolean || false

      const pos = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
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

        const node = await store.createNode({
          title,
          node_type: 'note',
          markdown_content: content,
          canvas_x: snapToGrid(x),
          canvas_y: snapToGrid(y),
        })

        createdNodes.push({ id: node.id, title })

        if (i % 100 === 0) {
          ctx.log(`> Created ${i}/${count}...`)
        }
      }

      if (connect && createdNodes.length > 1) {
        ctx.log(`> Connecting ${createdNodes.length - 1} edges...`)
        for (let i = 0; i < createdNodes.length - 1; i++) {
          await store.createEdge({
            source_node_id: createdNodes[i].id,
            target_node_id: createdNodes[i + 1].id,
          })
        }
      }

      return `Generated ${count} nodes${connect ? ` with ${count - 1} edges` : ''}`
    }

    case 'create_nodes_batch': {
      let nodesList = args.nodes as Array<{ title?: string; content?: string; mode?: string }> || []
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

      const existingByTitle = new Map(
        store.filteredNodes.map(n => [n.title.toLowerCase(), n])
      )

      const pos = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const created: string[] = []
      const updated: string[] = []
      let newIndex = 0

      for (const n of nodesList) {
        const title = n.title || `Node ${newIndex + 1}`
        const existing = existingByTitle.get(title.toLowerCase())

        if (existing) {
          const newContent = n.mode === 'append'
            ? (existing.markdown_content || '') + '\n\n' + cleanContent(n.content || '')
            : cleanContent(n.content || '')
          await store.updateNodeContent(existing.id, newContent)
          updated.push(title)
        } else {
          const cols = Math.ceil(Math.sqrt(nodesList.length))
          const x = pos.x + (newIndex % cols) * 250
          const y = pos.y + Math.floor(newIndex / cols) * 180

          await store.createNode({
            title,
            node_type: 'note',
            markdown_content: cleanContent(n.content || ''),
            canvas_x: snapToGrid(x),
            canvas_y: snapToGrid(y),
          })
          created.push(title)
          newIndex++
        }
      }

      const parts = []
      if (created.length) parts.push(`created ${created.length}`)
      if (updated.length) parts.push(`updated ${updated.length}`)
      return parts.join(', ') || 'No changes'
    }

    case 'auto_layout': {
      let nodes = [...store.filteredNodes]
      if (nodes.length === 0) return 'No nodes to layout'

      // Sort if requested
      if (args.sort) {
        const sortKey = args.sort as string
        const desc = sortKey.startsWith('-')
        const key = desc ? sortKey.slice(1) : sortKey

        nodes.sort((a, b) => {
          let valA: unknown, valB: unknown
          if (key === 'title' || key === 'alphabetical') {
            valA = a.title; valB = b.title
          } else if (key === 'numeric' || key === 'number') {
            valA = parseInt(a.title.match(/\d+/)?.[0] || '0')
            valB = parseInt(b.title.match(/\d+/)?.[0] || '0')
          } else {
            return 0
          }

          const cmp = typeof valA === 'string' ? (valA as string).localeCompare(valB as string) : (valA as number) - (valB as number)
          return desc ? -cmp : cmp
        })
      }

      const layout = (args.layout as string) || 'grid'
      const centerX = 600
      const centerY = 400
      const nodeWidth = 220
      const nodeHeight = 150
      const gap = 30

      if (layout === 'force') {
        const layoutNodes = nodes.map(n => ({
          id: n.id,
          x: n.canvas_x,
          y: n.canvas_y,
          width: n.width || 200,
          height: n.height || 120,
        }))
        const layoutEdges = store.filteredEdges.map(e => ({
          source: e.source_node_id,
          target: e.target_node_id,
        }))
        const positions = applyForceLayout(layoutNodes, layoutEdges, {
          centerX,
          centerY,
          chargeStrength: -400,
          linkDistance: 180,
          iterations: 300,
        })
        for (const node of nodes) {
          const pos = positions.get(node.id)
          if (pos) {
            await store.updateNodePosition(node.id, pos.x, pos.y)
          }
        }
        return `Arranged ${nodes.length} nodes using force-directed layout`
      }

      for (let i = 0; i < nodes.length; i++) {
        let x: number, y: number
        if (layout === 'horizontal') {
          x = 100 + i * (nodeWidth + gap)
          y = 100
        } else if (layout === 'vertical') {
          x = 100
          y = 100 + i * (nodeHeight + gap)
        } else if (layout === 'circle') {
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = nodes.length * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))
          const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
          x = centerX + radius * Math.cos(angle)
          y = centerY + radius * Math.sin(angle)
        } else if (layout === 'star') {
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = (nodes.length - 1) * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))
          if (i === 0) {
            x = centerX
            y = centerY
          } else {
            const angle = (2 * Math.PI * (i - 1)) / (nodes.length - 1) - Math.PI / 2
            x = centerX + radius * Math.cos(angle)
            y = centerY + radius * Math.sin(angle)
          }
        } else {
          // grid
          const cols = Math.ceil(Math.sqrt(nodes.length))
          x = 100 + (i % cols) * (nodeWidth + gap)
          y = 100 + Math.floor(i / cols) * (nodeHeight + gap)
        }
        await store.updateNodePosition(nodes[i].id, x, y)
      }
      return `Arranged ${nodes.length} nodes in ${layout} layout`
    }

    case 'query_nodes': {
      let nodes = store.filteredNodes
      const filter = args.filter as string

      if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (filter && filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n =>
          n.title.toLowerCase().includes(term) ||
          n.markdown_content?.toLowerCase().includes(term)
        )
      }

      const result = nodes.map(n => ({
        title: n.title,
        has_content: !!n.markdown_content?.trim(),
        preview: (n.markdown_content || '').slice(0, 50),
      }))

      return `Found ${result.length} nodes:\n${result.map(n => `- ${n.title}${n.has_content ? '' : ' (empty)'}`).join('\n')}`
    }

    case 'batch_update': {
      const updates = args.updates as Array<{
        title: string
        set_title?: string
        set_content?: string
        x?: number
        y?: number
        set_x?: number
        set_y?: number
      }> || []

      if (!Array.isArray(updates) || updates.length === 0) {
        return 'No updates provided'
      }

      const results: string[] = []
      for (const upd of updates) {
        const node = store.filteredNodes.find(n => n.title === upd.title)
        if (!node) {
          results.push(`${upd.title}: not found`)
          continue
        }

        if (upd.set_title) {
          await store.updateNodeTitle(node.id, upd.set_title)
          results.push(`${upd.title} → ${upd.set_title}`)
        }
        if (upd.set_content !== undefined) {
          await store.updateNodeContent(node.id, upd.set_content)
        }
        const newX = upd.x ?? upd.set_x
        const newY = upd.y ?? upd.set_y
        if (newX !== undefined || newY !== undefined) {
          const x = newX !== undefined ? Number(newX) : node.canvas_x
          const y = newY !== undefined ? Number(newY) : node.canvas_y
          await store.updateNodePosition(node.id, x, y)
          results.push(`${upd.title} → (${x},${y})`)
        }
      }

      return `Updated ${results.length} nodes`
    }

    case 'connect_matching': {
      const filter = (args.filter as string) || 'all'
      const mode = (args.mode as string) || 'chain'

      let nodes = [...store.filteredNodes]

      if (filter === 'even') {
        nodes = nodes.filter(n => {
          const num = parseInt(n.title.match(/\d+/)?.[0] || '0')
          return num % 2 === 0
        })
      } else if (filter === 'odd') {
        nodes = nodes.filter(n => {
          const num = parseInt(n.title.match(/\d+/)?.[0] || '0')
          return num % 2 === 1
        })
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n => n.title.toLowerCase().includes(term))
      }

      nodes.sort((a, b) => {
        const numA = parseInt(a.title.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.title.match(/\d+/)?.[0] || '0')
        return numA - numB
      })

      if (nodes.length < 2) return `Need at least 2 nodes to connect (found ${nodes.length})`

      let edgeCount = 0
      if (mode === 'star') {
        const hub = nodes[0]
        for (let i = 1; i < nodes.length; i++) {
          await store.createEdge({ source_node_id: hub.id, target_node_id: nodes[i].id })
          edgeCount++
        }
      } else {
        for (let i = 0; i < nodes.length - 1; i++) {
          await store.createEdge({ source_node_id: nodes[i].id, target_node_id: nodes[i + 1].id })
          edgeCount++
        }
      }

      return `Connected ${edgeCount} edges (${filter}, ${mode})`
    }

    case 'clear_canvas': {
      if (!args.confirm) {
        return 'Error: clear_canvas requires confirm=true'
      }
      const count = store.filteredNodes.length
      for (const node of [...store.filteredNodes]) {
        await store.deleteNode(node.id)
      }
      return `Cleared canvas (${count} nodes)`
    }

    case 'update_all_nodes': {
      const nodes = store.filteredNodes
      if (nodes.length === 0) return 'No nodes to update'

      const template = cleanContent((args.content_template as string) || '')
      for (const node of nodes) {
        let newContent = template.replace(/\{title\}/g, node.title)
        if (args.mode === 'append') {
          newContent = (node.markdown_content || '') + '\n\n' + newContent
        }
        await store.updateNodeContent(node.id, newContent)
      }
      return `Updated all ${nodes.length} nodes`
    }

    case 'done': {
      return `AGENT_DONE: ${args.summary || 'completed'}`
    }

    default:
      return `__UNHANDLED__:${name}`
  }
}
