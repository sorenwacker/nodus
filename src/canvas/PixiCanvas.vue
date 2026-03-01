<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { marked } from 'marked'

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

  // Try to find content element (might be .node-content or .inline-editor)
  let contentEl = cardEl.querySelector('.node-content') as HTMLElement
  if (!contentEl) {
    contentEl = cardEl.querySelector('.inline-editor') as HTMLElement
  }
  if (!contentEl) return

  // Temporarily remove height constraint to measure natural content size
  const originalHeight = cardEl.style.height
  cardEl.style.height = 'auto'

  // Measure content size
  const contentHeight = contentEl.scrollHeight + 24 // padding
  const contentWidth = Math.max(contentEl.scrollWidth + 24, 150)

  // Restore and update node size
  cardEl.style.height = originalHeight
  node.width = Math.min(Math.max(contentWidth, 150), 500)
  node.height = Math.max(contentHeight, 60)
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

// LLM interface
const graphPrompt = ref('')
const nodePrompt = ref('')
const isGraphLLMLoading = ref(false)
const isNodeLLMLoading = ref(false)
const showGraphLLM = ref(false)
const ollamaModel = ref('mistral:7b-instruct')
const nodeLLMMode = ref<'append' | 'replace'>('append')

async function callOllama(prompt: string, systemPrompt?: string): Promise<string> {
  const system = systemPrompt || 'You are a helpful assistant for a knowledge graph application. Respond concisely.'

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

async function sendGraphPrompt() {
  if (!graphPrompt.value.trim() || isGraphLLMLoading.value) return

  isGraphLLMLoading.value = true
  try {
    const systemPrompt = `You write concise notes. No explanations, no introductions, no "here is", just the content.

Example request: "create a flowchart of login process"
Example response:
\`\`\`mermaid
graph TD
    A[User] --> B[Enter credentials]
    B --> C{Valid?}
    C -->|Yes| D[Dashboard]
    C -->|No| E[Error message]
    E --> B
\`\`\`

Example request: "summarize machine learning"
Example response:
## Machine Learning

- Subset of AI that learns from data
- Types: supervised, unsupervised, reinforcement
- Applications: image recognition, NLP, predictions`

    const response = await callOllama(graphPrompt.value, systemPrompt)

    const pos = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
    await store.createNode({
      title: '',
      node_type: 'note',
      markdown_content: response.trim(),
      canvas_x: snapToGrid(pos.x),
      canvas_y: snapToGrid(pos.y),
    })

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
    const systemPrompt = nodeLLMMode.value === 'replace'
      ? `You are helping edit a note. The user wants you to rewrite/update the content based on their instruction. Return ONLY the new content, no explanations. Current content:\n\n${editContent.value}`
      : `You are helping edit a note. Add to or expand the content based on the user's instruction. Return ONLY the new text to add, no explanations. Current content:\n\n${editContent.value}`

    const response = await callOllama(nodePrompt.value, systemPrompt)

    if (nodeLLMMode.value === 'replace') {
      editContent.value = response
    } else {
      editContent.value = editContent.value.trimEnd() + '\n\n' + response
    }
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
  // Don't zoom if scrolling inside a node
  const target = e.target as HTMLElement
  if (target.closest('.node-content') || target.closest('.inline-editor')) {
    return
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
  // Left click - start panning if not on a node
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
  store.selectNode(nodeId)
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

  resizePreview.value = {
    width: Math.max(120, resizeStart.value.width + dx),
    height: Math.max(60, resizeStart.value.height + dy),
  }
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
    const node = store.getNode(nodeId)
    if (node?.auto_fit) {
      setTimeout(() => fitNodeToContent(nodeId), 150)
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
    markdown_content: '# New Node\n\n',
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
    markdown_content: '# New Node\n\n',
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

// Pre-computed rendered HTML for each node (avoids re-renders during drag)
const nodeRenderedContent = computed(() => {
  const result: Record<string, string> = {}
  for (const node of store.filteredNodes) {
    result[node.id] = renderMarkdown(node.markdown_content)
  }
  return result
})

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
    // Always fit immediately when clicking the button
    setTimeout(() => fitNodeToContent(nodeId), 50)
    // Toggle auto-fit for future saves
    node.auto_fit = !node.auto_fit
  }
}

async function deleteNode(nodeId: string) {
  if (confirm('Delete this node?')) {
    await store.deleteNode(nodeId)
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
    <div v-if="showGraphLLM" class="graph-llm-bar expanded">
      <button class="llm-toggle" @click="showGraphLLM = false">x</button>
      <div class="llm-input-row">
        <input
          v-model="graphPrompt"
          type="text"
          placeholder="Ask about the graph..."
          class="llm-input"
          @keydown.enter="sendGraphPrompt"
          :disabled="isGraphLLMLoading"
        />
        <select v-model="ollamaModel" class="model-select">
          <option value="mistral:7b-instruct">mistral (recommended)</option>
          <option value="llama3.2">llama3.2</option>
          <option value="llama3.1">llama3.1</option>
          <option value="codellama">codellama</option>
        </select>
        <button class="llm-send" @click="sendGraphPrompt" :disabled="isGraphLLMLoading || !graphPrompt.trim()">
          {{ isGraphLLMLoading ? '...' : 'Go' }}
        </button>
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
          selected: store.selectedNodeId === node.id,
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
        <!-- Editing mode -->
        <textarea
          v-if="editingNodeId === node.id"
          v-model="editContent"
          class="inline-editor"
          @blur="saveEditing($event)"
          @keydown="onEditorKeydown"
          placeholder="Write markdown..."
        ></textarea>
        <!-- View mode - uses pre-computed content to avoid re-renders during drag -->
        <div
          v-else
          class="node-content"
          v-html="nodeRenderedContent[node.id]"
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
          v-if="store.selectedNodeId === node.id && editingNodeId !== node.id"
          class="delete-node-btn"
          @mousedown.stop="deleteNode(node.id)"
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
        <button
          class="node-llm-mode"
          tabindex="0"
          @mousedown.stop
          @click.stop="nodeLLMMode = nodeLLMMode === 'append' ? 'replace' : 'append'"
          :title="nodeLLMMode === 'append' ? 'Mode: Append' : 'Mode: Replace'"
        >
          {{ nodeLLMMode === 'append' ? '+' : '=' }}
        </button>
        <input
          v-model="nodePrompt"
          type="text"
          :placeholder="nodeLLMMode === 'append' ? 'Add content...' : 'Rewrite content...'"
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
    </div>

    <div class="status-bar">
      <span>{{ store.filteredNodes.length }} nodes</span>
      <span class="sep">|</span>
      <span>{{ store.filteredEdges.length }} edges</span>
      <span class="sep">|</span>
      <span class="hint">Drag: pan | Scroll: zoom | Alt+drag: link | Dbl-click: new</span>
      <button v-if="!showGraphLLM" class="ai-btn" @click="showGraphLLM = true">AI</button>
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
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.graph-llm-bar.expanded {
  padding: 8px 12px;
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
