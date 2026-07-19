import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHttpFetch = vi.hoisted(() => vi.fn())
vi.mock('../llm/providers/http', () => ({ httpFetch: mockHttpFetch }))

import { AnthropicProvider } from '../llm/providers/anthropic'

function lastRequestBody(): Record<string, unknown> {
  const call = mockHttpFetch.mock.calls.at(-1)
  return JSON.parse((call![1] as { body: string }).body)
}

// The agent runner appends assistant messages carrying tool_calls and
// role:'tool' results. The Messages API only understands tool_use /
// tool_result content blocks - dropping these messages breaks every agent
// tool loop run against Claude.
describe('AnthropicProvider.chat message conversion', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    mockHttpFetch.mockReset()
    mockHttpFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    })
    provider = new AnthropicProvider()
    provider.configure({ apiKey: 'test-key' })
  })

  it('converts tool_calls and tool results into tool_use/tool_result blocks', async () => {
    await provider.chat({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'create a node' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'create_node', arguments: '{"title":"A"}' },
            },
          ],
        },
        { role: 'tool', content: 'created node A', tool_call_id: 'tc1' },
      ],
    })

    const body = lastRequestBody()
    expect(body.system).toBe('sys')
    expect(body.messages).toEqual([
      { role: 'user', content: 'create a node' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tc1', name: 'create_node', input: { title: 'A' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'created node A' }],
      },
    ])
  })

  it('merges consecutive tool results into a single user turn', async () => {
    await provider.chat({
      messages: [
        { role: 'user', content: 'go' },
        {
          role: 'assistant',
          content: 'doing two things',
          tool_calls: [
            { id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } },
            { id: 'b', type: 'function', function: { name: 'y', arguments: '{}' } },
          ],
        },
        { role: 'tool', content: 'result x', tool_call_id: 'a' },
        { role: 'tool', content: 'result y', tool_call_id: 'b' },
      ],
    })

    const body = lastRequestBody()
    const messages = body.messages as Array<{ role: string; content: unknown }>
    expect(messages).toHaveLength(3)
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'doing two things' },
        { type: 'tool_use', id: 'a', name: 'x', input: {} },
        { type: 'tool_use', id: 'b', name: 'y', input: {} },
      ],
    })
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'a', content: 'result x' },
        { type: 'tool_result', tool_use_id: 'b', content: 'result y' },
      ],
    })
  })
})
