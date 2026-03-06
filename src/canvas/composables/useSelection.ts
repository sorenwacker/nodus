/**
 * Selection composable
 * Handles node selection, multi-select, and selection box
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'

interface NodeRect {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

interface SelectionBox {
  x: number
  y: number
  width: number
  height: number
}

export function useSelection() {
  const selectedNodeIds = ref<Set<string>>(new Set())
  const isSelecting = ref(false)
  const selectionStart = ref<{ x: number; y: number } | null>(null)
  const selectionEnd = ref<{ x: number; y: number } | null>(null)

  const selectedCount = computed(() => selectedNodeIds.value.size)
  const hasSelection = computed(() => selectedNodeIds.value.size > 0)

  const selectionBox = computed<SelectionBox | null>(() => {
    if (!isSelecting.value || !selectionStart.value || !selectionEnd.value) {
      return null
    }

    const x = Math.min(selectionStart.value.x, selectionEnd.value.x)
    const y = Math.min(selectionStart.value.y, selectionEnd.value.y)
    const width = Math.abs(selectionEnd.value.x - selectionStart.value.x)
    const height = Math.abs(selectionEnd.value.y - selectionStart.value.y)

    return { x, y, width, height }
  })

  function select(nodeId: string, addToSelection = false) {
    if (addToSelection) {
      const newSet = new Set(selectedNodeIds.value)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      selectedNodeIds.value = newSet
    } else {
      selectedNodeIds.value = new Set([nodeId])
    }
  }

  function selectMultiple(nodeIds: string[]) {
    selectedNodeIds.value = new Set(nodeIds)
  }

  function addToSelection(nodeIds: string[]) {
    const newSet = new Set(selectedNodeIds.value)
    for (const id of nodeIds) {
      newSet.add(id)
    }
    selectedNodeIds.value = newSet
  }

  function deselect(nodeId: string) {
    const newSet = new Set(selectedNodeIds.value)
    newSet.delete(nodeId)
    selectedNodeIds.value = newSet
  }

  function clearSelection() {
    selectedNodeIds.value = new Set()
  }

  function isSelected(nodeId: string): boolean {
    return selectedNodeIds.value.has(nodeId)
  }

  function startSelectionBox(x: number, y: number) {
    isSelecting.value = true
    selectionStart.value = { x, y }
    selectionEnd.value = { x, y }
  }

  function updateSelectionBox(x: number, y: number) {
    if (!isSelecting.value) return
    selectionEnd.value = { x, y }
  }

  function endSelectionBox(nodes: NodeRect[], addToExisting = false) {
    if (!isSelecting.value || !selectionBox.value) {
      isSelecting.value = false
      return
    }

    const box = selectionBox.value
    const nodesInBox = nodes.filter(node => {
      const nodeRight = node.canvas_x + (node.width || 200)
      const nodeBottom = node.canvas_y + (node.height || 120)
      const boxRight = box.x + box.width
      const boxBottom = box.y + box.height

      return (
        node.canvas_x < boxRight &&
        nodeRight > box.x &&
        node.canvas_y < boxBottom &&
        nodeBottom > box.y
      )
    })

    if (addToExisting) {
      addToSelection(nodesInBox.map(n => n.id))
    } else {
      selectMultiple(nodesInBox.map(n => n.id))
    }

    isSelecting.value = false
    selectionStart.value = null
    selectionEnd.value = null
  }

  function cancelSelectionBox() {
    isSelecting.value = false
    selectionStart.value = null
    selectionEnd.value = null
  }

  return {
    selectedNodeIds,
    selectedCount,
    hasSelection,
    isSelecting,
    selectionBox,
    select,
    selectMultiple,
    addToSelection,
    deselect,
    clearSelection,
    isSelected,
    startSelectionBox,
    updateSelectionBox,
    endSelectionBox,
    cancelSelectionBox,
  }
}
