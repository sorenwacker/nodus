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
