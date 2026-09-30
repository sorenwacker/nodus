/**
 * Layout composable
 * Orchestrates node layout algorithms and animations
 */
import { type Ref } from 'vue'
import {
  createLayoutAnimator,
  animateToPositions as animatePositions,
} from './useLayoutAnimation'
import { batchUpdatePositions } from '../../layout/fastGrid'
import { executeAutoLayout, type LayoutType } from './useAutoLayout'
import { computeRadialLayout } from './useRadialLayout'
import {
  fitToContent as fitViewportToContent,
} from './useLayoutStrategies'

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

interface Store {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getSelectedNodeIds: () => string[]
  getNode: (id: string) => Node | undefined
  updateNodePosition: (
    id: string,
    x: number,
    y: number,
    options?: { skipPersist?: boolean; skipLayoutTrigger?: boolean }
  ) => void
  /** Flush one node's in-memory position to the backend */
  persistNodePosition?: (id: string) => void | Promise<void>
  layoutNodes: (nodeIds?: string[], options?: { centerX: number; centerY: number }) => Promise<void>
}

interface ViewState {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  canvasRect: () => DOMRect | null
}

/**
 * An ephemeral surface that a layout run should arrange instead of the canvas.
 *
 * Neighbourhood mode shows a subgraph at positions it overlays on the stored
 * ones. While it is open, the layout controls belong to what is on screen, so a
 * run is scoped to those nodes and handed back rather than persisted - the
 * stored coordinates stay as they are and leaving the mode restores the canvas
 * (PRODUCT_DESIGN.md > Neighborhood Mode).
 */
export interface LayoutOverlay {
  /** The nodes on screen. Anything outside this set is not laid out. */
  nodeIds: Set<string>
  /** The node a radial run centres on, when the overlay has one. */
  centerId: string | null
  /** Receives the computed positions in place of the store. */
  apply: (positions: Map<string, { x: number; y: number }>) => void
}

export interface UseLayoutOptions {
  store: Store
  viewState: ViewState
  pushUndo: () => void
  /** The active overlay, if a mode is showing one. */
  getOverlay?: () => LayoutOverlay | null
}

export function useLayout(options: UseLayoutOptions) {
  const { store, viewState, pushUndo, getOverlay } = options

  // Animation state
  const animationState = createLayoutAnimator()

  // Flag to prevent concurrent layout operations (rapid clicking)
  let isLayoutInProgress = false

  function stopAnimation() {
    animationState.stop()
  }

  function animateToPositions(targets: Map<string, { x: number; y: number }>, duration = 400) {
    animatePositions(
      targets,
      (id: string) => {
        const node = store.getNodes().find(n => n.id === id)
        return node ? { x: node.canvas_x, y: node.canvas_y } : null
      },
      // Animation frames write memory only; the landing positions are stored
      // once when the animation ends (PRODUCT_DESIGN.md > Persisting animated positions)
      (id, x, y) => store.updateNodePosition(id, x, y, { skipPersist: true }),
      animationState,
      duration,
      store.persistNodePosition
    )
  }

  /**
   * Radial/concentric layout - places selected node at center with neighbors in rings
   */
  async function radialLayout(): Promise<void> {
    const result = computeRadialLayout({
      getSelectedNodeIds: store.getSelectedNodeIds,
      getNode: store.getNode,
      getFilteredNodes: store.getFilteredNodes,
      getFilteredEdges: store.getFilteredEdges,
    })

    if (!result) return

    pushUndo()
    animationState.settle()

    const { targets, zOrder } = result

    // Animate to positions
    if (targets.size > 200) {
      await batchUpdatePositions(targets, store.updateNodePosition, 100)
    } else {
      animateToPositions(targets, 600)
    }

    // Dispatch z-order event
    window.dispatchEvent(new CustomEvent('nodus-radial-z-order', { detail: zOrder }))
  }

  /**
   * Run a layout against an overlay rather than the canvas.
   *
   * Every layout algorithm already reads its graph through injected accessors
   * and writes through an injected sink, so scoping a run to the overlay is a
   * matter of narrowing both. Nothing is persisted and no undo entry is pushed:
   * an overlay position was never stored, so there is nothing to undo to.
   */
  async function layoutOverlay(layout: LayoutType, overlay: LayoutOverlay): Promise<void> {
    const nodes = store.getFilteredNodes().filter(n => overlay.nodeIds.has(n.id))
    const edges = store
      .getFilteredEdges()
      .filter(e => overlay.nodeIds.has(e.source_node_id) && overlay.nodeIds.has(e.target_node_id))

    // The node a radial run centres on. Only radial takes a centre; to every
    // other algorithm a selection means "lay out only these", so handing them
    // the centre made them arrange the focus node alone and leave the subgraph
    // exactly as it was - the control appeared to do nothing. The overlay's own
    // node set is the scope of a run in this mode
    // (PRODUCT_DESIGN.md > Neighborhood Mode).
    const centreIds = () =>
      overlay.centerId ? [overlay.centerId] : store.getSelectedNodeIds().filter(id => overlay.nodeIds.has(id))

    const scopedStore = {
      ...store,
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      getSelectedNodeIds: () => [],
    }

    if (layout === 'radial') {
      const result = computeRadialLayout({
        getSelectedNodeIds: centreIds,
        getNode: store.getNode,
        getFilteredNodes: () => nodes,
        getFilteredEdges: () => edges,
      })
      if (result) overlay.apply(result.targets)
      return
    }

    await executeAutoLayout(layout, {
      store: scopedStore,
      animateToPositions: targets => overlay.apply(targets),
    })
  }

  async function autoLayout(layout: LayoutType = 'grid') {
    // Prevent concurrent layout operations (rapid clicking)
    if (isLayoutInProgress) {
      console.debug('[Layout] Skipping - layout already in progress')
      return
    }
    isLayoutInProgress = true

    try {
      const overlay = getOverlay?.() ?? null
      if (overlay) {
        await layoutOverlay(layout, overlay)
        return
      }

      // Radial layout is handled separately
      if (layout === 'radial') {
        await radialLayout()
        return
      }

      pushUndo()
      // Settle (not freeze) any in-flight animation so nodes are never read
      // mid-flight by the new run
      animationState.settle()

      await executeAutoLayout(layout, {
        store,
        animateToPositions,
      })
    } finally {
      isLayoutInProgress = false
    }
  }

  function fitToContent() {
    fitViewportToContent(store, viewState)
  }

  return {
    stopAnimation,
    animateToPositions,
    autoLayout,
    radialLayout,
    fitToContent,
    // Strategy pattern methods
    }
}
