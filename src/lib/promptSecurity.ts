/**
 * Prompt security utilities
 * Functions to sanitize user content before including in LLM prompts
 */

/**
 * Escape special characters that could be used for prompt injection
 * Replaces XML-like tags, quotes (for attribute safety), and control characters
 */
export function escapeForPrompt(text: string): string {
  return text
    .replace(/&/g, '&amp;')   // Ampersand first (before other entities)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')  // Double quote for XML attribute safety
    .replace(/'/g, '&#39;')   // Single quote for XML attribute safety
    .replace(/\[INST\]/gi, '[_INST_]')
    .replace(/\[\/INST\]/gi, '[_/INST_]')
    .replace(/```/g, "'''")
}

/**
 * Check if a hostname resolves to a private, loopback, link-local, or otherwise
 * non-routable address that must not be reachable via SSRF.
 */
function isPrivateHostname(hostname: string): boolean {
  // Strip IPv6 brackets that URL.hostname keeps
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '')

  // Named localhost and mDNS/internal names
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true
  }
  // Cloud metadata endpoints commonly targeted by SSRF
  if (host === 'metadata.google.internal') {
    return true
  }

  // IPv4 (dotted quad)
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127) return true // loopback 127.0.0.0/8
    if (a === 10) return true // private 10.0.0.0/8
    if (a === 0) return true // "this" network 0.0.0.0/8
    if (a === 169 && b === 254) return true // link-local 169.254.0.0/16 (metadata)
    if (a === 192 && b === 168) return true // private 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true // private 172.16.0.0/12
    return false
  }

  // IPv6
  if (host.includes(':')) {
    const lower = host.toLowerCase()
    if (lower === '::1' || lower === '::') return true // loopback / unspecified
    if (lower.startsWith('fe80:')) return true // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local fc00::/7
    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
    const mapped = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isPrivateHostname(mapped[1])
    return false
  }

  return false
}

/**
 * Validate URL scheme to prevent SSRF attacks
 * Only allows http and https schemes, blocks private IPs
 */
export function isValidFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    // Block private IPs and localhost
    if (isPrivateHostname(parsed.hostname.toLowerCase())) {
      return false
    }
    return true
  } catch {
    return false
  }
}
