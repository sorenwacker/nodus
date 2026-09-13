/**
 * The queue's pending count is one reactive value, not a new one per read.
 *
 * The getter built a fresh `computed` on every access, so a template that read
 * it twice watched two different values and a watcher registered on one never
 * saw the other change (PRODUCT_DESIGN.md > Reads that stay live).
 */
import { describe, it, expect } from 'vitest'
import { llmQueue } from '../llm/queue'

describe('the queue depth the interface reads', () => {
  it('is the same value on every read', () => {
    expect(llmQueue.pendingCount).toBe(llmQueue.pendingCount)
  })

  it('reports the queue depth', () => {
    expect(llmQueue.pendingCount.value).toBe(0)
  })
})
