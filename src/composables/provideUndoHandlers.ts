/**
 * Making the undo recorders reachable from any component.
 *
 * Every component that changes something records the step through one of these.
 * Listing the `provide` calls in the root component put nine lines of plumbing
 * in a file already over the size limit, and a recorder added to the undo
 * composable but not provided here silently does nothing - which is how batch
 * content undo came to be missing.
 */
import type { InjectionKey } from 'vue'

/** The recorders a component may ask for by name. */
const HANDLER_NAMES = [
  'pushUndo',
  'pushContentUndo',
  'pushContentsUndo',
  'pushDeletionUndo',
  'pushCreationUndo',
  'pushColorUndo',
  'pushSizeUndo',
  'pushFramePositionUndo',
  'pushFrameAssignmentUndo',
  'pushStorylineNodesUndo',
] as const

type HandlerName = (typeof HANDLER_NAMES)[number]

/** Vue's `provide`, passed in so this is callable from a component's setup. */
type Provide = <T>(key: InjectionKey<T> | string, value: T) => void

export function provideUndoHandlers(
  provide: Provide,
  undoRedo: Partial<Record<HandlerName, unknown>>
): void {
  for (const name of HANDLER_NAMES) {
    const handler = undoRedo[name]
    if (handler) provide(name, handler)
  }
}
