import { describe, it, expect } from 'vitest'
import { isValidFetchUrl } from '../lib/promptSecurity'

describe('isValidFetchUrl SSRF guard', () => {
  it('allows normal public https URLs', () => {
    expect(isValidFetchUrl('https://example.com/path')).toBe(true)
    expect(isValidFetchUrl('http://api.crossref.org/works')).toBe(true)
  })

  it('rejects non-http schemes', () => {
    expect(isValidFetchUrl('file:///etc/passwd')).toBe(false)
    expect(isValidFetchUrl('ftp://example.com')).toBe(false)
  })

  it('blocks loopback across the whole 127.0.0.0/8 range', () => {
    expect(isValidFetchUrl('http://127.0.0.1/')).toBe(false)
    expect(isValidFetchUrl('http://127.1.2.3/')).toBe(false)
  })

  it('blocks the cloud metadata endpoints', () => {
    expect(isValidFetchUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isValidFetchUrl('http://metadata.google.internal/')).toBe(false)
  })

  it('blocks RFC 1918 private ranges', () => {
    expect(isValidFetchUrl('http://10.0.0.5/')).toBe(false)
    expect(isValidFetchUrl('http://192.168.1.1/')).toBe(false)
    expect(isValidFetchUrl('http://172.16.0.1/')).toBe(false)
    expect(isValidFetchUrl('http://172.31.255.255/')).toBe(false)
  })

  it('does not block public addresses that merely start with private prefixes', () => {
    // 172.15.x and 172.32.x are public
    expect(isValidFetchUrl('http://172.15.0.1/')).toBe(true)
    expect(isValidFetchUrl('http://172.32.0.1/')).toBe(true)
  })

  it('blocks IPv6 loopback and link-local', () => {
    expect(isValidFetchUrl('http://[::1]/')).toBe(false)
    expect(isValidFetchUrl('http://[fe80::1]/')).toBe(false)
    expect(isValidFetchUrl('http://[fc00::1]/')).toBe(false)
  })
})
