/**
 * Tool surface parity gate.
 *
 * Nodus exposes its capabilities twice: through the MCP server (for external
 * agents) and through the in-app LLM agent (for the user's own agent). A
 * capability present on one surface and absent from the other is invisible to
 * half the users - the date fields were MCP-only for exactly that reason, so
 * asking the in-app agent to date nodes could not work.
 *
 * The lists below are a ledger, not decoration. A new tool on either surface
 * fails this gate until it is either given a counterpart or recorded here with
 * a reason. BASELINE_* holds the asymmetry that already existed when the gate
 * was introduced; those entries are debt to shrink, and removing a tool from
 * one surface without updating the ledger fails too, so the lists cannot rot.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAgentTools } from '../llm/tools'
import { NODUS_TOOLS } from '../../packages/nodus-mcp-server/src/tools'

const MCP_TOOLS_FILE = resolve(__dirname, '../../packages/nodus-mcp-server/src/tools.ts')

/** Tool names the MCP server advertises to clients */
function mcpToolNames(): string[] {
  const source = readFileSync(MCP_TOOLS_FILE, 'utf8')
  return [...new Set([...source.matchAll(/name:\s*'([a-z_0-9]+)'/g)].map(m => m[1]))]
}

/** Tool names the in-app agent can call */
function agentToolNames(): string[] {
  return [...new Set(getAgentTools().map(t => t.function.name))]
}

/**
 * Deliberately MCP-only: an external agent drives Nodus from outside, so it
 * needs plumbing the in-app agent gets implicitly from the running app.
 */
const INTENTIONAL_MCP_ONLY: Record<string, string> = {
  focus_node: 'the in-app agent acts on the workspace and view the user already has open',
  get_viewport: 'the in-app agent acts on the workspace and view the user already has open',
  get_workspace: 'the in-app agent acts on the workspace and view the user already has open',
  list_workspaces: 'the in-app agent acts on the workspace and view the user already has open',
  set_workspace: 'the in-app agent acts on the workspace and view the user already has open',
}

/**
 * Deliberately agent-only: loop control, planning and memory belong to a
 * conversation, not to a remote graph API.
 */
const INTENTIONAL_AGENT_ONLY: Record<string, string> = {
  check_progress: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  clear_stack: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  complete_goal: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  create_plan: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  done: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  node_done: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  peek_stack: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  plan: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  pop_task: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  push_task: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  remember: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  request_approval: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  set_goal: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  think: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  update_progress: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  update_task: 'loop control, planning or memory: belongs to a conversation, not a remote API',
  web_search: 'loop control, planning or memory: belongs to a conversation, not a remote API',
}

