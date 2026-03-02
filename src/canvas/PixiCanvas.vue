<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { marked } from 'marked'
import { openExternal } from '../lib/tauri'

// Configure marked
marked.use({
  gfm: true,
  breaks: true,
})

const store = useNodesStore()

// Reactive theme tracking
const isDarkMode = ref(false)

function updateTheme() {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark'
}

// Track if we've centered the view initially
let hasInitiallyCentered = false

onMounted(() => {
  updateTheme()
  // Watch for theme changes
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
  onUnmounted(() => observer.disconnect())

  // Center the grid initially
  centerGrid()
})

// Center the grid so origin (0,0) is in the middle of the viewport
function centerGrid() {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    offsetX.value = rect.width / 2
    offsetY.value = rect.height / 2
  }
}

// Center view when nodes are first loaded, or center grid when empty
watch(() => store.filteredNodes.length, (newLen, oldLen) => {
  if (newLen > 0 && !hasInitiallyCentered) {
    hasInitiallyCentered = true
    setTimeout(fitToContent, 50)
  } else if (newLen === 0) {
    // Empty workspace - center the grid
    hasInitiallyCentered = false
    setTimeout(centerGrid, 50)
  }
}, { immediate: true })

// Re-center when workspace changes
watch(() => store.currentWorkspaceId, () => {
  hasInitiallyCentered = false
  setTimeout(() => {
    if (store.filteredNodes.length > 0) {
      fitToContent()
      hasInitiallyCentered = true
    } else {
      centerGrid()
    }
  }, 50)
})

// Canvas transform state
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

// Interaction state
const draggingNode = ref<string | null>(null)
const dragStart = ref({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
const selectedEdge = ref<string | null>(null)

// Edge creation
const isCreatingEdge = ref(false)
const edgeStartNode = ref<string | null>(null)
const edgePreviewEnd = ref({ x: 0, y: 0 })

// Prevent double-click node creation right after drag
let lastDragEndTime = 0

// Node resizing
const resizingNode = ref<string | null>(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
const resizePreview = ref({ width: 0, height: 0 })

// Gridlock (snap to grid)
const gridLockEnabled = ref(false)

// Lasso selection
const isLassoSelecting = ref(false)
const lassoPoints = ref<{ x: number; y: number }[]>([])

function startLasso(e: MouseEvent) {
  isLassoSelecting.value = true
  lassoPoints.value = [screenToCanvas(e.clientX, e.clientY)]
}

function updateLasso(e: MouseEvent) {
  if (!isLassoSelecting.value) return
  lassoPoints.value.push(screenToCanvas(e.clientX, e.clientY))
}

function endLasso() {
  if (!isLassoSelecting.value || lassoPoints.value.length < 3) {
    isLassoSelecting.value = false
    lassoPoints.value = []
    return
  }

  // Find nodes inside lasso polygon
  const selected: string[] = []
  for (const node of store.filteredNodes) {
    const cx = node.canvas_x + node.width / 2
    const cy = node.canvas_y + node.height / 2
    if (pointInPolygon(cx, cy, lassoPoints.value)) {
      selected.push(node.id)
    }
  }

  store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...selected)
  isLassoSelecting.value = false
  lassoPoints.value = []
}

function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

const gridSize = 20 // Snap to 20px grid

function snapToGrid(value: number): number {
  if (!gridLockEnabled.value) return value
  return Math.round(value / gridSize) * gridSize
}

// Auto-fit is per-node (stored on node.auto_fit)

function fitNodeToContent(nodeId: string) {
  const node = store.getNode(nodeId)
  if (!node) return

  const cardEl = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement
  if (!cardEl) return

  const contentEl = cardEl.querySelector('.node-content') as HTMLElement
  if (!contentEl) return

  // Get actual rendered content dimensions
  const contentRect = contentEl.getBoundingClientRect()
  const children = contentEl.children
  let maxBottom = 0

  // Find the actual bottom of content by checking all children
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement
    const rect = child.getBoundingClientRect()
    const bottom = rect.bottom - contentRect.top
    if (bottom > maxBottom) maxBottom = bottom
  }

  // Use measured content height, with minimum padding
  const padding = 24
  const minWidth = 180
  const minHeight = 60

  const width = Math.min(Math.max(contentEl.scrollWidth + padding, minWidth), 600)
  const height = Math.max(maxBottom + padding, minHeight)

  store.updateNodeSize(nodeId, width, height)
}

// Auto-fit after mermaid renders (only for nodes with auto_fit enabled)
function autoFitAllNodes() {
  setTimeout(() => {
    for (const node of store.filteredNodes) {
      if (node.auto_fit && node.markdown_content?.includes('```mermaid')) {
        fitNodeToContent(node.id)
      }
    }
  }, 100)
}

// Inline editing
const editingNodeId = ref<string | null>(null)
const editContent = ref('')
const editingTitleId = ref<string | null>(null)
const editTitle = ref('')

// LLM interface
const graphPrompt = ref('')
const nodePrompt = ref('')
const isGraphLLMLoading = ref(false)

// Prompt history (persistent)
const promptHistory = ref<string[]>(JSON.parse(localStorage.getItem('nodus-prompt-history') || '[]'))
let historyIndex = -1

function onPromptKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (historyIndex < promptHistory.value.length - 1) {
      historyIndex++
      graphPrompt.value = promptHistory.value[promptHistory.value.length - 1 - historyIndex]
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (historyIndex > 0) {
      historyIndex--
      graphPrompt.value = promptHistory.value[promptHistory.value.length - 1 - historyIndex]
    } else if (historyIndex === 0) {
      historyIndex = -1
      graphPrompt.value = ''
    }
  }
}
const isNodeLLMLoading = ref(false)
const showGraphLLM = ref(true)
const showLLMSettings = ref(false)
// Node LLM always replaces content

// Load LLM settings from localStorage
const defaultSystemPrompt = `You are a terse note-taker for a knowledge graph canvas.

FOR MULTIPLE NODES: When asked to create multiple nodes, output JSON array:
USER: create 3 nodes about databases
YOU:
\`\`\`json
[{"title":"SQL","content":"Structured query language for relational databases"},{"title":"NoSQL","content":"Document, key-value, graph databases"},{"title":"ACID","content":"Atomicity, Consistency, Isolation, Durability"}]
\`\`\`

FOR SINGLE CONTENT: Output directly without JSON.
USER: flowchart of auth
YOU:
\`\`\`mermaid
graph TD
    A[Login] --> B{Valid?}
    B -->|Yes| C[Home]
    B -->|No| A
\`\`\`

RULES:
- Multiple nodes = JSON array with title and content
- Diagrams = mermaid code blocks
- No ASCII art, no explanations`

const ollamaModel = ref(localStorage.getItem('nodus_llm_model') || 'llama3.2')
const ollamaContextLength = ref(parseInt(localStorage.getItem('nodus_llm_context') || '4096'))
const customSystemPrompt = ref(localStorage.getItem('nodus_llm_prompt') || defaultSystemPrompt)

// Save LLM settings when changed
watch(ollamaModel, (v) => localStorage.setItem('nodus_llm_model', v))
watch(ollamaContextLength, (v) => localStorage.setItem('nodus_llm_context', String(v)))
watch(customSystemPrompt, (v) => localStorage.setItem('nodus_llm_prompt', v))

