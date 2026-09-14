/**
 * What a message from Nodus means, and when a connection attempt may run.
 *
 * Kept apart from the socket so it can be exercised without one: the client
 * imports `ws`, which belongs to this package alone, so anything importing the
 * client cannot be tested from the application's own suite. That is why the
 * rules here were only ever checked by reading the file as text, and why a
 * refusal that no longer matched the expected wording went unnoticed.
 */

export interface IncomingMessage {
  id?: string | number | null
  result?: unknown
  error?: { code: number; message?: string }
}

/** What the client should do about a message that arrived. */
export type MessageOutcome =
  | { kind: 'approved'; token?: string }
  | { kind: 'awaiting-approval' }
  | { kind: 'refused'; message: string }
  | { kind: 'settle'; id: string | number; error?: string; result?: unknown }
  | { kind: 'ignore' }

/** The code Nodus uses for "not approved", for both a wait and a refusal. */
const NOT_APPROVED = -32001

export function interpretMessage(message: IncomingMessage): MessageOutcome {
  if (message.result && typeof message.result === 'object') {
    const result = message.result as Record<string, unknown>
    if (result.status === 'approved') {
      return {
        kind: 'approved',
        token: typeof result.token === 'string' ? result.token : undefined,
      }
    }
    if (result.status === 'pending_approval') {
      return { kind: 'awaiting-approval' }
    }
  }

  if (message.error?.code === NOT_APPROVED) {
    const text = message.error.message || ''
    // The code alone does not say which of the two this is, but what the
    // message carries does: a wait names the request it concerns, a refusal
    // names none, because it is about the connection rather than any request.
    // Matching the words instead meant a refusal phrased any other way read as
    // a wait (PRODUCT_DESIGN.md > Reporting MCP errors).
    const namesARequest = message.id !== undefined && message.id !== null
    if (namesARequest) return { kind: 'awaiting-approval' }
    return { kind: 'refused', message: text || 'The user refused this connection' }
  }

  if (message.id !== undefined && message.id !== null) {
    return message.error
      ? { kind: 'settle', id: message.id, error: message.error.message }
      : { kind: 'settle', id: message.id, result: message.result }
  }

  return { kind: 'ignore' }
}

/**
 * Whether a connection attempt may start, and whether a closed socket should
 * bring about another one.
 */
export class ConnectionLifecycle {
  private attempts = 0
  private inFlight = false
  private closedOnPurpose = false

  constructor(private readonly maxAttempts: number) {}

  /** Whether the caller should start an attempt, or join one already running. */
  begin(): 'start' | 'join' {
    if (this.inFlight) return 'join'
    this.inFlight = true
    this.closedOnPurpose = false
    return 'start'
  }

  /** A connection succeeded: the retry budget is whole again. */
  succeeded(): void {
    this.inFlight = false
    this.attempts = 0
    this.closedOnPurpose = false
  }

  /** An attempt ended without connecting. */
  failed(): void {
    this.inFlight = false
  }

  /** The application asked for the socket to close. */
  closeRequested(): void {
    this.closedOnPurpose = true
  }

  /**
   * Whether a closed socket should be followed by another attempt.
   *
   * A close the application asked for is not a drop: closing the socket ran the
   * same handler as a lost link, so a deliberate disconnection reconnected at
   * once (PRODUCT_DESIGN.md > One connection attempt at a time).
   */
  shouldReconnect(): boolean {
    if (this.closedOnPurpose) return false
    return this.attempts < this.maxAttempts
  }

  /**
   * A caller explicitly wants the link: a tool call asks for one after a
   * deliberate close, and that request outranks the earlier decision to stop.
   */
  wanted(): void {
    this.closedOnPurpose = false
    this.attempts = 0
  }

  /** Count an attempt against the budget. */
  countAttempt(): number {
    return ++this.attempts
  }
}
