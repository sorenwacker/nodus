/**
 * Smart (LLM-powered) tool registrations
 *
 * Handles: smart_move, smart_connect, smart_color, color_matching
 */

import { defineTool } from '../registry'

export function registerSmartTools(): void {
  defineTool<{ instruction: string }>(
    'smart_move',
    'Move nodes based on semantic criteria. LLM reasons about each node. Use for "move cars left, animals right".',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language: "car brands to x=100, animals to x=600"' },
      },
      required: ['instruction'],
    },
    async (args, _ctx) => {
      // This tool requires external LLM calls - handled by agent runner
      return `__SMART_MOVE__:${args.instruction}`
    },
    { category: 'smart' }
  )

  defineTool<{ groups: string }>(
    'smart_connect',
    'Connect nodes within semantic groups. E.g., "connect animals together, connect cars together, but not across".',
    {
      type: 'object',
      properties: {
        groups: { type: 'string', description: 'Group descriptions: "animals, car brands"' },
      },
      required: ['groups'],
    },
    async (args, _ctx) => {
      return `__SMART_CONNECT__:${args.groups}`
    },
    { category: 'smart' }
  )

  defineTool<{ instruction: string }>(
    'smart_color',
    'Color nodes into multiple categories based on what they represent. LLM semantically classifies each node.',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Category-to-color mapping: "faculties blue, departments red" or "people green, organizations orange"' },
      },
      required: ['instruction'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:smart_color`
    },
    { category: 'smart' }
  )

  defineTool<{ pattern: string; color: string }>(
    'color_matching',
    'Color nodes by SEMANTIC criterion (what nodes represent). Use for categories like "person", "organization", "question". NOT for text patterns - use color_regex instead.',
    {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Semantic type (e.g., "person", "organization", "question", "assumption")' },
        color: { type: 'string', description: 'Color hex code: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink)' },
      },
      required: ['pattern', 'color'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:color_matching`
    },
    { category: 'smart' }
  )

  defineTool<{ regex: string; color: string; field?: string }>(
    'color_regex',
    'Color nodes by regex pattern on title. Use for "starts with x" (^x), "ends with .md" (\\.md$), "contains foo" (foo). Fast batch operation, no LLM needed.',
    {
      type: 'object',
      properties: {
        regex: { type: 'string', description: 'JavaScript regex pattern: ^x (starts with x), foo$ (ends with foo), \\d+ (contains numbers)' },
        color: { type: 'string', description: 'Color hex code: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink)' },
        field: { type: 'string', description: 'Field to match: "title" (default) or "content"' },
      },
      required: ['regex', 'color'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:color_regex`
    },
    { category: 'smart' }
  )

  defineTool<Record<string, never>>(
    'reset_edge_colors',
    'Reset all edge colors to default. Removes custom colors from all edges.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:reset_edge_colors`
    },
    { category: 'smart' }
  )
}