async function callOllama(prompt: string, systemPrompt?: string): Promise<string> {
  const system = systemPrompt || customSystemPrompt.value

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel.value,
        prompt: prompt,
        system: system,
        stream: false,
        options: {
          num_ctx: ollamaContextLength.value,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const data = await response.json()
    return data.response || ''
  } catch (e: any) {
    console.error('Ollama error:', e)
    if (e.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw new Error('Cannot connect to Ollama. Start it with: ollama serve')
  }
}

// Agent with tool calling
interface AgentTask {
  id: string
  description: string
  status: 'pending' | 'running' | 'done' | 'error'
}

const agentTasks = ref<AgentTask[]>([])
const agentRunning = ref(false)
const conversationHistory = ref<any[]>([])  // Persistent conversation memory
const agentLog = ref<string[]>([])  // Visible log of agent actions

const agentTools = [
  {
    type: 'function',
    function: {
      name: 'create_node',
      description: 'Create a new node on the canvas with a title and markdown content',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Node title' },
          content: { type: 'string', description: 'Markdown content for the node' },
          x: { type: 'number', description: 'X position (optional)' },
          y: { type: 'number', description: 'Y position (optional)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_edge',
      description: 'Create an edge connecting two nodes by their titles',
      parameters: {
        type: 'object',
        properties: {
          from_title: { type: 'string', description: 'Title of source node' },
          to_title: { type: 'string', description: 'Title of target node' },
          label: { type: 'string', description: 'Edge label (optional)' },
        },
        required: ['from_title', 'to_title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_edges',
      description: 'Delete edges. Use to remove connections without deleting nodes.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '"all" to delete all edges, or node title to delete edges from/to that node' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_node',
      description: 'Delete a single node by its title',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of node to delete' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_matching',
      description: 'Delete multiple nodes matching a filter.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '"all", "even", "odd", "empty", or search term' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_node',
      description: 'Update ONE node. For multiple nodes use batch_update.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of node to update' },
          new_content: { type: 'string', description: 'Literal content (no templates)' },
        },
        required: ['title', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_sequence',
      description: 'Generate N nodes with a pattern. Use for large batches (100+). Pattern uses {n} for number.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of nodes to create' },
          title_pattern: { type: 'string', description: 'Title pattern, e.g., "Node {n}" or "Item {n}"' },
          content_pattern: { type: 'string', description: 'Content pattern, e.g., "{n}" or empty' },
          layout: { type: 'string', description: '"grid" (default), "horizontal", or "vertical"' },
          connect: { type: 'boolean', description: 'If true, connect nodes sequentially (1→2→3...)' },
        },
        required: ['count', 'title_pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_nodes_batch',
      description: 'Create or update multiple nodes (up to ~50). For larger batches, use generate_sequence.',
      parameters: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            description: 'Array of {title, content, mode?} objects. mode="append" adds to existing content.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                mode: { type: 'string', description: '"replace" (default) or "append"' },
              },
            },
          },
        },
        required: ['nodes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_node',
      description: 'Move a single node to a new position',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of node to move' },
          x: { type: 'number', description: 'New X position' },
          y: { type: 'number', description: 'New Y position' },
        },
        required: ['title', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'auto_layout',
      description: 'Arrange nodes in a layout',
      parameters: {
        type: 'object',
        properties: {
          layout: { type: 'string', description: '"grid", "horizontal", "vertical", "circle", "clock", "star"' },
          sort: { type: 'string', description: '"alphabetical", "numeric", "reverse" (optional)' },
        },
        required: ['layout'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_nodes',
      description: 'Query nodes from database. Returns list of {title, content} for planning.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Filter: "all", "empty" (no content), "has_content", or a search term' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'for_each_node',
      description: 'Set/append CONTENT using math templates. For unique values or titles use batch_update.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '"all", "empty", "has_content", or search term' },
          action: { type: 'string', description: '"set" or "append" (content only, NOT titles)' },
          template: { type: 'string', description: 'Math template: {title}, {n}, {n^2}, {n+1}' },
        },
        required: ['action', 'template'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_update',
      description: 'Update multiple nodes. LLM decides values. Use for titles, content, OR positions.',
      parameters: {
        type: 'object',
        properties: {
          updates: { type: 'array', description: '[{title: "Node 1", set_title?: "Lion", set_content?: "...", x?: 100, y?: 200}]' },
        },
        required: ['updates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_move',
      description: 'Move nodes based on semantic criteria. LLM reasons about each node. Use for "move cars left, animals right".',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'Natural language: "car brands to x=100, animals to x=600"' },
        },
        required: ['instruction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_connect',
      description: 'Connect nodes within semantic groups. E.g., "connect animals together, connect cars together, but not across".',
      parameters: {
        type: 'object',
        properties: {
          groups: { type: 'string', description: 'Group descriptions: "animals, car brands"' },
        },
        required: ['groups'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information. Use this to research topics before creating nodes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Signal that the agent has completed all work',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        },
        required: ['summary'],
      },
    },
  },
]

let nodePositionCounter = 0

// Clean LLM-generated content: fix escape sequences, remove garbage
function cleanContent(text: string): string {
  return (text || '')
    .replace(/\\\\n/g, '\n')  // Double-escaped newlines
    .replace(/\\n/g, '\n')     // Single-escaped newlines
    .replace(/\\\\t/g, '\t')
    .replace(/\\t/g, '\t')
    .replace(/direct\s*\.end/gi, '')
    .replace(/;\s*$/gm, '')
    .trim()
}

async function executeAgentTool(name: string, args: any): Promise<string> {
  // Parse args if it's a string (some models return stringified JSON)
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch { /* keep as string */ }
  }
  console.log(`Agent tool: ${name}`, args)
  agentLog.value.push(`> ${name}(${JSON.stringify(args).slice(0, 50)}...)`)

  switch (name) {
    case 'create_node': {
      const pos = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const offsetX = (nodePositionCounter % 4) * 250
      const offsetY = Math.floor(nodePositionCounter / 4) * 180
      nodePositionCounter++

      const node = await store.createNode({
        title: args.title || '',
        node_type: 'note',
        markdown_content: cleanContent(args.content),
        canvas_x: snapToGrid(args.x ?? pos.x + offsetX),
        canvas_y: snapToGrid(args.y ?? pos.y + offsetY),
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
        label: args.label,
      })
      return `Created edge from "${args.from_title}" to "${args.to_title}"`
    }

    case 'connect_matching': {
      const filter = args.filter || 'all'
      const mode = args.mode || 'chain'

      // Filter nodes
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

      // Sort by number in title
      nodes.sort((a, b) => {
        const numA = parseInt(a.title.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.title.match(/\d+/)?.[0] || '0')
        return numA - numB
      })

      if (nodes.length < 2) return `Need at least 2 nodes to connect (found ${nodes.length})`

      let edgeCount = 0
      if (mode === 'star') {
        // All connect to first
        const hub = nodes[0]
        for (let i = 1; i < nodes.length; i++) {
          await store.createEdge({ source_node_id: hub.id, target_node_id: nodes[i].id })
          edgeCount++
        }
      } else {
        // Chain: 1→2→3→...
        for (let i = 0; i < nodes.length - 1; i++) {
          await store.createEdge({ source_node_id: nodes[i].id, target_node_id: nodes[i + 1].id })
          edgeCount++
        }
      }

      return `Connected ${edgeCount} edges (${filter}, ${mode})`
    }

    case 'delete_edges': {
      const filter = args.filter || 'all'
      let edges = [...store.filteredEdges]

      if (filter !== 'all') {
        // Find node by title and filter edges connected to it
        const node = store.filteredNodes.find(n => n.title.toLowerCase() === filter.toLowerCase())
        if (node) {
          edges = edges.filter(e => e.source_node_id === node.id || e.target_node_id === node.id)
        } else {
          return `Node "${filter}" not found`
        }
      }

      if (edges.length === 0) return 'No edges to delete'

      agentLog.value.push(`> Deleting ${edges.length} edges...`)
      for (const edge of edges) {
        await store.deleteEdge(edge.id)
      }
      return `Deleted ${edges.length} edges`
    }

    case 'generate_sequence': {
      const count = Math.min(args.count || 10, 10000) // Cap at 10k
      const titlePattern = args.title_pattern || 'Node {n}'
      const contentPattern = args.content_pattern || ''
      const layout = args.layout || 'grid'
      const connect = args.connect || false

      const pos = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const cols = layout === 'horizontal' ? count : layout === 'vertical' ? 1 : Math.ceil(Math.sqrt(count))
      const spacing = 250

      agentLog.value.push(`> Generating ${count} nodes${connect ? ' (connected)' : ''}...`)

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

        // Log progress every 100 nodes
        if (i % 100 === 0) {
          agentLog.value.push(`> Created ${i}/${count}...`)
        }
      }

      // Create edges if connect is true
      if (connect && createdNodes.length > 1) {
        agentLog.value.push(`> Connecting ${createdNodes.length - 1} edges...`)
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
      let nodesList = args.nodes || []
      // Handle case where nodes is a JSON string instead of array
      if (typeof nodesList === 'string') {
        try {
          // Try direct JSON parse first
          nodesList = JSON.parse(nodesList)
        } catch {
          try {
            // LLM sometimes sends single quotes (Python-style) - convert to valid JSON
            const fixed = nodesList
              .replace(/'/g, '"')
              .replace(/(\w+):/g, '"$1":') // unquoted keys
            nodesList = JSON.parse(fixed)
          } catch {
            return 'Error: could not parse nodes array'
          }
        }
      }
      if (!Array.isArray(nodesList) || nodesList.length === 0) {
        return 'Error: nodes must be a non-empty array'
      }

      // Upsert: update existing, create new
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
          // Update existing node
          const newContent = n.mode === 'append'
            ? (existing.markdown_content || '') + '\n\n' + cleanContent(n.content || '')
            : cleanContent(n.content || '')
          await store.updateNodeContent(existing.id, newContent)
          updated.push(title)
        } else {
          // Create new node
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

    case 'delete_node': {
      const node = store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      await store.deleteNode(node.id)
      return `Deleted node "${args.title}"`
    }

    case 'delete_matching': {
      const filter = args.filter || 'all'
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

      agentLog.value.push(`> Deleting ${nodes.length} nodes...`)
      for (const node of nodes) {
        await store.deleteNode(node.id)
      }
      return `Deleted ${nodes.length} nodes (${filter})`
    }

    case 'update_node': {
      const node = store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      await store.updateNodeContent(node.id, cleanContent(args.new_content))
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

    case 'auto_layout': {
      let nodes = [...store.filteredNodes]
      if (nodes.length === 0) return 'No nodes to layout'

      // Sort if requested
      if (args.sort) {
        const desc = args.sort.startsWith('-')
        const key = desc ? args.sort.slice(1) : args.sort

        nodes.sort((a, b) => {
          let valA: any, valB: any
          if (key === 'title' || key === 'alphabetical') {
            valA = a.title; valB = b.title
          } else if (key === 'numeric' || key === 'number') {
            valA = parseInt(a.title.match(/\d+/)?.[0] || '0')
            valB = parseInt(b.title.match(/\d+/)?.[0] || '0')
          } else if (key === 'content_length') {
            valA = (a.markdown_content || '').length
            valB = (b.markdown_content || '').length
          } else if (key === 'created') {
            valA = a.created_at; valB = b.created_at
          } else if (key === 'x') {
            valA = a.canvas_x; valB = b.canvas_x
          } else if (key === 'y') {
            valA = a.canvas_y; valB = b.canvas_y
          } else {
            return 0
          }

          let cmp = typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB
          return desc ? -cmp : cmp
        })
      }

      const centerX = 600
      const centerY = 400
      const nodeWidth = 220
      const nodeHeight = 150
      const gap = 30

      for (let i = 0; i < nodes.length; i++) {
        let x: number, y: number
        if (args.layout === 'horizontal') {
          x = 100 + i * (nodeWidth + gap)
          y = 100
        } else if (args.layout === 'vertical') {
          x = 100
          y = 100 + i * (nodeHeight + gap)
        } else if (args.layout === 'circle') {
          // Reorder nodes by connectivity (BFS) to minimize edge lengths
          if (i === 0) {
            const edges = store.filteredEdges
            const adj: Record<string, string[]> = {}
            for (const n of nodes) adj[n.id] = []
            for (const e of edges) {
              if (adj[e.source_node_id]) adj[e.source_node_id].push(e.target_node_id)
              if (adj[e.target_node_id]) adj[e.target_node_id].push(e.source_node_id)
            }
            // BFS from most connected node
            const degrees = nodes.map(n => ({ id: n.id, deg: adj[n.id].length }))
            degrees.sort((a, b) => b.deg - a.deg)
            const visited = new Set<string>()
            const ordered: typeof nodes = []
            const queue = [degrees[0]?.id]
            while (queue.length > 0 && ordered.length < nodes.length) {
              const id = queue.shift()!
              if (visited.has(id)) continue
              visited.add(id)
              const node = nodes.find(n => n.id === id)
              if (node) ordered.push(node)
              for (const neighbor of adj[id] || []) {
                if (!visited.has(neighbor)) queue.push(neighbor)
              }
            }
            // Add any unvisited nodes
            for (const n of nodes) if (!visited.has(n.id)) ordered.push(n)
            nodes.splice(0, nodes.length, ...ordered)
          }
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = nodes.length * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))
          const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
          x = centerX + radius * Math.cos(angle)
          y = centerY + radius * Math.sin(angle)
        } else if (args.layout === 'clock') {
          // Clock layout: sort nodes by number (12 first, then 1-11), go clockwise
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = nodes.length * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))

          // Sort nodes by clock order (12 first, then 1, 2, 3... 11)
          const sortedNodes = [...nodes].sort((a, b) => {
            const numA = parseInt(a.title.match(/\d+/)?.[0] || '0')
            const numB = parseInt(b.title.match(/\d+/)?.[0] || '0')
            const clockA = numA === 12 ? 0 : numA
            const clockB = numB === 12 ? 0 : numB
            return clockA - clockB
          })

          const sortedIndex = sortedNodes.findIndex(n => n.id === nodes[i].id)
          // Clockwise from top: negative angle direction
          const angle = -(2 * Math.PI * sortedIndex) / nodes.length - Math.PI / 2
          x = centerX + radius * Math.cos(angle)
          y = centerY + radius * Math.sin(angle)
        } else if (args.layout === 'star') {
          // Star layout: first node in center, others radiate outward
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = (nodes.length - 1) * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))

          if (i === 0) {
            // First node goes in center
            x = centerX
            y = centerY
          } else {
            // Rest go around the center
            const angle = (2 * Math.PI * (i - 1)) / (nodes.length - 1) - Math.PI / 2
            x = centerX + radius * Math.cos(angle)
            y = centerY + radius * Math.sin(angle)
          }
        } else { // grid
          const cols = Math.ceil(Math.sqrt(nodes.length))
          x = 100 + (i % cols) * (nodeWidth + gap)
          y = 100 + Math.floor(i / cols) * (nodeHeight + gap)
        }
        await store.updateNodePosition(nodes[i].id, x, y)
      }
      return `Arranged ${nodes.length} nodes in ${args.layout || 'grid'} layout`
    }

    case 'add_task': {
      const task: AgentTask = {
        id: crypto.randomUUID().slice(0, 8),
        description: args.description,
        status: 'pending',
      }
      agentTasks.value.push(task)
      return `Added task ${task.id}: ${args.description}`
    }

    case 'complete_task': {
      const task = agentTasks.value.find(t => t.id === args.task_id)
      if (!task) return `Error: Task ${args.task_id} not found`
      task.status = 'done'
      return `Completed task ${args.task_id}`
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

      const template = cleanContent(args.content_template)
      for (const node of nodes) {
        let newContent = template.replace(/\{title\}/g, node.title)
        if (args.mode === 'append') {
          newContent = (node.markdown_content || '') + '\n\n' + newContent
        }
        await store.updateNodeContent(node.id, newContent)
      }
      return `Updated all ${nodes.length} nodes`
    }

    case 'query_nodes': {
      let nodes = store.filteredNodes

      if (args.filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (args.filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (args.filter && args.filter !== 'all') {
        const term = args.filter.toLowerCase()
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

    case 'for_each_node': {
      let nodes = [...store.filteredNodes]

      // Apply filter
      const filter = args.filter || 'all'
      if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n =>
          n.title.toLowerCase().includes(term) ||
          n.markdown_content?.toLowerCase().includes(term)
        )
      }

      if (nodes.length === 0) return `No nodes match filter "${filter}"`
      agentLog.value.push(`> Iterating ${nodes.length} nodes (filter: ${filter})`)

      // Simple math expression evaluator (supports n, +, -, *, /, ^, parentheses)
      const evalExpr = (expr: string, n: number): string => {
        try {
          // Replace n with the number, ^ with **
          const safe = expr.replace(/\bn\b/g, String(n)).replace(/\^/g, '**')
          // Only allow safe math characters
          if (!/^[\d\s+\-*/().]+$/.test(safe)) return expr
          return String(Math.round(Function(`"use strict"; return (${safe})`)() * 1000) / 1000)
        } catch { return expr }
      }

      const results: string[] = []
      for (const node of nodes) {
        // Extract number from title
        const num = parseInt(node.title.match(/\d+/)?.[0] || '0')
        const idx = nodes.indexOf(node) + 1

        // Replace placeholders and evaluate expressions like {n*n}, {n^2+1}
        let query = (args.template || '')
          .replace(/\{title\}/g, node.title)
          .replace(/\{index\}/g, String(idx))
          .replace(/\{([^}]+)\}/g, (_, expr) => evalExpr(expr, num))
        agentLog.value.push(`> ${node.title}: ${args.action}...`)

        if (args.action === 'search') {
          // Web search and update
          try {
            const searchQuery = encodeURIComponent(query)
            const ddgUrl = `https://api.duckduckgo.com/?q=${searchQuery}&format=json&no_html=1`
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`
            const response = await fetch(proxyUrl)
            const data = await response.json()

            let content = ''
            if (data.Abstract) content = data.Abstract
            else if (data.RelatedTopics?.[0]?.Text) content = data.RelatedTopics[0].Text

            if (content) {
              await store.updateNodeContent(node.id, content)
              results.push(`${node.title}: updated`)
            } else {
              results.push(`${node.title}: no results`)
            }
          } catch {
            results.push(`${node.title}: search failed`)
          }
        } else if (args.action === 'set') {
          await store.updateNodeContent(node.id, query)
          results.push(`${node.title}: set`)
        } else if (args.action === 'append') {
          const newContent = (node.markdown_content || '') + '\n\n' + query
          await store.updateNodeContent(node.id, newContent)
          results.push(`${node.title}: appended`)
        }
      }
      return `Processed ${nodes.length} nodes: ${results.slice(0, 3).join(', ')}${results.length > 3 ? '...' : ''}`
    }

    case 'batch_update': {
      const updates = args.updates || []
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
        // Accept both x/y and set_x/set_y
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

    case 'smart_move': {
      const nodes = store.filteredNodes
      if (nodes.length === 0) return 'No nodes to move'

      // Ask LLM to extract categories from instruction
      const instruction = args.instruction || ''
      let categories: string[] = []
      try {
        const catResponse = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel.value,
            prompt: `Extract the category names from: "${instruction}"

List ONLY the category words separated by comma. Example: "cars left, animals right" -> "car, animal"

Categories:`,
            stream: false,
          }),
        })
        const catData = await catResponse.json()
        categories = (catData.response || '')
          .toLowerCase()
          .split(/[,\n]+/)
          .map((c: string) => c.trim().replace(/[^a-z]/g, ''))
          .filter((c: string) => c.length > 1)
      } catch { /* fallback below */ }
      const categoryList = categories.length >= 2 ? categories.join(', ') : 'left, right'

      agentLog.value.push(`> Smart move: ${nodes.length} nodes into categories: ${categoryList}`)

      const moves: { id: string; title: string; group: string }[] = []

      for (const node of nodes) {
        try {
          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: ollamaModel.value,
              prompt: `Classify "${node.title}" into exactly ONE category: ${categoryList}

Answer with ONLY the category name, nothing else:`,
              stream: false,
            }),
          })
          const data = await response.json()
          // Normalize: lowercase, remove punctuation, remove trailing 's'
          let group = (data.response || 'other').toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z]/g, '')
          if (group.endsWith('s') && group.length > 3) group = group.slice(0, -1)
          // Map to closest known category
          if (categories.length > 0 && !categories.includes(group)) {
            group = categories.find(c => group.includes(c) || c.includes(group)) || categories[0]
          }
          moves.push({ id: node.id, title: node.title, group })
          agentLog.value.push(`> ${node.title}: ${group}`)
        } catch {
          // Skip
        }
      }

      // Group nodes and assign positions
      const groups: Record<string, typeof moves> = {}
      for (const m of moves) {
        if (!groups[m.group]) groups[m.group] = []
        groups[m.group].push(m)
      }

      // Position groups as columns: first category = left, second = right, etc.
      const groupKeys = Object.keys(groups)
      const spacing = 150
      const columnWidth = 400

      for (let gi = 0; gi < groupKeys.length; gi++) {
        const key = groupKeys[gi]
        const x = 100 + gi * columnWidth
        let y = 100
        for (const m of groups[key]) {
          await store.updateNodePosition(m.id, x, y)
          y += spacing
        }
      }

      return `AGENT_DONE: Moved ${moves.length} nodes into ${groupKeys.length} groups: ${groupKeys.join(', ')}`
    }

    case 'smart_connect': {
      const nodes = store.filteredNodes
      if (nodes.length === 0) return 'No nodes'

      // Delete existing edges first
      const existingEdges = [...store.filteredEdges]
      for (const edge of existingEdges) {
        await store.deleteEdge(edge.id)
      }

      const pairs = nodes.length * (nodes.length - 1) / 2
      agentLog.value.push(`> Smart connect: checking ${pairs} pairs...`)

      // For each pair, ask LLM what type of connection (if any)
      const linkTypes = ['related', 'cites', 'blocks', 'supports', 'contradicts', 'none']
      let edgeCount = 0
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          try {
            const response = await fetch('http://localhost:11434/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel.value,
                prompt: `Instruction: "${args.groups}"

What connection between "${nodes[i].title}" and "${nodes[j].title}"?
Options: related, cites, blocks, supports, contradicts, none
Answer with ONE word:`,
                stream: false,
              }),
            })
            const data = await response.json()
            const answer = (data.response || 'none').toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z]/g, '')
            const linkType = linkTypes.includes(answer) ? answer : 'none'
            if (linkType !== 'none') {
              await store.createEdge({ source_node_id: nodes[i].id, target_node_id: nodes[j].id, link_type: linkType })
              edgeCount++
              agentLog.value.push(`> ${nodes[i].title} —[${linkType}]→ ${nodes[j].title}`)
            }
          } catch {
            // Skip
          }
        }
      }

      return `AGENT_DONE: Created ${edgeCount} edges`
    }

    case 'web_search': {
      try {
        // Thinking layer: refine the query
        const thinkResponse = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel.value,
            prompt: `Convert this request into a specific search query (just output the query, nothing else): "${args.query}"`,
            stream: false,
          }),
        })
        const thinkData = await thinkResponse.json()
        const refinedQuery = thinkData.response?.trim() || args.query

        agentLog.value.push(`> Search: "${refinedQuery}"`)

        const query = encodeURIComponent(refinedQuery)
        // Use CORS proxy for browser compatibility
        const ddgUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1`
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`

        const response = await fetch(proxyUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()

        // Extract useful info from DuckDuckGo response
        const results: string[] = []
        if (data.Abstract) results.push(data.Abstract)
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, 5)) {
            if (topic.Text) results.push(topic.Text)
          }
        }

        if (results.length === 0) {
          return `No web results for "${refinedQuery}". Use your knowledge.`
        }
        return `Search "${refinedQuery}":\n${results.join('\n\n')}`
      } catch (e) {
        return `Search unavailable. Use your knowledge instead.`
      }
    }

    case 'done': {
      return `AGENT_DONE: ${args.summary}`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

function getSystemPrompt() {
  // Use selected nodes if any, otherwise all filtered nodes
  const hasSelection = store.selectedNodeIds.length > 0
  const nodes = hasSelection
    ? store.filteredNodes.filter(n => store.selectedNodeIds.includes(n.id))
    : store.filteredNodes

  // Build node list with positions for smaller sets, just titles for large sets
  let nodeList = 'none'
  const prefix = hasSelection ? '(SELECTED) ' : ''
  if (nodes.length > 0 && nodes.length <= 30) {
    nodeList = nodes.map((n, i) =>
      `${i+1}. "${n.title}" @(${Math.round(n.canvas_x)},${Math.round(n.canvas_y)})`
    ).join('\n')
  } else if (nodes.length > 30) {
    nodeList = nodes.slice(0, 20).map(n => n.title).join(', ') + `... (${nodes.length} total)`
  }

  return {
    role: 'system',
    content: `You are a graph builder agent.

RULES:
- ONLY do what user asks. Do NOT add extra actions.
- For SEMANTIC tasks (categories like "animals", "car brands"): USE smart_move or smart_connect.
- After smart_move or smart_connect: call done() immediately. These tools are complete operations.

CANVAS: x right, y down.

${prefix}NODES (${nodes.length}):
${nodeList}

TOOLS:
- create_node(title, content): Create one node
- generate_sequence(count, title_pattern, content_pattern?, layout?, connect?): Generate N nodes. {n}=number. connect=true links 1→2→3...
- create_nodes_batch(nodes): Create/update up to ~50 nodes. nodes=[{title, content}]. Updates existing.
- create_edge(from_title, to_title): Connect two nodes
- delete_edges(filter): Delete edges. filter="all" or node title
- update_node(title, new_content): Edit a node's content
- delete_node(title): Remove a single node
- delete_matching(filter): Delete multiple nodes. filter="all"|"even"|"odd"|"empty"|term
- auto_layout("grid"|"horizontal"|"vertical"|"circle"|"clock"|"star"): Arrange all nodes
- query_nodes(filter): Query DB. filter="all"|"empty"|"has_content"|"search term". Returns node list.
- for_each_node(action, template, filter?): CONTENT with math templates. {title}, {n}, {n^2}
- batch_update(updates): Update multiple nodes. [{title, set_title?, set_content?, x?, y?}]. YOU generate the values.
- smart_move(instruction): Move nodes by semantic criteria. E.g., "car brands to left, animals to right".
- smart_connect(groups): Connect nodes within groups. E.g., "animals, car brands" connects animals together and cars together.
- web_search(query): Search web for information
- done(summary): Call when finished

CONTENT RULES:
- Title = label, Content = substance
- No meta-commentary ("This node contains...", "Here is...")
- Be concise: data, definitions, or markdown only

RULES:
- Use create_nodes_batch for 3+ nodes
- Create exactly what user asks - no more, no less
- ALWAYS call done() when finished
- Never output plain text - only use tools`,
  }
}

function clearConversation() {
  conversationHistory.value = []
}

let agentAbortController: AbortController | null = null

function stopAgent() {
  if (agentAbortController) {
    agentAbortController.abort()
    agentAbortController = null
  }
  agentRunning.value = false
  agentLog.value.push('> Stopped by user')
}

// Prune messages to manage context size - keep only essential info
function pruneMessages(messages: any[], keepRecent: number = 6): any[] {
  if (messages.length <= keepRecent + 2) return messages

  // Keep system prompt (first) and recent messages
  const systemPrompt = messages[0]
  const userRequest = messages[1] // Original user request
  const recentMessages = messages.slice(-keepRecent)

  // Count completed actions from pruned messages
  const prunedCount = messages.length - keepRecent - 2
  const summary = `[Completed ${prunedCount} previous actions successfully. Continue with remaining work.]`

  return [
    systemPrompt,
    userRequest,
    { role: 'assistant', content: summary },
    ...recentMessages,
  ]
}

async function runAgent(userRequest: string) {
  // Singleton - stop any existing agent
  if (agentRunning.value) {
    stopAgent()
  }

  // Auto-cleanup orphan edges
  store.cleanupOrphanEdges()

  agentAbortController = new AbortController()
  agentRunning.value = true
  agentTasks.value = []
  // Append new request to log (add separator if log not empty)
  if (agentLog.value.length > 0) {
    agentLog.value.push('---')
  }
  agentLog.value.push(`User: ${userRequest}`)
  nodePositionCounter = 0

  // Each request starts fresh - system prompt has current nodes
  let messages: any[] = [
    getSystemPrompt(),
    { role: 'user', content: userRequest },
  ]

  const maxIterations = 200  // Enough for complex graphs
  const pruneEvery = 10  // Prune context every N iterations

  for (let i = 0; i < maxIterations; i++) {
    // Prune context periodically to manage size
    if (i > 0 && i % pruneEvery === 0) {
      messages = pruneMessages(messages)
      agentLog.value.push(`> Pruned context (${messages.length} messages)`)
    }

    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel.value,
          messages,
          tools: agentTools,
          stream: false,
          options: { num_ctx: ollamaContextLength.value },
        }),
        signal: agentAbortController?.signal,
      })

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`)
      const data = await response.json()
      const msg = data.message

      messages.push(msg)

      // Check for native tool calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const result = await executeAgentTool(tc.function.name, tc.function.arguments)
          messages.push({
            role: 'tool',
            content: result,
          })

          if (result.startsWith('AGENT_DONE:')) {
            // Save assistant's final response to history
            conversationHistory.value.push({ role: 'assistant', content: result.replace('AGENT_DONE:', '').trim() })
            agentRunning.value = false
            agentAbortController = null
            return result.replace('AGENT_DONE:', '').trim()
          }
        }
      } else if (msg.content) {
        agentLog.value.push(`LLM: ${msg.content.slice(0, 80)}...`)

        // If LLM asks a question or says it's done, stop and return
        if (msg.content.includes('?') || /done|complete|finished|empty/i.test(msg.content)) {
          agentRunning.value = false
          return msg.content.slice(0, 200)
        }

        // Try to parse tool calls from text (fallback for models without native tool calling)
        // Pattern 1: ```json { "name": ..., "arguments": ... } ```
        // Pattern 2: <|python_tag|>{"name": ..., "parameters": ...}
        let toolJson: string | null = null

        const jsonMatch = msg.content.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          toolJson = jsonMatch[1]
        }

        // Llama 3.x python_tag format
        const pythonTagMatch = msg.content.match(/<\|python_tag\|>\s*(\{[\s\S]*\})/)
        if (!toolJson && pythonTagMatch) {
          toolJson = pythonTagMatch[1]
        }

        // Raw JSON object at start of content
        const rawJsonMatch = msg.content.match(/^\s*(\{"name"\s*:[\s\S]*\})/)
        if (!toolJson && rawJsonMatch) {
          toolJson = rawJsonMatch[1]
        }

        if (toolJson) {
          try {
            const parsed = JSON.parse(toolJson)
            const toolName = parsed.name
            const toolArgs = parsed.arguments || parsed.parameters || {}

            if (toolName) {
              const result = await executeAgentTool(toolName, toolArgs)
              messages.push({
                role: 'assistant',
                content: `Executed: ${toolName}`,
              })
              messages.push({
                role: 'user',
                content: `Tool result: ${result}\n\nContinue with the next action or call done if finished.`,
              })

              if (result.startsWith('AGENT_DONE:')) {
                conversationHistory.value.push({ role: 'assistant', content: result.replace('AGENT_DONE:', '').trim() })
                agentRunning.value = false
                return result.replace('AGENT_DONE:', '').trim()
              }
              continue
            }
          } catch { /* Not valid tool JSON */ }
        }
        // No tool calls found - check if LLM thinks it's done
        const looksComplete = /now shows|complete|finished|created|done|successfully/i.test(msg.content)
        if (looksComplete) {
          // LLM is summarizing - treat as done
          agentRunning.value = false
          agentAbortController = null
          return 'Done'
        }

        // Otherwise prompt to continue
        messages.push({
          role: 'user',
          content: 'Use tools only. Call done() when finished.',
        })
        continue
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        agentLog.value.push('> Agent stopped')
        agentRunning.value = false
        agentAbortController = null
        return 'Agent stopped by user'
      }
      console.error('Agent error:', e)
      agentRunning.value = false
      throw e
    }
  }

  agentRunning.value = false
  agentAbortController = null
  return 'Agent reached max iterations'
}

