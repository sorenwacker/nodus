/**
 * A tool call written into the reply text takes the same path as a native one.
 *
 * Models that cannot emit native calls write them as fenced JSON. That text was
 * executed directly, skipping the mode allow-list - so a plan-mode model could
 * run a mutating tool the request had stripped - and skipping the log and the
 * transcript, so the call happened with no line saying it had
 * (PRODUCT_DESIGN.md > One path for a tool call).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

function toolNamed(name: string): ToolDefinition {
  return {
    type: 'function',
    function: { name, description: name, parameters: { type: 'object', properties: {} } },
  } as unknown as ToolDefinition
}

function makeContext(executeAgentTool: (name: string, args: Record<string, unknown>) => Promise<string>) {
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
    transcript: ref([]),
    // create_node is absent from the plan-mode whitelist; think is in it
    agentTools: [toolNamed('create_node'), toolNamed('think')],
    executeAgentTool,
  }
}

/** A reply whose text carries a tool call, as models without native calls write them. */
function replyEmbedding(name: string, args: Record<string, unknown>) {
  return {
    message: {
      role: 'assistant',
      content: '```json\n' + JSON.stringify({ name, arguments: args }) + '\n```',
    },
  }
}

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0))
}

describe('a tool call recovered from the reply text', () => {
  beforeEach(() => {
    chat.mockReset()
  })

  it('is refused when the mode does not offer that tool', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const executed: string[] = []
    const ctx = makeContext(async name => {
      executed.push(name)
      return 'done'
    })
    const runner = useAgentRunner(ctx as never)

    chat.mockImplementation(() => new Promise(() => {}))
    chat.mockReturnValueOnce(Promise.resolve(replyEmbedding('create_node', { title: 'Smuggled' })))

    void runner.run('research this')
    await settle()

    expect(executed, 'a plan-mode model reached a tool the request had stripped').not.toContain(
      'create_node'
    )
    expect(ctx.log.value.join('\n')).toContain('create_node')
  })

  it('runs, logs and records a tool the mode does offer', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const executed: string[] = []
    const ctx = makeContext(async name => {
      executed.push(name)
      return 'Thought recorded'
    })
    const runner = useAgentRunner(ctx as never)

    chat.mockImplementation(() => new Promise(() => {}))
    chat.mockReturnValueOnce(Promise.resolve(replyEmbedding('think', { thought: 'a plan' })))

    void runner.run('research this')
    await settle()

    expect(executed).toContain('think')
    expect(ctx.log.value.join('\n'), 'the log never said the call happened').toContain('think(')
    expect(
      ctx.transcript.value.some((t: { actions?: string[] }) => t.actions?.includes('think')),
      'the transcript did not record the action'
    ).toBe(true)
  })

  it('does not also file the call as prose in the transcript', async () => {
    const { useAgentRunner } = await import('../canvas/composables/agent/useAgentRunner')
    const ctx = makeContext(async () => 'Thought recorded')
    const runner = useAgentRunner(ctx as never)

    chat.mockImplementation(() => new Promise(() => {}))
    chat.mockReturnValueOnce(Promise.resolve(replyEmbedding('think', { thought: 'a plan' })))

    void runner.run('research this')
    await settle()

    const prose = ctx.transcript.value.map((t: { text?: string }) => t.text || '').join('\n')
    expect(prose, 'the raw tool JSON was shown to the user as an answer').not.toContain('"name"')
  })
})