/** Pre-existing asymmetry, recorded so new drift stands out. Shrink over time. */
const BASELINE_MCP_ONLY: Record<string, string> = {
  add_node_to_storyline: 'baseline debt: no in-app agent counterpart yet',
  arrange_radial: 'baseline debt: no in-app agent counterpart yet',
  assign_node_to_frame: 'baseline debt: no in-app agent counterpart yet',
  batch_assign_nodes_to_frame: 'baseline debt: no in-app agent counterpart yet',
  batch_create_edges: 'baseline debt: no in-app agent counterpart yet',
  batch_delete_edges: 'baseline debt: no in-app agent counterpart yet',
  batch_move_frames: 'baseline debt: no in-app agent counterpart yet',
  batch_move_nodes: 'baseline debt: no in-app agent counterpart yet',
  batch_resize_frames: 'baseline debt: no in-app agent counterpart yet',
  batch_resize_nodes: 'baseline debt: no in-app agent counterpart yet',
  batch_set_node_colors: 'baseline debt: no in-app agent counterpart yet',
  check_frame_overlaps: 'baseline debt: no in-app agent counterpart yet',
  create_frame: 'baseline debt: no in-app agent counterpart yet',
  create_storyline: 'baseline debt: no in-app agent counterpart yet',
  delete_edge: 'baseline debt: no in-app agent counterpart yet',
  delete_edges_for_node: 'baseline debt: no in-app agent counterpart yet',
  delete_frame: 'baseline debt: no in-app agent counterpart yet',
  delete_storyline: 'baseline debt: no in-app agent counterpart yet',
  fit_all_frames: 'baseline debt: no in-app agent counterpart yet',
  fit_frame_to_contents: 'baseline debt: no in-app agent counterpart yet',
  get_edges: 'baseline debt: no in-app agent counterpart yet',
  get_frame: 'baseline debt: no in-app agent counterpart yet',
  get_graph_structure: 'baseline debt: no in-app agent counterpart yet',
  get_graph_summary: 'baseline debt: no in-app agent counterpart yet',
  get_hub_nodes: 'baseline debt: no in-app agent counterpart yet',
  get_leaf_nodes: 'baseline debt: no in-app agent counterpart yet',
  get_node: 'baseline debt: no in-app agent counterpart yet',
  get_node_neighbors: 'baseline debt: no in-app agent counterpart yet',
  get_nodes_by_color: 'baseline debt: no in-app agent counterpart yet',
  get_nodes_in_frame: 'baseline debt: no in-app agent counterpart yet',
  get_orphan_nodes: 'baseline debt: no in-app agent counterpart yet',
  get_root_nodes: 'baseline debt: no in-app agent counterpart yet',
  get_storyline: 'baseline debt: no in-app agent counterpart yet',
  get_storyline_nodes: 'baseline debt: no in-app agent counterpart yet',
  list_frames: 'baseline debt: no in-app agent counterpart yet',
  list_nodes: 'baseline debt: no in-app agent counterpart yet',
  list_storylines: 'baseline debt: no in-app agent counterpart yet',
  remove_node_from_frame: 'baseline debt: no in-app agent counterpart yet',
  remove_node_from_storyline: 'baseline debt: no in-app agent counterpart yet',
  reorder_storyline_nodes: 'baseline debt: no in-app agent counterpart yet',
  resize_node: 'baseline debt: no in-app agent counterpart yet',
  resolve_frame_overlaps: 'baseline debt: no in-app agent counterpart yet',
  search_nodes: 'baseline debt: no in-app agent counterpart yet',
  set_node_color: 'baseline debt: no in-app agent counterpart yet',
  update_frame: 'baseline debt: no in-app agent counterpart yet',
  update_storyline: 'baseline debt: no in-app agent counterpart yet',
}

/** Pre-existing asymmetry in the other direction. Shrink over time. */
const BASELINE_AGENT_ONLY: Record<string, string> = {
  append_content: 'baseline debt: no MCP counterpart yet',
  append_to_selected: 'baseline debt: no MCP counterpart yet',
  apply_theme: 'baseline debt: no MCP counterpart yet',
  auto_layout: 'baseline debt: no MCP counterpart yet',
  batch_update: 'baseline debt: no MCP counterpart yet',
  build_knowledge_base: 'baseline debt: no MCP counterpart yet',
  check_completeness: 'baseline debt: no MCP counterpart yet',
  color_matching: 'baseline debt: no MCP counterpart yet',
  color_regex: 'baseline debt: no MCP counterpart yet',
  color_selected: 'baseline debt: no MCP counterpart yet',
  connect_selected_to: 'baseline debt: no MCP counterpart yet',
  create_edges_batch: 'baseline debt: no MCP counterpart yet',
  create_nodes_batch: 'baseline debt: no MCP counterpart yet',
  create_theme: 'baseline debt: no MCP counterpart yet',
  deep_research: 'baseline debt: no MCP counterpart yet',
  delete_edges: 'baseline debt: no MCP counterpart yet',
  delete_matching: 'baseline debt: no MCP counterpart yet',
  delete_selected: 'baseline debt: no MCP counterpart yet',
  expand_aspect: 'baseline debt: no MCP counterpart yet',
  expand_selected: 'baseline debt: no MCP counterpart yet',
  fetch_url: 'baseline debt: no MCP counterpart yet',
  fetch_wikipedia: 'baseline debt: no MCP counterpart yet',
  for_each_node: 'baseline debt: no MCP counterpart yet',
  format_math: 'baseline debt: no MCP counterpart yet',
  generate_sequence: 'baseline debt: no MCP counterpart yet',
  list_themes: 'baseline debt: no MCP counterpart yet',
  move_node: 'baseline debt: no MCP counterpart yet',
  query_nodes: 'baseline debt: no MCP counterpart yet',
  read_graph: 'baseline debt: no MCP counterpart yet',
  rename_selected: 'baseline debt: no MCP counterpart yet',
  research: 'baseline debt: no MCP counterpart yet',
  research_topic: 'baseline debt: no MCP counterpart yet',
  reset_edge_colors: 'baseline debt: no MCP counterpart yet',
  smart_color: 'baseline debt: no MCP counterpart yet',
  smart_connect: 'baseline debt: no MCP counterpart yet',
  smart_move: 'baseline debt: no MCP counterpart yet',
  summarize_selected: 'baseline debt: no MCP counterpart yet',
  update_content: 'baseline debt: no MCP counterpart yet',
  update_selected_content: 'baseline debt: no MCP counterpart yet',
  update_theme: 'baseline debt: no MCP counterpart yet',
  update_title: 'baseline debt: no MCP counterpart yet',
  validate_claim: 'baseline debt: no MCP counterpart yet',
  wikipedia_search: 'baseline debt: no MCP counterpart yet',
}