async function sendGraphPrompt() {
  if (!graphPrompt.value.trim() || isGraphLLMLoading.value) return

  // Save to history
  const prompt = graphPrompt.value.trim()
  if (prompt && promptHistory.value[promptHistory.value.length - 1] !== prompt) {
    promptHistory.value.push(prompt)
    // Keep last 50 prompts
    if (promptHistory.value.length > 50) promptHistory.value.shift()
    localStorage.setItem('nodus-prompt-history', JSON.stringify(promptHistory.value))
  }
  historyIndex = -1

  isGraphLLMLoading.value = true
  try {
    const result = await runAgent(graphPrompt.value)
    console.log('Agent result:', result)
    graphPrompt.value = ''
  } catch (e: any) {
    alert(e.message)
  } finally {
    isGraphLLMLoading.value = false
  }
}

async function sendNodePrompt() {
  if (!nodePrompt.value.trim() || isNodeLLMLoading.value || !editingNodeId.value) return

  const nodeId = editingNodeId.value
  isNodeLLMLoading.value = true
  try {
    // Get connected nodes for context
    const connectedNodes = store.filteredEdges
      .filter(e => e.source_node_id === nodeId || e.target_node_id === nodeId)
      .map(e => e.source_node_id === nodeId ? e.target_node_id : e.source_node_id)
      .map(id => store.getNode(id))
      .filter(Boolean)
      .map(n => `[${n!.title || 'Untitled'}]: ${(n!.markdown_content || '').slice(0, 200)}`)
      .join('\n')

    const neighborsContext = connectedNodes
      ? `\nCONNECTED NODES:\n${connectedNodes}\n`
      : ''

    const nodeSystemPrompt = `${customSystemPrompt.value}

---
REWRITE the note based on the user's request. Return ONLY the new content.
${neighborsContext}
CURRENT NOTE CONTENT:
${editContent.value || '(empty)'}
---`

    const response = await callOllama(nodePrompt.value, nodeSystemPrompt)
    editContent.value = response
    nodePrompt.value = ''

    // Auto-fit after LLM updates content (if enabled for this node)
    const node = store.getNode(nodeId)
    if (node?.auto_fit) {
      store.updateNodeContent(nodeId, editContent.value)
      setTimeout(() => {
        renderMermaidDiagrams()
        setTimeout(() => fitNodeToContent(nodeId), 100)
      }, 50)
    }
  } catch (e: any) {
    alert(e.message)
  } finally {
    isNodeLLMLoading.value = false
  }
}

