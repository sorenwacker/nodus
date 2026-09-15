/**
 * A reply carrying a tool call the model wrote into its text.
 *
 * Models that cannot emit native calls write them into the message, and they
 * do not agree on how. One writes `call:name(key:value)` with its own string
 * delimiters, which every existing pattern missed, so seven node creations and
 * eight edges arrived in the chat as raw markup
 * (PRODUCT_DESIGN.md > A reply that carries a tool call it could not make).
 */
import { describe, it, expect } from 'vitest'
import { decodeCallSyntax } from '../llm/callSyntax'

/** The shape the model actually sent, shortened. */
const REPLY =
  '<|tool_call>call:create_nodes_batch(nodes:[{content:<|"|>A primary antagonist in DOORS.<|"|>,' +
  'title:<|"|>Seek<|"|>},{content:<|"|>A horror game.<|"|>,title:<|"|>Roblox Doors<|"|>}])<tool_call|>'

describe('a call written in the model own syntax', () => {
  it('is decoded to the tool it names and the arguments it carries', () => {
    const calls = decodeCallSyntax(REPLY)

    expect(calls.length).toBe(1)
    expect(calls[0].name).toBe('create_nodes_batch')
    expect(calls[0].args).toEqual({
      nodes: [
        { content: 'A primary antagonist in DOORS.', title: 'Seek' },
        { content: 'A horror game.', title: 'Roblox Doors' },
      ],
    })
  })

  it('keeps punctuation inside a delimited string', () => {
    // Commas, colons and braces in prose must not be read as structure
    const reply =
      '<|tool_call>call:create_node(title:<|"|>Seek: the chase, in {The Hotel}<|"|>)<tool_call|>'

    expect(decodeCallSyntax(reply)[0].args).toEqual({
      title: 'Seek: the chase, in {The Hotel}',
    })
  })

  it('decodes each call when a reply carries several', () => {
    const reply =
      '<|tool_call>call:create_node(title:<|"|>A<|"|>)<tool_call|>' +
      '<|tool_call>call:create_node(title:<|"|>B<|"|>)<tool_call|>'

    expect(decodeCallSyntax(reply).map(c => c.args.title)).toEqual(['A', 'B'])
  })

  it('reports a malformed call as unusable rather than guessing', () => {
    // The model repeated a key: its own error, not something to interpret
    const reply = '<|tool_call>call:create_node(title:title:<|"|>The Mines<|"|>)<tool_call|>'

    expect(decodeCallSyntax(reply)).toEqual([])
  })

  it('finds nothing in a reply that is genuinely an answer', () => {
    expect(decodeCallSyntax('I created seven nodes about Seek and connected them.')).toEqual([])
  })
})
