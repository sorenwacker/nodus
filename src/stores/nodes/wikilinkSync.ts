/**
 * Keeping wikilink edges in step with a node's text.
 *
 * The backend resolver handles folder path links and `#section` anchors as well
 * as plain titles. The local resolver matches exact titles only, so it is a
 * fallback for running without a backend, never for a backend that failed: it
 * reads the edges the backend created for path links as removed and deletes
 * them (PRODUCT_DESIGN.md > Syncing wikilink edges).
 */
import { invoke, isTauri } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'

/** What happened, so a caller can tell "done" from "not done". */
export type WikilinkSyncOutcome =
  /** The backend resolved and stored the links */
  | 'synced'
  /** No backend is present; the title-only resolver ran instead */
  | 'synced_locally'
  /** A backend is present and failed. Edges are left exactly as they were */
  | 'not_synced'

export interface WikilinkSyncHandlers {
  /** Reload edges into the store after the backend has changed them */
  reloadEdges: () => Promise<void> | void
  /** Title-only resolution, for when no backend exists */
  localFallback: () => Promise<void> | void
}

export async function syncWikilinks(
  nodeId: string,
  _content: string,
  handlers: WikilinkSyncHandlers
): Promise<WikilinkSyncOutcome> {
  // Whether a backend exists is knowable up front. Inferring it from a failed
  // call is what turned an outage into a deletion.
  if (!isTauri()) {
    await handlers.localFallback()
    return 'synced_locally'
  }

  try {
    await invoke<number>('sync_node_wikilinks', { nodeId })
    await handlers.reloadEdges()
    return 'synced'
  } catch (e) {
    // Leave the edges alone. Running the title-only resolver here would delete
    // the ones only the backend resolver can see.
    storeLogger.warn(`Wikilink sync failed for ${nodeId}, edges left unchanged: ${e}`)
    return 'not_synced'
  }
}