const canvasRef = ref<HTMLElement | null>(null)

// Calculate intersection point of line with node rectangle
function getNodeEdgePoint(
  nodeX: number, nodeY: number, nodeW: number, nodeH: number,
  fromX: number, fromY: number
): { x: number; y: number } {
  const cx = nodeX + nodeW / 2
  const cy = nodeY + nodeH / 2
  const dx = fromX - cx
  const dy = fromY - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  // Calculate intersection with rectangle edges
  const halfW = nodeW / 2
  const halfH = nodeH / 2

  // Check which edge the line crosses
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  }
}

// Get node height - use stored height or estimate from content
function getNodeHeight(node: { height: number; markdown_content: string | null }): number {
  if (node.height) return node.height
  const content = node.markdown_content || ''
  const lineCount = content.split('\n').length
  const charCount = content.length
  // Rough estimate: ~20px per line, min 60px, max 324px
  return Math.max(60, Math.min(324, lineCount * 22 + Math.floor(charCount / 40) * 18))
}

// Compute edge lines with endpoints at node boundaries
const edgeLines = computed(() => {
  const edges = store.filteredEdges

  return edges.map(edge => {
    const source = store.getNode(edge.source_node_id)
    const target = store.getNode(edge.target_node_id)
    if (!source || !target) return null

    const sw = source.width || 200
    const sh = getNodeHeight(source)
    const tw = target.width || 200
    const th = getNodeHeight(target)

    // Center points
    const sourceCx = source.canvas_x + sw / 2
    const sourceCy = source.canvas_y + sh / 2
    const targetCx = target.canvas_x + tw / 2
    const targetCy = target.canvas_y + th / 2

    // Get edge points at node boundaries
    const startEdge = getNodeEdgePoint(source.canvas_x, source.canvas_y, sw, sh, targetCx, targetCy)
    const endEdge = getNodeEdgePoint(target.canvas_x, target.canvas_y, tw, th, sourceCx, sourceCy)

    // Check if this edge is bidirectional (reverse edge exists)
    const isBidirectional = edges.some(
      e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
    )

    // Calculate direction and length
    const dx = endEdge.x - startEdge.x
    const dy = endEdge.y - startEdge.y
    const len = Math.sqrt(dx * dx + dy * dy)

    // Visual gap from node edges (same on both sides)
    const gap = 6
    // Arrow size (markerWidth=5 * strokeWidth=2 = 10px, but arrow points forward from line end)
    const arrowSize = isBidirectional ? 0 : 10

    let x1 = startEdge.x
    let y1 = startEdge.y
    let x2 = endEdge.x
    let y2 = endEdge.y

    if (len > gap * 2 + arrowSize) {
      // Source side: gap from node edge
      x1 = startEdge.x + (dx / len) * gap
      y1 = startEdge.y + (dy / len) * gap
      // Target side: gap + arrow size, so arrow tip ends at 'gap' from node
      x2 = endEdge.x - (dx / len) * (gap + arrowSize)
      y2 = endEdge.y - (dy / len) * (gap + arrowSize)
    }

    // Get edge style
    const style = edgeStyleMap.value[edge.id] || 'straight'

    // Generate path based on style
    let path = ''
    if (style === 'curved') {
      // Quadratic bezier curve
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      // Control point perpendicular to the line
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      const curveOffset = dist * 0.2
      const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2
      const cx = midX + Math.cos(angle) * curveOffset
      const cy = midY + Math.sin(angle) * curveOffset
      path = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
    } else if (style === 'orthogonal') {
      // Right-angle path
      const midX = (x1 + x2) / 2
      path = `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`
    } else {
      // Straight line
      path = `M${x1},${y1} L${x2},${y2}`
    }

    return {
      id: edge.id,
      x1,
      y1,
      x2,
      y2,
      path,
      style,
      // Full extent for hit area (includes arrow)
      hitX1: startEdge.x,
      hitY1: startEdge.y,
      hitX2: endEdge.x,
      hitY2: endEdge.y,
      link_type: edge.link_type,
      label: edge.label,
      isBidirectional,
    }
  }).filter(Boolean)
})

