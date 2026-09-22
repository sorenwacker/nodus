/**
 * The AI settings tab is a sequence of named sections, and its Agent section
 * reads the tool registry (PRODUCT_DESIGN.md > Settings > AI, Agent section).
 *
 * Thirteen flat controls gave no hint which ones a first-time user must fill
 * in. The agent had a default mode nothing could change, tools no interface
 * listed, and a memory no interface showed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import { AI_SETTINGS_SECTIONS } from '../components/settings/aiSections'
import { describeAgentTools } from '../llm/toolCatalog'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { llmStorage, memoryStorage } from '../lib/storage'
import AgentSettingsSection from '../components/settings/AgentSettingsSection.vue'

registerCoreTools()

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const SETTINGS_DIR = resolve(__dirname, '../components/settings')

describe('the AI tab', () => {
  it('has the documented sections in order, with Generation collapsed', () => {
    expect(AI_SETTINGS_SECTIONS.map(s => s.id)).toEqual([
      'connection',
      'generation',
      'search',
      'prompts',
      'agent',
    ])
    expect(AI_SETTINGS_SECTIONS.find(s => s.id === 'generation')?.collapsed).toBe(true)
    expect(AI_SETTINGS_SECTIONS.find(s => s.id === 'connection')?.collapsed).toBe(false)
  })

  it('renders each section through the shared collapsible', () => {
    const panel = readFileSync(resolve(SETTINGS_DIR, 'LLMSettingsPanel.vue'), 'utf-8')
    expect(panel).toContain('v-for="section in AI_SETTINGS_SECTIONS"')
    // One component per section id, so a documented section cannot be skipped
    for (const section of AI_SETTINGS_SECTIONS) {
      expect(panel, `${section.id} has no component`).toMatch(new RegExp(`^\\s+${section.id}: \\w+Section,$`, 'm'))
    }
    expect(panel).toContain('<SettingsSection')
  })

  it('owns the LLM Features toggle, so the tab is one component', () => {
    const modal = readFileSync(resolve(SETTINGS_DIR, '../SettingsModal.vue'), 'utf-8')
    const panel = readFileSync(resolve(SETTINGS_DIR, 'LLMSettingsPanel.vue'), 'utf-8')
    expect(panel).toContain('setLLMEnabled')
    expect(modal).not.toContain('setLLMEnabled')
  })
})

describe('the tool catalogue', () => {
  it('lists exactly the registered tools', () => {
    const rows = describeAgentTools({ search: true })
    const registered = toolRegistry.getToolDefinitions().map(t => t.function.name).sort()
    expect(rows.map(r => r.name).sort()).toEqual(registered)
  })

  it('carries each tool declaration', () => {
    const rows = describeAgentTools({ search: true })
    const createNode = rows.find(r => r.name === 'create_node')!
    expect(createNode.mutates).toBe(true)
    expect(createNode.modes).toEqual(toolRegistry.declarationOf('create_node')!.modes)
    const pushTask = rows.find(r => r.name === 'push_task')!
    expect(pushTask.modes).toEqual([])
    expect(pushTask.unexposedReason).toMatch(/create_plan/)
  })

  it('marks the tools that need an unconfigured service', () => {
    const without = describeAgentTools({ search: false })
    expect(without.find(r => r.name === 'web_search')!.missing).toEqual(['search'])
    expect(without.find(r => r.name === 'deep_research')!.missing).toEqual(['search'])
    expect(without.find(r => r.name === 'think')!.missing).toEqual([])

    const with_ = describeAgentTools({ search: true })
    expect(with_.find(r => r.name === 'web_search')!.missing).toEqual([])
  })
})

describe('the default agent mode', () => {
  beforeEach(() => localStorage.clear())

  it('is plan until changed', () => {
    expect(llmStorage.getDefaultAgentMode()).toBe('plan')
  })

  it('persists explore', () => {
    llmStorage.setDefaultAgentMode('explore')
    expect(llmStorage.getDefaultAgentMode()).toBe('explore')
  })

  it('ignores a stored value that is not a start mode', () => {
    localStorage.setItem('nodus_agent_default_mode', 'execute')
    expect(llmStorage.getDefaultAgentMode()).toBe('plan')
  })

  it('is what a run starts in', () => {
    // Every run started in plan mode and nothing entered explore mode, so the
    // explore tools were declared and unreachable
    const canvas = readFileSync(resolve(__dirname, '../canvas/GraphCanvas.vue'), 'utf-8')
    expect(canvas).toMatch(/agentRunner\.run\(prompt, llmStorage\.getDefaultAgentMode\(\)\)/)
  })
})

describe('the facts memory', () => {
  beforeEach(() => localStorage.clear())

  it('can forget one fact', () => {
    memoryStorage.addMemory('w1', 'first')
    memoryStorage.addMemory('w1', 'second')
    memoryStorage.addMemory('w1', 'third')

    memoryStorage.removeMemory('w1', 1)

    expect(memoryStorage.getMemories('w1')).toEqual(['first', 'third'])
  })
})

describe('the Agent settings section', () => {
  beforeEach(() => localStorage.clear())

  function mountSection(workspaceId: string | null = 'w1') {
    return mount(AgentSettingsSection, {
      props: { workspaceId },
      global: { plugins: [i18n] },
    })
  }

  it('lists every registered tool', () => {
    const wrapper = mountSection()
    const rows = wrapper.findAll('[data-tool]').map(r => r.attributes('data-tool'))
    const registered = toolRegistry.getToolDefinitions().map(t => t.function.name)
    expect(rows.sort()).toEqual(registered.sort())
  })

  it('says why web_search is unavailable when no search key is set', () => {
    const wrapper = mountSection()
    const row = wrapper.find('[data-tool="web_search"]')
    expect(row.text()).toContain(en.settings.agent.needsSearchKey)
  })

  it('does not say so once the key is set', () => {
    llmStorage.setSearchApiKey('tvly-test')
    const wrapper = mountSection()
    expect(wrapper.find('[data-tool="web_search"]').text()).not.toContain(
      en.settings.agent.needsSearchKey
    )
  })

  it('shows the facts of the current workspace and forgets one on request', async () => {
    memoryStorage.addMemory('w1', 'The vault is about plant genetics')
    memoryStorage.addMemory('w1', 'Prefers short titles')
    memoryStorage.addMemory('w2', 'Another workspace')

    const wrapper = mountSection('w1')
    const facts = wrapper.findAll('[data-fact]')
    expect(facts.map(f => f.find('span').text())).toEqual(
      expect.arrayContaining(['The vault is about plant genetics', 'Prefers short titles'])
    )
    expect(wrapper.text()).not.toContain('Another workspace')

    await facts[0].find('button').trigger('click')

    expect(memoryStorage.getMemories('w1')).toEqual(['Prefers short titles'])
    expect(wrapper.findAll('[data-fact]')).toHaveLength(1)
  })

  it('writes the default mode', async () => {
    const wrapper = mountSection()
    await wrapper.find('select[data-default-mode]').setValue('explore')
    expect(llmStorage.getDefaultAgentMode()).toBe('explore')
  })
})
