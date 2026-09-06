/**
 * Graph metrics composable
 *
 * Computes graph size thresholds, LOD mode, and node degree for visualization optimization
 */

import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { Node, Edge } from '../../../types'
import { useDisplayStore } from '../../../stores/display'
import { canvasStorage } from '../../../lib/storage'
import { NODE_DEFAULTS } from '../../constants'
import { MOUNT_BUDGET_PER_FRAME, stageAdditions, stagingIncomplete } from '../../utils/stagedMounting'

export interface UseGraphMetricsContext {
  displayNodes: ComputedRef<Node[]>
  visibleNodes: ComputedRef<Node[]>
  filteredNodes: ComputedRef<Node[]> | Ref<Node[]>
  filteredEdges: ComputedRef<Edge[]> | Ref<Edge[]>
  neighborhoodMode: Ref<boolean>
  scale: Ref<number>
  workspaceId: ComputedRef<string | null>
  /**
   * True while a zoom or pan gesture is being performed. While it is, the
   * zoom tier holds whatever renderer is showing: crossing the band swaps DOM
   * cards for canvas circles, which costs seconds, and paying that repeatedly
   * inside one gesture is the stutter it caused. The tier settles once, when
   * the gesture ends. Optional: without it every change settles immediately.
   */
  gestureActive?: Ref<boolean>
  /** The node being edited keeps its card even in bubble mode. Lazy: the
   *  editor composable is constructed after this one. */
  getEditingNodeId?: () => string | null
}

export interface UseGraphMetricsReturn {
  isLargeGraph: ComputedRef<boolean>
  isHugeGraph: ComputedRef<boolean>
  isMassiveGraph: ComputedRef<boolean>
  isSemanticZoomCollapsed: ComputedRef<boolean>
  isTextHidden: ComputedRef<boolean>
  isLODMode: ComputedRef<boolean>
  /** Nodes drawn as circles / kept as cards while bubble mode is on. */
  lodCircleNodes: ComputedRef<Node[]>
  lodCardNodes: ComputedRef<Node[]>
  useSimpleEdges: ComputedRef<boolean>
  isBubbleModeForced: ComputedRef<boolean>
  nodeDegree: ComputedRef<Record<string, number>>
  getLODRadius: (nodeId: string) => number
  toggleBubbleMode: () => void
}

