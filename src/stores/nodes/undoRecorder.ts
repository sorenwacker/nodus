/**
 * Recording undo steps where the writes happen.
 *
 * Undo used to be opt-in at every call site: each writer had to remember to
 * call `pushContentUndo` before changing content. Writers kept forgetting - the
 * batch tools recorded nothing, the inline date editor recorded nothing, and an
 * agent rewriting a node recorded nothing - and each omission was found only
 * when a user pressed undo and nothing happened.
 *
 * The store is the one place every write passes through, so recording belongs
 * here. A caller cannot opt in, and therefore cannot forget
 * (PRODUCT_DESIGN.md > Recording an undo step).
 */

export interface ContentEntry {
  nodeId: string
  content: string | null
  title: string
}

/** What the recorder needs from the undo stack. */
export interface UndoSink {
  /** Record several nodes' prior content as one step */
  pushContentsUndo: (entries: ContentEntry[]) => void
}

let sink: UndoSink | null = null

/**
 * Depth of nested groups. While greater than zero, entries accumulate instead
 * of being recorded one at a time, so a batch of 300 writes is one undo step
 * rather than 300.
 */
let groupDepth = 0
let grouped: ContentEntry[] = []

/** Ids already recorded in the current group, so a node's ORIGINAL state wins */
let groupedIds = new Set<string>()

/**
 * Supply the undo stack. Called once when the application composes its stores;
 * without it, recording is a no-op and undo does nothing - which is why this
 * has a gate rather than a warning.
 */
export function setUndoSink(next: UndoSink | null): void {
  sink = next
}

/**
 * Record a node's state before it is changed.
 *
 * Call with the values as they are NOW, before writing. Inside a group the
 * first recording for a node wins, because that is the state undo must return
 * to however many times the node is written during the group.
 */
export function recordContentBefore(entry: ContentEntry): void {
  if (!sink) return

  if (groupDepth > 0) {
    if (!groupedIds.has(entry.nodeId)) {
      groupedIds.add(entry.nodeId)
      grouped.push(entry)
    }
    return
  }

  sink.pushContentsUndo([entry])
}

/**
 * Run `work` so that every content change inside it is one undo step.
 *
 * Nested groups join the outermost one, so a tool that groups internally still
 * produces a single step when called from a batch.
 */
export async function asOneUndoStep<T>(work: () => Promise<T>): Promise<T> {
  groupDepth++
  try {
    return await work()
  } finally {
    groupDepth--
    if (groupDepth === 0) {
      const entries = grouped
      grouped = []
      groupedIds = new Set()
      if (entries.length > 0) sink?.pushContentsUndo(entries)
    }
  }
}

/** Discard any group in progress. For tests, and for a run that was abandoned. */
export function resetUndoRecorder(): void {
  groupDepth = 0
  grouped = []
  groupedIds = new Set()
}
