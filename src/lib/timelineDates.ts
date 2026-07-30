/**
 * Historical date handling for the timelines view.
 *
 * Nodes declare their point in time with a `date:` frontmatter field, e.g.
 * `date: 20 BC`, `date: 1969-07-20`, `date: 1500`. Parsed to a signed year
 * number (BC negative, fractional for month/day precision) for positioning
 * on a shared time axis.
 */

/** Raw value of a field from a leading frontmatter block, if any */
export function extractFrontmatterField(content: string, field: string): string | null {
  if (!content.startsWith('---\n')) return null
  const end = content.indexOf('\n---', 4)
  if (end === -1) return null
  const block = content.slice(4, end)
  const re = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`)
  for (const line of block.split('\n')) {
    const match = line.match(re)
    if (match) return match[1]
  }
  return null
}

/** Raw `date:` value from a leading frontmatter block, if any */
export function extractFrontmatterDate(content: string): string | null {
  return extractFrontmatterField(content, 'date')
}

/**
 * Parse a human date into a signed year number (fractional for sub-year
 * precision down to minutes).
 * Supported: "1969", "1969-07-20", "1969-07-20 14:30", "20 BC", "20 BCE",
 * "AD 79", "79 AD", "79 CE", "-20". Returns null when unparseable.
 */
export function parseHistoricalDate(input: string | null): number | null {
  if (!input) return null
  const text = input.trim()

  // "20 BC" / "20 BCE"
  const bc = text.match(/^(\d+(?:\.\d+)?)\s*(?:BC|BCE)$/i)
  if (bc) return -Number(bc[1])

  // ISO date, optionally with a time: "1969-07-20", "1969-07-20 14:30"
  const iso = text.match(/^(\d{1,6})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    if (month < 1 || month > 12) return year
    const ms = Date.UTC(year, month - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0))
    const start = Date.UTC(year, 0, 1)
    const end = Date.UTC(year + 1, 0, 1)
    return year + (ms - start) / (end - start)
  }

  // "79 AD" / "79 CE" / "AD 79" / plain "1969" / "-20"
  const ad = text.match(/^(?:AD\s+)?(-?\d+(?:\.\d+)?)\s*(?:AD|CE)?$/i)
  if (ad) return Number(ad[1])

  return null
}

/** Format a signed year for axis labels: -20 -> "20 BC", 1969 -> "1969" */
export function formatYear(year: number): string {
  const rounded = Math.round(year)
  return rounded < 0 ? `${-rounded} BC` : String(rounded)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A stretch of continuous time mapped to a pixel interval on the axis */
export interface AxisSegment {
  min: number
  max: number
  x1: number
  x2: number
}

/**
 * Build a broken time axis: clusters of dated values keep proportional
 * widths, while large empty gaps between them are abbreviated to a fixed
 * break. A gap counts as large when it exceeds gapRatio of the full span.
 */
export function buildBrokenAxis(
  values: number[],
  plotLeft: number,
  plotWidth: number,
  options: { gapRatio?: number; gapWidth?: number } = {}
): AxisSegment[] {
  const { gapRatio = 0.15, gapWidth = 32 } = options
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  if (sorted.length === 0) return []

  const span = sorted[sorted.length - 1] - sorted[0]
  // A break must dwarf both the overall span share and the typical spacing,
  // so evenly spread values never fragment into singleton segments
  const gaps = sorted.slice(1).map((v, i) => v - sorted[i]).sort((a, b) => a - b)
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
  const gapThreshold = Math.max(span * gapRatio, medianGap * 4)

  // Group values into clusters separated by large gaps
  const clusters: Array<{ min: number; max: number }> = []
  let current = { min: sorted[0], max: sorted[0] }
  for (const value of sorted.slice(1)) {
    if (span > 0 && value - current.max > gapThreshold) {
      clusters.push(current)
      current = { min: value, max: value }
    } else {
      current.max = value
    }
  }
  clusters.push(current)

  // Pad each cluster; give zero-duration clusters (single points) some body
  const padded = clusters.map(c => {
    const duration = c.max - c.min
    const pad = duration > 0 ? duration * 0.08 : Math.max(span * 0.01, 0.5)
    return { min: c.min - pad, max: c.max + pad }
  })

  const totalDuration = padded.reduce((sum, c) => sum + (c.max - c.min), 0)
  const usableWidth = plotWidth - (padded.length - 1) * gapWidth
  let x = plotLeft
  return padded.map(c => {
    const width = ((c.max - c.min) / totalDuration) * usableWidth
    const segment = { min: c.min, max: c.max, x1: x, x2: x + width }
    x += width + gapWidth
    return segment
  })
}

/** Map a time value onto the broken axis, clamping into the nearest segment */
export function axisX(segments: AxisSegment[], value: number): number {
  for (const s of segments) {
    if (value <= s.max) {
      if (value < s.min) return s.x1
      return s.x1 + ((value - s.min) / (s.max - s.min)) * (s.x2 - s.x1)
    }
  }
  return segments.length ? segments[segments.length - 1].x2 : 0
}

/**
 * Format an axis value with detail adapted to the visible span: years for
 * long ranges, months/days for shorter ones, clock time for sub-day spans
 * (a narrative playing out within an hour gets minute labels).
 */
export function formatAxisValue(value: number, spanYears: number): string {
  const year = Math.floor(value)
  if (spanYears > 3 || year < 1 || year > 9998) return formatYear(value)

  const start = Date.UTC(year, 0, 1)
  const end = Date.UTC(year + 1, 0, 1)
  const date = new Date(start + (value - year) * (end - start))

  if (spanYears > 0.2) return `${MONTHS[date.getUTCMonth()]} ${year}`
  if (spanYears > 0.005) return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${year}`
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${hh}:${mm}`
}
