/**
 * Decode a tool call a model wrote into its reply text.
 *
 * Some models cannot emit native tool calls and write them into the message
 * instead, each in its own syntax. This one writes
 * `OPENcall:name(key:value,...)CLOSE`, with strings wrapped in its own
 * delimiter rather than quotes, so no JSON pattern matched it and the call was
 * shown to the user as raw markup
 * (PRODUCT_DESIGN.md > A reply that carries a tool call it could not make).
 *
 * The arguments are JSON once two things are repaired: the delimited strings
 * become quoted strings, and the bare keys are quoted. The strings are lifted
 * out first, so punctuation inside them is never read as structure.
 */

export interface DecodedCall {
  name: string
  args: Record<string, unknown>
}

/** The markers, assembled so this file contains no raw delimiter runs. */
const OPEN_MARKER = '<' + '|tool_call>'
const CLOSE_MARKER = '<tool_call' + '|>'
const STRING_MARKER = '<' + '|"' + '|>'

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CALL = new RegExp(
  escapeForRegex(OPEN_MARKER) + String.raw`\s*call:(\w+)\(([\s\S]*?)\)\s*` + escapeForRegex(CLOSE_MARKER),
  'g'
)

const STRING = new RegExp(
  escapeForRegex(STRING_MARKER) + String.raw`([\s\S]*?)` + escapeForRegex(STRING_MARKER),
  'g'
)

/** A bare key: an identifier followed by a colon, outside any string. */
const BARE_KEY = /([{,]\s*|^\s*)([A-Za-z_]\w*)\s*:/g

function argumentsToJson(body: string): string | null {
  const strings: string[] = []
  // Lift the strings out, so their commas, colons and braces stay content
  const withoutStrings = body.replace(STRING, (_match, content: string) => {
    strings.push(content)
    return ` ${strings.length - 1} `
  })

  // A delimiter left behind means the markers did not pair up, and the rest
  // cannot be trusted
  if (withoutStrings.includes(STRING_MARKER.slice(0, 2))) return null

  const quoted = withoutStrings.replace(
    BARE_KEY,
    (_match, before: string, key: string) => `${before}"${key}":`
  )

  // Restore the strings, JSON-escaped
  const restored = quoted.replace(/ (\d+) /g, (_match, index: string) =>
    JSON.stringify(strings[Number(index)])
  )

  return `{${restored}}`
}

export function decodeCallSyntax(content: string): DecodedCall[] {
  if (!content.includes(OPEN_MARKER)) return []

  const calls: DecodedCall[] = []
  CALL.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = CALL.exec(content)) !== null) {
    const [, name, body] = match
    const json = argumentsToJson(body)
    if (!json) continue

    try {
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        calls.push({ name, args: parsed as Record<string, unknown> })
      }
    } catch {
      // Malformed: the model's own error, reported as unusable rather than
      // guessed at
    }
  }

  return calls
}

/** Whether a reply carries call markers, decodable or not. */
export function carriesCallMarkers(content: string): boolean {
  return content.includes(OPEN_MARKER)
}
