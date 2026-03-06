/**
 * Shared types for Nodus
 * Single source of truth for core data structures
 */

// Core data types

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
  created_at: number
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
  node_type: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  tags?: string[]
  workspace_id?: string
}

export interface CreateEdgeInput {
  source_node_id: string
  target_node_id: string
  label?: string
  link_type?: string
}

// Event types

export interface FileChangeEvent {
  path: string
  change_type: 'Created' | 'Modified' | 'Deleted'
  new_checksum: string | null
}
