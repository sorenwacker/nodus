import { describe, it, expect } from 'vitest'
import {
  extractFrontmatterDate,
  extractFrontmatterField,
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

  it('reads arbitrary fields such as date_end for time spans', () => {
    const content = '---\ndate: 800\ndate_end: 1800\n---\nBody'
    expect(extractFrontmatterField(content, 'date')).toBe('800')
    expect(extractFrontmatterField(content, 'date_end')).toBe('1800')
    expect(extractFrontmatterField(content, 'missing')).toBeNull()
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

describe('buildBrokenAxis', () => {
  it('keeps one segment when values are evenly spread', async () => {
    const { buildBrokenAxis } = await import('../lib/timelineDates')
    const segments = buildBrokenAxis([0, 25, 50, 75, 100], 0, 900)
    expect(segments.length).toBe(1)
    expect(segments[0].x1).toBe(0)
    expect(segments[0].x2).toBe(900)
  })

  it('abbreviates a large empty gap into a fixed break', async () => {
    const { buildBrokenAxis, axisX } = await import('../lib/timelineDates')
    // Two tight clusters 1900 years apart
    const segments = buildBrokenAxis([-20, -10, 1880, 1900], 0, 900, { gapWidth: 32 })
    expect(segments.length).toBe(2)
    // The pixel gap between the clusters is the fixed break, not ~880px
    expect(segments[1].x1 - segments[0].x2).toBe(32)
    // Ordering is preserved across the break
    expect(axisX(segments, -15)).toBeLessThan(axisX(segments, 1890))
  })

  it('clamps out-of-segment values into the nearest segment edge', async () => {
    const { buildBrokenAxis, axisX } = await import('../lib/timelineDates')
    const segments = buildBrokenAxis([0, 10, 1000, 1010], 0, 900)
    const gapValue = axisX(segments, 500) // inside the abbreviated gap
    expect(gapValue).toBeGreaterThanOrEqual(segments[0].x2 - 1)
    expect(gapValue).toBeLessThanOrEqual(segments[1].x1 + 1)
  })
})

describe('time-of-day support', () => {
  it('parses timestamps with minute precision', () => {
    const t1400 = parseHistoricalDate('1969-07-20 14:00')!
    const t1500 = parseHistoricalDate('1969-07-20 15:00')!
    expect(t1500).toBeGreaterThan(t1400)
    // one hour apart, as a fraction of a year
    expect((t1500 - t1400) * 365.25 * 24).toBeCloseTo(1, 1)
  })

  it('adapts axis labels to the span: years, days, then minutes', async () => {
    const { formatAxisValue } = await import('../lib/timelineDates')
    const noon = parseHistoricalDate('1969-07-20 12:30')!
    expect(formatAxisValue(noon, 100)).toBe('1970')
    expect(formatAxisValue(noon, 0.01)).toBe('Jul 20, 1969')
    expect(formatAxisValue(noon, 0.0001)).toBe('Jul 20 12:30')
  })

  it('keeps BC values on year labels regardless of span', async () => {
    const { formatAxisValue } = await import('../lib/timelineDates')
    expect(formatAxisValue(-20, 0.0001)).toBe('20 BC')
  })
})
