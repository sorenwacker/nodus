import { describe, it, expect } from 'vitest'
import {
  extractFrontmatterDate,
  parseHistoricalDate,
  formatYear,
} from '../lib/timelineDates'

describe('extractFrontmatterDate', () => {
  it('reads the date field from a frontmatter block', () => {
    expect(extractFrontmatterDate('---\ntitle: X\ndate: 20 BC\n---\nBody')).toBe('20 BC')
    expect(extractFrontmatterDate('---\ndate: "1969-07-20"\n---\nBody')).toBe('1969-07-20')
  })

  it('returns null without frontmatter or date', () => {
    expect(extractFrontmatterDate('plain content')).toBeNull()
    expect(extractFrontmatterDate('---\ntitle: X\n---\nBody')).toBeNull()
  })
})

describe('parseHistoricalDate', () => {
  it('parses BC and BCE years as negative', () => {
    expect(parseHistoricalDate('20 BC')).toBe(-20)
    expect(parseHistoricalDate('44 BCE')).toBe(-44)
  })

  it('parses AD/CE and plain years', () => {
    expect(parseHistoricalDate('79 AD')).toBe(79)
    expect(parseHistoricalDate('AD 79')).toBe(79)
    expect(parseHistoricalDate('79 CE')).toBe(79)
    expect(parseHistoricalDate('1969')).toBe(1969)
    expect(parseHistoricalDate('-20')).toBe(-20)
  })

  it('parses ISO dates with sub-year precision', () => {
    const y = parseHistoricalDate('1969-07-20')
    expect(y).toBeGreaterThan(1969.4)
    expect(y).toBeLessThan(1969.6)
  })

  it('returns null for unparseable input', () => {
    expect(parseHistoricalDate('sometime later')).toBeNull()
    expect(parseHistoricalDate(null)).toBeNull()
  })
})

describe('formatYear', () => {
  it('formats negative years as BC', () => {
    expect(formatYear(-20)).toBe('20 BC')
    expect(formatYear(1969.55)).toBe('1970')
    expect(formatYear(1500)).toBe('1500')
  })
})
