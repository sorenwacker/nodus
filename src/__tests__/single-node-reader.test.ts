/**
 * Reading a single node offers no storyline operations
 * (PRODUCT_DESIGN.md > Reading a single node).
 *
 * The reader built a placeholder storyline from the node, so the contents
 * list kept its insert, remove and reorder controls. Those sent the node's id
 * to the storyline service as a storyline id, and the refetch that followed
 * replaced the node with the storyline read before it. The node's scroll
 * position was saved under that storyline too.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import StorylineNodeList from '../components/StorylineNodeList.vue'
import type { Node } from '../types'

function node(id: string): Node {
  return { id, title: id, node_type: 'note', markdown_content: '', color_theme: null } as Node
}

function mountList(readonly: boolean) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(StorylineNodeList, {
    props: { nodes: [node('a'), node('b')], storylineId: '', compact: true, readonly },
    global: { plugins: [i18n], stubs: { Icon: true, NodePicker: true } },
  })
}

describe('the contents list while reading a single node', () => {
  it('shows the storyline controls when it lists a storyline', () => {
    const list = mountList(false)
    expect(list.find('.insert-btn').exists(), 'precondition: controls exist when editable').toBe(true)
  })

  it('offers no insert, remove or reorder control', () => {
    const list = mountList(true)

    expect(list.find('.insert-btn').exists()).toBe(false)
    expect(list.find('.remove-btn').exists()).toBe(false)
    expect(list.find('.drag-handle').exists()).toBe(false)
  })
})

describe('the reader in single-node mode', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/StorylineReader.vue'), 'utf8')

  it('lists the node without storyline controls', () => {
    const list = source.slice(source.indexOf('<StorylineNodeList'), source.indexOf('>', source.indexOf('<StorylineNodeList')))
    expect(list).toMatch(/:readonly="[^"]*singleNodeId/)
  })

  it('builds no placeholder storyline from the node', () => {
    expect(source).not.toContain('as typeof storyline.value')
  })

  it('does not remember the scroll position under the storyline id it was handed', () => {
    expect(source).not.toMatch(/useScrollPositionMemory\(\s*storylineIdRef/)
  })
})
