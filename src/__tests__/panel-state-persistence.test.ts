/**
 * Panel states that must survive folding a layer away and coming back, and
 * survive a restart: the reader's contents sidebar and the agent panel's
 * folded state (PRODUCT_DESIGN.md > Local LLM Agent, Storylines).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { uiStorage } from '../lib/storage'

describe('reader contents sidebar state', () => {
  beforeEach(() => {
    localStorage.removeItem('nodus-reader-toc-visible')
  })

  it('is shown by default', () => {
    expect(uiStorage.getReaderTocVisible()).toBe(true)
  })

  it('remembers being hidden, so reopening the reader does not bring it back', () => {
    uiStorage.setReaderTocVisible(false)
    expect(uiStorage.getReaderTocVisible()).toBe(false)
  })

  it('remembers being shown again', () => {
    uiStorage.setReaderTocVisible(false)
    uiStorage.setReaderTocVisible(true)
    expect(uiStorage.getReaderTocVisible()).toBe(true)
  })
})

describe('agent panel folded state', () => {
  beforeEach(() => {
    localStorage.removeItem('nodus-agent-panel-collapsed')
  })

  it('starts folded, leaving the canvas the space until asked', () => {
    // The corner toggle and a left-edge push reveal it
    // (PRODUCT_DESIGN.md > Chat transcript)
    expect(uiStorage.getAgentPanelCollapsed()).toBe(true)
  })

  it('remembers being unfolded', () => {
    uiStorage.setAgentPanelCollapsed(false)
    expect(uiStorage.getAgentPanelCollapsed()).toBe(false)
  })

  it('remembers being folded away', () => {
    uiStorage.setAgentPanelCollapsed(true)
    expect(uiStorage.getAgentPanelCollapsed()).toBe(true)
  })
})

describe('agent panel toggle is reachable while folded', () => {
  it('exposes the fold state and a toggle on the shared display store', async () => {
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useDisplayStore } = await import('../stores/display')
    localStorage.removeItem('nodus-agent-panel-collapsed')

    const store = useDisplayStore()
    expect(store.agentPanelCollapsed).toBe(true)

    // The toolbar and the panel share this state, so a folded panel can
    // always be brought back from outside itself
    store.toggleAgentPanel()
    expect(store.agentPanelCollapsed).toBe(false)
    expect(localStorage.getItem('nodus-agent-panel-collapsed')).toBe('false')

    store.toggleAgentPanel()
    expect(store.agentPanelCollapsed).toBe(true)
  })
})

describe('panel sizes the user chooses persist', () => {
  it('remembers the agent panel width across sessions', async () => {
    const { usePanelReveal } = await import('../composables/usePanelReveal')
    localStorage.removeItem('nodus-agent-panel-width')

    const panel = usePanelReveal({
      side: 'left',
      minSize: 280,
      maxSize: 640,
      defaultSize: 380,
      storageKey: 'nodus-agent-panel-width',
    })
    expect(panel.size.value).toBe(380)

    panel.setSize(520)
    const reopened = usePanelReveal({
      side: 'left',
      minSize: 280,
      maxSize: 640,
      defaultSize: 380,
      storageKey: 'nodus-agent-panel-width',
    })
    expect(reopened.size.value).toBe(520)
  })

  it('remembers the timelines height and only then stops sizing to content', async () => {
    const { usePanelReveal } = await import('../composables/usePanelReveal')
    localStorage.removeItem('nodus-timelines-height')

    const sheet = usePanelReveal({
      side: 'bottom',
      minSize: 120,
      maxSize: 900,
      defaultSize: 240,
      storageKey: 'nodus-timelines-height',
    })
    // Until the user drags it, the sheet fits its lanes
    expect(sheet.hasStoredSize.value).toBe(false)

    sheet.setSize(420)
    const reopened = usePanelReveal({
      side: 'bottom',
      minSize: 120,
      maxSize: 900,
      defaultSize: 240,
      storageKey: 'nodus-timelines-height',
    })
    expect(reopened.hasStoredSize.value).toBe(true)
    expect(reopened.size.value).toBe(420)
  })
})

describe('what records the agent panel preference', () => {
  it('persists a deliberate toggle', async () => {
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useDisplayStore } = await import('../stores/display')
    localStorage.removeItem('nodus-agent-panel-collapsed')

    const store = useDisplayStore()
    store.toggleAgentPanel()

    expect(localStorage.getItem('nodus-agent-panel-collapsed')).toBe('false')
  })

  it('does not persist an edge-push reveal', async () => {
    // An edge push fires from ordinary pointer travel; recording it as a
    // preference changed every future startup
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useDisplayStore } = await import('../stores/display')
    localStorage.removeItem('nodus-agent-panel-collapsed')

    const store = useDisplayStore()
    store.toggleAgentPanel({ persist: false })

    expect(store.agentPanelCollapsed).toBe(false)
    expect(localStorage.getItem('nodus-agent-panel-collapsed')).toBeNull()
  })
})

describe('clearing the preference the edge push wrote', () => {
  it('drops a value recorded before the reveal stopped persisting', () => {
    // That value records an accidental edge brush, not an intent
    localStorage.clear()
    localStorage.setItem('nodus-agent-panel-collapsed', 'false')

    expect(uiStorage.getAgentPanelCollapsed()).toBe(true)
  })

  it('runs once, so a later deliberate choice survives', () => {
    localStorage.clear()
    localStorage.setItem('nodus-agent-panel-collapsed', 'false')
    uiStorage.getAgentPanelCollapsed()

    // The user then chooses to keep it open
    uiStorage.setAgentPanelCollapsed(false)

    expect(uiStorage.getAgentPanelCollapsed()).toBe(false)
  })
})
