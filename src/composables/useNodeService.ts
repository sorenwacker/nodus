/**
 * useNodeService composable
 *
 * Provides access to the NodeService instance for components
 * that need to delete or move nodes with undo support.
 */

import { inject } from 'vue'
import type { NodeService } from '../services/nodeService'

/**
 * Symbol key for NodeService injection
 */
export const NODE_SERVICE_KEY = Symbol('nodeService')

/**
 * Inject the NodeService from the parent component tree.
 * Returns null if not provided (with console warning).
 */
export function useNodeService(): NodeService | null {
  const service = inject<NodeService | null>(NODE_SERVICE_KEY, null)

  if (!service) {
    console.warn(
      '[useNodeService] NodeService not provided. ' +
      'Undo will not work for node deletions/moves. ' +
      'Make sure App.vue provides the service.'
    )
  }

  return service
}
