import { describe, it, expect, vi } from 'vitest'
import {
  formatMathToTypst,
  TYPST_FORMAT_SYSTEM_PROMPT,
  TYPST_MATH_FORMAT,
} from '../llm/typstFormat'

describe('formatMathToTypst', () => {
  it('sends the content and a Typst-aware system prompt to the model', async () => {
    const generate = vi.fn().mockResolvedValue('Energy is $E = m c^2$.')
    const out = await formatMathToTypst('Energy is \\(E = mc^2\\).', generate)

    expect(generate).toHaveBeenCalledTimes(1)
    const [prompt, system] = generate.mock.calls[0]
    expect(prompt).toBe('Energy is \\(E = mc^2\\).')
    expect(system).toBe(TYPST_FORMAT_SYSTEM_PROMPT)
    // The model is informed about the target format.
    expect(system).toContain('Typst')
    expect(out).toBe('Energy is $E = m c^2$.')
  })

  it('does not call the model for empty content', async () => {
    const generate = vi.fn()
    expect(await formatMathToTypst('', generate)).toBe('')
    expect(await formatMathToTypst('   \n ', generate)).toBe('   \n ')
    expect(generate).not.toHaveBeenCalled()
  })

  it('strips a surrounding markdown code fence from the model output', async () => {
    const generate = vi.fn().mockResolvedValue('```typst\nSee $a/b$ here.\n```')
    expect(await formatMathToTypst('See \\frac{a}{b} here.', generate)).toBe('See $a/b$ here.')
  })

  it('keeps the original content when the model returns nothing usable', async () => {
    const generate = vi.fn().mockResolvedValue('   ')
    expect(await formatMathToTypst('original $x$', generate)).toBe('original $x$')
  })

  it('exposes the Typst syntax reference used in the prompt', () => {
    expect(TYPST_FORMAT_SYSTEM_PROMPT).toContain(TYPST_MATH_FORMAT)
    expect(TYPST_MATH_FORMAT).toContain('sqrt(x)')
    expect(TYPST_MATH_FORMAT).toContain('mat(1, 2; 3, 4)')
  })
})
