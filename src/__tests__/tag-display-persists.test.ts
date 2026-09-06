/**
 * Hiding tag nodes must outlive the session.
 *
 * The flag that hides them was initialised to true on every launch, ignoring
 * the setting the user had chosen, so switching tag nodes off worked until the
 * app restarted and then all of them came back
 * (docs/content/features.md > Tags).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createState } from '../stores/nodes/state'
import { tagStorage } from '../lib/storage'

describe('tag display preference', () => {
  beforeEach(() => localStorage.clear())

  it('starts hidden, matching the default of the setting', () => {
    expect(tagStorage.getShowTagNodes()).toBe(false)
    expect(createState().showTagEdges.value).toBe(false)
  })

  it('honours a choice made in an earlier session', () => {
    tagStorage.setShowTagNodes(true)
    expect(createState().showTagEdges.value).toBe(true)
  })

  it('hides them again when the choice is reversed', () => {
    tagStorage.setShowTagNodes(true)
    tagStorage.setShowTagNodes(false)
    expect(createState().showTagEdges.value).toBe(false)
  })

  it('leaves the other edge filters showing by default', () => {
    const state = createState()
    expect(state.showManualEdges.value).toBe(true)
    expect(state.showWikilinkEdges.value).toBe(true)
    expect(state.showStorylineEdges.value).toBe(true)
  })
})
