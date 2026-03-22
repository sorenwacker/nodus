/**
 * Canvas composables
 * Reusable logic for canvas operations
 */

// Viewport: panning, zooming, view state
export {
  useCanvasDisplay,
  useCanvasPan,
  useCanvasZoom,
  useMinimap,
  useViewState,
  type UseCanvasDisplayContext,
  type UseCanvasDisplayReturn,
  type UseCanvasPanOptions,
  type UseCanvasZoomContext,
  type UseCanvasZoomReturn,
  type MinimapNode,
  type MinimapOptions,
  type ViewState,
  type UseViewStateOptions,
  type UseViewStateReturn,
} from './viewport'

// Nodes: manipulation, editing, visibility
export {
  useNodeClipboard,
  useNodeDragging,
  useNodeEditor,
  useNodeHover,
  useNodeResizing,
  useNodeVisibility,
  type ClipboardNodeData,
  type UseNodeClipboardOptions,
  type UseNodeClipboardReturn,
  type UseNodeDraggingContext,
  type UseNodeDraggingReturn,
  type NodeEditorStore,
  type UseNodeEditorOptions,
  type UseNodeHoverContext,
  type UseNodeHoverReturn,
  type UseNodeResizingContext,
  type UseNodeResizingReturn,
  type VisibilityNode,
  type UseNodeVisibilityOptions,
  type UseNodeVisibilityReturn,
} from './nodes'

// Edges: routing, styling, visibility, manipulation
export {
  useEdgeManipulation,
  useEdgeRouting,
  useEdgeStyling,
  useEdgeVisibility,
  type EdgeManipulationStore,
  type UseEdgeManipulationOptions,
  type EdgeLine,
  type UseEdgeRoutingContext,
  type UseEdgeRoutingReturn,
  type EdgeStyleType,
  type EdgeStyleOption,
  type EdgeColorOption,
  type UseEdgeStylingContext,
  type UseEdgeStylingReturn,
  type VisibleEdgeLine,
  type UseEdgeVisibilityContext,
  type UseEdgeVisibilityReturn,
} from './edges'

// Selection: lasso, context menu
export {
  useContextMenu,
  useLasso,
  pointInPolygon,
  type ContextMenuDeps,
  type UseLassoOptions,
} from './selection'

// Agent: LLM agent runner, tools, handlers
export {
  useAgentRunner,
  useLLMTools,
  useMarkerHandlers,
  useNodeAgent,
  usePlanHandlers,
  type AgentContext,
  type AgentRunResult,
  type LLMQueueInterface,
  type LLMToolsNodeStore,
  type ThemesStoreInterface,
  type PlanStateInterface,
  type MemoryStorageInterface,
  type LLMToolsContext,
  type UseLLMToolsReturn,
  type MarkerHandlerContext,
  type UseMarkerHandlersReturn,
  type NodeAgentContext,
  type UsePlanHandlersContext,
  type UsePlanHandlersReturn,
} from './agent'

// Rendering: content rendering, viewport culling, metrics
export {
  useContentRenderer,
  useGraphMetrics,
  useViewportCulling,
  type UseContentRendererOptions,
  type UseGraphMetricsContext,
  type UseGraphMetricsReturn,
  type UseViewportCullingContext,
  type UseViewportCullingReturn,
} from './rendering'

// Layout: graph layout, neighborhood mode
export {
  useLayout,
  useNeighborhoodMode,
  type UseLayoutOptions,
  type UseNeighborhoodModeOptions,
} from './layout'

// Frames: spatial grouping
export { useFrames, type UseFramesOptions } from './frames'

// Utilities: keyboard shortcuts, undo, PDF, Zotero, storylines
export {
  useCanvasKeyboardShortcuts,
  usePdfDrop,
  useStorylines,
  useUndoHandlers,
  useZotero,
  type UseCanvasKeyboardShortcutsContext,
  type UseCanvasKeyboardShortcutsReturn,
  type BibEntry,
  type PendingBibImport,
  type UsePdfDropOptions,
  type UseStorylinesContext,
  type UseStorylinesReturn,
  type ZoteroCollection,
  type ZoteroCreator,
  type ZoteroAttachment,
  type ZoteroItem,
} from './util'
