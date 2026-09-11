/**
 * The workspace editor offers only what is stored, and stores everything it
 * offers (PRODUCT_DESIGN.md > Workspace settings).
 *
 * Recovering a workspace rebuilt it from its id and name alone, dropping the
 * vault path and the sync setting the database still held. A rename that the
 * backend refused kept the new name on screen and was reported as saved. The
 * editor offered a description field that nothing stored, and a new
 * workspace was opened without waiting for the switch to it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkspaceStore } from '../stores/workspaces'
import { notifications$ } from '../composables/useNotifications'

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

describe('the workspace store', () => {
  let notifyError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    localStorageMock.clear()
    notifyError = vi.spyOn(notifications$, 'error')
  })

  afterEach(() => {
    notifyError.mockRestore()
  })

  it('restores a workspace with its vault path and sync setting', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'get_workspaces'
        ? [{ id: 'w9', name: 'Old', color: null, vault_path: '/vault', sync_enabled: true, created_at: 1, updated_at: 1 }]
        : undefined
    )
    const store = useWorkspaceStore()

    const recovered = await store.recoverWorkspace('w9')

    expect(recovered).toMatchObject({ id: 'w9', vault_path: '/vault', sync_enabled: true })
  })

  it('keeps the old name and says so when the backend refuses a rename', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'rename_workspace') throw new Error('refused')
    })
    const store = useWorkspaceStore()
    store.workspaces.push({ id: 'w1', name: 'Old name', created_at: 0 } as never)

    await expect(store.renameWorkspace('w1', 'New name')).rejects.toThrow('refused')

    expect(store.workspaces.find(w => w.id === 'w1')?.name).toBe('Old name')
    expect(notifyError).toHaveBeenCalled()
  })
})

describe('the workspace editor in App.vue', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
  const body = (fn: string) => {
    const start = source.indexOf(`function ${fn}(`)
    return source.slice(start, source.indexOf('\n}\n', start))
  }

  it('offers no description field, because nothing stores one', () => {
    expect(source).not.toContain('editingWorkspace.description')
  })

  it('waits for the rename before reporting the workspace saved', () => {
    expect(body('saveWorkspaceChanges')).toContain('await store.renameWorkspace(')
  })

  it('opens a new workspace only once the switch to it has finished', () => {
    expect(body('createNewWorkspace')).toContain('await store.switchWorkspace(ws.id)')
  })
})