// Transform for the canvas content
const transform = computed(() => {
  return `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`
})

// Screen to canvas coordinates
function screenToCanvas(screenX: number, screenY: number) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (screenX - rect.left - offsetX.value) / scale.value,
    y: (screenY - rect.top - offsetY.value) / scale.value,
  }
}

// Zoom centered on mouse position
function onWheel(e: WheelEvent) {
  // Check if inside a scrollable element
  const target = e.target as HTMLElement
  const scrollable = target.closest('.node-content') || target.closest('.inline-editor')

  if (scrollable) {
    const el = scrollable as HTMLElement
    const canScroll = el.scrollHeight > el.clientHeight

    if (canScroll) {
      // Check if at scroll boundaries
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1

      // Only allow zoom if scrolling past boundary
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
        return // Let the element scroll
      }
    }
    // Content doesn't need scrolling or at boundary - continue to zoom
  }

  e.preventDefault()

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.min(Math.max(scale.value * delta, 0.1), 3)

  // Zoom toward mouse position
  const scaleChange = newScale / scale.value
  offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
  offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
  scale.value = newScale
}

// Pan with left mouse drag on empty canvas space
function onCanvasMouseDown(e: MouseEvent) {
  // Left click - start panning or lasso if not on a node
  if (e.button === 0) {
    const target = e.target as HTMLElement
    // Don't pan if clicking on a node, edge, or panel
    if (target.closest('.node-card') || target.closest('.edge-line') || target.closest('.edge-panel')) {
      return
    }
    e.preventDefault()
    // End any editing
    if (editingNodeId.value) {
      saveEditing()
    }

    // Shift+drag = lasso selection
    if (e.shiftKey) {
      startLasso(e)
      document.addEventListener('mousemove', updateLasso)
      document.addEventListener('mouseup', () => {
        endLasso()
        document.removeEventListener('mousemove', updateLasso)
      }, { once: true })
      return
    }

    store.selectNode(null)
    selectedEdge.value = null
    startPan(e)
    return
  }
}

function startPan(e: MouseEvent) {
  panStart.value = {
    x: e.clientX,
    y: e.clientY,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', stopPan)
}

function onPanMove(e: MouseEvent) {
  // Only set panning true after mouse actually moves (allows double-click to work)
  const dx = e.clientX - panStart.value.x
  const dy = e.clientY - panStart.value.y
  if (!isPanning.value && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
    isPanning.value = true
  }
  if (!isPanning.value) return
  offsetX.value = panStart.value.offsetX + dx
  offsetY.value = panStart.value.offsetY + dy
}

function stopPan() {
  if (isPanning.value) {
    lastDragEndTime = Date.now()
  }
  isPanning.value = false
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', stopPan)
}

// Node dragging
function onNodeMouseDown(e: MouseEvent, nodeId: string) {
  e.stopPropagation()

  // Don't start drag if editing this node
  if (editingNodeId.value === nodeId) {
    return
  }

  // Alt+drag to create edge
  if (e.altKey) {
    const node = store.getNode(nodeId)
    if (node) {
      isCreatingEdge.value = true
      edgeStartNode.value = nodeId
      const pos = screenToCanvas(e.clientX, e.clientY)
      edgePreviewEnd.value = pos
      document.addEventListener('mousemove', onEdgePreviewMove)
      document.addEventListener('mouseup', onEdgeCreate)
    }
    return
  }

  const node = store.getNode(nodeId)
  if (!node) return

  draggingNode.value = nodeId
  store.selectNode(nodeId, e.shiftKey || e.metaKey)
  selectedEdge.value = null

  const pos = screenToCanvas(e.clientX, e.clientY)
  dragStart.value = {
    x: pos.x,
    y: pos.y,
    nodeX: node.canvas_x,
    nodeY: node.canvas_y,
  }

  document.addEventListener('mousemove', onNodeDrag)
  document.addEventListener('mouseup', stopNodeDrag)
}

function onNodeDrag(e: MouseEvent) {
  if (!draggingNode.value) return
  const pos = screenToCanvas(e.clientX, e.clientY)
  const dx = pos.x - dragStart.value.x
  const dy = pos.y - dragStart.value.y
  const newX = snapToGrid(dragStart.value.nodeX + dx)
  const newY = snapToGrid(dragStart.value.nodeY + dy)
  store.updateNodePosition(draggingNode.value, newX, newY)
}

function stopNodeDrag() {
  draggingNode.value = null
  lastDragEndTime = Date.now()
  document.removeEventListener('mousemove', onNodeDrag)
  document.removeEventListener('mouseup', stopNodeDrag)
}

// Node resizing
function onResizeMouseDown(e: MouseEvent, nodeId: string) {
  e.stopPropagation()
  e.preventDefault()

  const node = store.getNode(nodeId)
  if (!node) return

  resizingNode.value = nodeId
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: node.width || 200,
    height: node.height || 120,
  }
  resizePreview.value = { width: node.width || 200, height: node.height || 120 }

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
}

function onResizeMove(e: MouseEvent) {
  if (!resizingNode.value) return

  const dx = (e.clientX - resizeStart.value.x) / scale.value
  const dy = (e.clientY - resizeStart.value.y) / scale.value

  let width = Math.max(120, resizeStart.value.width + dx)
  let height = Math.max(60, resizeStart.value.height + dy)

  // Apply grid snap if enabled
  if (gridLockEnabled.value) {
    width = snapToGrid(width)
    height = snapToGrid(height)
  }

  resizePreview.value = { width, height }
}

function stopResize() {
  if (resizingNode.value) {
    // Only update store on mouse up
    const node = store.nodes.find(n => n.id === resizingNode.value)
    if (node) {
      node.width = resizePreview.value.width
      node.height = resizePreview.value.height
    }
  }
  resizingNode.value = null
  lastDragEndTime = Date.now()
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

// Handle clicks in node content (for external links)
function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const link = target.closest('a')
  if (link && link.href) {
    e.preventDefault()
    e.stopPropagation()
    openExternal(link.href)
  }
}

// Inline editing
function startEditing(nodeId: string) {
  // Save any current editing first
  if (editingNodeId.value && editingNodeId.value !== nodeId) {
    saveEditing()
  }
  const node = store.getNode(nodeId)
  if (!node) return
  editingNodeId.value = nodeId
  editContent.value = node.markdown_content || ''
  // Focus the textarea after Vue updates the DOM
  setTimeout(() => {
    const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, 10)
}

function startEditingTitle(nodeId: string) {
  const node = store.getNode(nodeId)
  if (!node) return
  editingTitleId.value = nodeId
  editTitle.value = node.title || ''
  setTimeout(() => {
    const input = document.querySelector('.title-editor') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }, 10)
}

function saveTitleEditing() {
  if (editingTitleId.value) {
    const node = store.getNode(editingTitleId.value)
    if (node) {
      node.title = editTitle.value
    }
  }
  editingTitleId.value = null
  editTitle.value = ''
}

function cancelTitleEditing() {
  editingTitleId.value = null
  editTitle.value = ''
}

function saveEditing(e?: FocusEvent) {
  // Don't close if focus moved to LLM inputs, buttons, or color bar
  if (e?.relatedTarget) {
    const related = e.relatedTarget as HTMLElement
    if (related.closest('.node-llm-bar-floating') ||
        related.closest('.node-color-bar') ||
        related.closest('.graph-llm-bar')) {
      return
    }
  }
  const nodeId = editingNodeId.value
  if (nodeId) {
    store.updateNodeContent(nodeId, editContent.value)
    // Trigger mermaid rendering after content update
    setTimeout(renderMermaidDiagrams, 100)
    // Auto-fit node to content after saving (if enabled for this node)
    // Delay to ensure content is rendered (including mermaid)
    const node = store.getNode(nodeId)
    if (node?.auto_fit) {
      setTimeout(() => fitNodeToContent(nodeId), 500)
    }
  }
  editingNodeId.value = null
  editContent.value = ''
  nodePrompt.value = ''
}

function cancelEditing() {
  editingNodeId.value = null
  editContent.value = ''
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    saveEditing()
  }
  // Cmd/Ctrl+Enter to save and exit
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    saveEditing()
  }
  // Don't propagate to prevent canvas shortcuts
  e.stopPropagation()
}

// Edge creation
function onEdgePreviewMove(e: MouseEvent) {
  edgePreviewEnd.value = screenToCanvas(e.clientX, e.clientY)
}

function onEdgeCreate(e: MouseEvent) {
  document.removeEventListener('mousemove', onEdgePreviewMove)
  document.removeEventListener('mouseup', onEdgeCreate)

  if (!edgeStartNode.value) {
    isCreatingEdge.value = false
    return
  }

  // Find node under cursor using DOM hit testing
  const target = document.elementFromPoint(e.clientX, e.clientY)
  const nodeCard = target?.closest('.node-card') as HTMLElement | null
  const targetNodeId = nodeCard?.dataset.nodeId
  const finalTarget = targetNodeId ? store.filteredNodes.find(n => n.id === targetNodeId) : null

  if (finalTarget && finalTarget.id !== edgeStartNode.value) {
    store.createEdge({
      source_node_id: edgeStartNode.value,
      target_node_id: finalTarget.id,
      link_type: 'related',
    })
  }

  isCreatingEdge.value = false
  edgeStartNode.value = null
}

// Edge selection
function onEdgeClick(e: MouseEvent, edgeId: string) {
  e.stopPropagation()
  selectedEdge.value = edgeId
  store.selectNode(null)
}

async function deleteSelectedEdge() {
  if (selectedEdge.value) {
    await store.deleteEdge(selectedEdge.value)
    selectedEdge.value = null
  }
}

function changeEdgeLabel(label: string) {
  if (selectedEdge.value) {
    const edge = store.filteredEdges.find(e => e.id === selectedEdge.value)
    if (edge) {
      edge.label = label || null
    }
  }
}

function reverseEdge() {
  if (!selectedEdge.value) return
  const edge = store.filteredEdges.find(e => e.id === selectedEdge.value)
  if (!edge) return
  // Swap source and target
  const temp = edge.source_node_id
  edge.source_node_id = edge.target_node_id
  edge.target_node_id = temp
}

function isEdgeBidirectional(edgeId: string): boolean {
  const edge = store.edges.find(e => e.id === edgeId)
  if (!edge) return false
  return store.edges.some(
    e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
  )
}

async function makeUnidirectional() {
  if (!selectedEdge.value) return
  const edge = store.edges.find(e => e.id === selectedEdge.value)
  if (!edge) return

  // Find and delete the reverse edge
  const reverseEdge = store.edges.find(
    e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
  )

  if (reverseEdge) {
    await store.deleteEdge(reverseEdge.id)
  }
}

async function makeBidirectional() {
  if (!selectedEdge.value) return
  const edge = store.edges.find(e => e.id === selectedEdge.value)
  if (!edge) return

  // Check if reverse edge already exists
  const reverseExists = store.edges.some(
    e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
  )

  if (!reverseExists) {
    await store.createEdge({
      source_node_id: edge.target_node_id,
      target_node_id: edge.source_node_id,
      link_type: edge.link_type,
      label: edge.label || undefined,
    })
  }
}

