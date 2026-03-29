/**
 * Prompt security utilities
 * Functions to sanitize user content before including in LLM prompts
 */

/**
 * Escape special characters that could be used for prompt injection
 * Replaces XML-like tags and control characters
 */
export function escapeForPrompt(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[INST\]/gi, '[_INST_]')
    .replace(/\[\/INST\]/gi, '[_/INST_]')
    .replace(/```/g, "'''")
}

/**
 * Check if hostname is in private IP range (RFC 1918)
 */
function isPrivateHostname(hostname: string): boolean {
  // Localhost variations
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  ) {
    return true
  }
  // Private IP ranges
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return true
  }
  // 172.16.0.0 - 172.31.255.255 range
  for (let i = 16; i <= 31; i++) {
    if (hostname.startsWith(`172.${i}.`)) {
      return true
    }
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
