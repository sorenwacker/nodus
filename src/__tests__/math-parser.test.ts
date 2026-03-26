/**
 * Tests for safe math expression parser
 */
import { describe, it, expect } from 'vitest'
import { evalMathExpr } from '../llm/utils'

describe('evalMathExpr', () => {
  describe('basic operations', () => {
    it('evaluates simple addition', () => {
      expect(evalMathExpr('1+2', 0)).toBe('3')
    })

    it('evaluates subtraction', () => {
      expect(evalMathExpr('5-3', 0)).toBe('2')
    })

    it('evaluates multiplication', () => {
      expect(evalMathExpr('3*4', 0)).toBe('12')
    })

    it('evaluates division', () => {
      expect(evalMathExpr('10/2', 0)).toBe('5')
    })

    it('evaluates power with ^', () => {
      expect(evalMathExpr('2^3', 0)).toBe('8')
    })
  })

  describe('variable substitution', () => {
    it('substitutes n with provided value', () => {
      expect(evalMathExpr('n+1', 5)).toBe('6')
    })

    it('substitutes multiple n occurrences', () => {
      expect(evalMathExpr('n*n', 3)).toBe('9')
    })

    it('handles n in complex expressions', () => {
      expect(evalMathExpr('2*n+1', 4)).toBe('9')
    })

    it('handles n with power', () => {
      expect(evalMathExpr('n^2', 5)).toBe('25')
    })
  })

  describe('operator precedence', () => {
    it('respects multiplication before addition', () => {
      expect(evalMathExpr('2+3*4', 0)).toBe('14')
    })

    it('respects parentheses', () => {
      expect(evalMathExpr('(2+3)*4', 0)).toBe('20')
    })

    it('handles nested parentheses', () => {
      expect(evalMathExpr('((2+3)*4)+1', 0)).toBe('21')
    })

    it('respects power precedence', () => {
      expect(evalMathExpr('2*3^2', 0)).toBe('18')
    })
  })

  describe('decimal results', () => {
    it('rounds to 3 decimal places', () => {
      expect(evalMathExpr('10/3', 0)).toBe('3.333')
    })

    it('handles integer division without unnecessary decimals', () => {
      expect(evalMathExpr('10/5', 0)).toBe('2')
    })
  })

  describe('negative numbers', () => {
    it('handles negative result', () => {
      expect(evalMathExpr('3-5', 0)).toBe('-2')
    })

    it('handles negative number in expression', () => {
      expect(evalMathExpr('(-3)*2', 0)).toBe('-6')
    })
  })

  describe('security - rejects unsafe input', () => {
    it('returns original expression for code injection attempts', () => {
      expect(evalMathExpr('alert(1)', 0)).toBe('alert(1)')
    })

    it('returns original expression for function calls', () => {
      expect(evalMathExpr('console.log(1)', 0)).toBe('console.log(1)')
    })

    it('returns original expression for assignment', () => {
      expect(evalMathExpr('x=1', 0)).toBe('x=1')
    })

    it('returns original expression for semicolons', () => {
      expect(evalMathExpr('1;2', 0)).toBe('1;2')
    })

    it('returns original expression for brackets', () => {
      expect(evalMathExpr('[1,2]', 0)).toBe('[1,2]')
    })

    it('returns original expression for braces', () => {
      expect(evalMathExpr('{x:1}', 0)).toBe('{x:1}')
    })

    it('returns original expression for quotes', () => {
      expect(evalMathExpr('"test"', 0)).toBe('"test"')
    })
  })

  describe('edge cases', () => {
    it('handles whitespace', () => {
      expect(evalMathExpr('  2  +  3  ', 0)).toBe('5')
    })

    it('handles expression with only n', () => {
      expect(evalMathExpr('n', 42)).toBe('42')
    })

    it('returns original for malformed expressions', () => {
      expect(evalMathExpr('2+', 0)).toBe('2+')
    })

    it('handles zero division gracefully', () => {
      const result = evalMathExpr('1/0', 0)
      expect(result).toBe('Infinity')
    })
  })
})