/**
 * Fields a shared tool may expose on one surface only, with the reason. A
 * shared name is not parity: MCP's update_node once accepted date fields the
 * in-app agent's did not, so the same request succeeded for external agents
 * and failed in the app.
 */
const FIELD_EXCEPTIONS: Record<string, { mcpOnly?: string[]; agentOnly?: string[]; reason: string }> = {
  create_node: {
    mcpOnly: ['x', 'y', 'node_type', 'workspace_id'],
    agentOnly: ['content'],
    reason: 'MCP places nodes explicitly; the app auto-places and names the field content',
  },
  update_node: {
    mcpOnly: ['id', 'updates', 'content', 'x', 'y'],
    agentOnly: ['title', 'new_content'],
    reason:
      'MCP addresses nodes by id with an updates object and moves them through the same call; ' +
      'the app addresses by title, names the field new_content, and moves through move_node',
  },
  delete_node: {
    mcpOnly: ['id'],
    agentOnly: ['title'],
    reason: 'MCP addresses nodes by id; the app addresses by title',
  },
  create_edge: {
    mcpOnly: ['source_node_id', 'target_node_id', 'label', 'directed', 'weight', 'color', 'link_type'],
    agentOnly: ['from_title', 'to_title', 'type'],
    reason: 'MCP addresses nodes by id; the app addresses by title',
  },
  update_edge: {
    mcpOnly: ['id', 'label', 'link_type', 'directed', 'color', 'weight'],
    agentOnly: ['from_title', 'to_title', 'label', 'type'],
    reason: 'MCP addresses edges by id; the app addresses them by endpoint titles',
  },
}

function mcpFields(name: string): string[] {
  const tool = NODUS_TOOLS.find(t => t.name === name)
  const schema = tool?.inputSchema as
    | { properties?: Record<string, { properties?: Record<string, unknown> }> }
    | undefined
  const properties = schema?.properties ?? {}
  const fields = Object.keys(properties)
  // MCP nests mutable fields inside an "updates" object; a capability hidden
  // one level down is still a capability the other surface must have
  const nested = properties.updates?.properties
  if (nested) fields.push(...Object.keys(nested))
  return [...new Set(fields)]
}

function agentFields(name: string): string[] {
  const tool = getAgentTools().find(t => t.function.name === name)
  const schema = tool?.function.parameters as { properties?: Record<string, unknown> } | undefined
  return Object.keys(schema?.properties ?? {})
}

describe('shared tools expose the same capability on both surfaces', () => {
  const shared = mcpToolNames().filter(name => new Set(agentToolNames()).has(name))

  it('finds the tools that exist on both surfaces', () => {
    expect(shared.length).toBeGreaterThan(0)
  })

  for (const name of ['create_node', 'update_node']) {
    it(`${name} accepts the same node metadata on both surfaces`, () => {
      // Metadata that shapes a node beyond its text: a surface missing these
      // silently cannot fulfil requests like "add dates to every node"
      const metadata = ['date', 'date_end', 'tags']
      const mcp = new Set(mcpFields(name))
      const agent = new Set(agentFields(name))

      for (const field of metadata) {
        if (!mcp.has(field)) continue
        expect(
          agent.has(field),
          `MCP ${name} accepts "${field}" but the in-app agent's ${name} does not, ` +
            'so the same request fails in the app'
        ).toBe(true)
      }
    })
  }

  it('records every other field difference on purpose', () => {
    for (const name of shared) {
      const exception = FIELD_EXCEPTIONS[name]
      const mcp = mcpFields(name)
      const agent = agentFields(name)
      const allowedMcpOnly = new Set(exception?.mcpOnly ?? [])
      const allowedAgentOnly = new Set(exception?.agentOnly ?? [])

      const mcpOnly = mcp.filter(f => !agent.includes(f) && !allowedMcpOnly.has(f))
      const agentOnly = agent.filter(f => !mcp.includes(f) && !allowedAgentOnly.has(f))

      expect(
        mcpOnly,
        `${name}: MCP-only fields ${mcpOnly.join(', ')} - add them to the agent tool or to FIELD_EXCEPTIONS`
      ).toEqual([])
      expect(
        agentOnly,
        `${name}: agent-only fields ${agentOnly.join(', ')} - add them to the MCP tool or to FIELD_EXCEPTIONS`
      ).toEqual([])
    }
  })
})

