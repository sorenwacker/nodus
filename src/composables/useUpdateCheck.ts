/**
 * Update checking.
 *
 * Asks the release endpoint once per launch whether a newer version exists and
 * reports it; installing is always the user's decision. Being unreachable is
 * silence rather than an error, because a local-first application is expected
 * to run offline.
 *
 * See PRODUCT_DESIGN.md > Updates.
 */
import { ref } from 'vue'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const STORAGE_KEY = 'nodus-update-check-enabled'

export interface AvailableUpdate {
  version: string
  currentVersion: string
  notes?: string
}

interface UpdateHandle extends AvailableUpdate {
  downloadAndInstall: () => Promise<void>
}

export function useUpdateCheck() {
  const enabled = ref(localStorage.getItem(STORAGE_KEY) !== 'false')
  const available = ref<AvailableUpdate | null>(null)
  const checking = ref(false)
  const installing = ref(false)
  const error = ref<string | null>(null)

  let handle: UpdateHandle | null = null

  function setEnabled(value: boolean) {
    enabled.value = value
    localStorage.setItem(STORAGE_KEY, String(value))
  }

  /**
   * Ask whether a newer release exists. Never throws: a machine without a
   * network is the normal case, and an update check is not worth interrupting
   * anyone's work over.
   */
  async function checkForUpdate(): Promise<void> {
    if (!enabled.value || checking.value) return
    checking.value = true
    try {
      const update = (await check()) as UpdateHandle | null
      if (update) {
        handle = update
        available.value = {
          version: update.version,
          currentVersion: update.currentVersion,
          notes: update.notes,
        }
      } else {
        handle = null
        available.value = null
      }
    } catch {
      // Offline, endpoint down, or running outside the desktop shell
      handle = null
      available.value = null
    } finally {
      checking.value = false
    }
  }

  /** Download, install and restart. Only ever called from the user's click. */
  async function installUpdate(): Promise<void> {
    if (!handle || installing.value) return
    installing.value = true
    error.value = null
    try {
      await handle.downloadAndInstall()
      await relaunch()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      installing.value = false
    }
  }

  /** Stop offering this version for the rest of the session */
  function dismiss(): void {
    available.value = null
    handle = null
  }

  return {
    enabled,
    available,
    checking,
    installing,
    error,
    setEnabled,
    checkForUpdate,
    installUpdate,
    dismiss,
  }
}
