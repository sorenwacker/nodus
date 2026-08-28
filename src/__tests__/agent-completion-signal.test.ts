/**
 * Whether the agent has finished is something it says, not something inferred
 * from its wording.
 *
 * A run ended when the reply matched words like "created", "done" or
 * "finished" - so a message describing what the model was ABOUT to do ended it
 * with the work undone, and a completion phrased any other way was missed. The
 * project rule is explicit: no regex over natural language
 * (PRODUCT_DESIGN.md > Deciding an agent run has ended).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const AGENT_DIR = resolve(__dirname, '../canvas/composables/agent')

/** Words that were used to guess completion from prose. */
const COMPLETION_WORDS = ['looksComplete', 'now shows|complete', 'done|complete|finished']

describe('the completion signal', () => {
  const files = readdirSync(AGENT_DIR)
    .filter(f => f.endsWith('.ts'))
    .map(f => ({ name: f, text: readFileSync(join(AGENT_DIR, f), 'utf-8') }))

  it('scans the agent composables', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it('is not guessed from the words in a reply', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const word of COMPLETION_WORDS) {
        if (file.text.includes(word)) offenders.push(`${file.name}: ${word}`)
      }
    }

    expect(
      offenders,
      'a reply describing what the model is about to do would end the run'
    ).toEqual([])
  })

  it('comes from the done tool', () => {
    const runner = files.find(f => f.name === 'useAgentRunner.ts')!
    expect(runner.text).toContain('AGENT_DONE:')
  })

  it('asks the model to act before giving up on it', () => {
    // A model that replies with prose is asked once to use a tool, and only
    // then treated as having stopped
    for (const name of ['useAgentRunner.ts', 'useNodeAgent.ts']) {
      const file = files.find(f => f.name === name)!
      expect(file.text, `${name} nudges before ending`).toContain('hasBeenNudged')
    }
  })
})
