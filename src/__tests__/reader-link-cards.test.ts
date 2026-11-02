/**
 * The links sidebar lists the links as the reader shows them
 * (PRODUCT_DESIGN.md > Anchored nodes).
 *
 * Cards were built from the section's Markdown and placed by counting the
 * rendered links. Whenever the two counts differed, cards were matched to
 * the wrong links or to none and fell back to the top of the reader, out of
 * view.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { renderMarkdown } from '../services/MarkdownRenderService'
import StorylineReferencesSidebar from '../components/StorylineReferencesSidebar.vue'
import type { Node } from '../types'

function node(id: string, title: string, markdown_content = ''): Node {
  return { id, title, markdown_content, node_type: 'note' } as Node
}

const section = node('chapter-3', 'Chapter 3', 'Recap: [[Grace]] meets [[Alan]].\n\nThen [[Edsger]] arrives, and [[Barbara]] leaves.')
const all = [section, node('g', 'Grace'), node('a', 'Alan'), node('e', 'Edsger'), node('b', 'Barbara')]

/** Link spacing wide enough that no two cards collapse or push each other */
const SPACING = 200

let wrapper: VueWrapper

function mountOnRenderedSection() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useNodesStore()
  store.nodes = all

  // The reader's section as rendered
  const content = document.createElement('div')
  const article = document.createElement('article')
  article.setAttribute('data-node-index', '0')
  article.innerHTML = renderMarkdown(section.markdown_content!, {
    wikilinkExists: t => all.some(n => n.title === t),
  })
  content.appendChild(article)
  document.body.appendChild(content)

  // Each rendered link sits SPACING below the previous one
  article.querySelectorAll('a.wikilink').forEach((link, i) => {
    link.getBoundingClientRect = () => ({ top: SPACING * (i + 1) }) as DOMRect
  })

  wrapper = mount(StorylineReferencesSidebar, {
    props: { nodes: [section], activeIndex: 0, contentRef: content },
    global: { plugins: [pinia], stubs: { Icon: true, MarkdownContent: true } },
  })
  return article
}

function cards() {
  return wrapper.findAll('.reference-card').map(card => ({
    title: card.find('.ref-title').text(),
    top: parseFloat(card.attributes('style')!.match(/top:\s*([\d.-]+)px/)![1]),
  }))
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('the reader links sidebar', () => {
  it('gives every rendered link a card', async () => {
    mountOnRenderedSection()
    await new Promise(r => setTimeout(r, 150))

    expect(cards().map(c => c.title)).toEqual(['Grace', 'Alan', 'Edsger', 'Barbara'])
  })

  it('places each card level with its link', async () => {
    mountOnRenderedSection()
    await new Promise(r => setTimeout(r, 150))

    expect(cards().map(c => c.top)).toEqual([1, 2, 3, 4].map(i => SPACING * i))
  })

  it('runs nothing while the text scrolls', async () => {
    const article = mountOnRenderedSection()
    await new Promise(r => setTimeout(r, 150))
    const content = article.parentElement!

    let measured = 0
    article.querySelectorAll('a.wikilink').forEach(link => {
      const rect = link.getBoundingClientRect
      link.getBoundingClientRect = () => {
        measured++
        return rect()
      }
    })

    content.scrollTop = 300
    content.dispatchEvent(new Event('scroll'))
    await new Promise(r => setTimeout(r, 50))

    // The cards scroll natively with the text; a card moved by script trails
    // the native scroll (PRODUCT_DESIGN.md > Anchored nodes)
    expect(measured).toBe(0)
    expect(cards().map(c => c.top)).toEqual([1, 2, 3, 4].map(i => SPACING * i))
  })

  it('sits in the scroll container of the text', () => {
    // Parsed rather than matched as text: containment is the property
    const { descriptor } = parse(readFileSync(resolve(__dirname, '../components/StorylineReader.vue'), 'utf-8'))
    type El = { tag?: string; props?: { name: string; value?: { content: string } }[]; children?: El[] }
    const find = (el: El, test: (e: El) => boolean): El | null =>
      test(el) ? el : (el.children ?? []).reduce<El | null>((hit, c) => hit ?? find(c, test), null)

    const scroller = find(descriptor.template!.ast as El, e =>
      !!e.props?.some(p => p.name === 'ref' && p.value?.content === 'contentRef'))
    expect(scroller, 'the reader scroll container').not.toBeNull()
    expect(find(scroller!, e => e.tag === 'StorylineReferencesSidebar')).not.toBeNull()
  })

  it('measures the links again when the rendered content changes', async () => {
    const article = mountOnRenderedSection()
    await new Promise(r => setTimeout(r, 150))

    const link = document.createElement('a')
    link.className = 'wikilink'
    link.dataset.target = 'Grace'
    link.getBoundingClientRect = () => ({ top: SPACING * 5 }) as DOMRect
    article.appendChild(link)
    await new Promise(r => setTimeout(r, 50))

    expect(cards().map(c => c.top)).toEqual([1, 2, 3, 4, 5].map(i => SPACING * i))
  })
})
