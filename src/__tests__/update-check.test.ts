/**
 * Update checking (PRODUCT_DESIGN.md > Updates).
 *
 * An installed copy that never learns about a newer release is frozen on
 * whatever version its user first downloaded, so every fix reaches only the
 * people who happen to revisit the download page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkMock = vi.fn()
const relaunchMock = vi.fn()

vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...args: unknown[]) => checkMock(...args) }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunchMock() }))

async function loadComposable() {
  vi.resetModules()
  const module = await import('../composables/useUpdateCheck')
  return module.useUpdateCheck()
}

describe('update check', () => {
  beforeEach(() => {
    localStorage.clear()
    checkMock.mockReset()
    relaunchMock.mockReset()
  })

  it('reports the newer version when one exists', async () => {
    checkMock.mockResolvedValue({ version: '2.0.0', currentVersion: '1.3.0', downloadAndInstall: vi.fn() })

    const updater = await loadComposable()
    await updater.checkForUpdate()

    expect(updater.available.value?.version).toBe('2.0.0')
  })

  it('reports nothing when the installed copy is current', async () => {
    checkMock.mockResolvedValue(null)

    const updater = await loadComposable()
    await updater.checkForUpdate()

    expect(updater.available.value).toBeNull()
  })

  it('stays silent when the endpoint cannot be reached', async () => {
    // Being offline is the normal case for a local-first app, not a fault
    checkMock.mockRejectedValue(new Error('network unreachable'))

    const updater = await loadComposable()
    await expect(updater.checkForUpdate()).resolves.toBeUndefined()
    expect(updater.available.value).toBeNull()
    expect(updater.error.value).toBeNull()
  })

  it('does not contact the endpoint when the user turned checks off', async () => {
    localStorage.setItem('nodus-update-check-enabled', 'false')

    const updater = await loadComposable()
    await updater.checkForUpdate()

    expect(checkMock).not.toHaveBeenCalled()
  })

  it('remembers that preference', async () => {
    const updater = await loadComposable()
    expect(updater.enabled.value).toBe(true)

    updater.setEnabled(false)
    expect(localStorage.getItem('nodus-update-check-enabled')).toBe('false')

    const reopened = await loadComposable()
    expect(reopened.enabled.value).toBe(false)
  })

  it('installs and relaunches only when asked', async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
    checkMock.mockResolvedValue({ version: '2.0.0', currentVersion: '1.3.0', downloadAndInstall })

    const updater = await loadComposable()
    await updater.checkForUpdate()

    // Finding an update must not install it: that is the user's decision
    expect(downloadAndInstall).not.toHaveBeenCalled()
    expect(relaunchMock).not.toHaveBeenCalled()

    await updater.installUpdate()
    expect(downloadAndInstall).toHaveBeenCalledTimes(1)
    expect(relaunchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed install rather than pretending it worked', async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error('disk full'))
    checkMock.mockResolvedValue({ version: '2.0.0', currentVersion: '1.3.0', downloadAndInstall })

    const updater = await loadComposable()
    await updater.checkForUpdate()
    await updater.installUpdate()

    expect(updater.error.value).toContain('disk full')
    expect(relaunchMock).not.toHaveBeenCalled()
  })

  it('dismisses a version so it is not offered again this session', async () => {
    checkMock.mockResolvedValue({ version: '2.0.0', currentVersion: '1.3.0', downloadAndInstall: vi.fn() })

    const updater = await loadComposable()
    await updater.checkForUpdate()
    updater.dismiss()

    expect(updater.available.value).toBeNull()
  })
})
