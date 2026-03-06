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

  // Constants
  PORT_SPACING,
  CORNER_MARGIN
} from './routing'