async function insertNodeOnEdge() {
  if (!selectedEdge.value) return

  const edge = store.filteredEdges.find(e => e.id === selectedEdge.value)
  if (!edge) return

  const sourceNode = store.getNode(edge.source_node_id)
  const targetNode = store.getNode(edge.target_node_id)
  if (!sourceNode || !targetNode) return

  // Calculate midpoint
  const midX = (sourceNode.canvas_x + targetNode.canvas_x) / 2
  const midY = (sourceNode.canvas_y + targetNode.canvas_y) / 2

  // Create new node at midpoint
  const newNode = await store.createNode({
    title: '',
    node_type: 'note',
    markdown_content: '',
    canvas_x: midX,
    canvas_y: midY,
  })

  // Delete old edge
  await store.deleteEdge(edge.id)

  // Create two new edges
  await store.createEdge({
    source_node_id: edge.source_node_id,
    target_node_id: newNode.id,
    link_type: edge.link_type,
  })
  await store.createEdge({
    source_node_id: newNode.id,
    target_node_id: edge.target_node_id,
    link_type: edge.link_type,
  })

  selectedEdge.value = null
  store.selectNode(newNode.id)
}

// Double click to create node
async function onCanvasDoubleClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // Don't create if clicking on interactive elements
  if (target.closest('.node-card') ||
      target.closest('.edge-panel') ||
      target.closest('.zoom-controls') ||
      target.closest('.status-bar')) {
    return
  }

  // Don't create if we just finished dragging (within 200ms)
  if (Date.now() - lastDragEndTime < 200) return

  const pos = screenToCanvas(e.clientX, e.clientY)
  await store.createNode({
    title: '',
    node_type: 'note',
    markdown_content: '',
    canvas_x: snapToGrid(pos.x),
    canvas_y: snapToGrid(pos.y),
  })
}

// Reset view
function resetView() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

async function autoLayoutNodes(layout: 'grid' | 'horizontal' | 'vertical' = 'grid') {
  const nodes = store.filteredNodes
  if (nodes.length === 0) return

  const startX = 100
  const startY = 100
  const nodeWidth = 220
  const nodeHeight = 150
  const gap = 30

  for (let i = 0; i < nodes.length; i++) {
    let x: number, y: number
    if (layout === 'horizontal') {
      x = startX + i * (nodeWidth + gap)
      y = startY
    } else if (layout === 'vertical') {
      x = startX
      y = startY + i * (nodeHeight + gap)
    } else {
      const cols = Math.ceil(Math.sqrt(nodes.length))
      x = startX + (i % cols) * (nodeWidth + gap)
      y = startY + Math.floor(i / cols) * (nodeHeight + gap)
    }
    await store.updateNodePosition(nodes[i].id, x, y)
  }
}

function fitToContent() {
  if (store.filteredNodes.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of store.filteredNodes) {
    minX = Math.min(minX, node.canvas_x)
    minY = Math.min(minY, node.canvas_y)
    maxX = Math.max(maxX, node.canvas_x + (node.width || 200))
    maxY = Math.max(maxY, node.canvas_y + 100)
  }

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  const padding = 50
  const contentWidth = maxX - minX + padding * 2
  const contentHeight = maxY - minY + padding * 2

  const scaleX = rect.width / contentWidth
  const scaleY = rect.height / contentHeight
  scale.value = Math.min(scaleX, scaleY, 1)

  offsetX.value = (rect.width - contentWidth * scale.value) / 2 - minX * scale.value + padding * scale.value
  offsetY.value = (rect.height - contentHeight * scale.value) / 2 - minY * scale.value + padding * scale.value
}

// Center the view on the content without changing scale
function centerViewOnContent() {
  if (store.filteredNodes.length === 0) return

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of store.filteredNodes) {
    minX = Math.min(minX, node.canvas_x)
    minY = Math.min(minY, node.canvas_y)
    maxX = Math.max(maxX, node.canvas_x + (node.width || 200))
    maxY = Math.max(maxY, node.canvas_y + (node.height || 100))
  }

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  // Center of the content in canvas coordinates
  const contentCenterX = (minX + maxX) / 2
  const contentCenterY = (minY + maxY) / 2

  // Set offset so content center is at viewport center
  offsetX.value = rect.width / 2 - contentCenterX * scale.value
  offsetY.value = rect.height / 2 - contentCenterY * scale.value
}

// Edge color palette
const edgeColorPalette = [
  { value: '#94a3b8' }, // gray (default)
  { value: '#3b82f6' }, // blue
  { value: '#22c55e' }, // green
  { value: '#f97316' }, // orange
  { value: '#ef4444' }, // red
  { value: '#8b5cf6' }, // purple
  { value: '#ec4899' }, // pink
]

// Edge style types
const edgeStyles = [
  { value: 'straight', label: '—' },
  { value: 'curved', label: '⌒' },
  { value: 'orthogonal', label: '⌐' },
]

// Store edge styles (edgeId -> style)
const edgeStyleMap = ref<Record<string, string>>({})

function getEdgeStyle(edgeId: string): string {
  return edgeStyleMap.value[edgeId] || 'straight'
}

function setEdgeStyle(style: string) {
  if (selectedEdge.value) {
    edgeStyleMap.value[selectedEdge.value] = style
  }
}

function getEdgeColor(edge: { link_type: string }): string {
  // link_type now stores the color directly, or defaults to gray
  const color = edge.link_type
  if (color && color.startsWith('#')) return color
  return '#94a3b8'
}

function getArrowMarkerId(color: string): string {
  // Create a safe ID from the color
  return `arrow-${color.replace('#', '')}`
}

function changeEdgeColor(color: string) {
  if (selectedEdge.value) {
    const edge = store.edges.find(e => e.id === selectedEdge.value)
    if (edge) {
      edge.link_type = color
    }
  }
}

// Render markdown to HTML with caching
const markdownCache = new Map<string, string>()
let mermaidCounter = 0

function renderMarkdown(content: string | null): string {
  if (!content) return ''

  // Check cache first
  if (markdownCache.has(content)) {
    return markdownCache.get(content)!
  }

  const preview = content.slice(0, 2000)
  let html = marked.parse(preview) as string

  // Post-process to handle mermaid code blocks
  const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g

  let needsMermaidRender = false
  html = html.replace(mermaidRegex, (match, code) => {
    const id = `mermaid-${mermaidCounter++}`
    const decoded = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    // If we have cached SVG for this mermaid code, use it directly
    if (mermaidCache.has(decoded)) {
      return `<div class="mermaid-wrapper">${mermaidCache.get(decoded)}</div>`
    }
    // Only trigger mermaid render if we have uncached diagrams
    needsMermaidRender = true
    return `<div class="mermaid-wrapper"><pre class="mermaid" id="${id}">${decoded}</pre></div>`
  })

  // Only schedule mermaid render if there are uncached diagrams
  if (needsMermaidRender) {
    setTimeout(renderMermaidDiagrams, 50)
  }

  // Cache the result (limit cache size)
  if (markdownCache.size > 100) {
    const firstKey = markdownCache.keys().next().value
    markdownCache.delete(firstKey)
  }
  markdownCache.set(content, html)

  return html
}

// Pre-rendered HTML cache for each node (avoids re-renders during drag)
const nodeRenderedContent = ref<Record<string, string>>({})

// Update rendered content when node content changes
watch(
  () => store.filteredNodes.map(n => `${n.id}:${n.markdown_content}`).join('|'),
  () => {
    const result: Record<string, string> = {}
    for (const node of store.filteredNodes) {
      result[node.id] = renderMarkdown(node.markdown_content)
    }
    nodeRenderedContent.value = result
  },
  { immediate: true }
)

// Mermaid rendering
let mermaidLoaded = false
let mermaidApi: any = null
const mermaidCache = new Map<string, string>() // code -> svg
let mermaidRenderPending = false

async function renderMermaidDiagrams() {
  // Debounce: prevent multiple concurrent renders
  if (mermaidRenderPending) return
  mermaidRenderPending = true

  await nextTick()

  const elements = document.querySelectorAll('.mermaid')
  if (elements.length === 0) {
    mermaidRenderPending = false
    return
  }

  // Lazy load mermaid only when needed
  if (!mermaidLoaded) {
    try {
      const mod = await import('mermaid')
      let api = mod.default || mod
      if (api.default) api = api.default

      mermaidApi = api
      if (typeof mermaidApi.initialize === 'function') {
        mermaidApi.initialize({
          startOnLoad: false,
          theme: isDarkMode.value ? 'dark' : 'default',
          securityLevel: 'loose',
        })
      }
      mermaidLoaded = true
    } catch (e) {
      console.error('Mermaid load error:', e)
      mermaidRenderPending = false
      return
    }
  }

  let didRenderNew = false
  for (const el of elements) {
    // Skip if already contains SVG (already rendered in DOM)
    if (el.querySelector('svg')) continue

    const code = el.textContent?.trim() || ''
    if (!code) continue

    // Check cache first
    if (mermaidCache.has(code)) {
      el.innerHTML = mermaidCache.get(code)!
      didRenderNew = true
      continue
    }

    try {
      const id = `m${Date.now()}${Math.random().toString(36).substr(2, 5)}`
      const { svg } = await mermaidApi.render(id, code)
      mermaidCache.set(code, svg)
      el.innerHTML = svg
      didRenderNew = true
    } catch (e: any) {
      const msg = e.message || String(e)
      const errorHtml = `<div style="color:var(--danger-color);font-size:11px;padding:8px;user-select:text;">Diagram error: ${msg.substring(0, 100)}</div>`
      mermaidCache.set(code, errorHtml)
      el.innerHTML = errorHtml
      didRenderNew = true
    }
  }

  // Only clear markdown cache and auto-fit if we actually rendered something new
  if (didRenderNew) {
    markdownCache.clear()
    autoFitAllNodes()
  }

  mermaidRenderPending = false
}

// Track mermaid code for re-rendering (only changes when actual mermaid content changes)
let lastMermaidCode = ''

// Watch for mermaid content changes only
watch(() => {
  // Extract only mermaid code blocks from all nodes
  const mermaidBlocks: string[] = []
  for (const node of store.filteredNodes) {
    const content = node.markdown_content || ''
    const matches = content.match(/```mermaid[\s\S]*?```/g)
    if (matches) {
      mermaidBlocks.push(...matches)
    }
  }
  return mermaidBlocks.join('|||')
}, (newMermaidCode) => {
  if (newMermaidCode && newMermaidCode !== lastMermaidCode) {
    lastMermaidCode = newMermaidCode
    setTimeout(renderMermaidDiagrams, 100)
  }
})

// Node colors for the color picker
const nodeColors = [
  { value: null },
  { value: '#fee2e2' },
  { value: '#ffedd5' },
  { value: '#fef9c3' },
  { value: '#dcfce7' },
  { value: '#dbeafe' },
  { value: '#f3e8ff' },
  { value: '#fce7f3' },
]

function updateNodeColor(nodeId: string, color: string | null) {
  const node = store.nodes.find(n => n.id === nodeId)
  if (node) {
    node.color_theme = color
    node.updated_at = Date.now()
  }
}

function toggleNodeAutoFit(nodeId: string) {
  const node = store.nodes.find(n => n.id === nodeId)
  if (node) {
    node.auto_fit = !node.auto_fit
    // Only applies on next save, no immediate resize
  }
}

async function deleteNode(nodeId: string) {
  await store.deleteNode(nodeId)
}

async function deleteSelectedNodes() {
  const count = store.selectedNodeIds.length
  if (count === 0) return
  // Delete without confirm to avoid Tauri permission issues
  for (const id of [...store.selectedNodeIds]) {
    await store.deleteNode(id)
  }
}

// Map light colors to dark mode equivalents (subtle tints on dark background)
const darkModeColors: Record<string, string> = {
  '#fee2e2': '#3f2a2a', // red tint
  '#ffedd5': '#3d3328', // orange tint
  '#fef9c3': '#3a3826', // yellow tint
  '#dcfce7': '#2a3d2e', // green tint
  '#dbeafe': '#2a3041', // blue tint
  '#f3e8ff': '#352a41', // purple tint
  '#fce7f3': '#3d2a38', // pink tint
}