export function useGraphMetrics(ctx: UseGraphMetricsContext): UseGraphMetricsReturn {
  const {
    displayNodes,
    visibleNodes,
    filteredNodes,
    filteredEdges,
    neighborhoodMode,
    scale,
    workspaceId,
    gestureActive,
    getEditingNodeId,
  } = ctx

  // Get reactive refs from display store
  const displayStore = useDisplayStore()
  const { lodThreshold, semanticZoomThreshold } = storeToRefs(displayStore)

  // Persistent LOD mode override (user can manually toggle bubble mode) - per workspace
  const forceLODMode = ref(canvasStorage.getBubbleMode(workspaceId.value || undefined))

  // Update bubble mode when workspace changes
  watch(workspaceId, (newId) => {
    forceLODMode.value = canvasStorage.getBubbleMode(newId || undefined)
  })

  // Graph size thresholds - use displayNodes count so neighborhood mode gets proper routing
  // In neighborhood mode, always use full routing since we have few nodes
  // Thresholds increased for modern hardware - most devices handle 500+ nodes fine
  // One definition per tier, in ascending order. The thresholds were inline
  // literals with "massive" at 800 below "huge" at 1000, so a 900-node graph
  // was massive but not huge and the names said nothing true about ordering
  // (PRODUCT_DESIGN.md > Graph size tiers)
  const LARGE_NODES = 500
  const LARGE_EDGES = 1500
  const HUGE_NODES = 1000
  const HUGE_EDGES = 2000
  const MASSIVE_NODES = 2000
  const MASSIVE_EDGES = 4000

  const isLargeGraph = computed(
    () =>
      !neighborhoodMode.value &&
      (displayNodes.value.length > LARGE_NODES || filteredEdges.value.length > LARGE_EDGES)
  )

  const isHugeGraph = computed(
    () =>
      !neighborhoodMode.value &&
      (displayNodes.value.length > HUGE_NODES || filteredEdges.value.length > HUGE_EDGES)
  )

  const isMassiveGraph = computed(
    () =>
      !neighborhoodMode.value &&
      (displayNodes.value.length > MASSIVE_NODES || filteredEdges.value.length > MASSIVE_EDGES)
  )

  // Semantic zoom collapse - show title only when zoomed out
  // Uses hysteresis to prevent flickering when zooming near threshold
  const SEMANTIC_ZOOM_HYSTERESIS = 0.05 // 5% hysteresis band
  const semanticZoomCollapsed = ref(scale.value < semanticZoomThreshold.value)

  // Watching the threshold as well as the scale: the threshold is a setting the
  // user can change, and re-evaluating only on zoom left cards collapsed or
  // expanded until they happened to zoom, disagreeing with every other view of
  // the same setting (PRODUCT_DESIGN.md > Semantic zoom collapse)
  watch([scale, semanticZoomThreshold], ([s]) => {
    const threshold = semanticZoomThreshold.value
    const massiveThreshold = threshold + 0.2

    if (semanticZoomCollapsed.value) {
      // Currently collapsed - need to zoom IN past threshold + hysteresis to expand
      const expandThreshold = isMassiveGraph.value
        ? massiveThreshold + SEMANTIC_ZOOM_HYSTERESIS
        : threshold + SEMANTIC_ZOOM_HYSTERESIS
      if (s >= expandThreshold) {
        semanticZoomCollapsed.value = false
      }
    } else {
      // Currently expanded - need to zoom OUT past threshold to collapse
      const collapseThreshold = isMassiveGraph.value ? massiveThreshold : threshold
      if (s < collapseThreshold) {
        semanticZoomCollapsed.value = true
      }
    }
  })

  const isSemanticZoomCollapsed = computed(() => semanticZoomCollapsed.value)

  // Hide text completely when zoomed out below 10% - text is unreadable at this scale
  const isTextHidden = computed(() => scale.value < 0.10)

  /** Narrowest a card may render on screen before its DOM form buys nothing. */
  const CARD_MIN_SCREEN_PX = 30
  /** How wide it must get again before cards come back - the hysteresis band. */
  const CARD_RESTORE_SCREEN_PX = 40
  /** Visible-node counts that turn the zoom tier on and off, banded likewise. */
  const LOD_COUNT_ENTER = 20
  const LOD_COUNT_LEAVE = 12

  // LOD (Level of Detail) mode - render nodes as circles when many visible in viewport
  // Also activates when user manually toggles bubble mode.
  //
  // Zoom decides it as well as count, for the same reason it decides the edge
  // form below. A card is a composited DOM subtree of some sixty elements; the
  // compositor backs each one whatever its size on screen, so a few dozen of
  // them at a zoom where each is a few pixels wide cost gigabytes of graphics
  // memory to draw nothing legible. Fitting a workspace whose layout spans tens
  // of thousands of canvas px puts every node on screen at once at a zoom near
  // the floor - the count tier cannot catch that, because the count never
  // changes - and the process is killed by the kernel before the view appears.
  // Measured on the Portfolio workspace (215 nodes, layout 41,000 x 50,000 px,
  // fitted zoom ~0.02): 6 GB of shared graphics memory and an OOM kill as DOM
  // cards, 0.7 GB and a live canvas as circles (PERF_NOTES.md).
  //
  // The floor keeps a handful of nodes as cards: a sparse workspace zoomed out
  // costs nothing to draw properly, and turning it into bubbles would only take
  // detail away.
  //
  // Hysteresis, for the reason semanticZoomCollapsed above has it: a bare
  // comparison flickers when the zoom sits on the boundary, and this boundary
  // swaps the entire renderer - DOM cards for canvas circles - so a flicker
  // here is a far louder one than a collapsing card. Bubbles arrive when a card
  // is narrower than CARD_MIN_SCREEN_PX and leave only once it is comfortably
  // legible again, so no single wheel notch can cross both edges of the band.
  const zoomForcesLOD = ref(false)

  // gestureActive is a watch source as well as a guard: while it is true the
  // tier does nothing, and its falling edge re-runs this watcher so the tier
  // settles exactly once, on the state the gesture ended at. Programmatic
  // scale changes (the startup fit, zoom-to-node) have no gesture and settle
  // immediately, as before.
  watch(
    [scale, () => visibleNodes.value.length, () => gestureActive?.value ?? false],
    ([s, count, gesturing]) => {
      if (gesturing) return
      if (zoomForcesLOD.value) {
        if (s >= CARD_RESTORE_SCREEN_PX / NODE_DEFAULTS.WIDTH || count < LOD_COUNT_LEAVE) {
          zoomForcesLOD.value = false
        }
      } else if (s < CARD_MIN_SCREEN_PX / NODE_DEFAULTS.WIDTH && count > LOD_COUNT_ENTER) {
        zoomForcesLOD.value = true
      }
    },
    { immediate: true }
  )

  const isLODMode = computed(
    () => forceLODMode.value || visibleNodes.value.length > lodThreshold.value || zoomForcesLOD.value
  )

  // Pre-computed LOD node lists so the template does not filter twice
  const lodCircleNodes = computed(() => {
    if (!isLODMode.value) return []
    const editing = getEditingNodeId?.() ?? null
    return visibleNodes.value.filter(n => n.id !== editing)
  })
  /**
   * Cards are admitted a few per frame while a gesture is live.
   *
   * A grid crosses the margin in columns, so the number of cards mounting in a
   * frame is 0 for most frames and then 20, 30 or 60 in one. Mounting is the
   * expensive part, so the burst is what is felt. Staging is confined to the
   * gesture: when the viewport is still there is no burst to spread, and a
   * fresh load should paint at once rather than trickle
   * (PRODUCT_DESIGN.md > Staging what the viewport mounts).
   */
  const mountedCardIds = ref(new Set<string>())
  let stagingFrame: number | null = null

  function advanceStaging() {
    stagingFrame = null
    const editing = getEditingNodeId?.() ?? null
    const wanted = new Set(
      (isLODMode.value ? visibleNodes.value.filter(n => n.id === editing) : visibleNodes.value).map(
        n => n.id
      )
    )
    const budget = gestureActive?.value ? MOUNT_BUDGET_PER_FRAME : 0
    mountedCardIds.value = stageAdditions(mountedCardIds.value, wanted, budget)
    if (stagingIncomplete(mountedCardIds.value, wanted) && stagingFrame === null) {
      stagingFrame = requestAnimationFrame(advanceStaging)
    }
  }

  watch(
    [() => visibleNodes.value, isLODMode, () => gestureActive?.value ?? false],
    advanceStaging,
    { immediate: true }
  )

  const lodCardNodes = computed(() => {
    const editing = getEditingNodeId?.() ?? null
    const wanted = isLODMode.value
      ? visibleNodes.value.filter(n => n.id === editing)
      : visibleNodes.value
    const mounted = mountedCardIds.value
    return wanted.filter(n => mounted.has(n.id))
  })

  /** Stroke width of an edge's invisible hit path, in canvas px (CanvasEdgesSVG). */
  const EDGE_HIT_STROKE = 12
  /** Narrowest a hit target may render on screen and still be reliably clickable. */
  const EDGE_HIT_MIN_SCREEN_PX = 4

  // Whether to draw each edge as a single path instead of the full form.
  //
  // The full form is a <g> holding an invisible hit path, the visible path and
  // (above the label zoom threshold) a label - three to four elements per edge
  // against one. On a 1,200-edge graph that is ~3,600 SVG elements against
  // ~1,200, plus a pointer-events hit region per edge to test.
  //
  // Zoom decides it, not only graph size. Below the zoom at which the 12px hit
  // path renders thinner than a comfortable click target, the extra elements
  // are paid for on every frame and can never be used. The size tiers above
  // still force the simple form on their own account.
  const useSimpleEdges = computed(
    () => isLargeGraph.value || scale.value < EDGE_HIT_MIN_SCREEN_PX / EDGE_HIT_STROKE
  )

  // Toggle bubble mode manually
  function toggleBubbleMode() {
    forceLODMode.value = !forceLODMode.value
    canvasStorage.setBubbleMode(forceLODMode.value, workspaceId.value || undefined)
  }

  // Node degree (edge count) for LOD circle sizing
  const nodeDegree = computed(() => {
    const degree: Record<string, number> = {}
    for (const node of filteredNodes.value) {
      degree[node.id] = 0
    }
    for (const edge of filteredEdges.value) {
      if (degree[edge.source_node_id] !== undefined) degree[edge.source_node_id]++
      if (degree[edge.target_node_id] !== undefined) degree[edge.target_node_id]++
    }
    return degree
  })

  // Circle radius from degree. Log scale, so a hub with sixty edges does not
  // dwarf everything: a lower floor and a steeper slope than the original
  // 8 + log2(d+1) * 6, which spent most of its range on the low degrees and
  // clipped the hubs against its own cap - the nodes worth spotting were the
  // ones it flattened together.
  function getLODRadius(nodeId: string): number {
    const deg = nodeDegree.value[nodeId] || 0
    return Math.min(60, 5 + Math.log2(deg + 1) * 9)
  }

  return {
    isLargeGraph,
    isHugeGraph,
    isMassiveGraph,
    isSemanticZoomCollapsed,
    isTextHidden,
    isLODMode,
    lodCircleNodes,
    lodCardNodes,
    useSimpleEdges,
    isBubbleModeForced: computed(() => forceLODMode.value),
    nodeDegree,
    getLODRadius,
    toggleBubbleMode,
  }
}
