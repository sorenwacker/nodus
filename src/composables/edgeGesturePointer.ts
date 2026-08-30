/**
 * Which pointers may drive the window-edge gestures.
 *
 * The edge gestures ask the pointer to rest against a window border and dwell
 * there. That only reads as deliberate when something is steering it, which
 * means a mouse or a trackpad.
 *
 * A pen or a finger cannot express the gesture. Touching near an edge to
 * scroll, or resting a palm while writing, lands in the band and dwells there
 * by accident, and the timelines sheet slid up on its own. Restricting the
 * gesture to a mouse leaves it working where it works and stops it firing
 * where it cannot have been meant - the sheet still opens from the overview
 * button on every device.
 */
export function isEdgeGesturePointer(e: PointerEvent): boolean {
  // An empty pointerType comes from synthetic events in tests and from some
  // older WebKit builds; treating it as a mouse preserves existing behaviour.
  return e.pointerType === 'mouse' || e.pointerType === ''
}
