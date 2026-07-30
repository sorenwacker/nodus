/**
 * Historical date handling for the timelines view.
 *
 * Nodes declare their point in time with a `date:` frontmatter field, e.g.
 * `date: 20 BC`, `date: 1969-07-20`, `date: 1500`. Parsed to a signed year
 * number (BC negative, fractional for month/day precision) for positioning
 * on a shared time axis.
 */

/** Raw `date:` value from a leading frontmatter block, if any */
export function extractFrontmatterDate(content: string): string | null {
  if (!content.startsWith('---\n')) return null
  const end = content.indexOf('\n---', 4)
  if (end === -1) return null
  const block = content.slice(4, end)
  for (const line of block.split('\n')) {
    const match = line.match(/^date:\s*["']?(.+?)["']?\s*$/)
    if (match) return match[1]
  }
  return null
}

/**
 * Parse a human date into a signed year number.
 * Supported: "1969", "1969-07-20", "20 BC", "20 BCE", "AD 79", "79 AD",
 * "79 CE", "-20". Returns null when unparseable.
 */
export function parseHistoricalDate(input: string | null): number | null {
  if (!input) return null
  const text = input.trim()

  // "20 BC" / "20 BCE"
  const bc = text.match(/^(\d+(?:\.\d+)?)\s*(?:BC|BCE)$/i)
  if (bc) return -Number(bc[1])

  // "79 AD" / "79 CE" / "AD 79"
  const ad = text.match(/^(?:AD\s+)?(\d+(?:\.\d+)?)\s*(?:AD|CE)?$/i)
  const iso = text.match(/^(-?\d{1,6})(?:-(\d{2}))?(?:-(\d{2}))?$/)
  if (iso) {
    const year = Number(iso[1])
    const month = iso[2] ? Number(iso[2]) : 0
    const day = iso[3] ? Number(iso[3]) : 0
    if (month >= 1 && month <= 12) {
      return year + (month - 1) / 12 + (day >= 1 ? (day - 1) / 365 : 0)
    }
    return year
  }
  if (ad && /(?:AD|CE)/i.test(text)) return Number(ad[1])

  return null
}

/** Format a signed year for axis labels: -20 -> "20 BC", 1969 -> "1969" */
export function formatYear(year: number): string {
  const rounded = Math.round(year)
  return rounded < 0 ? `${-rounded} BC` : String(rounded)
}
