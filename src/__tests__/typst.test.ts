import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/lib/tauri before importing useTypst
vi.mock('@/lib/tauri', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Mock: No backend')),
  isTauri: vi.fn().mockReturnValue(false),
}))

// Mock the typst.ts module since WASM doesn't run in Node
vi.mock('@myriaddreamin/typst.ts', () => ({
  $typst: {
    svg: vi.fn().mockResolvedValue('<svg>mock</svg>'),
  },
}))

import { hasMath, hasTypstBlock } from '../composables/useTypst'

describe('useTypst', () => {
  describe('hasMath', () => {
    it('detects inline math $...$', () => {
      expect(hasMath('The formula is $E = mc^2$')).toBe(true)
      expect(hasMath('$x + y$')).toBe(true)
    })

    it('detects display math $$...$$', () => {
      expect(hasMath('$$\\int_0^1 f(x) dx$$')).toBe(true)
    })

    it('returns false for no math', () => {
      expect(hasMath('Plain text')).toBe(false)
      expect(hasMath('Price is 5 dollars')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(hasMath('')).toBe(false)
    })
  })

  describe('hasTypstBlock', () => {
    it('detects typst code blocks', () => {
      const content = '```typst\n#table(columns: 2)\n```'
      expect(hasTypstBlock(content)).toBe(true)
    })

    it('returns false for other code blocks', () => {
      const content = '```javascript\nconst x = 1\n```'
      expect(hasTypstBlock(content)).toBe(false)
    })

    it('returns false for no code blocks', () => {
      expect(hasTypstBlock('Plain text')).toBe(false)
    })
  })

  describe('math patterns', () => {
    const testCases = [
      { input: '$a^2 + b^2 = c^2$', expected: true },
      { input: '$\\frac{1}{2}$', expected: true },
      { input: '$$\\sum_{i=1}^{n} i$$', expected: true },
      { input: 'Price: $50', expected: false }, // Single $ is not math
      { input: 'Cost $100 and $200', expected: true }, // Matches $100 and $200$ as potential math
      { input: '$x$ and $y$', expected: true },
      { input: 'Text with $inline$ math', expected: true },
    ]

    testCases.forEach(({ input, expected }) => {
      it(`"${input}" should ${expected ? 'have' : 'not have'} math`, () => {
        expect(hasMath(input)).toBe(expected)
      })
    })
  })
})

describe('Typst integration scenarios', () => {
  it('should handle academic content with equations', () => {
    const academicContent = `
# Research Notes

The Schrödinger equation is $i\\hbar\\frac{\\partial}{\\partial t}\\Psi = H\\Psi$

For the harmonic oscillator:
$$E_n = \\hbar\\omega(n + \\frac{1}{2})$$

Where $n = 0, 1, 2, ...$
    `
    expect(hasMath(academicContent)).toBe(true)
  })

  it('should handle markdown with math mixed', () => {
    const mixedContent = `
## Theorem

If $f$ is continuous on $[a,b]$, then:

$$\\int_a^b f(x)dx = F(b) - F(a)$$

**Proof:** By the fundamental theorem of calculus.
    `
    expect(hasMath(mixedContent)).toBe(true)
  })

  it('should handle Typst-specific syntax', () => {
    const typstContent = `
\`\`\`typst
#table(
  columns: (1fr, 1fr),
  [Name], [Value],
  [Alpha], [$alpha$],
  [Beta], [$beta$],
)
\`\`\`
    `
    expect(hasTypstBlock(typstContent)).toBe(true)
  })
})
