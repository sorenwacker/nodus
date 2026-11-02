/**
 * Deleting a workspace with its files reports the files that remain
 * (PRODUCT_DESIGN.md > Workspace settings).
 *
 * A file the backend could not delete reached only its log, and the user was
 * told the workspace and its files were gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setActivePinia, createPinia } from 'pinia'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))

describe('deleting a workspace with its files', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invoke.mockReset()
  })

  it('returns the files the backend could not delete', async () => {
    invoke.mockImplementation(async (command: string) => (command === 'delete_workspace' ? ['/vault/stuck.md'] : undefined))
    const { useWorkspaceStore } = await import('../stores/workspaces')
    const remaining = await useWorkspaceStore().deleteWorkspace('w1', true)
    expect(remaining).toEqual(['/vault/stuck.md'])
  })

  it('tells the user how many files remain', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const start = source.indexOf('async function confirmDeleteWorkspace')
    const body = source.slice(start, source.indexOf('\n}\n', start))
    expect(body).toContain("t('toasts.workspaceFilesRemain'")
  })
})
