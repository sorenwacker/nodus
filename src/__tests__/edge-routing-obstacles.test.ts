/**
 * An edge routes around a node, not through it.
 *
 * The three-segment router asked whether each segment was horizontal in order
 * to pick a detour direction, and every one of the three calls passed the
 * negation. A horizontal segment was therefore offered a horizontal detour,
 * which cannot clear anything, so obstacle avoidance never produced a waypoint
 * and edges ran straight through nodes
 * (PRODUCT_DESIGN.md > Routing edges around nodes).
 */
import { describe, it, expect } from 'vitest'
import { routeOrthogonal } from '../canvas/routing/orthogonalRouter'
import { findObstacles } from '../canvas/routing/obstacleAvoider'
import { GridTracker } from '../canvas/routing/gridTracker'
import type { NodeRect } from '../canvas/routing/types'

function rect(id: string, x: number, y: number, w = 160, h = 80): NodeRect {
  // NodeRect uses canvas_x/canvas_y. Building it with x/y made every bound NaN,
  // and the test failed for that reason rather than the one under test.
  return { id, canvas_x: x, canvas_y: y, width: w, height: h }
}

/** Whether any leg of the path crosses a node it is not attached to. */
function crossesAnObstacle(path: Array<{ x: number; y: number }>, nodes: NodeRect[], exclude: Set<string>) {
  for (let i = 0; i < path.length - 1; i++) {
    const blocked = findObstacles(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, nodes, exclude)
    if (blocked.length > 0) return blocked.map(n => n.id)
  }
  return null
}

describe('orthogonal routing with an obstacle in the way', () => {
  it('does not run a horizontal path through a node between the endpoints', () => {
    // Source on the left, target on the right, one node squarely between them
    const source = rect('source', 0, 200)
    const blocker = rect('blocker', 400, 180)
    const target = rect('target', 800, 200)
    const nodes = [source, blocker, target]
    const exclude = new Set(['source', 'target'])

    const result = routeOrthogonal({
      startPort: { x: 160, y: 240 },
      startStandoff: { x: 200, y: 240 },
      endPort: { x: 800, y: 240 },
      endStandoff: { x: 760, y: 240 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds: exclude,
      gridTracker: new GridTracker(),
    } as never)

    const hit = crossesAnObstacle(result.path, nodes, exclude)
    expect(hit, `path runs through ${hit}: ${JSON.stringify(result.path)}`).toBeNull()
  })

  it('does not run a vertical path through a node between the endpoints', () => {
    const source = rect('source', 400, 0)
    const blocker = rect('blocker', 380, 300)
    const target = rect('target', 400, 600)
    const nodes = [source, blocker, target]
    const exclude = new Set(['source', 'target'])

    const result = routeOrthogonal({
      startPort: { x: 480, y: 80 },
      startStandoff: { x: 480, y: 120 },
      endPort: { x: 480, y: 600 },
      endStandoff: { x: 480, y: 560 },
      sourceSide: 'bottom',
      targetSide: 'top',
      nodes,
      excludeIds: exclude,
      gridTracker: new GridTracker(),
    } as never)

    const hit = crossesAnObstacle(result.path, nodes, exclude)
    expect(hit, `path runs through ${hit}: ${JSON.stringify(result.path)}`).toBeNull()
  })

  it('routes the first segment around a node when the ends are far apart', () => {
    // Endpoints offset on the secondary axis, so the near-aligned shortcut is
    // skipped and the three-segment router runs. The first segment is
    // horizontal; a node on it must force a vertical detour. With the
    // horizontal flag inverted the router offered a horizontal detour, which
    // cannot clear a horizontal obstruction, and the edge went straight through.
    const source = rect('source', 0, 0)
    const blocker = rect('blocker', 260, 10, 160, 120)
    const target = rect('target', 800, 400)
    const nodes = [source, blocker, target]
    const exclude = new Set(['source', 'target'])

    const result = routeOrthogonal({
      startPort: { x: 160, y: 40 },
      startStandoff: { x: 200, y: 40 },
      endPort: { x: 800, y: 440 },
      endStandoff: { x: 760, y: 440 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds: exclude,
      gridTracker: new GridTracker(),
    } as never)

    const hit = crossesAnObstacle(result.path, nodes, exclude)
    expect(hit, `path runs through ${hit}: ${JSON.stringify(result.path)}`).toBeNull()
  })

  it('leaves a clear path alone', () => {
    // Nothing in the way: the route must not gain pointless detours
    const source = rect('source', 0, 200)
    const target = rect('target', 800, 200)
    const nodes = [source, target]

    const result = routeOrthogonal({
      startPort: { x: 160, y: 240 },
      startStandoff: { x: 200, y: 240 },
      endPort: { x: 800, y: 240 },
      endStandoff: { x: 760, y: 240 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds: new Set(['source', 'target']),
      gridTracker: new GridTracker(),
    } as never)

    // A straight run needs no more than the ports and standoffs
    expect(result.path.length).toBeLessThanOrEqual(6)
  })
})
