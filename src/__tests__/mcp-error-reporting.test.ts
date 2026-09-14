/**
 * An MCP failure says what actually went wrong.
 *
 * Four ways it did not. The code a handler chose was discarded and re-guessed
 * from the message text. A rejected request was reported as still waiting, and
 * its promise never settled. Requests in flight when the socket closed were
 * left pending for ever. And "not connected" covered three different situations
 * while advising on only one (PRODUCT_DESIGN.md > Reporting MCP errors).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CLIENT = resolve(__dirname, '../../packages/nodus-mcp-server/src/websocket-client.ts')
const SERVER = resolve(__dirname, '../../packages/nodus-mcp-server/src/index.ts')
const HANDLER = resolve(__dirname, '../mcp/messageHandler.ts')

describe('the error code a handler chose', () => {
  const source = readFileSync(HANDLER, 'utf-8')

  it('is used rather than guessed from the message', () => {
    expect(source).toContain('error instanceof McpError')
    expect(source).toContain('createErrorResponse(request.id, error.code, message)')
  })

  it('no longer depends on the message wording', () => {
    expect(source).not.toMatch(/if \(message\.includes\('not found'\)\)/)
  })
})

describe('a connection the user refused', () => {
  const source = readFileSync(CLIENT, 'utf-8')

  // What it carries tells it apart, not how it is worded: a wait names the
  // request it concerns, a refusal names none. The wording was matched instead,
  // so a refusal phrased any other way read as a wait. The rule itself is
  // exercised in mcp-client-connection.test.ts, which drives the logic without
  // a socket; these check that the client acts on it.
  it('is recorded, since the socket stays open and says nothing', () => {
    expect(source).toContain('this.refused = true')
    expect(source).toContain('wasRefused()')
  })

  it('is no longer reported as still waiting for approval', () => {
    const awaiting = source.slice(source.indexOf('isAwaitingApproval(): boolean'))
    expect(awaiting.slice(0, 200)).toContain('!this.refused')
  })

  it('fails the requests that will never be answered', () => {
    const block = source.slice(source.indexOf("case 'refused'"))
    expect(block.slice(0, 300)).toContain('rejectAllPending')
  })
})

describe('requests in flight when the socket closes', () => {
  const source = readFileSync(CLIENT, 'utf-8')

  it('are rejected rather than left pending', () => {
    expect(source).toContain('rejectAllPending')
    // Anchored on the event, not the variable holding the socket: the client
    // names it `socket` now, so that it can tell a superseded one apart
    const closeBlock = source.slice(source.indexOf("on('close'"))
    expect(closeBlock.slice(0, 600)).toContain('rejectAllPending')
  })

  it('clears the pending map, so a reconnect starts clean', () => {
    const helper = source.slice(source.indexOf('private rejectAllPending'))
    expect(helper.slice(0, 400)).toContain('this.pendingRequests.clear()')
  })
})

describe('the not-connected message', () => {
  const source = readFileSync(SERVER, 'utf-8')

  it('distinguishes never reached, dropped, and awaiting approval', () => {
    expect(source).toContain('isAwaitingApproval()')
    expect(source).toContain('hasEverConnected()')
  })

  it('gives advice that suits each state', () => {
    expect(source).toMatch(/Waiting for this connection to be approved/)
    expect(source).toMatch(/connection to Nodus dropped/)
    expect(source).toMatch(/Could not reach Nodus/)
  })
})
