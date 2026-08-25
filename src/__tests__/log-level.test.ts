/**
 * The log level must be selectable, or the detail behind it is unreachable.
 *
 * 25 call sites called logger.debug(). The threshold was 'info' in development
 * and 'warn' in release, and nothing could set it lower, so none of them could
 * ever emit (PRODUCT_DESIGN.md > Log level).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(__dirname, '..')

describe('log level', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
    warnSpy.mockRestore()
    localStorage.clear()
  })

  it('emits debug messages once debug is selected', async () => {
    const { createLogger, setLogLevel } = await import('../lib/logger')
    const log = createLogger('Test')

    setLogLevel('debug')
    log.debug('reached')

    expect(debugSpy).toHaveBeenCalledWith('[Test] reached')
  })

  it('suppresses debug messages at the default threshold', async () => {
    const { createLogger, setLogLevel, defaultLogLevel } = await import('../lib/logger')
    const log = createLogger('Test')

    setLogLevel(defaultLogLevel())
    log.debug('hidden')
    log.warn('shown')

    expect(debugSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith('[Test] shown')
  })

  it('restores the selected level on a later start', async () => {
    const { setLogLevel, storedLogLevel } = await import('../lib/logger')

    setLogLevel('debug')

    // What a fresh start would read back
    expect(storedLogLevel()).toBe('debug')
  })

  it('ignores a stored value that is not a level', async () => {
    localStorage.setItem('nodus.logLevel', 'verbose')
    const { storedLogLevel } = await import('../lib/logger')

    expect(storedLogLevel()).toBeNull()
  })

  it('is selectable from the settings UI', () => {
    // A level nobody can change is the defect this gate exists for
    const panel = readFileSync(
      join(SRC, 'components/settings/WorkspaceDiagnosticsSection.vue'),
      'utf-8'
    )

    expect(panel).toMatch(/setLogLevel|logLevel/)
    expect(panel).toContain('debug')
  })
})
