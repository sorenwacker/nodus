/**
 * Every asset a documentation page references must exist in the built site.
 *
 * The site is built from `docs/content` only. Assets kept outside that
 * directory are silently left out of the build, so the pages ship with broken
 * images - which is exactly what happened when the toolchain changed and the
 * screenshots still lived in `docs/assets`.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, normalize, dirname } from 'node:path'

const SITE = resolve(__dirname, '../../docs/public')
const CONTENT = resolve(__dirname, '../../docs/content')

function walk(dir: string, match: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...walk(path, match))
    else if (match(entry)) found.push(path)
  }
  return found
}

/** Strip the published base path so links resolve against the built site */
function siteRelative(ref: string): string {
  return ref.replace(/^\/nodus\//, '').replace(/^\//, '')
}

describe('documentation assets', () => {
  it('has a built site to check', () => {
    expect(existsSync(join(SITE, 'index.html'))).toBe(true)
  })

  it('resolves every local asset referenced by a built page', () => {
    const pages = walk(SITE, name => name.endsWith('.html'))
    expect(pages.length).toBeGreaterThan(0)

    const missing: string[] = []
    for (const page of pages) {
      const html = readFileSync(page, 'utf8')
      const refs = html.matchAll(
        /(?:src|href)="([^":?#]+\.(?:png|jpg|jpeg|svg|webp|gif|css|js))"/g
      )
      for (const [, ref] of refs) {
        if (/^https?:/.test(ref)) continue
        const relativeToPage = normalize(join(dirname(page), ref))
        const relativeToSite = join(SITE, siteRelative(ref))
        if (!existsSync(relativeToPage) && !existsSync(relativeToSite)) {
          missing.push(`${page.replace(SITE, 'docs/public')} -> ${ref}`)
        }
      }
    }

    expect(missing, `assets referenced but not published: ${missing.join(', ')}`).toEqual([])
  })

  it('keeps assets inside the directory the site is built from', () => {
    // Anything referenced as ./assets/... must live under docs/content
    const strays = walk(resolve(CONTENT, '..'), name =>
      /\.(png|jpg|jpeg|svg|webp|gif)$/.test(name)
    ).filter(path => !path.startsWith(CONTENT) && !path.startsWith(SITE))

    expect(
      strays.map(p => p.replace(resolve(CONTENT, '..'), 'docs')),
      'these images sit outside docs/content and will not be published'
    ).toEqual([])
  })
})
