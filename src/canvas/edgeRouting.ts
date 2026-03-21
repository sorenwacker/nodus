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
  optimizeNodeEntrypoints,
  clearPortCache,
  pathToSvg,
  getSide,
  getPortPoint,
  getStandoff,
  getAngledStandoff,
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

  // Spatial indexing
  SpatialIndex,
  getSpatialIndex,
  invalidateSpatialIndex,
  setRoutingSpatialIndex,

  // Constants
  PORT_SPACING,
  CORNER_MARGIN,
  DEFAULT_GRID_SIZE
} from './routing'
