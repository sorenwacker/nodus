/**
 * Card text keeps its on-screen size above 100% zoom, so a zoomed-in card
 * shows more text rather than larger text. The counter-zoom factor is set on
 * the node layer, committed only once the zoom has settled, and never reaches
 * the card's stored size (PRODUCT_DESIGN.md > Card text above 100% zoom).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref, nextTick } from 'vue'
import { useCardCounterZoom, COUNTER_ZOOM_SETTLE_MS } from '../canvas/composables/viewport/useCardCounterZoom'
import { measureNodeContent } from '../canvas/utils/nodeSizing'

describe('useCardCounterZoom', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps the factor at 1 at and below 100% zoom', async () => {
    const scale = ref(1)
    const { counterZoom } = useCardCounterZoom(scale, ref(false))
    expect(counterZoom.value).toBe(1)

    scale.value = 0.6
    await nextTick()
    vi.advanceTimersByTime(COUNTER_ZOOM_SETTLE_MS)
    expect(counterZoom.value).toBe(1)
  })

  it('divides by the zoom above 100% once the zoom has settled', async () => {
    const scale = ref(1)
    const { counterZoom } = useCardCounterZoom(scale, ref(false))

    for (const zoom of [2, 4]) {
      scale.value = zoom
      await nextTick()
      vi.advanceTimersByTime(COUNTER_ZOOM_SETTLE_MS)
      expect(counterZoom.value).toBe(1 / zoom)
    }
  })

  it('starts at the settled factor for the initial zoom', () => {
    const { counterZoom } = useCardCounterZoom(ref(2.5), ref(false))
    expect(counterZoom.value).toBe(0.4)
  })

  it('does not reflow cards on intermediate zoom frames', async () => {
    const scale = ref(1)
    const { counterZoom } = useCardCounterZoom(scale, ref(false))

    for (const zoom of [1.2, 1.5, 1.8, 2]) {
      scale.value = zoom
      await nextTick()
      vi.advanceTimersByTime(COUNTER_ZOOM_SETTLE_MS / 3)
      expect(counterZoom.value).toBe(1)
    }
    vi.advanceTimersByTime(COUNTER_ZOOM_SETTLE_MS)
    expect(counterZoom.value).toBe(0.5)
  })

  it('holds the factor while a gesture is live and commits when it ends', async () => {
    const scale = ref(1)
    const gestureActive = ref(true)
    const { counterZoom } = useCardCounterZoom(scale, gestureActive)

    scale.value = 2
    await nextTick()
    vi.advanceTimersByTime(COUNTER_ZOOM_SETTLE_MS * 4)
    expect(counterZoom.value).toBe(1)

    gestureActive.value = false
    await nextTick()
    vi.advanceTimersByTime(COUNTER_ZOOM_SETTLE_MS)
    expect(counterZoom.value).toBe(0.5)
  })
})

describe('the counter-zoom factor reaches the cards', () => {
  it('is bound on the node layer', () => {
    const src = readFileSync(resolve(__dirname, '../canvas/GraphCanvas.vue'), 'utf-8')
    const layer = src.slice(src.indexOf('class="nodes-layer"'), src.indexOf('<CanvasNodeCard', src.indexOf('class="nodes-layer"')))
    expect(layer).toMatch(/'--zoom-scale':\s*counterZoom/)
  })
})

describe('auto-sizing measures at the 100% size', () => {
  it('pins the counter-zoom factor to 1 while measuring and restores it', () => {
    const layer = document.createElement('div')
    layer.style.setProperty('--zoom-scale', '0.5')
    const card = document.createElement('div')
    card.className = 'node-card'
    const content = document.createElement('div')
    content.className = 'node-content'
    card.appendChild(content)
    layer.appendChild(card)
    document.body.appendChild(layer)

    // Content height follows the factor in effect on the card: 400px of text
    // at 100%, half of that when the counter-zoom factor halves the type
    Object.defineProperty(content, 'scrollHeight', {
      get: () => 400 * Number(card.style.getPropertyValue('--zoom-scale') || 0.5),
    })

    const size = measureNodeContent(card, 200)
    expect(size!.height).toBe(400 + 36 + 4)
    expect(card.style.getPropertyValue('--zoom-scale')).toBe('')

    layer.remove()
  })
})
