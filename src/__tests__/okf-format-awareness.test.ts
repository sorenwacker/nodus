/**
 * Both agent surfaces state the storage format
 * (PRODUCT_DESIGN.md > Open Knowledge Format).
 *
 * A model that does not know the target format writes content that has to be
 * corrected afterwards, and two surfaces that describe it differently drift.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8')

describe('the in-app agent knows the format', () => {
  const prompts = read('src/llm/prompts.ts')

  it('names OKF in the content and agent prompts', () => {
    expect(prompts).toContain('Open Knowledge Format')
    expect(prompts.match(/Open Knowledge Format/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('tells the model not to author frontmatter itself', () => {
    // Nodus writes it; a model-authored block duplicates it
    expect(prompts.toLowerCase()).toContain('frontmatter')
    expect(prompts).toMatch(/never author it|Nodus adds it|Nodus writes the/)
  })
})

describe('the MCP surface knows the format', () => {
  it('states it in the server instructions', () => {
    const index = read('packages/nodus-mcp-server/src/index.ts')
    expect(index).toContain('instructions')
    expect(index).toContain('Open Knowledge Format')
  })

  it('states it on the content parameter that writes node bodies', () => {
    const tools = read('packages/nodus-mcp-server/src/tools.ts')
    expect(tools).toContain('Open Knowledge Format')
  })
})
