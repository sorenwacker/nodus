/**
 * Canvas pan composable
 * Manages canvas panning with pointer events (supports mouse, touch, pen)
 */
import { ref } from 'vue'

export interface UseCanvasPanOptions {
  getOffset: () => { x: number; y: number }
  setOffset: (x: number, y: number) => void
  onPanEnd?: () => void
}

export function useCanvasPan(options: UseCanvasPanOptions) {
  const { getOffset, setOffset, onPanEnd } = options

  const isPanning = ref(false)
  const panStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

  function startPan(e: PointerEvent) {
    const offset = getOffset()
    panStart.value = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    document.addEventListener('pointermove', onPanMove)
    document.addEventListener('pointerup', stopPan)
  }

  function onPanMove(e: PointerEvent) {
    // Only set panning true after pointer actually moves (allows double-click to work)
    const dx = e.clientX - panStart.value.x
    const dy = e.clientY - panStart.value.y
    if (!isPanning.value && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      isPanning.value = true
    }
    if (!isPanning.value) return
    setOffset(panStart.value.offsetX + dx, panStart.value.offsetY + dy)
  }

  function stopPan() {
    if (isPanning.value) {
      onPanEnd?.()
    }
    isPanning.value = false
    document.removeEventListener('pointermove', onPanMove)
    document.removeEventListener('pointerup', stopPan)
  }

  return {
    isPanning,
    panStart,
    startPan,
    onPanMove,
    stopPan,
  }
}
