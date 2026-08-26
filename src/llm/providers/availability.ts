/**
 * Deciding whether a provider can answer.
 *
 * One rule for every provider: ask the endpoint the application uses for work,
 * with the configured model, and treat any failing status as unavailable while
 * recording why. A model listing can answer while completions fail on
 * authorisation, routing or timeout, and reading "any status but 401" as online
 * showed green beside a model that answered nothing
 * (PRODUCT_DESIGN.md > Provider status).
 */

/** The shape of a response, whether it came from httpFetch or fetch. */
export interface ProbeResponse {
  ok: boolean
  status: number
  text?: () => Promise<string>
}

export interface AvailabilityOutcome {
  available: boolean
  /** Why not, when not. Null when available. */
  reason: string | null
}

/**
 * Run an availability probe and interpret its result.
 *
 * `request` performs the call. Anything it throws is a provider that could not
 * be reached, which is distinct from one that refused the request.
 */
export async function probeProvider(
  request: () => Promise<ProbeResponse>
): Promise<AvailabilityOutcome> {
  try {
    const response = await request()
    if (response.ok) {
      return { available: true, reason: null }
    }
    const detail = typeof response.text === 'function' ? await response.text() : ''
    return {
      available: false,
      reason: `HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    }
  } catch (e) {
    return {
      available: false,
      reason: e instanceof Error ? e.message : String(e),
    }
  }
}
