/**
 * The agent bar's chat transcript (PRODUCT_DESIGN.md > Local LLM Agent):
 * the visible record of prompts, full answers, and a per-turn summary of the
 * actions the agent took.
 */
import { describe, it, expect } from 'vitest'
import {
  appendUserTurn,
  appendAssistantText,
  recordAction,
  failCurrentTurn,
  type ChatTurn,
} from '../llm/chatTranscript'

describe('chat transcript', () => {
  it('records a user prompt as its own turn', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'cluster these nodes')

    expect(turns).toHaveLength(1)
    expect(turns[0].role).toBe('user')
    expect(turns[0].text).toBe('cluster these nodes')
  })

  it('keeps the assistant answer in full rather than truncating it', () => {
    const turns: ChatTurn[] = []
    const long = 'x'.repeat(500)
    appendUserTurn(turns, 'summarize')
    appendAssistantText(turns, long)

    expect(turns[1].text).toBe(long)
    expect(turns[1].text).not.toContain('...')
  })

  it('attaches actions to the assistant turn they belong to', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'build a graph')
    recordAction(turns, 'create_node')
    recordAction(turns, 'create_edge')
    appendAssistantText(turns, 'Created two nodes and linked them.')

    expect(turns).toHaveLength(2)
    expect(turns[1].role).toBe('assistant')
    expect(turns[1].actions).toEqual(['create_node', 'create_edge'])
  })

  it('starts a fresh assistant turn for the next exchange', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'first')
    recordAction(turns, 'create_node')
    appendAssistantText(turns, 'done one')
    appendUserTurn(turns, 'second')
    appendAssistantText(turns, 'done two')

    expect(turns.map(t => t.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(turns[3].actions).toEqual([])
  })

  it('merges consecutive assistant text into the same turn', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'think out loud')
    appendAssistantText(turns, 'First thought.')
    appendAssistantText(turns, 'Second thought.')

    expect(turns).toHaveLength(2)
    expect(turns[1].text).toBe('First thought.\n\nSecond thought.')
  })

  it('ignores empty or whitespace-only assistant text', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'hi')
    appendAssistantText(turns, '   ')
    appendAssistantText(turns, '')

    expect(turns).toHaveLength(1)
  })

  it('marks a failed run so the transcript does not end mid-thought', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'do something')
    recordAction(turns, 'create_node')
    failCurrentTurn(turns, 'Model request failed')

    expect(turns[1].role).toBe('assistant')
    expect(turns[1].status).toBe('error')
    expect(turns[1].text).toContain('Model request failed')
    expect(turns[1].actions).toEqual(['create_node'])
  })

  it('gives every turn a distinct id for keyed rendering', () => {
    const turns: ChatTurn[] = []
    appendUserTurn(turns, 'a')
    appendAssistantText(turns, 'b')
    appendUserTurn(turns, 'c')

    expect(new Set(turns.map(t => t.id)).size).toBe(turns.length)
  })
})
