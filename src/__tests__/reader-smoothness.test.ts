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
import { extractHeadings } from '../lib/contentParser'
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
    // The first batch covers a screenful; the rest waits out the settle
    // delay. Relative order only: absolute wall-clock budgets flake under
    // full-suite load
    expect(batches[0].size).toBeGreaterThanOrEqual(6)
    expect(batches[1].at - batches[0].at).toBeGreaterThanOrEqual(35)
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

describe('reader mounting', () => {
  it('stays mounted and slides with a transform, like the other panels', () => {
    // A panel that mounts fresh on every open paints during its own entrance
    // (PRODUCT_DESIGN.md > Reader opening and switching)
    const app = readFileSync(resolve(__dirname, '../App.vue'), 'utf-8')

    // Mounted once, then kept: the v-if guards first use, not each open
    expect(app).toContain('readerEverOpened')
    expect(app).toContain('reader-reveal')
    expect(app).not.toContain('Transition name="reader-slide"')

    const css = readFileSync(resolve(__dirname, '../App.css'), 'utf-8')
    const reveal = css.slice(css.indexOf('.reader-reveal'))
    expect(reveal.slice(0, 600)).toContain('transform')
    expect(reveal.slice(0, 600)).toContain('var(--step-duration)')
  })
})

describe('graph chrome while reading', () => {
  it('fades the minimap and zoom controls out instead of centring them', () => {
    // The right inset keeps overlays beside a panel the user works alongside;
    // the reader is worked in, and a minimap at mid-screen is noise
    const css = readFileSync(resolve(__dirname, '../App.css'), 'utf-8')
    const rule = css.slice(css.indexOf('.with-reader .minimap'))
    expect(rule.slice(0, 300)).toContain('opacity: 0')
    expect(rule.slice(0, 300)).toContain('pointer-events: none')
  })
})

describe('contents sidebar headings', () => {
  it('extracts headings with their levels', () => {
    const headings = extractHeadings(
      '# Top\n\nProse.\n\n## Sub A\n\nMore.\n\n### Deep\n\n## Sub B\n'
    )
    expect(headings).toEqual([
      { level: 1, text: 'Top' },
      { level: 2, text: 'Sub A' },
      { level: 3, text: 'Deep' },
      { level: 2, text: 'Sub B' },
    ])
  })

  it('ignores headings inside fenced code blocks', () => {
    const headings = extractHeadings('## Real\n\n```\n# not a heading\n```\n')
    expect(headings.map(h => h.text)).toEqual(['Real'])
  })

  it('ignores frontmatter and empty input', () => {
    expect(extractHeadings('---\ntitle: x\n---\n\n## Only\n')).toEqual([
      { level: 2, text: 'Only' },
    ])
    expect(extractHeadings('')).toEqual([])
  })

  it('is shown in the reader contents, indented under each node', () => {
    const reader = readFileSync(
      resolve(__dirname, '../components/StorylineReader.vue'),
      'utf-8'
    )
    expect(reader).toContain('#after-item')
    expect(reader).toContain('toc-subheading')

    const list = readFileSync(
      resolve(__dirname, '../components/StorylineNodeList.vue'),
      'utf-8'
    )
    expect(list).toContain('name="after-item"')
  })
})

describe('reader header', () => {
  it('truncates a long title instead of pushing the buttons off screen', () => {
    // An imported paper's title is long; the contents toggle disappeared
    // behind it
    const header = readFileSync(
      resolve(__dirname, '../components/StorylineReaderHeader.vue'),
      'utf-8'
    )
    const title = header.slice(header.indexOf('.reader-title {'))
    expect(title.slice(0, 300)).toContain('text-overflow: ellipsis')

    const right = header.slice(header.indexOf('.header-right {'))
    expect(right.slice(0, 200)).toContain('flex-shrink: 0')
  })
})
