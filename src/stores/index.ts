/**
 * Pinia stores
 * Re-export all stores for convenient importing
 */

// Main stores
export { useNodesStore } from './nodes'
export { useThemesStore } from './themes'

// Domain stores (extracted from useNodesStore)
export { useWorkspaceStore } from './workspaces'
export { useEdgesStore } from './edges'
export { useFramesStore } from './frames'

// Re-export types
export type { Node, Edge, Frame, Workspace, CreateNodeInput, CreateEdgeInput } from './nodes'
