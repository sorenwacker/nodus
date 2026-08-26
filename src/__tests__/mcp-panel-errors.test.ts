/**
 * A failed MCP server start says so.
 *
 * `const error = computed(() => null)` made the panel's error row unreachable,
 * and `toggleServer` awaited the start with no catch. Starting on a port already
 * in use rejected unhandled, the persisted flag was not written, the checkbox
 * snapped back, and nothing was shown. `useMcpServer` already exposed an
 * `error` ref; App.vue never provided it
 * (PRODUCT_DESIGN.md > Reporting MCP server failures).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ref, nextTick } from 'vue'
import { readFileSync } from 'fs'
import { join } from 'path'
import en from '../i18n/locales/en.json'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(0) }))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function mountPanel(overrides: Record<string, unknown>) {
  const McpSettingsPanel = (await import('../components/settings/McpSettingsPanel.vue')).default
  return mount(McpSettingsPanel, {
    global: {
      plugins: [i18n],
      provide: {
        mcpRunning: ref(false),
        mcpConnections: ref([]),
        mcpPort: ref(null),
        mcpError: ref(null),
        mcpStartServer: vi.fn(),
        mcpStopServer: vi.fn(),
        mcpGetStatus: vi.fn().mockResolvedValue({ running: false, port: null }),
        ...overrides,
      },
    },
  })
}

describe('MCP server failures', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the reason a start failed', async () => {
    const mcpError = ref<string | null>(null)
    const wrapper = await mountPanel({
      mcpError,
      mcpStartServer: vi.fn().mockRejectedValue(new Error('Address already in use')),
    })

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await nextTick()
    mcpError.value = 'Address already in use'
    await nextTick()

    expect(wrapper.text()).toContain('Address already in use')
  })

  it('does not record the server as enabled when the start failed', async () => {
    const wrapper = await mountPanel({
      mcpStartServer: vi.fn().mockRejectedValue(new Error('Address already in use')),
    })

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await nextTick()

    // A flag saying "enabled" would start the server again on the next launch
    expect(localStorage.getItem('nodus-mcp-enabled')).not.toBe('true')
  })

  it('records the server as enabled when the start succeeded', async () => {
    const wrapper = await mountPanel({ mcpStartServer: vi.fn().mockResolvedValue(undefined) })

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await nextTick()

    expect(localStorage.getItem('nodus-mcp-enabled')).toBe('true')
  })

  it('is wired to the error state the composable exposes', () => {
    // The panel can only show what App.vue provides
    const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8')

    expect(app).toContain("provide('mcpError'")
  })
})
