import { inject } from 'vue'
import type { Node, Edge } from '../../../types'

/**
 * Composable for undo handlers
 * Wraps injected undo functions with fallback warnings
 */
export function useUndoHandlers() {
  const injectedPushUndo = inject<(() => void) | undefined>('pushUndo')
  const injectedPushContentUndo = inject<((nodeId: string, oldContent: string | null, oldTitle: string) => void) | undefined>('pushContentUndo')
  const injectedPushDeletionUndo = inject<((node: Node, edges: Edge[]) => void) | undefined>('pushDeletionUndo')
  const injectedPushCreationUndo = inject<((nodeIds: string[]) => void) | undefined>('pushCreationUndo')
  const injectedPushColorUndo = inject<((colors: Map<string, string | null>) => void) | undefined>('pushColorUndo')
  const injectedPushSizeUndo = inject<((sizes: Map<string, { width: number; height: number; x: number; y: number }>) => void) | undefined>('pushSizeUndo')

  const pushUndo = () => {
    if (injectedPushUndo) {
      injectedPushUndo()
    } else {
      console.warn('pushUndo not provided - undo will not work')
    }
  }

  const pushContentUndo = (nodeId: string, oldContent: string | null, oldTitle: string) => {
    if (injectedPushContentUndo) {
      injectedPushContentUndo(nodeId, oldContent, oldTitle)
    } else {
      console.warn('pushContentUndo not provided - content undo will not work')
    }
  }

  const pushDeletionUndo = (node: Node, edges: Edge[]) => {
    if (injectedPushDeletionUndo) {
      injectedPushDeletionUndo(node, edges)
    } else {
      console.warn('pushDeletionUndo not provided - deletion undo will not work')
    }
  }

  const pushCreationUndo = (nodeIds: string[]) => {
    if (injectedPushCreationUndo) {
      injectedPushCreationUndo(nodeIds)
    } else {
      console.warn('pushCreationUndo not provided - creation undo will not work')
    }
  }

  const pushColorUndo = (colors: Map<string, string | null>) => {
    if (injectedPushColorUndo) {
      injectedPushColorUndo(colors)
    } else {
      console.warn('pushColorUndo not provided - color undo will not work')
    }
  }

  const pushSizeUndo = (sizes: Map<string, { width: number; height: number; x: number; y: number }>) => {
    if (injectedPushSizeUndo) {
      injectedPushSizeUndo(sizes)
    } else {
      console.warn('pushSizeUndo not provided - size undo will not work')
    }
  }

  return {
    pushUndo,
    pushContentUndo,
    pushDeletionUndo,
    pushCreationUndo,
    pushColorUndo,
    pushSizeUndo,
  }
}
