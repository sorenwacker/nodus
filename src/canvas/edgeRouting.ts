/**
 * Edge routing - re-exports from modular routing module
 * @deprecated Import from './routing' instead
 */

export {
  // Types
  type Point,
  type NodeRect,
  type EdgeDef,
  type RoutedEdge,
  type Side,
  type PortAssignment,
  type EdgeStyle,
  type EdgeRouteParams,
  type EdgeRouteResult,

  // Functions
  routeAllEdges,
  routeEdgesWithBundling,
  pathToSvg,
  getSide,
  getPortPoint,
  getStandoff,
  getNodeCenter,
  analyzeEdges,
  assignPorts,
  calculatePortOffset,
  createOrthogonalPath,
  cleanPath,
  findOrthogonalPath,

  // New routing modules
  GridTracker,
  routeDiagonal,
  routeOrthogonal,
  validateDiagonalPath,
  validateOrthogonalPath,
  segmentIntersectsNode,
  findObstacles,
  findObstaclesInRegion,
  OBSTACLE_MARGIN,

  // Constants
  PORT_SPACING,
  CORNER_MARGIN,
  DEFAULT_GRID_SIZE
} from './routing'
