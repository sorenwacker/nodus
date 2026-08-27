/**
 * The slice of the node store that frame interactions need.
 *
 * `useFrames` depends on this shape rather than on the store itself, so the
 * canvas supplies the collaborator instead of the composable reaching for it.
 * Written out inline in the canvas component, it was 26 lines of plumbing in a
 * file already well over the size limit.
 */
import type { useNodesStore } from '../../../stores/nodes'
import type { UseFramesOptions } from './useFrames'

type NodesStore = ReturnType<typeof useNodesStore>

/** Reads stay live: the getters read through to the store on every access. */
export function framesStoreAdapter(store: NodesStore): UseFramesOptions['store'] {
  return {
    get frames() {
      return store.frames
    },
    get filteredNodes() {
      return store.filteredNodes
    },
    get selectedNodeIds() {
      return store.selectedNodeIds
    },
    get selectedFrameId() {
      return store.selectedFrameId
    },
    selectFrame: store.selectFrame,
    selectNode: store.selectNode,
    createFrame: store.createFrame,
    deleteFrame: store.deleteFrame,
    updateFramePosition: store.updateFramePosition,
    persistFramePosition: store.persistFramePosition,
    updateFrameSize: store.updateFrameSize,
    persistFrameSize: store.persistFrameSize,
    updateFrameTitle: store.updateFrameTitle,
    updateNodePosition: store.updateNodePosition,
    persistNodePosition: store.persistNodePosition,
    assignNodesToFrame: store.assignNodesToFrame,
  }
}
