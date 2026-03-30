/**
 * Edge manipulation composable
 * Manages edge creation, selection, and modification
 */
import { ref } from 'vue'
import type { Node, Edge, CreateEdgeInput } from '../../../types'

export interface EdgeManipulationStore {
  getNode: (id: string) => Node | undefined
  getEdges: () => Edge[]
  getFilteredEdges: () => Edge[]
  getFilteredNodes: () => Node[]
  createNode: (data: { title: string; node_type: string; markdown_content: string; canvas_x: number; canvas_y: number }) => Promise<Node>
  createEdge: (data: CreateEdgeInput) => Promise<Edge>
  deleteEdge: (id: string) => Promise<void>
  updateEdgeDirected: (id: string, directed: boolean) => Promise<void>
  selectNode: (id: string | null) => void
}

export interface UseEdgeManipulationOptions {
  store: EdgeManipulationStore
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

export function useEdgeManipulation(options: UseEdgeManipulationOptions) {
  const { store, screenToCanvas } = options

  // Edge creation state
  const isCreatingEdge = ref(false)
  const edgeStartNode = ref<string | null>(null)
  const edgePreviewEnd = ref({ x: 0, y: 0 })

  // Edge selection state
  const selectedEdge = ref<string | null>(null)

  function onEdgePreviewMove(e: PointerEvent) {
    edgePreviewEnd.value = screenToCanvas(e.clientX, e.clientY)
  }

  function onEdgeCreate(e: PointerEvent) {
    document.removeEventListener('pointermove', onEdgePreviewMove)
    document.removeEventListener('pointerup', onEdgeCreate)

    if (!edgeStartNode.value) {
      isCreatingEdge.value = false
      return
    }

    // Find node under cursor using DOM hit testing
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const nodeCard = target?.closest('.node-card') as HTMLElement | null
    const targetNodeId = nodeCard?.dataset.nodeId
    // Check both filteredNodes and use getNode as fallback (handles edge cases)
    let finalTarget = targetNodeId ? store.getFilteredNodes().find((n) => n.id === targetNodeId) : null
    if (!finalTarget && targetNodeId) {
      // Fallback: the node card exists in DOM, so get it directly
      finalTarget = store.getNode(targetNodeId)
    }

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

  function startEdgeCreation(nodeId: string) {
    isCreatingEdge.value = true
    edgeStartNode.value = nodeId
    document.addEventListener('pointermove', onEdgePreviewMove)
    document.addEventListener('pointerup', onEdgeCreate)
  }

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
      const edge = store.getFilteredEdges().find((e) => e.id === selectedEdge.value)
      if (edge) {
        edge.label = label || null
      }
    }
  }

  async function reverseEdge() {
    if (!selectedEdge.value) return
    const edge = store.getFilteredEdges().find((e) => e.id === selectedEdge.value)
    if (!edge) return

    // Delete old edge and create new one with swapped source/target
    const oldId = edge.id
    await store.deleteEdge(oldId)

    const newEdge = await store.createEdge({
      source_node_id: edge.target_node_id,
      target_node_id: edge.source_node_id,
      link_type: edge.link_type,
      label: edge.label || undefined,
    })

    // Select the new edge
    if (newEdge) {
      selectedEdge.value = newEdge.id
    }
  }

  function isEdgeDirected(edgeId: string): boolean {
    const edge = store.getEdges().find((e) => e.id === edgeId)
    return edge?.directed ?? true
  }

  async function makeNonDirectional() {
    if (!selectedEdge.value) return
    await store.updateEdgeDirected(selectedEdge.value, false)
  }

  async function makeDirectional() {
    if (!selectedEdge.value) return
    await store.updateEdgeDirected(selectedEdge.value, true)
  }

  async function insertNodeOnEdge() {
    if (!selectedEdge.value) return

    const edge = store.getFilteredEdges().find((e) => e.id === selectedEdge.value)
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

  function clearSelection() {
    selectedEdge.value = null
  }

  return {
    // State
    isCreatingEdge,
    edgeStartNode,
    edgePreviewEnd,
    selectedEdge,

    // Methods
    startEdgeCreation,
    onEdgePreviewMove,
    onEdgeCreate,
    onEdgeClick,
    deleteSelectedEdge,
    changeEdgeLabel,
    reverseEdge,
    isEdgeDirected,
    makeNonDirectional,
    makeDirectional,
    insertNodeOnEdge,
    clearSelection,
  }
}
