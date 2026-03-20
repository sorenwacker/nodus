/**
 * Canvas pan composable
 * Manages canvas panning with mouse drag
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

  function startPan(e: MouseEvent) {
    const offset = getOffset()
    panStart.value = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
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
    setOffset(panStart.value.offsetX + dx, panStart.value.offsetY + dy)
  }

  function stopPan() {
    if (isPanning.value) {
      onPanEnd?.()
    }
    isPanning.value = false
    document.removeEventListener('mousemove', onPanMove)
    document.removeEventListener('mouseup', stopPan)
  }

  return {
    isPanning,
    panStart,
    startPan,
    onPanMove,
    stopPan,
  }
}
