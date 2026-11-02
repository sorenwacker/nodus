/**
 * The workspace list: searchable, sorted by last use, name or creation date,
 * with a node count per row.
 *
 * The workspace scopes the canvas, search, the agent's context and file sync,
 * so choosing one is the most consequential control in the toolbar. A dropdown
 * of every workspace in creation order stops being usable somewhere around a
 * dozen entries (PRODUCT_DESIGN.md > Choosing a workspace).
 *
 * The counts come from the nodes already in memory - the store loads every
 * workspace's nodes - so the list costs one pass over an array, not a query.
 */
import { computed, ref, watch, type Ref } from 'vue'

const RECENTS_KEY = 'nodus-workspace-recents'
const SORT_KEY = 'nodus-workspace-sort'

export type WorkspaceSortOrder = 'used' | 'name' | 'created'
const SORT_ORDERS: WorkspaceSortOrder[] = ['used', 'name', 'created']

export interface SwitcherWorkspace {
  id: string
  name: string
  created_at: number
}

export interface WorkspaceRow extends SwitcherWorkspace {
  nodeCount: number
  isCurrent: boolean
}

export interface UseWorkspaceSwitcherOptions {
  workspaces: Ref<SwitcherWorkspace[]>
  nodes: Ref<Array<{ workspace_id: string | null }>>
  currentWorkspaceId: Ref<string | null>
}

/** Lowercase and strip accents, so "Zoterö" answers to "zotero". */
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function readSortOrder(): WorkspaceSortOrder {
  try {
    const stored = localStorage.getItem(SORT_KEY)
    return SORT_ORDERS.find(order => order === stored) ?? 'used'
  } catch {
    return 'used'
  }
}

function byName(a: SwitcherWorkspace, b: SwitcherWorkspace): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function useWorkspaceSwitcher(options: UseWorkspaceSwitcherOptions) {
  const { workspaces, nodes, currentWorkspaceId } = options

  const query = ref('')
  const isOpen = ref(false)
  const highlighted = ref(0)
  const recents = ref<string[]>(readRecents())
  const sortOrder = ref<WorkspaceSortOrder>(readSortOrder())

  watch(
    sortOrder,
    order => {
      try {
        localStorage.setItem(SORT_KEY, order)
      } catch {
        // A browser refusing storage costs the remembered order, not the sort
      }
    },
    { flush: 'sync' }
  )

  /** Note that a workspace was opened, so it leads the list next time. */
  function remember(id: string | null): void {
    if (!id) return
    const next = [id, ...recents.value.filter(existing => existing !== id)]
    recents.value = next
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    } catch {
      // A browser refusing storage costs the ordering, not the switcher
    }
  }

  const nodeCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const node of nodes.value) {
      if (!node.workspace_id) continue
      counts.set(node.workspace_id, (counts.get(node.workspace_id) ?? 0) + 1)
    }
    return counts
  })

  const rows = computed<WorkspaceRow[]>(() => {
    const q = normalize(query.value.trim())
    const matching = workspaces.value.filter(w => !q || normalize(w.name).includes(q))

    let ordered: SwitcherWorkspace[]
    if (sortOrder.value === 'name') {
      ordered = [...matching].sort(byName)
    } else if (sortOrder.value === 'created') {
      ordered = [...matching].sort((a, b) => b.created_at - a.created_at)
    } else {
      // A remembered workspace that has since been deleted is never matched
      const lastUse = new Map(recents.value.map((id, rank) => [id, rank]))
      ordered = [...matching].sort((a, b) => {
        const ra = lastUse.get(a.id) ?? Infinity
        const rb = lastUse.get(b.id) ?? Infinity
        return ra === rb ? byName(a, b) : ra - rb
      })
    }

    return ordered.map(w => ({
      ...w,
      nodeCount: nodeCounts.value.get(w.id) ?? 0,
      isCurrent: w.id === currentWorkspaceId.value,
    }))
  })

  const highlightedId = computed<string | null>(() => rows.value[highlighted.value]?.id ?? null)

  /** Move the highlight without leaving the list. */
  function moveHighlight(delta: number): void {
    const last = rows.value.length - 1
    if (last < 0) {
      highlighted.value = 0
      return
    }
    highlighted.value = Math.min(Math.max(highlighted.value + delta, 0), last)
  }

  function open(): void {
    query.value = ''
    highlighted.value = 0
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
    query.value = ''
  }

  return {
    query,
    isOpen,
    highlighted,
    highlightedId,
    rows,
    sortOrder,
    remember,
    moveHighlight,
    open,
    close,
  }
}