describe('tool surface parity', () => {
  it('advertises tools on both surfaces', () => {
    expect(mcpToolNames().length).toBeGreaterThan(20)
    expect(agentToolNames().length).toBeGreaterThan(10)
  })

  it('has no unrecorded MCP tool the in-app agent cannot reach', () => {
    const agent = new Set(agentToolNames())
    const unrecorded = mcpToolNames().filter(
      name => !agent.has(name) && !(name in INTENTIONAL_MCP_ONLY) && !(name in BASELINE_MCP_ONLY)
    )
    expect(
      unrecorded,
      `MCP gained capabilities the in-app agent cannot reach: ${unrecorded.join(', ')}. ` +
        'Add the agent tool, or record it in INTENTIONAL_MCP_ONLY with the reason.'
    ).toEqual([])
  })

  it('has no unrecorded in-app agent tool MCP cannot reach', () => {
    const mcp = new Set(mcpToolNames())
    const unrecorded = agentToolNames().filter(
      name => !mcp.has(name) && !(name in INTENTIONAL_AGENT_ONLY) && !(name in BASELINE_AGENT_ONLY)
    )
    expect(
      unrecorded,
      `The in-app agent gained capabilities MCP cannot reach: ${unrecorded.join(', ')}. ` +
        'Add the MCP tool, or record it in INTENTIONAL_AGENT_ONLY with the reason.'
    ).toEqual([])
  })

  it('keeps the ledger free of tools that no longer exist', () => {
    const mcp = new Set(mcpToolNames())
    const agent = new Set(agentToolNames())

    for (const name of [...Object.keys(INTENTIONAL_MCP_ONLY), ...Object.keys(BASELINE_MCP_ONLY)]) {
      expect(mcp.has(name), `the ledger lists MCP tool ${name}, which MCP no longer exposes`).toBe(true)
    }
    for (const name of [...Object.keys(INTENTIONAL_AGENT_ONLY), ...Object.keys(BASELINE_AGENT_ONLY)]) {
      expect(agent.has(name), `the ledger lists agent tool ${name}, which the agent no longer exposes`).toBe(true)
    }
  })

  it('never records a tool as both intentional and baseline debt', () => {
    for (const name of Object.keys(BASELINE_MCP_ONLY)) {
      expect(name in INTENTIONAL_MCP_ONLY, `${name} is both intentional and debt`).toBe(false)
    }
    for (const name of Object.keys(BASELINE_AGENT_ONLY)) {
      expect(name in INTENTIONAL_AGENT_ONLY, `${name} is both intentional and debt`).toBe(false)
    }
  })
})

describe('the documented tool table matches the registry', () => {
  const DESIGN_DOC = resolve(__dirname, '../../docs/content/PRODUCT_DESIGN.md')

  /** Tool names listed in the Graph Agent Tools section */
  function documentedTools(): string[] {
    const doc = readFileSync(DESIGN_DOC, 'utf8')
    const start = doc.indexOf('**Graph Agent Tools:**')
    const end = doc.indexOf('**Node Agent Tools')
    expect(start, 'Graph Agent Tools section missing').toBeGreaterThan(-1)
    const section = doc.slice(start, end)
    return [...new Set([...section.matchAll(/\| `([a-z_0-9]+)\(/g)].map(m => m[1]))]
  }

  it('documents every tool the agent can call', () => {
    const undocumented = agentToolNames().filter(name => !documentedTools().includes(name))
    expect(
      undocumented,
      `these tools exist but are undocumented: ${undocumented.join(', ')}`
    ).toEqual([])
  })

  it('documents no tool that does not exist', () => {
    const agent = new Set(agentToolNames())
    const phantom = documentedTools().filter(name => !agent.has(name))
    expect(
      phantom,
      `the documentation promises tools the agent does not have: ${phantom.join(', ')}`
    ).toEqual([])
  })
})
