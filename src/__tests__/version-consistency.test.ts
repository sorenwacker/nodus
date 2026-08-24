/**
 * The declared version has one value.
 *
 * The release workflow refuses a tag whose version disagrees with either
 * manifest, which is correct but late: the mismatch is found after the tag is
 * pushed and the release has already failed. This finds it at commit time.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

describe('version consistency', () => {
  it('declares the same version in package.json and Cargo.toml', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')).version
    const cargo = readFileSync(resolve(ROOT, 'src-tauri/Cargo.toml'), 'utf-8')
      .split('\n')
      .find(line => line.startsWith('version'))
      ?.replace(/.*"(.*)".*/, '$1')

    expect(cargo, 'src-tauri/Cargo.toml declares no version').toBeTruthy()
    expect(cargo).toBe(pkg)
  })

  it('has a changelog entry for the declared version', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')).version
    const changelog = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf-8')

    expect(changelog).toContain(`## [${pkg}]`)
  })
})

describe('updater configuration', () => {
  it('never declares a public key it has no private key for', () => {
    // A placeholder key makes Tauri demand the private key and fail the build
    const conf = JSON.parse(
      readFileSync(resolve(ROOT, 'src-tauri/tauri.conf.json'), 'utf-8')
    )
    const pubkey: string = conf.plugins?.updater?.pubkey ?? ''
    const artifacts: boolean = conf.bundle?.createUpdaterArtifacts ?? false

    expect(pubkey).not.toMatch(/REPLACE|PLACEHOLDER|TODO/i)
    // Artifacts are signed, so they require a real key to exist
    if (artifacts) {
      expect(pubkey.length).toBeGreaterThan(20)
    }
  })
})
