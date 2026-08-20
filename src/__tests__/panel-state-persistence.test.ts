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

  it('starts unfolded so the agent is discoverable', () => {
    expect(uiStorage.getAgentPanelCollapsed()).toBe(false)
  })

  it('remembers being folded away', () => {
    uiStorage.setAgentPanelCollapsed(true)
    expect(uiStorage.getAgentPanelCollapsed()).toBe(true)
  })
})
