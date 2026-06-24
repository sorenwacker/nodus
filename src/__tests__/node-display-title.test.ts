import { describe, it, expect } from 'vitest'
import { nodeDisplayTitle } from '../canvas/utils/nodeDisplayTitle'

describe('nodeDisplayTitle', () => {
  it('uses an explicit title when present', () => {
    expect(nodeDisplayTitle({ title: 'My Note', markdown_content: '# Other' })).toBe('My Note')
  })

  it('derives an ad-hoc title from the first content line when there is no title', () => {
    expect(nodeDisplayTitle({ title: '', markdown_content: '# Heading\n\nbody' })).toBe('Heading')
    expect(nodeDisplayTitle({ title: null, markdown_content: '**Bold intro**\nmore' })).toBe('Bold intro')
    expect(nodeDisplayTitle({ markdown_content: 'plain first line' })).toBe('plain first line')
  })

  it('treats a whitespace-only title as no title', () => {
    expect(nodeDisplayTitle({ title: '   ', markdown_content: 'derived' })).toBe('derived')
  })

  it('truncates long ad-hoc titles', () => {
    const long = 'x'.repeat(80)
    const out = nodeDisplayTitle({ markdown_content: long })
    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBe(50)
  })

  it('falls back to the untitled label only when there is nothing', () => {
    expect(nodeDisplayTitle({ title: '', markdown_content: '' }, 'Untitled')).toBe('Untitled')
    expect(nodeDisplayTitle(null, 'Nada')).toBe('Nada')
  })
})
