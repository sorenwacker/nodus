/**
 * Mock/fallback data for offline development mode
 */
import type { Node } from '../types'

/**
 * Create mock starter nodes for offline/fallback mode
 */
export function createMockNodes(): Node[] {
  const now = Date.now()
  return [
    {
      id: '1',
      title: 'Welcome to Nodus',
      file_path: null,
      markdown_content: '# Welcome\n\nThis is your first node.',
      node_type: 'note',
      canvas_x: 100,
      canvas_y: 100,
      width: 200,
      height: 120,
      z_index: 0,
      frame_id: null,
      color_theme: null,
      is_collapsed: false,
      tags: null,
      workspace_id: null,
      checksum: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: '2',
      title: 'Getting Started',
      file_path: null,
      markdown_content: '## Getting Started\n\nDrag nodes to arrange them.',
      node_type: 'note',
      canvas_x: 400,
      canvas_y: 150,
      width: 200,
      height: 120,
      z_index: 0,
      frame_id: null,
      color_theme: null,
      is_collapsed: false,
      tags: null,
      workspace_id: null,
      checksum: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]
}
