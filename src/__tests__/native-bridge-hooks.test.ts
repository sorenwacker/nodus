/**
 * The Rust side reaches the frontend through a small, fixed set of hooks.
 *
 * A native menu item and a GTK gesture both run outside the webview, so they
 * call in by evaluating `window.__NODUS_*(...)` in the page. It works, and it is
 * the convention the application already uses, but it is coupling neither side
 * declares: the name exists only as a string in Rust and a property assignment
 * in TypeScript, so nothing checks that the two agree, no type describes the
 * arguments, and a rename on either side fails silently at runtime. Tauri's
 * event channel is the declared alternative - a typed payload and one shared
 * event name - and moving these over would also remove the interpolation of
 * floats into JavaScript source that the pinch bridge has to guard by hand
 * (PRODUCT_DESIGN.md > One rule, one place).
 *
 * Until then this is a ratchet: the recorded set may shrink, never grow. A new
 * hook fails here, so the next piece of native wiring is a decision rather than
 * a habit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const REPO = resolve(__dirname, '../..')
const RUST_MAIN = join(REPO, 'src-tauri/src/main.rs')

/**
 * Every hook that exists today. Each is called from `src-tauri/src/main.rs`.
 * Remove an entry when its caller moves to a Tauri event; never add one.
 */
const RECORDED_HOOKS = [
  '__NODUS_OPEN_SETTINGS',
  '__NODUS_PINCH_ZOOM',
  '__NODUS_ZOOM_IN',
  '__NODUS_ZOOM_OUT',
  '__NODUS_ZOOM_RESET',
]

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '__tests__'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, found)
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) found.push(path)
  }
  return found
}

/** Hook names appearing in a body of text, deduplicated. */
function hooksIn(text: string): Set<string> {
  return new Set(text.match(/__NODUS_[A-Z0-9_]+/g) ?? [])
}

describe('native bridge hooks', () => {
  const frontend = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    for (const hook of hooksIn(readFileSync(file, 'utf-8'))) frontend.add(hook)
  }
  const rust = hooksIn(readFileSync(RUST_MAIN, 'utf-8'))

  it('adds no hook beyond the recorded set', () => {
    const added = [...frontend].filter((h) => !RECORDED_HOOKS.includes(h)).sort()

    expect(
      added,
      'A new window hook couples Rust and the frontend through a name neither ' +
        `declares. Use a Tauri event instead:\n  ${added.join('\n  ')}`
    ).toEqual([])
  })

  it('drops a hook from the recorded set once it is gone', () => {
    const stale = RECORDED_HOOKS.filter((h) => !frontend.has(h))

    expect(
      stale,
      `These are no longer used. Remove them from RECORDED_HOOKS:\n  ${stale.join('\n  ')}`
    ).toEqual([])
  })

  it('has a Rust caller for every hook the frontend installs', () => {
    // A hook nothing calls is dead code that looks wired, and the only thing
    // that would reveal it is the gesture or menu item never working.
    const uncalled = [...frontend].filter((h) => !rust.has(h)).sort()

    expect(
      uncalled,
      `No caller in src-tauri/src/main.rs:\n  ${uncalled.join('\n  ')}`
    ).toEqual([])
  })

  it('has a frontend handler for every hook Rust calls', () => {
    // The reverse: Rust evaluating a name nothing installed is a silent no-op,
    // because every call site guards with `&&` or `?.`.
    const unhandled = [...rust].filter((h) => !frontend.has(h)).sort()

    expect(
      unhandled,
      `Called from Rust but never installed:\n  ${unhandled.join('\n  ')}`
    ).toEqual([])
  })

  it('interpolates no value into evaluated JavaScript without a finite check', () => {
    // Rust writes a non-finite float as `inf`, which is not a JavaScript
    // literal but an undefined identifier, so the call throws instead of doing
    // anything. Any eval that formats values in needs the values checked first.
    const rustSource = readFileSync(RUST_MAIN, 'utf-8')
    const interpolating = [...rustSource.matchAll(/\.eval\(\s*format!\(/g)]

    expect(
      interpolating.length > 0 && rustSource.includes('is_finite()'),
      'main.rs formats values into evaluated JavaScript but checks none of ' +
        'them for finiteness'
    ).toBe(true)
  })
})
