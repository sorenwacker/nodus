/**
 * Model side of smart layout: the order of kinds, and the parent of nodes
 * the graph leaves a choice for (features.md > Smart Layout).
 */
import type { LLMQueueInterface } from './types'

/** Nodes per parent-choice request */
const CHOICE_BATCH = 80

export interface ParentChoice {
  id: string
  title: string
  /** Most specific first */
  candidates: Array<{ id: string; title: string }>
}

/**
 * Order kinds from broad to specific.
 *
 * Kinds the model leaves out keep their given order after the ones it named.
 */
export async function orderKinds(
  kinds: Array<{ kind: string; examples: string[] }>,
  instruction: string,
  llm: LLMQueueInterface,
  log?: (message: string) => void
): Promise<string[]> {
  const names = kinds.map(k => k.kind)
  if (names.length < 2) return names
  const listing = kinds.map(k => `- ${k.kind}: ${k.examples.slice(0, 4).join('; ')}`).join('\n')
  const prompt = `These kinds of notes form a knowledge graph. Order the kinds from broadest (top of a hierarchy) to most specific.${instruction ? ` The user asks: ${instruction}.` : ''}

${listing}

Respond with ONLY the kind names, broadest first, separated by commas:`
  const response = (await llm.generate(prompt)) || ''
  const named = response.toLowerCase().split(/[,\n]+/).map(s => s.trim()).filter(s => names.includes(s))
  const order = [...new Set(named), ...names.filter(n => !named.includes(n))]
  log?.(`> Kinds, broad to specific: ${order.join(' > ')}`)
  return order
}

/**
 * Let the model pick each node's parent among its candidates, many nodes per
 * request. An unusable answer keeps the first, most specific candidate.
 */
export async function chooseParents(
  choices: ParentChoice[],
  instruction: string,
  llm: LLMQueueInterface,
  log?: (message: string) => void
): Promise<Map<string, string>> {
  const parents = new Map(choices.map(c => [c.id, c.candidates[0].id]))
  for (let start = 0; start < choices.length; start += CHOICE_BATCH) {
    const batch = choices.slice(start, start + CHOICE_BATCH)
    log?.(`> Choosing parents for ${start + batch.length}/${choices.length} nodes`)
    const listing = batch
      .map((c, i) => `${i + 1}. "${c.title}" under: ${c.candidates.map((p, j) => `${letter(j)}) "${p.title}"`).join(' ')}`)
      .join('\n')
    const prompt = `For each note, choose the option it belongs under in a hierarchy. Prefer the most specific option that fits.${instruction ? ` The user asks: ${instruction}.` : ''}

${listing}

Respond with ONLY one line per note, like:
1: a
2: c`
    const response = (await llm.generate(prompt)) || ''
    for (const line of response.split('\n')) {
      const m = line.trim().match(/^(\d+)\s*[:.)-]\s*\(?([a-z])\)?/i)
      if (!m) continue
      const choice = batch[parseInt(m[1]) - 1]
      const pick = choice?.candidates[m[2].toLowerCase().charCodeAt(0) - 97]
      if (pick) parents.set(choice.id, pick.id)
    }
  }
  return parents
}

function letter(i: number): string {
  return String.fromCharCode(97 + (i % 26))
}
