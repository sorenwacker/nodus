/**
 * Requests to outside services go through the backend
 * (PRODUCT_DESIGN.md > Requests to outside services go through the backend).
 *
 * The packaged web view connects only to the hosts its content security policy
 * lists. A direct fetch to any other host works in a development build and is
 * refused in the installed application, which is how the Zotero connection
 * broke without a test noticing.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const SRC = join(__dirname, '..')

/** Files that may call fetch directly, and the policy host that lets them */
const DIRECT_FETCH_ALLOWED: Record<string, string> = {
  'llm/providers/http.ts': 'the wrapper itself; its fetch runs only outside the packaged application',
  'llm/providers/ollama.ts': 'http://localhost:11434',
  'lib/semanticScholar.ts': 'https://api.semanticscholar.org',
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|vue)$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : []
  })
}

describe('requests to outside services', () => {
  it('are not made with a direct fetch outside the listed files', () => {
    const offenders = sourceFiles(SRC)
      .filter(path => /(?<![.\w])fetch\(/.test(readFileSync(path, 'utf8')))
      .map(path => relative(SRC, path))
      .filter(path => !(path in DIRECT_FETCH_ALLOWED))

    expect(offenders).toEqual([])
  })

  it('lists only files that still call fetch, for hosts the policy names', () => {
    const config = JSON.parse(readFileSync(join(SRC, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'))
    const policy: string = config.app.security.csp
    const connect = policy.split(';').find(part => part.trim().startsWith('connect-src')) ?? ''

    for (const [file, host] of Object.entries(DIRECT_FETCH_ALLOWED)) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).toMatch(/(?<![.\w])fetch\(/)
      if (host.startsWith('http')) expect(connect, file).toContain(host)
    }
  })
})
