/**
 * A superseded node run stops working, rather than stopping its reports.
 *
 * Guarding each write left the loop running: it kept requesting completions,
 * kept executing the tool calls that came back, and its writes to the note went
 * through `ctx.updateContent`, which no guard covered. So a user who asked a
 * second time had the first run's answer written into the note behind the
 * second one (PRODUCT_DESIGN.md > Superseding an agent run).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const chat = vi.fn()
const cancelCurrent = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => []) }))

vi.mock('../llm/queue', () => ({
  llmQueue: {
    chat: (...args: unknown[]) => chat(...args),
    cancelCurrent: () => cancelCurrent(),
    generate: vi.fn(async () => ''),
  },
}))

vi.mock('../lib/storage', () => ({
  llmStorage: {
    getProvider: () => 'test-provider',
    getProviderConfig: () => ({ model: 'test-model' }),
    getChainContextLimit: () => 32000,
    getSearchApiKey: () => '',
  },
}))

vi.mock('../composables/useNotifications', () => ({
  notifications$: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

/** A reply carrying a tool call that was already in flight when the user asked again. */
function replyWritingContent(text: string) {
  return {
    message: {
      role: 'assistant',
      tool_calls: [
        {
          id: 'call-1',
          function: { name: 'update_content', arguments: JSON.stringify({ content: text }) },
        },
      ],
    },
  }
}

function contextFor(nodeId: string) {
  return {
    nodeId,
    nodeTitle: nodeId,
    nodeContent: '',
    connectedNodes: [],
    updateContent: vi.fn(async () => {}),
    updateTitle: vi.fn(async () => {}),
  }
}

describe('a node run that has been superseded', () => {
  beforeEach(() => {
    chat.mockReset()
    cancelCurrent.mockReset()
  })

  it('writes nothing to the note when its reply arrives anyway', async () => {
    const { useNodeAgent } = await import('../canvas/composables/agent/useNodeAgent')
    const agent = useNodeAgent()

    const firstReply = deferred<unknown>()
    // Any request after the first stays in flight for the test's duration
    chat.mockImplementation(() => new Promise(() => {}))
    chat.mockReturnValueOnce(firstReply.promise)

    const first = contextFor('a')
    void agent.run('rewrite this', first)

    // The user asks again before the first reply arrives
    const second = contextFor('a')
    void agent.run('no, do this instead', second)

    // The cancelled request resolves regardless: the tool call was in flight
    firstReply.resolve(replyWritingContent('text from the superseded run'))
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    expect(
      first.updateContent,
      'the superseded run wrote its answer into the note'
    ).not.toHaveBeenCalled()
  })

  it('asks the model nothing further', async () => {
    const { useNodeAgent } = await import('../canvas/composables/agent/useNodeAgent')
    const agent = useNodeAgent()

    const firstReply = deferred<unknown>()
    chat.mockImplementation(() => new Promise(() => {}))
    chat.mockReturnValueOnce(firstReply.promise)

    void agent.run('rewrite this', contextFor('a'))
    void agent.run('no, do this instead', contextFor('a'))
    expect(chat).toHaveBeenCalledTimes(2)

    firstReply.resolve(replyWritingContent('text from the superseded run'))
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    expect(chat, 'the superseded loop asked for another completion').toHaveBeenCalledTimes(2)
  })
})
