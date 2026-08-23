/**
 * Reader opening and switching
 * (PRODUCT_DESIGN.md > Reader opening and switching).
 *
 * Rendering every node in one synchronous pass during the slide animation
 * starves the animation frames, and blanking readable content while switching
 * storylines is a flash, not feedback.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useStorylineMarkdownRendering } from '../composables/useStorylineMarkdownRendering'
import { createPinia, setActivePinia } from 'pinia'
import type { Node } from '../types'

function node(i: number): Node {
  return {
    id: `n${i}`,
    title: `Node ${i}`,
    markdown_content: `Paragraph for node ${i} with **emphasis**.`,
  } as unknown as Node
}

describe('batched content rendering', () => {
  it('renders the first screenful at once and the rest after the slide', async () => {
    setActivePinia(createPinia())
    const rendering = useStorylineMarkdownRendering()
    const nodes = Array.from({ length: 12 }, (_, i) => node(i))

    const batches: Array<{ size: number; at: number }> = []
    const start = performance.now()
    await rendering.renderAllNodes(nodes, {
      settleMs: 40,
      onBatch: () =>
        batches.push({ size: rendering.renderedContent.value.size, at: performance.now() - start }),
    })

    // All rendered in the end
    expect(rendering.getRenderedContent('n11')).toContain('Paragraph for node 11')
    // The first batch covers a screenful and lands immediately
    expect(batches[0].size).toBeGreaterThanOrEqual(6)
    expect(batches[0].at).toBeLessThan(40)
    // The rest waits for the slide to settle: content that pops in while the
    // panel is moving reads as flicker
    expect(batches[1].at).toBeGreaterThanOrEqual(35)
  })

  it('renders a small storyline in a single pass', async () => {
    setActivePinia(createPinia())
    const rendering = useStorylineMarkdownRendering()

    const frames: number[] = []
    await rendering.renderAllNodes([node(0), node(1)], {
      onBatch: () => frames.push(1),
    })

    expect(frames.length).toBe(1)
  })
})

describe('switching storylines', () => {
  it('shows the loading state only when there is nothing to show', () => {
    // Replacing readable content with a spinner is a flash, not feedback
    const reader = readFileSync(
      resolve(__dirname, '../components/StorylineReader.vue'),
      'utf-8'
    )
    const load = reader.slice(reader.indexOf('async function loadStoryline'))

    expect(load).toContain('nodes.value.length === 0')
    expect(load).not.toMatch(/loading\.value = true\n/)
  })
})

describe('editing in the reader', () => {
  const reader = readFileSync(
    resolve(__dirname, '../components/StorylineReader.vue'),
    'utf-8'
  )

  it('starts from a double-click on the section text', () => {
    // PRODUCT_DESIGN.md > Editing in the reader
    expect(reader).toContain('@dblclick')
    expect(reader).toContain('startSectionEdit')
  })

  it('acquires the file lock before the textarea appears', () => {
    // A locked file must never be silently forked
    const fn = reader.slice(reader.indexOf('async function startSectionEdit'))
    const lock = fn.indexOf('acquireEditLock')
    const editing = fn.indexOf('editingSectionId.value = node.id')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(editing)
  })

  it('saves through the store path the canvas uses', () => {
    const fn = reader.slice(reader.indexOf('async function saveSectionEdit'))
    expect(fn).toContain('updateNodeContent')
    expect(fn).toContain('releaseEditLock')
  })
})
