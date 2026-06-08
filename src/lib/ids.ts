/**
 * Short ID Generator
 *
 * Generates 8-character alphanumeric IDs using crypto.getRandomValues.
 * IDs are workspace-scoped (unique within a workspace, not globally).
 * With 62^8 possibilities (~218 trillion), collision probability
 * is negligible for typical workspace sizes.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 8 // Workspace-scoped: only needs uniqueness within workspace

/**
 * Generate a short random ID (10 alphanumeric characters)
 *
 * @returns A 10-character alphanumeric string
 */
export function generateShortId(): string {
  const bytes = new Uint8Array(ID_LENGTH)
  crypto.getRandomValues(bytes)

  let result = ''
  for (let i = 0; i < ID_LENGTH; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length]
  }

  return result
}

/**
 * Check if a string looks like a short ID (8 alphanumeric chars)
 */
export function isShortId(id: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(id)
}

/**
 * Check if a string looks like a UUID
 */
export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
