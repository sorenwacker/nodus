/**
 * Shared types for Nodus
 * Single source of truth for core data structures
 */

// Core data types

/**
 * Node type classification
 * - note: Regular content node
 * - comment: Storyline annotation
 * - character: Person/entity (novel writing)
 * - location: Place (novel writing)
 * - citation: Reference (academic writing)
 * - term: Glossary/definition (both)
 * - item: Object, figure, dataset
 */
export type NodeType = 'note' | 'comment' | 'character' | 'location' | 'citation' | 'term' | 'item'

/** Entity node types (subset of NodeType used for cross-linking) */
export type EntityNodeType = 'character' | 'location' | 'citation' | 'term' | 'item'

/** All entity node type values */
export const ENTITY_NODE_TYPES: EntityNodeType[] = ['character', 'location', 'citation', 'term', 'item']

/**
 * Edge link type classification
 * - related: General relationship
 * - cites: Academic citation
 * - blocks: Blocking relationship
 * - supports: Supporting evidence
 * - contradicts: Contradicting evidence
 * - wikilink: Wiki-style link from content
 * - mentions: Content node mentions entity
 * - appears_in: Character/location appears in scene
 * - references: Academic reference to citation
 * - defines: Node defines a term
 */
export type LinkType =
  | 'related'
  | 'cites'
  | 'blocks'
  | 'supports'
  | 'contradicts'
  | 'wikilink'
  | 'mentions'
  | 'appears_in'
  | 'references'
  | 'defines'

/** Entity-specific link types */
export type EntityLinkType = 'mentions' | 'appears_in' | 'references' | 'defines'

/** All entity link type values */
export const ENTITY_LINK_TYPES: EntityLinkType[] = ['mentions', 'appears_in', 'references', 'defines']

export interface Node {
  id: string
  title: string
  file_path: string | null
  markdown_content: string | null
  node_type: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  z_index: number
  frame_id: string | null
  color_theme: string | null
  is_collapsed: boolean
  auto_fit?: boolean
  tags: string | null
  workspace_id: string | null
  checksum: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  link_type: string
  weight: number
  color: string | null
  storyline_id: string | null
  created_at: number
  directed: boolean
}

export interface Frame {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  color: string | null
  workspace_id: string | null
}

export interface Workspace {
  id: string
  name: string
  created_at: number
}

// Canvas geometry types

export interface NodeRect {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

// Input types for creation

export interface CreateNodeInput {
  title: string
  file_path?: string
  markdown_content?: string
  node_type?: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  tags?: string[]
  workspace_id?: string
  color_theme?: string | null
}

export interface CreateEdgeInput {
  source_node_id: string
  target_node_id: string
  label?: string
  link_type?: string
  color?: string
  storyline_id?: string
  directed?: boolean
}

// Event types

export interface FileChangeEvent {
  path: string
  change_type: 'Created' | 'Modified' | 'Deleted'
  new_checksum: string | null
}

// Storyline types

export interface Storyline {
  id: string
  title: string
  description: string | null
  color: string | null
  workspace_id: string | null
  created_at: number
  updated_at: number
}

export interface StorylineNode {
  id: string
  storyline_id: string
  node_id: string
  sequence_order: number
}

export interface CreateStorylineInput {
  title: string
  description?: string
  color?: string
  workspace_id?: string
}

// Ontology import types

export interface OntologyImportResult {
  nodesCreated: number
  edgesCreated: number
  classNodesCreated: number
  nodeIds: string[]
}

export type OntologyLayout = 'grid' | 'hierarchical'

export interface ImportOntologyInput {
  filePath: string
  workspaceId?: string
  createClassNodes: boolean
  layout?: OntologyLayout
}

// Comment types for storyline annotations

/**
 * Comment type classification for storyline annotations
 * - note: General annotation or observation
 * - question: Question to address or research
 * - todo: Task or action item
 * - important: Critical point requiring attention
 */
export type CommentType = 'note' | 'question' | 'todo' | 'important'

/**
 * Metadata stored with comment nodes
 */
export interface CommentMeta {
  type: CommentType
  resolved: boolean
}

/**
 * Style configuration for each comment type
 */
export const COMMENT_STYLES: Record<CommentType, { icon: string; color: string }> = {
  note: { icon: 'comment', color: 'var(--text-muted)' },
  question: { icon: 'help-circle', color: '#3b82f6' },
  todo: { icon: 'check-square', color: '#f59e0b' },
  important: { icon: 'alert-circle', color: '#ef4444' },
}
