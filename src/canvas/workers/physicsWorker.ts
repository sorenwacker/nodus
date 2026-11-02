/**
 * Runs the physics mode simulation off the main thread
 * (PRODUCT_DESIGN.md > Physics Mode).
 */
import { handlePhysicsMessage } from '../composables/layout/physicsEngine'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: unknown, transfer: Transferable[]) => void
}

scope.onmessage = event => {
  const reply = handlePhysicsMessage(event.data)
  // The centres are handed over, not copied
  if (reply) scope.postMessage(reply, [reply.xy.buffer])
}
