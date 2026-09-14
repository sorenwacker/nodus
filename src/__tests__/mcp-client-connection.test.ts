/**
 * A refusal is recognised by what it carries, and one attempt runs at a time.
 *
 * The refusal was matched against the words "reject", "denied" and "declined",
 * so a refusal phrased any other way read as a wait, and the caller was told it
 * was still waiting for approval for the rest of the session. Nodus sends the
 * refusal with no request id, while a genuine wait names the request it
 * concerns, so the two differ in what they carry
 * (PRODUCT_DESIGN.md > Reporting MCP errors).
 *
 * Each tool call also made its own connection attempt, so with Nodus down ten
 * calls produced ten reconnection chains, each replacing the socket the others
 * held, and a disconnection the application asked for reconnected at once
 * (PRODUCT_DESIGN.md > One connection attempt at a time).
 */
import { describe, it, expect } from 'vitest'
import {
  interpretMessage,
  ConnectionLifecycle,
} from '../../packages/nodus-mcp-server/src/connection'

describe('a message carrying the not-approved code', () => {
  it('is a refusal when it names no request, whatever its wording', () => {
    // What Nodus actually sends: no id, and the socket stays open
    const outcome = interpretMessage({
      id: null,
      error: { code: -32001, message: 'The user said no' },
    })

    expect(outcome.kind).toBe('refused')
  })

  it('is still a refusal when phrased the way it happens to be today', () => {
    const outcome = interpretMessage({
      id: null,
      error: { code: -32001, message: 'Connection rejected by user' },
    })

    expect(outcome.kind).toBe('refused')
  })

  it('is a wait when it names the request it concerns', () => {
    const outcome = interpretMessage({
      id: 7,
      error: { code: -32001, message: 'Connection pending approval' },
    })

    expect(outcome.kind).toBe('awaiting-approval')
  })
})

describe('an ordinary reply', () => {
  it('settles the request it names', () => {
    expect(interpretMessage({ id: 3, result: { ok: true } })).toEqual({
      kind: 'settle',
      id: 3,
      result: { ok: true },
    })
  })

  it('reports an approval and keeps its token', () => {
    expect(interpretMessage({ result: { status: 'approved', token: 't' } })).toEqual({
      kind: 'approved',
      token: 't',
    })
  })
})

describe('connection attempts', () => {
  it('joins one already in flight instead of starting another', () => {
    const lifecycle = new ConnectionLifecycle(10)

    expect(lifecycle.begin()).toBe('start')
    expect(lifecycle.begin(), 'a second caller started its own chain').toBe('join')
  })

  it('starts a fresh attempt once the previous one has settled', () => {
    const lifecycle = new ConnectionLifecycle(10)

    lifecycle.begin()
    lifecycle.failed()

    expect(lifecycle.begin()).toBe('start')
  })

  it('does not reconnect after a disconnection the application asked for', () => {
    const lifecycle = new ConnectionLifecycle(10)
    lifecycle.succeeded()

    lifecycle.closeRequested()

    expect(lifecycle.shouldReconnect(), 'a deliberate disconnect reconnected').toBe(false)
  })

  it('reconnects again once a caller asks for the link', () => {
    const lifecycle = new ConnectionLifecycle(10)
    lifecycle.succeeded()
    lifecycle.closeRequested()

    lifecycle.wanted()

    expect(lifecycle.shouldReconnect()).toBe(true)
  })

  it('still reconnects after a drop, until the budget runs out', () => {
    const lifecycle = new ConnectionLifecycle(2)
    lifecycle.succeeded()

    expect(lifecycle.shouldReconnect()).toBe(true)
    lifecycle.countAttempt()
    lifecycle.countAttempt()
    expect(lifecycle.shouldReconnect()).toBe(false)
  })
})
