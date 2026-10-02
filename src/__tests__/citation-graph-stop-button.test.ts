/**
 * The Zotero panel offers Stop while the citation graph is being built
 * (docs/content/features.md > Citation Graph).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'

const isBuilding = ref(false)
const cancelBuild = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockRejectedValue(new Error('no backend')) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('../composables/useCitationGraph', () => ({
  useCitationGraph: () => ({
    isBuilding,
    progress: ref({ phase: 'fetching', current: 12, total: 130, currentPaper: 'A paper', errors: [] }),
    buildCitationGraph: vi.fn(),
    cancelBuild,
  }),
}))

import ZoteroSettingsPanel from '../components/settings/ZoteroSettingsPanel.vue'

function mountPanel() {
  setActivePinia(createPinia())
  return mount(ZoteroSettingsPanel, {
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('the citation graph controls', () => {
  beforeEach(() => {
    cancelBuild.mockReset()
    isBuilding.value = false
  })

  it('show no Stop button while nothing is being built', () => {
    expect(mountPanel().find('.stop-build-btn').exists()).toBe(false)
  })

  it('stop the build from the Stop button and say so', async () => {
    isBuilding.value = true
    const wrapper = mountPanel()
    const stop = wrapper.find('.stop-build-btn')

    expect(stop.text()).toBe(en.settings.zotero.citationGraph.stop)
    await stop.trigger('click')

    expect(cancelBuild).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stop-build-btn').text()).toBe(en.settings.zotero.citationGraph.stopping)
  })

  it('show the position of the paper being processed', () => {
    isBuilding.value = true
    expect(mountPanel().text()).toContain('(12 of 130)')
  })
})
