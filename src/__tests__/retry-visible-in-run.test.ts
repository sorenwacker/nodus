/**
 * A retried provider failure is visible in the run
 * (PRODUCT_DESIGN.md > Retrying a provider failure).
 *
 * The retries were written to the browser console only, so three gateway
 * timeouts in a row reached the user as one final error, indistinguishable
 * from a crash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import type { ToolDefinition } from '../llm/types'

const chat = vi.fn()
vi.mock('../llm/queue', () => ({
  llmQueue: {
    chat: (...args: unknown[]) => chat(...args),
    cancelCurrent: vi.fn(),
    generate: vi.fn(async () => ''),
  },
}))
vi.mock('../lib/storage', () => ({
  llmStorage: { getAgentPrompt: (fallback: string) => fallback },
  agentMemoryStorage: { getAgentMemory: () => ({ session: null, stack: [], facts: [] }) },
}))

const doneTool: ToolDefinition = {
  type: 'function',
  function: { name: 'done', description: 'done', parameters: { type: 'object', properties: {} } },
} as unknown as ToolDefinition

function makeContext() {
  return {
    filteredNodes: () => [],
    filteredEdges: () => [],
    cleanupOrphanEdges: () => {},
    workspaceId: () => 'workspace-1',
    selectedNodeIds: () => [],
    model: ref('test-model'),
    contextLength: ref(8192),
    getProviderId: () => 'test-provider',
    isRunning: ref(false),
    log: ref<string[]>([]),
    tasks: ref([]),
    conversationHistory: ref([]),
    transcript: ref<Array<{ role: string; actions: string[]; text: string }>>([]),
    agentTools: [doneTool],
    executeAgentTool: async () => 'AGENT_DONE:A FIP records choices.',
  }
}

async function settle() {
  for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0))
}

describe('a retry during a run', () => {
  beforeEach(() => {
    chat.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('is written to the transcript turn and the log, naming the failure and the wait', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext()
    const runner = useAgentRunner(ctx as never)

    chat.mockImplementation(async (_messages: unknown, _tools: unknown, options?: { onRetry?: (attempt: number, error: Error, delayMs: number) => void }) => {
      options?.onRetry?.(1, new Error('API error 504: the gateway timed out waiting for the model'), 15_200)
      return {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 't1', type: 'function', function: { name: 'done', arguments: '{"summary":"A FIP records choices."}' } }],
        },
      }
    })

    void runner.run('what is a FIP for?')
    await settle()

    const assistant = ctx.transcript.value.find(t => t.role === 'assistant')
    expect(assistant?.actions.join('\n')).toMatch(/504.*retry.*15 s|retry.*15 s.*504/i)
    expect(ctx.log.value.join('\n')).toMatch(/504[\s\S]*retrying in 15 s/i)
    expect(assistant?.text).toContain('A FIP records choices.')
  })
})

describe('a request failure that ends the run', () => {
  beforeEach(() => {
    chat.mockReset()
  })

  it('says how many attempts were made and how long they took', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext()
    const runner = useAgentRunner(ctx as never)
    const gateway = new Error('API error 504: the gateway timed out waiting for the model')

    chat.mockImplementation(async (_m: unknown, _t: unknown, options?: { onRetry?: (attempt: number, error: Error, delayMs: number) => void }) => {
      options?.onRetry?.(1, gateway, 5_000)
      options?.onRetry?.(2, gateway, 15_000)
      throw gateway
    })

    void runner.run('what is a FIP for?')
    await settle()

    const assistant = ctx.transcript.value.find(t => t.role === 'assistant')
    expect(assistant?.text).toMatch(/504.*after 3 attempts over \d+ s/)
    expect(ctx.log.value.join('\n')).toMatch(/after 3 attempts over \d+ s/)
  })

  it('says when the first attempt was the only one', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext()
    const runner = useAgentRunner(ctx as never)
    chat.mockRejectedValue(new Error('API error 401: invalid api key'))

    void runner.run('what is a FIP for?')
    await settle()

    const assistant = ctx.transcript.value.find(t => t.role === 'assistant')
    expect(assistant?.text).toMatch(/401.*on the first attempt, after \d+ s/)
  })

  it('does not annotate a stop', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext()
    const runner = useAgentRunner(ctx as never)
    chat.mockRejectedValue(new Error('Cancelled'))

    void runner.run('what is a FIP for?')
    await settle()

    const assistant = ctx.transcript.value.find(t => t.role === 'assistant')
    expect(assistant?.text).toContain('Stopped')
    expect(assistant?.text).not.toMatch(/attempt/)
  })
})
