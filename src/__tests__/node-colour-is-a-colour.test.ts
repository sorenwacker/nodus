/**
 * A node's colour is a colour or nothing
 * (PRODUCT_DESIGN.md > A node's colour is a colour or nothing).
 *
 * The MCP colour tools were sent the word "null" to reset a colour and stored
 * it. A background written with it is discarded when computed, so the card had
 * no background and the edges behind it showed through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { isColorValue } from '../lib/colorValue'
import { getNodeBackground } from '../canvas/utils/nodeColors'
import { normalizeColor } from '../mcp/handlers/nodeHandlers'
import type { Node } from '../types'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

describe('isColorValue', () => {
  it.each(['#fff', '#3b82f6', '#3b82f680', 'rgba(59, 130, 246, 0.18)', 'rgb(0 0 0)', 'hsl(210, 50%, 40%)', 'var(--primary-color)'])(
    'accepts %s',
    value => expect(isColorValue(value)).toBe(true)
  )

  it.each(['null', 'undefined', '', '  ', '#12', '#ggg', 'rgba(', 'red; background: url(x)'])('refuses %j', value =>
    expect(isColorValue(value)).toBe(false)
  )
})

describe('the card background', () => {
  it('is not built from a value that is not a colour', () => {
    expect(getNodeBackground('null', 'pitch-black')).toBeUndefined()
    expect(getNodeBackground('null', 'light')).toBeUndefined()
  })
})

describe('a colour given over MCP', () => {
  it('resets on null, an empty string and the word null', () => {
    expect(normalizeColor(null)).toBeNull()
    expect(normalizeColor('')).toBeNull()
    expect(normalizeColor('null')).toBeNull()
    expect(normalizeColor(' NULL ')).toBeNull()
  })

  it('still resolves names and passes colour values through', () => {
    expect(normalizeColor('Red')).toBe(normalizeColor('red'))
    expect(isColorValue(normalizeColor('red')!)).toBe(true)
    expect(normalizeColor('#123456')).toBe('#123456')
  })

  it('refuses what is neither', () => {
    expect(() => normalizeColor('banana-ish')).toThrow(/colour|color/i)
  })
})

describe('the store', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  it('writes an empty colour in place of a value that is not a colour', async () => {
    const { updateNodeColor } = await import('../stores/nodes/crud')
    const nodes = ref([{ id: 'a', color_theme: '#3b82f6' } as Node])

    await updateNodeColor(nodes, 'a', 'null')

    expect(nodes.value[0].color_theme).toBeNull()
    expect(invokeMock).toHaveBeenCalledWith('update_node_color', { id: 'a', color: null })
  })

  it('resets the nodes already holding such a value, and only those', async () => {
    const { resetInvalidNodeColors } = await import('../stores/nodes/crud')
    const nodes = ref([
      { id: 'a', color_theme: 'null' } as Node,
      { id: 'b', color_theme: '#3b82f6' } as Node,
      { id: 'c', color_theme: null } as Node,
    ])

    const count = await resetInvalidNodeColors(nodes)

    expect(count).toBe(1)
    expect(nodes.value.map(n => n.color_theme)).toEqual([null, '#3b82f6', null])
    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('update_node_color', { id: 'a', color: null })
  })
})
