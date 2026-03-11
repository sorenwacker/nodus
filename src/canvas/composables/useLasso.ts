/**
 * Lasso selection composable
 * Handles free-form selection of nodes by drawing a polygon
 */
import { ref } from 'vue'

interface Point {
  x: number
  y: number
}

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

interface Store {
  getFilteredNodes: () => Node[]
  setSelectedNodeIds: (ids: string[]) => void
}

export interface UseLassoOptions {
  store: Store
  screenToCanvas: (screenX: number, screenY: number) => Point
}

export function useLasso(options: UseLassoOptions) {
  const { store, screenToCanvas } = options

  const isLassoSelecting = ref(false)
  const lassoPoints = ref<Point[]>([])

  function start(e: MouseEvent) {
    isLassoSelecting.value = true
    lassoPoints.value = [screenToCanvas(e.clientX, e.clientY)]
  }

  function update(e: MouseEvent) {
    if (!isLassoSelecting.value) return
    lassoPoints.value.push(screenToCanvas(e.clientX, e.clientY))
  }

  function end() {
    try {
      if (!isLassoSelecting.value || lassoPoints.value.length < 3) {
        return
      }

      // Find nodes inside lasso polygon
      const selected: string[] = []
      const points = lassoPoints.value
      for (const node of store.getFilteredNodes()) {
        const cx = node.canvas_x + node.width / 2
        const cy = node.canvas_y + node.height / 2
        if (pointInPolygon(cx, cy, points)) {
          selected.push(node.id)
        }
      }

      store.setSelectedNodeIds(selected)
    } finally {
      // Always reset state
      isLassoSelecting.value = false
      lassoPoints.value = []
    }
  }

  return {
    isLassoSelecting,
    lassoPoints,
    start,
    update,
    end,
  }
}

/**
 * Ray casting algorithm to determine if a point is inside a polygon
 */
export function pointInPolygon(x: number, y: number, polygon: Point[]): boolean {
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
