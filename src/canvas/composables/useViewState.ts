/**
 * View state composable
 * Manages canvas scale, offset, persistence, and centering
 */
import { ref, onUnmounted } from 'vue'

const VIEW_STORAGE_KEY = 'nodus-canvas-view'

export interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

export interface UseViewStateOptions {
  /** Get canvas element bounding rect */
  getCanvasRect: () => DOMRect | null
  /** Default scale if no saved state */
  defaultScale?: number
}

export function useViewState(options: UseViewStateOptions) {
  const { getCanvasRect, defaultScale = 1 } = options

  // Load saved view state from localStorage
  function loadViewState(): ViewState | null {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (
          typeof parsed.scale === 'number' &&
          typeof parsed.offsetX === 'number' &&
          typeof parsed.offsetY === 'number'
        ) {
          return parsed
        }
      }
    } catch {
      /* ignore */
    }
    return null
  }

  const savedView = loadViewState()
  const scale = ref(savedView?.scale ?? defaultScale)
  const offsetX = ref(savedView?.offsetX ?? 0)
  const offsetY = ref(savedView?.offsetY ?? 0)
  const isZooming = ref(false)

  let zoomTimeout: number | null = null
  let viewSaveTimeout: number | null = null

  // Save view state to localStorage
  function saveViewState() {
    try {
      localStorage.setItem(
        VIEW_STORAGE_KEY,
        JSON.stringify({
          scale: scale.value,
          offsetX: offsetX.value,
          offsetY: offsetY.value,
        })
      )
    } catch {
      /* ignore */
    }
  }

  // Debounced save
  function scheduleSaveViewState() {
    if (viewSaveTimeout) clearTimeout(viewSaveTimeout)
    viewSaveTimeout = window.setTimeout(saveViewState, 500)
  }

  // Center the grid so origin (0,0) is in the middle of the viewport
  function centerGrid() {
    const rect = getCanvasRect()
    if (rect) {
      offsetX.value = rect.width / 2
      offsetY.value = rect.height / 2
    }
  }

  // Zoom controls
  function zoomIn() {
    scale.value = Math.min(scale.value * 1.25, 3)
    scheduleSaveViewState()
  }

  function zoomOut() {
    scale.value = Math.max(scale.value * 0.8, 0.05)
    scheduleSaveViewState()
  }

  function setScale(newScale: number) {
    scale.value = Math.max(0.05, Math.min(3, newScale))
    scheduleSaveViewState()
  }

  // Set zooming flag with auto-clear
  function startZooming() {
    isZooming.value = true
    if (zoomTimeout) clearTimeout(zoomTimeout)
    zoomTimeout = window.setTimeout(() => {
      isZooming.value = false
    }, 150)
  }

  // Screen to canvas coordinate conversion
  function screenToCanvas(screenX: number, screenY: number) {
    const rect = getCanvasRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (screenX - rect.left - offsetX.value) / scale.value,
      y: (screenY - rect.top - offsetY.value) / scale.value,
    }
  }

  // Canvas to screen coordinate conversion
  function canvasToScreen(canvasX: number, canvasY: number) {
    const rect = getCanvasRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: canvasX * scale.value + offsetX.value + rect.left,
      y: canvasY * scale.value + offsetY.value + rect.top,
    }
  }

  // Get viewport center in canvas coordinates
  function getViewportCenter() {
    const rect = getCanvasRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (rect.width / 2 - offsetX.value) / scale.value,
      y: (rect.height / 2 - offsetY.value) / scale.value,
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (zoomTimeout) clearTimeout(zoomTimeout)
    if (viewSaveTimeout) clearTimeout(viewSaveTimeout)
  })

  return {
    // State
    scale,
    offsetX,
    offsetY,
    isZooming,
    hasSavedView: savedView !== null,

    // Methods
    saveViewState,
    scheduleSaveViewState,
    centerGrid,
    zoomIn,
    zoomOut,
    setScale,
    startZooming,
    screenToCanvas,
    canvasToScreen,
    getViewportCenter,
  }
}

export type UseViewStateReturn = ReturnType<typeof useViewState>