// Get appropriate node background color for current theme
function getNodeBackground(colorTheme: string | null): string | undefined {
  if (!colorTheme) return undefined
  if (isDarkMode.value && darkModeColors[colorTheme]) {
    return darkModeColors[colorTheme]
  }
  return colorTheme
}

// Prevent context menu
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
}
</script>

<template>
  <div class="canvas-wrapper">
    <!-- Graph-level LLM prompt bar -->
    <div class="graph-llm-bar">
      <div class="llm-input-row">
        <input
          v-model="graphPrompt"
          type="text"
          placeholder="Ask about the graph..."
          class="llm-input"
          @keydown.enter="sendGraphPrompt"
          @keydown.up="onPromptKeydown"
          @keydown.down="onPromptKeydown"
          :disabled="isGraphLLMLoading"
        />
        <button class="llm-settings-btn" @click="showLLMSettings = !showLLMSettings" :class="{ active: showLLMSettings }" title="Settings">
          S
        </button>
        <button class="llm-clear-btn" @click="clearConversation" title="Clear conversation memory" :class="{ active: conversationHistory.length > 0 }">
          {{ conversationHistory.length || 'C' }}
        </button>
        <button v-if="!agentRunning" class="llm-send" @click="sendGraphPrompt" :disabled="isGraphLLMLoading || !graphPrompt.trim()">
          {{ isGraphLLMLoading ? '...' : 'Go' }}
        </button>
        <button v-else class="llm-stop" @click="stopAgent">Stop</button>
      </div>
      <!-- LLM Settings Panel -->
      <div v-if="showLLMSettings" class="llm-settings-panel">
        <div class="settings-grid">
          <label>Model</label>
          <select v-model="ollamaModel" class="settings-select">
            <option value="llama3.2">llama3.2</option>
            <option value="llama3.1">llama3.1</option>
            <option value="mistral">mistral</option>
            <option value="mistral:7b-instruct">mistral:7b-instruct</option>
            <option value="codellama">codellama</option>
            <option value="phi3">phi3</option>
            <option value="gemma2">gemma2</option>
            <option value="qwen2">qwen2</option>
          </select>
          <label>Context</label>
          <div class="slider-row">
            <input v-model.number="ollamaContextLength" type="range" min="1024" max="32768" step="1024" class="settings-slider" />
            <span class="slider-value">{{ (ollamaContextLength / 1024).toFixed(0) }}k</span>
          </div>
        </div>
        <label class="settings-label">System Prompt</label>
        <textarea v-model="customSystemPrompt" class="settings-textarea" rows="8" placeholder="Instructions for the LLM..."></textarea>
      </div>
      <!-- Agent Task List -->
      <div v-if="agentTasks.length > 0" class="agent-tasks">
        <div v-for="task in agentTasks" :key="task.id" class="agent-task" :class="task.status">
          <span class="task-status">{{ task.status === 'done' ? 'v' : task.status === 'running' ? '~' : 'o' }}</span>
          <span class="task-desc">{{ task.description }}</span>
        </div>
      </div>
      <!-- Agent activity log -->
      <div v-if="agentLog.length > 0" class="agent-log">
        <div v-for="(line, i) in agentLog" :key="i" class="log-line">{{ line }}</div>
      </div>
    </div>

    <div
      ref="canvasRef"
      class="canvas-viewport"
      @wheel="onWheel"
      @mousedown="onCanvasMouseDown"
      @dblclick="onCanvasDoubleClick"
      @contextmenu="onContextMenu"
      :class="{ panning: isPanning }"
      :style="{ backgroundPosition: offsetX + 'px ' + offsetY + 'px', backgroundSize: (24 * scale) + 'px ' + (24 * scale) + 'px' }"
    >
    <div class="canvas-content" :style="{ transform }">
      <!-- SVG for edges -->
      <svg class="edges-layer" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;">
        <defs>
          <marker v-for="color in edgeColorPalette" :key="color.value" :id="getArrowMarkerId(color.value)" viewBox="0 0 10 10" markerWidth="5" markerHeight="5" refX="0" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" :fill="color.value" />
          </marker>
          <marker id="arrow-selected" viewBox="0 0 10 10" markerWidth="5" markerHeight="5" refX="0" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#3b82f6" />
          </marker>
        </defs>

        <!-- Existing edges -->
        <g v-for="edge in edgeLines" :key="edge.id">
          <!-- Invisible wider hit area -->
          <path
            :d="edge.path"
            stroke="transparent"
            stroke-width="16"
            fill="none"
            class="edge-hit-area"
            @click="onEdgeClick($event, edge.id)"
          />
          <!-- Visible edge path -->
          <path
            :d="edge.path"
            :stroke="selectedEdge === edge.id ? '#3b82f6' : getEdgeColor(edge)"
            :stroke-width="selectedEdge === edge.id ? 3 : 2"
            :marker-end="edge.isBidirectional ? undefined : (selectedEdge === edge.id ? 'url(#arrow-selected)' : `url(#${getArrowMarkerId(getEdgeColor(edge))})`)"
            fill="none"
            class="edge-line-visible"
            pointer-events="none"
          />
          <text
            v-if="edge.label"
            :x="(edge.x1 + edge.x2) / 2"
            :y="(edge.y1 + edge.y2) / 2 - 8"
            class="edge-label"
          >{{ edge.label }}</text>
        </g>

        <!-- Lasso selection -->
        <polygon
          v-if="isLassoSelecting && lassoPoints.length > 2"
          :points="lassoPoints.map(p => `${p.x},${p.y}`).join(' ')"
          fill="rgba(59, 130, 246, 0.1)"
          stroke="#3b82f6"
          stroke-width="2"
          stroke-dasharray="4,4"
        />

        <!-- Edge preview while creating -->
        <line
          v-if="isCreatingEdge && edgeStartNode"
          :x1="(store.getNode(edgeStartNode)?.canvas_x || 0) + 100"
          :y1="(store.getNode(edgeStartNode)?.canvas_y || 0) + 40"
          :x2="edgePreviewEnd.x"
          :y2="edgePreviewEnd.y"
          stroke="#3b82f6"
          stroke-width="2"
          stroke-dasharray="8,4"
        />
      </svg>

      <!-- Node cards -->
      <div
        v-for="node in store.filteredNodes"
        :key="node.id"
        :data-node-id="node.id"
        class="node-card"
        :class="{
          selected: store.selectedNodeIds.includes(node.id),
          dragging: draggingNode === node.id,
          resizing: resizingNode === node.id,
          editing: editingNodeId === node.id
        }"
        :style="{
          transform: `translate(${node.canvas_x}px, ${node.canvas_y}px)`,
          width: (resizingNode === node.id ? resizePreview.width : (node.width || 200)) + 'px',
          height: (resizingNode === node.id ? resizePreview.height : (node.height || 120)) + 'px',
          ...(node.color_theme ? { background: getNodeBackground(node.color_theme) } : {}),
        }"
        @mousedown="onNodeMouseDown($event, node.id)"
        @dblclick.stop="startEditing(node.id)"
      >
        <!-- Node title header -->
        <div class="node-header" @dblclick.stop="startEditingTitle(node.id)">
          <input
            v-if="editingTitleId === node.id"
            v-model="editTitle"
            class="title-editor"
            @blur="saveTitleEditing"
            @keydown.enter="saveTitleEditing"
            @keydown.escape="cancelTitleEditing"
            @click.stop
            @mousedown.stop
          />
          <span v-else>{{ node.title || 'Untitled' }}</span>
        </div>
        <!-- Editing mode -->
        <textarea
          v-if="editingNodeId === node.id"
          v-model="editContent"
          class="inline-editor"
          @blur="saveEditing($event)"
          @keydown="onEditorKeydown"
          placeholder="Write markdown..."
        ></textarea>
        <!-- View mode - uses pre-rendered content to avoid re-renders during drag -->
        <div
          v-else
          class="node-content"
          v-html="nodeRenderedContent[node.id] || ''"
          @click="handleContentClick"
        ></div>

        <!-- Color palette and options (shown when editing) -->
        <div v-if="editingNodeId === node.id" class="node-color-bar" @mousedown.prevent>
          <button
            v-for="color in nodeColors"
            :key="color.value || 'default'"
            class="color-dot"
            :class="{ active: node.color_theme === color.value }"
            :style="{ background: color.value || 'var(--bg-surface)' }"
            @click.stop="updateNodeColor(node.id, color.value)"
          ></button>
          <span class="color-bar-sep"></span>
          <button
            class="autofit-toggle"
            :class="{ active: node.auto_fit }"
            @click.stop="toggleNodeAutoFit(node.id)"
            title="Auto-fit to content"
          >Fit</button>
        </div>

        <!-- Delete button (shown when selected but not editing) -->
        <button
          v-if="store.selectedNodeIds.includes(node.id) && editingNodeId !== node.id"
          class="delete-node-btn"
          @mousedown.stop="deleteSelectedNodes"
        >x</button>

        <div class="resize-handle" @mousedown.stop="onResizeMouseDown($event, node.id)"></div>
      </div>

      <!-- Empty state (positioned in viewport, not canvas) -->

      <!-- Floating Node LLM bar (above editing node) -->
      <div
        v-if="editingNodeId && store.getNode(editingNodeId)"
        class="node-llm-bar-floating"
        :style="{
          transform: `translate(${store.getNode(editingNodeId)!.canvas_x}px, ${store.getNode(editingNodeId)!.canvas_y - 40}px)`,
          width: (store.getNode(editingNodeId)!.width || 200) + 'px'
        }"
        @mousedown.stop
        @click.stop
      >
        <input
          v-model="nodePrompt"
          type="text"
          placeholder="Ask AI to update this note..."
          class="node-llm-input"
          tabindex="0"
          @mousedown.stop
          @keydown.enter.stop="sendNodePrompt"
          @keydown.stop
          :disabled="isNodeLLMLoading"
        />
        <button
          class="node-llm-send"
          tabindex="0"
          @mousedown.stop
          @click.stop="sendNodePrompt"
          :disabled="isNodeLLMLoading || !nodePrompt.trim()"
        >
          {{ isNodeLLMLoading ? '...' : 'AI' }}
        </button>
      </div>
    </div>

    <!-- Edge edit panel -->
    <div v-if="selectedEdge" class="edge-panel" @mousedown.stop @click.stop @dblclick.stop @pointerdown.stop>
      <div class="edge-panel-header">
        <span>Edge</span>
        <button @click="selectedEdge = null">x</button>
      </div>
      <div class="edge-panel-content">
        <label>Label:</label>
        <input
          type="text"
          :value="store.filteredEdges.find(e => e.id === selectedEdge)?.label || ''"
          @input="changeEdgeLabel(($event.target as HTMLInputElement).value)"
          placeholder="e.g. depends on"
          class="edge-label-input"
        />
        <label>Color:</label>
        <div class="edge-color-picker">
          <button
            v-for="color in edgeColorPalette"
            :key="color.value"
            class="edge-color-dot"
            :class="{ active: getEdgeColor(store.filteredEdges.find(e => e.id === selectedEdge) || { link_type: '' }) === color.value }"
            :style="{ background: color.value }"
            @click.stop="changeEdgeColor(color.value)"
          ></button>
        </div>
        <label>Style:</label>
        <div class="edge-style-picker">
          <button
            v-for="style in edgeStyles"
            :key="style.value"
            class="edge-style-btn"
            :class="{ active: getEdgeStyle(selectedEdge || '') === style.value }"
            @click.stop="setEdgeStyle(style.value)"
          >{{ style.label }}</button>
        </div>
        <label>Direction:</label>
        <div class="direction-btns">
          <button @click.stop="reverseEdge" title="Reverse direction">Flip</button>
          <button
            v-if="!isEdgeBidirectional(selectedEdge || '')"
            @click.stop="makeBidirectional"
            title="Make bidirectional"
          >Both</button>
          <button
            v-else
            @click.stop="makeUnidirectional"
            title="Make unidirectional"
          >One</button>
        </div>
        <button class="insert-node-btn" @click="insertNodeOnEdge">Insert Node</button>
        <button class="delete-edge-btn" @click="deleteSelectedEdge">Delete Edge</button>
      </div>
    </div>

    <!-- Controls -->
    <div class="zoom-controls">
      <button @click="scale = Math.min(scale * 1.25, 3)">+</button>
      <span>{{ Math.round(scale * 100) }}%</span>
      <button @click="scale = Math.max(scale * 0.8, 0.1)">-</button>
      <button @click="resetView" title="Reset view">R</button>
      <button @click="fitToContent" title="Fit to content">F</button>
      <button @click="centerViewOnContent" title="Center view">C</button>
      <button
        @click="gridLockEnabled = !gridLockEnabled"
        :class="{ active: gridLockEnabled }"
        title="Snap to grid"
      >G</button>
      <button @click="autoLayoutNodes('grid')" title="Auto-layout grid">L</button>
    </div>

    <div class="status-bar">
      <span>{{ store.filteredNodes.length }} nodes</span>
      <span class="sep">|</span>
      <span>{{ store.filteredEdges.length }} edges</span>
      <span class="sep">|</span>
      <span class="hint">Drag: pan | Scroll: zoom | Alt+drag: link | Dbl-click: new</span>
    </div>

    <!-- Empty state overlay -->
    <div v-if="store.filteredNodes.length === 0" class="empty-state-overlay">
      <div class="empty-state-box">
        <h3>No nodes yet</h3>
        <p>Double-click anywhere to create a node</p>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.graph-llm-bar {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.agent-tasks {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.agent-log {
  margin-top: 8px;
  padding: 8px;
  background: #1a1a2e;
  border-radius: 6px;
  font-family: monospace;
  font-size: 11px;
  max-height: 120px;
  overflow-y: auto;
  color: #4ade80;
}

.log-line {
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: var(--text-secondary);
}

.agent-task.done {
  color: var(--success-color, #22c55e);
}

.agent-task.running {
  color: var(--primary-color);
}

.task-status {
  font-family: monospace;
  width: 16px;
}

.llm-toggle {
  padding: 6px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.llm-toggle:hover {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.llm-input-row {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: center;
}

.llm-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.llm-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.llm-input::placeholder {
  color: var(--text-muted);
}

.model-select {
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.llm-send {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.llm-send:hover:not(:disabled) {
  opacity: 0.9;
}

.llm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.llm-stop {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #dc2626;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.llm-stop:hover {
  background: #b91c1c;
}

.llm-settings-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.llm-settings-btn:hover,
.llm-settings-btn.active {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
}

.llm-clear-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  min-width: 32px;
}

.llm-clear-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--warning-color, #f59e0b);
}

.llm-clear-btn.active {
  background: var(--warning-color, #f59e0b);
  color: white;
  border-color: var(--warning-color, #f59e0b);
}

.llm-settings-panel {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
}

.settings-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px 16px;
  align-items: center;
  margin-bottom: 16px;
}

.settings-grid label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.settings-input {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface-alt);
  color: var(--text-main);
}

.settings-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.settings-select {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface-alt);
  color: var(--text-main);
  cursor: pointer;
}

.settings-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-default);
  border-radius: 2px;
  cursor: pointer;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--primary-color);
  border-radius: 50%;
  cursor: pointer;
}

.settings-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--primary-color);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
  min-width: 32px;
  text-align: right;
}

