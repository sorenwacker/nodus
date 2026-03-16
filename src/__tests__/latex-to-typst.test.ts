import { describe, it, expect } from 'vitest'
import { latexToTypst, hasLatexMath, convertLatexDocument } from '../lib/latex-to-typst'

describe('LaTeX to Typst Converter', () => {
  describe('latexToTypst', () => {
    it('converts fractions', () => {
      expect(latexToTypst('\\frac{a}{b}')).toBe('(a)/(b)')
      expect(latexToTypst('\\frac{x+1}{y-2}')).toBe('(x+1)/(y-2)')
      expect(latexToTypst('\\dfrac{1}{2}')).toBe('(1)/(2)')
    })

    it('converts square roots', () => {
      expect(latexToTypst('\\sqrt{x}')).toBe('sqrt(x)')
      expect(latexToTypst('\\sqrt[3]{x}')).toBe('root(3, x)')
      // Single char superscripts don't need braces in Typst
      expect(latexToTypst('\\sqrt{x^2 + y^2}')).toBe('sqrt(x^2 + y^2)')
    })

    it('converts Greek letters', () => {
      expect(latexToTypst('\\alpha + \\beta')).toBe('alpha + beta')
      expect(latexToTypst('\\Gamma \\Delta')).toBe('Gamma Delta')
      expect(latexToTypst('\\varepsilon')).toBe('epsilon.alt')
    })

    it('converts subscripts and superscripts', () => {
      expect(latexToTypst('x_{i}')).toBe('x_(i)')
      expect(latexToTypst('x^{2}')).toBe('x^(2)')
      expect(latexToTypst('x_{i}^{2}')).toBe('x_(i)^(2)')
    })

    it('converts sum and integral', () => {
      expect(latexToTypst('\\sum_{i=0}^{n}')).toBe('sum_(i=0)^(n)')
      expect(latexToTypst('\\int_{a}^{b}')).toBe('integral_(a)^(b)')
      expect(latexToTypst('\\prod_{i=1}^{n}')).toBe('product_(i=1)^(n)')
    })

    it('converts math symbols', () => {
      expect(latexToTypst('a \\times b')).toBe('a times b')
      expect(latexToTypst('a \\leq b')).toBe('a <= b')
      expect(latexToTypst('a \\rightarrow b')).toBe('a -> b')
      expect(latexToTypst('a \\in A')).toBe('a in A')
    })

    it('converts text in math', () => {
      expect(latexToTypst('\\text{where}')).toBe('"where"')
      expect(latexToTypst('\\mathbf{v}')).toBe('bold(v)')
      expect(latexToTypst('\\mathbb{R}')).toBe('bb(R)')
    })

    it('converts accents', () => {
      expect(latexToTypst('\\hat{x}')).toBe('hat(x)')
      expect(latexToTypst('\\vec{v}')).toBe('arrow(v)')
      expect(latexToTypst('\\bar{x}')).toBe('macron(x)')
    })

    it('converts delimiters', () => {
      expect(latexToTypst('\\left( x \\right)')).toBe('( x )')
      expect(latexToTypst('\\left[ x \\right]')).toBe('[ x ]')
      expect(latexToTypst('\\langle x \\rangle')).toBe('angle.l x angle.r')
    })

    it('converts binomial', () => {
      expect(latexToTypst('\\binom{n}{k}')).toBe('binom(n, k)')
    })

    it('converts function names', () => {
      expect(latexToTypst('\\sin(x)')).toBe('sin(x)')
      expect(latexToTypst('\\log_{2}(x)')).toBe('log_(2)(x)')
      expect(latexToTypst('\\lim_{x \\to 0}')).toBe('lim_(x -> 0)')
    })

    it('handles complex expressions', () => {
      const latex = '\\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}'
      const typst = latexToTypst(latex)
      // Check key parts are converted
      expect(typst).toContain('plus.minus')
      expect(typst).toContain('sqrt')
      expect(typst).toContain('2a')
    })
  })

  describe('hasLatexMath', () => {
    it('detects LaTeX math patterns', () => {
      expect(hasLatexMath('\\frac{1}{2}')).toBe(true)
      expect(hasLatexMath('\\alpha + \\beta')).toBe(true)
      expect(hasLatexMath('\\begin{matrix}')).toBe(true)
      expect(hasLatexMath('\\sum_{i=0}')).toBe(true)
    })

    it('returns false for plain text', () => {
      expect(hasLatexMath('Hello world')).toBe(false)
      expect(hasLatexMath('x + y = z')).toBe(false)
    })
  })

  describe('convertLatexDocument', () => {
    it('converts inline math', () => {
      const input = 'The equation $\\alpha + \\beta$ is important.'
      const output = convertLatexDocument(input)
      expect(output).toBe('The equation $alpha + beta$ is important.')
    })

    it('converts display math', () => {
      const input = 'Consider:\n$$\\frac{a}{b}$$'
      const output = convertLatexDocument(input)
      expect(output).toContain('(a)/(b)')
    })

    it('converts \\[ \\] display math', () => {
      const input = '\\[E = mc^{2}\\]'
      const output = convertLatexDocument(input)
      expect(output).toContain('$ E = mc^(2) $')
    })

    it('converts \\( \\) inline math', () => {
      const input = 'Energy is \\(E = mc^{2}\\).'
      const output = convertLatexDocument(input)
      expect(output).toBe('Energy is $E = mc^(2)$.')
    })

    it('handles mixed content', () => {
      const input = `
# Physics Notes

The famous equation $E = mc^{2}$ shows mass-energy equivalence.

For the quadratic formula:
$$x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}$$

Where $a$, $b$, and $c$ are coefficients.
      `.trim()

      const output = convertLatexDocument(input)
      expect(output).toContain('$E = mc^(2)$')
      expect(output).toContain('plus.minus')
      expect(output).toContain('sqrt')
      expect(output).toContain('$a$')
    })
  })

  describe('Matrix conversion', () => {
    it('converts basic matrix', () => {
      const latex = '\\begin{matrix} a & b \\\\ c & d \\end{matrix}'
      const typst = latexToTypst(latex)
      expect(typst).toBe('mat(a, b; c, d)')
    })

    it('converts pmatrix with parentheses', () => {
      const latex = '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}'
      const typst = latexToTypst(latex)
      expect(typst).toContain('delim: "()"')
    })

    it('converts bmatrix with brackets', () => {
      const latex = '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'
      const typst = latexToTypst(latex)
      expect(typst).toContain('delim: "[]"')
    })
  })

  describe('Cases environment', () => {
    it('converts cases', () => {
      const latex = '\\begin{cases} x & x > 0 \\\\ -x & x \\leq 0 \\end{cases}'
      const typst = latexToTypst(latex)
      expect(typst).toContain('cases(')
    })
  })
})
