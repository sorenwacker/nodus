/**
 * Placement for smart layout: one region per semantic group
 * (features.md > Smart Layout).
 *
 * Each group is packed as a near-square grid of its nodes; the groups are
 * laid out row by row, in the order given, so groups listed next to each
 * other end up side by side.
 */

export interface SizedNode {
  id: string
  width: number
  height: number
}

export interface SemanticGroup {
  name: string
  nodes: SizedNode[]
}

const NODE_GAP = 40
const GROUP_GAP = 160

/**
 * Compute positions for nodes arranged by group.
 *
 * Args:
 *   groups: Groups in placement order.
 *   origin: Top-left corner of the arrangement.
 *
 * Returns:
 *   Top-left position per node id.
 */
export function arrangeGroups(
  groups: SemanticGroup[],
  origin: { x: number; y: number }
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const filled = groups.filter(g => g.nodes.length > 0)
  const groupsPerRow = Math.max(1, Math.ceil(Math.sqrt(filled.length)))

  let rowY = origin.y
  for (let row = 0; row < filled.length; row += groupsPerRow) {
    let groupX = origin.x
    let rowHeight = 0
    for (const group of filled.slice(row, row + groupsPerRow)) {
      const cols = Math.ceil(Math.sqrt(group.nodes.length))
      const cellW = Math.max(...group.nodes.map(n => n.width)) + NODE_GAP
      const cellH = Math.max(...group.nodes.map(n => n.height)) + NODE_GAP
      group.nodes.forEach((node, i) => {
        positions.set(node.id, { x: groupX + (i % cols) * cellW, y: rowY + Math.floor(i / cols) * cellH })
      })
      groupX += cols * cellW + GROUP_GAP
      rowHeight = Math.max(rowHeight, Math.ceil(group.nodes.length / cols) * cellH)
    }
    rowY += rowHeight + GROUP_GAP
  }
  return positions
}
