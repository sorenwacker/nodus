/**
 * Earlier versions of a node (PRODUCT_DESIGN.md > Node history).
 *
 * The backend keeps a version whenever a write replaces a node's content or
 * title; this module reads them back and makes one current again. A restore
 * is an ordinary write through the store, so it is one undo step, syncs
 * wikilinks and tags, reaches the vault file, and keeps the version it
 * replaces.
 */
import { invoke, isTauri } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import { asOneUndoStep } from './undoRecorder'
import type { NodeVersion } from '../../types'

/** The writes a restore is made of; the store supplies them. */
export interface VersionWriter {
  updateNodeContent: (id: string, content: string, options?: { source?: string }) => Promise<void>
  updateNodeTitle: (id: string, title: string, options?: { source?: string }) => Promise<void>
}

/**
 * A restore names itself to the backend, so the state it replaces is kept even
 * minutes after the edit that made it, when an ordinary write would be
 * coalesced into the last version.
 */
const RESTORE_SOURCE = 'restore'

/** Every kept version of a node, newest first. Empty outside the desktop app. */
export async function getNodeHistory(id: string): Promise<NodeVersion[]> {
  if (!isTauri()) return []
  try {
    return await invoke<NodeVersion[]>('get_node_history', { id })
  } catch (e) {
    storeLogger.error('Failed to load node history:', e)
    return []
  }
}

/** Make `version` the node's current title and content, as one undo step. */
export async function restoreNodeVersion(writer: VersionWriter, version: NodeVersion): Promise<void> {
  await asOneUndoStep(async () => {
    await writer.updateNodeContent(version.node_id, version.markdown_content ?? '', { source: RESTORE_SOURCE })
    await writer.updateNodeTitle(version.node_id, version.title, { source: RESTORE_SOURCE })
  })
}
