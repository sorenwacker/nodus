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
    'Color nodes based on semantic criteria. LLM reasons about each node.',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language: "males blue, females pink" or "urgent red, normal green"' },
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
    'Color nodes matching a text pattern (grep-style). Fast, no LLM reasoning.',
    {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text pattern to match (e.g., "#department", "urgent", "2024")' },
        color: { type: 'string', description: 'Color hex code: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink)' },
      },
      required: ['pattern', 'color'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:color_matching`
    },
    { category: 'smart' }
  )
}
