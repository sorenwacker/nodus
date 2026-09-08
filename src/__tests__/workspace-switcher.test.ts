/**
 * The workspace list has to stay usable as workspaces accumulate.
 *
 * The workspace scopes the canvas, search, the agent's context and file sync,
 * so choosing one is the most consequential control in the toolbar - and it was
 * a plain dropdown of every workspace in creation order, which stops working
 * somewhere around a dozen entries (PRODUCT_DESIGN.md > Choosing a workspace).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useWorkspaceSwitcher } from '../composables/useWorkspaceSwitcher'

function setup(names: string[]) {
  const workspaces = ref(names.map((name, i) => ({ id: `w${i}`, name })))
  const nodes = ref([
    { workspace_id: 'w0' },
    { workspace_id: 'w0' },
    { workspace_id: 'w1' },
    { workspace_id: null },
  ])
  const switcher = useWorkspaceSwitcher({
    workspaces,
    nodes,
    currentWorkspaceId: ref('w0'),
  } as never)
  return { switcher, workspaces }
}

describe('choosing a workspace', () => {
  beforeEach(() => localStorage.clear())

  it('lists workspaces alphabetically when none has been opened', () => {
    const { switcher } = setup(['Tulip', 'Genomics', 'CropXR'])
    expect(switcher.rows.value.map(r => r.name)).toEqual(['CropXR', 'Genomics', 'Tulip'])
  })

  it('puts recently opened workspaces first, most recent leading', () => {
    const { switcher } = setup(['Tulip', 'Genomics', 'CropXR'])

    switcher.remember('w0') // Tulip
    switcher.remember('w1') // Genomics

    expect(switcher.rows.value.map(r => r.name)).toEqual(['Genomics', 'Tulip', 'CropXR'])
  })

  it('filters by name, ignoring case and accents', () => {
    const { switcher } = setup(['Zoterö Notes', 'Kubernetes', 'kubectl'])

    switcher.query.value = 'zotero'
    expect(switcher.rows.value.map(r => r.name)).toEqual(['Zoterö Notes'])

    switcher.query.value = 'KUBE'
    expect(switcher.rows.value.map(r => r.name)).toEqual(['kubectl', 'Kubernetes'])
  })

  it('says how many nodes each workspace holds', () => {
    const { switcher } = setup(['Tulip', 'Genomics'])
    const byName = Object.fromEntries(switcher.rows.value.map(r => [r.name, r.nodeCount]))
    expect(byName).toEqual({ Tulip: 2, Genomics: 1 })
  })

  it('moves a highlight with the keyboard and stays inside the list', () => {
    const { switcher } = setup(['Tulip', 'Genomics', 'CropXR'])
    expect(switcher.highlighted.value).toBe(0)

    switcher.moveHighlight(1)
    switcher.moveHighlight(1)
    expect(switcher.highlighted.value).toBe(2)

    switcher.moveHighlight(1) // already at the end
    expect(switcher.highlighted.value).toBe(2)

    switcher.moveHighlight(-5)
    expect(switcher.highlighted.value).toBe(0)
  })

  it('returns the highlighted workspace so Enter can switch to it', () => {
    const { switcher } = setup(['Tulip', 'Genomics', 'CropXR'])
    switcher.query.value = 'gen'
    expect(switcher.highlighted.value).toBe(0)
    expect(switcher.highlightedId.value).toBe('w1')
  })

  it('drops a remembered workspace that no longer exists', () => {
    const { switcher, workspaces } = setup(['Tulip', 'Genomics'])
    switcher.remember('w1')
    workspaces.value = workspaces.value.filter(w => w.id !== 'w1')

    expect(switcher.rows.value.map(r => r.id)).toEqual(['w0'])
  })
})
