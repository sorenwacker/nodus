/**
 * Tag nodes created before the lookup normalised its comparison were duplicated:
 * the bare name was compared against a title stored with its hash, so it never
 * matched and each save made another tag node. Detection is fixed, but the rows
 * it produced remain - a vault held "test" beside "#test", and "#Paradigm" twice
 * (docs/content/features.md > Tags).
 */
import { describe, it, expect } from 'vitest'
import { planTagNodeRepair } from '../composables/tagNodeRepair'
import type { Edge, Node } from '../types'

function tag(id: string, title: string, workspace: string | null = 'w1'): Node {
  return { id, title, node_type: 'tag', workspace_id: workspace } as unknown as Node
}
function note(id: string, workspace: string | null = 'w1'): Node {
  return { id, title: id, node_type: 'note', workspace_id: workspace } as unknown as Node
}
function tagged(id: string, source: string, target: string): Edge {
  return { id, source_node_id: source, target_node_id: target, link_type: 'tagged' } as unknown as Edge
}

describe('planTagNodeRepair', () => {
  it('merges tag nodes that differ only by hash or case', () => {
    const plan = planTagNodeRepair(
      [tag('t1', '#test'), tag('t2', 'test'), note('n1')],
      [tagged('e1', 'n1', 't2')]
    )
    expect(plan.merges).toHaveLength(1)
    expect(plan.merges[0].keepId).toBe('t1')
    expect(plan.merges[0].dropIds).toEqual(['t2'])
    expect(plan.merges[0].repointEdges).toEqual([{ id: 'e1', sourceNodeId: 'n1' }])
  })

  it('does not merge the same tag in different workspaces', () => {
    const plan = planTagNodeRepair([tag('t1', '#test', 'w1'), tag('t2', '#test', 'w2')], [])
    expect(plan.merges).toEqual([])
  })

  it('gives a tag node back its hash', () => {
    const plan = planTagNodeRepair([tag('t1', 'lonely')], [])
    expect(plan.renames).toEqual([{ id: 't1', title: '#lonely' }])
  })

  it('drops an edge that would duplicate one the kept node already has', () => {
    const plan = planTagNodeRepair(
      [tag('t1', '#test'), tag('t2', 'test'), note('n1')],
      [tagged('e1', 'n1', 't1'), tagged('e2', 'n1', 't2')]
    )
    expect(plan.merges[0].repointEdges).toEqual([])
    expect(plan.merges[0].deleteEdgeIds).toEqual(['e2'])
  })

  it('leaves a healthy vault alone', () => {
    const plan = planTagNodeRepair([tag('t1', '#a'), tag('t2', '#b'), note('n1')], [tagged('e1', 'n1', 't1')])
    expect(plan.merges).toEqual([])
    expect(plan.renames).toEqual([])
  })

  it('ignores nodes that are not tag nodes', () => {
    expect(planTagNodeRepair([note('n1'), note('n2')], []).merges).toEqual([])
  })
})

describe('runTagNodeRepair', () => {
  it('moves edges before deleting the node they pointed at', async () => {
    const { runTagNodeRepair } = await import('../composables/tagNodeRepair')
    const order: string[] = []
    const result = await runTagNodeRepair(
      {
        merges: [
          {
            keepId: 't1',
            dropIds: ['t2'],
            repointEdges: [{ id: 'e1', sourceNodeId: 'n1' }],
            deleteEdgeIds: ['e2'],
          },
        ],
        renames: [{ id: 't1', title: '#test' }],
      },
      {
        createTaggedEdge: async (source, target) => {
          order.push(`create:${source}->${target}`)
        },
        deleteEdge: async id => {
          order.push(`deleteEdge:${id}`)
        },
        deleteNode: async id => {
          order.push(`deleteNode:${id}`)
        },
        renameNode: async id => {
          order.push(`rename:${id}`)
        },
      }
    )

    // The replacement edge exists before the node it replaced points at is gone
    expect(order.indexOf('create:n1->t1')).toBeLessThan(order.indexOf('deleteEdge:e1'))
    expect(order.indexOf('deleteEdge:e1')).toBeLessThan(order.indexOf('deleteNode:t2'))
    expect(result).toEqual({ merged: 1, edgesRepointed: 1, edgesDeleted: 1, renamed: 1 })
  })
})