.settings-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: var(--bg-surface-alt);
  color: var(--text-main);
  resize: vertical;
}

.settings-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.canvas-viewport {
  flex: 1;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--bg-canvas);
  cursor: default;
}

.canvas-viewport.panning {
  cursor: grabbing;
}

.canvas-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  transform-origin: 0 0;
}

.canvas-viewport {
  background-color: var(--bg-canvas);
  background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
  background-size: 24px 24px;
}

.edges-layer {
  pointer-events: none;
  overflow: visible;
  background: none;
}

.edge-hit-area {
  cursor: pointer;
  pointer-events: stroke;
}

.edge-line-visible {
  stroke-linecap: round;
  transition: stroke-width 0.1s;
}

.edge-hit-area:hover + .edge-line-visible {
  stroke-width: 4px !important;
}

.edge-label {
  font-size: 11px;
  font-weight: 500;
  fill: var(--text-main);
  text-anchor: middle;
  pointer-events: none;
  paint-order: stroke fill;
  stroke: var(--bg-canvas);
  stroke-width: 3px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.node-card {
  position: absolute;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  cursor: grab;
  box-shadow: 0 1px 3px var(--shadow-sm);
  user-select: none;
  transition: box-shadow 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  min-height: 60px;
}

.node-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface-alt);
  border-radius: 7px 7px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.title-editor {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  outline: none;
  padding: 0;
  margin: 0;
}

.node-card:hover {
  border-color: var(--text-muted);
}

.node-card.selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2), 0 4px 12px var(--shadow-md);
}

.node-card.dragging,
.node-card.resizing {
  cursor: grabbing;
  box-shadow: 0 8px 24px var(--shadow-md);
  z-index: 1000;
}

.resize-handle {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  cursor: nwse-resize;
  z-index: 9999;
  opacity: 0;
  transition: opacity 0.15s;
}

.resize-handle::before,
.resize-handle::after {
  content: '';
  position: absolute;
  background: var(--text-muted);
  border-radius: 1px;
}

.resize-handle::before {
  bottom: 0;
  right: 0;
  width: 8px;
  height: 2px;
}

.resize-handle::after {
  bottom: 0;
  right: 0;
  width: 2px;
  height: 8px;
}

.node-card:hover .resize-handle {
  opacity: 0.4;
}

.resize-handle:hover {
  opacity: 1 !important;
}

.node-card.editing {
  cursor: text;
}

.node-llm-bar-floating {
  position: absolute;
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 1001;
}

.node-llm-mode {
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  min-width: 24px;
}

.node-llm-mode:hover {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
}

.node-llm-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 11px;
  background: var(--bg-surface);
  color: var(--text-main);
  min-width: 0;
}

.node-llm-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.node-llm-input::placeholder {
  color: var(--text-muted);
}

.node-llm-send {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.node-llm-send:hover:not(:disabled) {
  opacity: 0.9;
}

.node-llm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inline-editor {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  overflow-y: auto;
  padding: 12px;
  padding-bottom: 20px;
}

.inline-editor::placeholder {
  color: var(--text-muted);
}

.node-color-bar {
  position: absolute;
  bottom: -28px;
  left: 0;
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 10;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--border-default);
  cursor: pointer;
  padding: 0;
}

.color-dot:hover {
  border-color: var(--text-muted);
  transform: scale(1.1);
}

.color-dot.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.color-bar-sep {
  width: 1px;
  height: 12px;
  background: var(--border-default);
  margin: 0 4px;
}

.autofit-toggle {
  padding: 2px 6px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
}

.autofit-toggle:hover {
  border-color: var(--text-muted);
}

.autofit-toggle.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.delete-node-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--danger-border);
  background: var(--danger-bg);
  color: var(--danger-color);
  cursor: pointer;
  padding: 0;
  font-size: 11px;
  line-height: 1;
  box-shadow: 0 1px 3px var(--shadow-sm);
}

.delete-node-btn:hover {
  background: var(--danger-color);
  color: white;
}

.node-content {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  padding: 12px;
  padding-bottom: 20px;
  border-radius: 0 0 7px 7px;
}

.node-content :deep(p) {
  margin: 0 0 8px 0;
}

.node-content :deep(p:last-child) {
  margin-bottom: 0;
}

.node-content :deep(h1) {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-main);
}

.node-content :deep(h2) {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 6px 0;
  color: var(--text-main);
}

.node-content :deep(h3) {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--text-secondary);
}

.node-content :deep(ul),
.node-content :deep(ol) {
  margin: 0 0 8px 0;
  padding-left: 18px;
}

.node-content :deep(li) {
  margin-bottom: 2px;
}

.node-content :deep(code) {
  background: var(--bg-elevated);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.node-content :deep(pre) {
  background: var(--bg-elevated);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0 0 8px 0;
}

.node-content :deep(pre code) {
  background: none;
  padding: 0;
}

.node-content :deep(strong) {
  font-weight: 600;
}

.node-content :deep(em) {
  font-style: italic;
}

.node-content :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}

.node-content :deep(blockquote) {
  border-left: 3px solid var(--border-default);
  margin: 0 0 8px 0;
  padding-left: 12px;
  color: var(--text-muted);
}

.node-content :deep(.mermaid-wrapper) {
  margin: 8px 0;
  overflow-x: auto;
}

.node-content :deep(.mermaid) {
  display: flex;
  justify-content: center;
}

.node-content :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
  /* Prevent blurry SVG in scaled containers */
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}

.node-content :deep(.mermaid svg text) {
  /* Keep text crisp */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.empty-state-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.empty-state-box {
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 24px 32px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  box-shadow: 0 4px 12px var(--shadow-sm);
}

.empty-state-box h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.empty-state-box p {
  font-size: 14px;
  margin: 0;
}

.edge-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 180px;
  background: var(--bg-surface-alt);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 100;
  animation: fadeIn 0.1s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.edge-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-default);
  font-weight: 500;
  font-size: 12px;
  color: var(--text-muted);
}

.edge-panel-header button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
}

.edge-panel-content {
  padding: 10px;
}

.edge-panel-content label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.edge-panel-content select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.edge-label-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.edge-label-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.edge-color-picker {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.edge-color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border-default);
  cursor: pointer;
  padding: 0;
}

.edge-color-dot:hover {
  border-color: var(--text-muted);
}

.edge-color-dot.active {
  border-color: var(--text-main);
  box-shadow: 0 0 0 2px var(--bg-surface);
}

.edge-style-picker {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.edge-style-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-main);
  cursor: pointer;
  font-size: 14px;
}

.edge-style-btn:hover {
  background: var(--bg-elevated);
}

.edge-style-btn.active {
  border-color: var(--primary-color);
  background: var(--bg-elevated);
}

.direction-btns {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.direction-btns button {
  flex: 1;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-main);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.direction-btns button:hover {
  background: var(--bg-elevated);
}

.insert-node-btn {
  width: 100%;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
  margin-bottom: 8px;
}

.insert-node-btn:hover {
  background: var(--bg-elevated);
}

.delete-edge-btn {
  width: 100%;
  padding: 8px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: 4px;
  color: var(--danger-color);
  font-size: 12px;
  cursor: pointer;
}

.delete-edge-btn:hover {
  opacity: 0.9;
}

.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 4px 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
}

.zoom-controls button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
}

.zoom-controls button:hover {
  background: var(--bg-elevated);
}

.zoom-controls button.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.zoom-controls span {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
}

.status-bar {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-muted);
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
}

.status-bar .sep {
  color: #e2e8f0;
}

.status-bar .hint {
  color: #94a3b8;
}

.status-bar .ai-btn {
  margin-left: 8px;
  padding: 4px 10px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.status-bar .ai-btn:hover {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

</style>
