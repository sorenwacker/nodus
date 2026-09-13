/**
 * A schema describes what the handler actually reads.
 *
 * `create_nodes_batch` declared an array of strings and read `title` and
 * `content` off each element, so a model that followed the schema produced a
 * batch of untitled, empty nodes. `batch_update` carried `items` as a sibling
 * of `updates`: the element type written one level too high, which declares a
 * parameter that does not exist and leaves the real array undeclared
 * (PRODUCT_DESIGN.md > Declaring a tool's parameters).
 *
 * These read the registered definitions rather than the source text. The text
 * scan that preceded them accepted the misplaced `items`, because it only
 * looked for the word within a few lines of the array.
 */
import { describe, it, expect } from 'vitest'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'

registerCoreTools()

/** Keywords of the schema language: never the name of a parameter. */
const SCHEMA_KEYWORDS = ['items', 'type', 'properties', 'required']

type Schema = { type?: string; items?: { type?: string }; properties?: Record<string, unknown> }

function definitions() {
  return toolRegistry.getToolDefinitions()
}

describe('registered tool schemas', () => {
  it('scans the registered tools', () => {
    expect(definitions().length).toBeGreaterThan(20)
  })

  it('declares an element type inside every array parameter', () => {
    const offenders: string[] = []
    for (const { function: fn } of definitions()) {
      const properties = (fn.parameters?.properties || {}) as Record<string, Schema>
      for (const [name, schema] of Object.entries(properties)) {
        if (schema?.type === 'array' && !schema.items?.type) {
          offenders.push(`${fn.name}.${name}`)
        }
      }
    }

    expect(offenders, 'the model is left guessing what an element looks like').toEqual([])
  })

  it('names no parameter after a keyword of the schema language', () => {
    const offenders: string[] = []
    for (const { function: fn } of definitions()) {
      const properties = (fn.parameters?.properties || {}) as Record<string, Schema>
      for (const name of Object.keys(properties)) {
        if (SCHEMA_KEYWORDS.includes(name)) offenders.push(`${fn.name}.${name}`)
      }
    }

    expect(offenders, 'an element type written one level too high').toEqual([])
  })

  it('declares object elements where the handler reads fields off them', () => {
    const byName = new Map(definitions().map(d => [d.function.name, d.function]))

    for (const name of ['create_nodes_batch', 'batch_update']) {
      const fn = byName.get(name)!
      const arrayParam = Object.values((fn.parameters?.properties || {}) as Record<string, Schema>)
        .find(s => s?.type === 'array')

      expect(arrayParam?.items?.type, `${name} reads fields off each element`).toBe('object')
    }
  })
})
