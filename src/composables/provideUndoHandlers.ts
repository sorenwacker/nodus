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
import { setUndoSink, type ContentEntry } from '../stores/nodes/undoRecorder'

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

  // The store records every content change itself, and needs the stack to
  // record into. Connected here rather than at the call site so wiring the
  // handlers and wiring the recorder cannot be done by halves - an unconnected
  // recorder makes undo silently do nothing
  // (PRODUCT_DESIGN.md > Recording an undo step)
  const pushContentsUndo = undoRedo.pushContentsUndo as
    | ((entries: ContentEntry[]) => void)
    | undefined
  setUndoSink(pushContentsUndo ? { pushContentsUndo } : null)
}
