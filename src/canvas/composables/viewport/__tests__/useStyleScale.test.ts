import { describe, it, expect } from 'vitest'
import { nextTick, ref } from 'vue'
import { quantiseScale, useStyleScale, STYLE_SCALE_STEP } from '../useStyleScale'

describe('the scale that sizes borders and strokes', () => {
  // A border sized from the live scale restyled every mounted card on every
  // frame of a zoom (PRODUCT_DESIGN.md > Zooming a canvas of cards)
  it('is a step of a 1.5x ladder, so a short zoom changes it not at all', () => {
    expect(quantiseScale(1)).toBe(1)
    expect(quantiseScale(1.1)).toBe(1)
    expect(quantiseScale(0.9)).toBe(1)
    expect(quantiseScale(1.5)).toBeCloseTo(STYLE_SCALE_STEP)
    expect(quantiseScale(0.3)).toBeCloseTo(1 / STYLE_SCALE_STEP ** 3)
  })

  it('keeps a 2px border within 1.6 and 2.4px on screen at any zoom', () => {
    for (let scale = 0.05; scale <= 3; scale *= 1.07) {
      const onScreen = (2 / quantiseScale(scale)) * scale
      expect(onScreen).toBeGreaterThanOrEqual(1.63)
      expect(onScreen).toBeLessThanOrEqual(2.45)
    }
  })

  it('holds while a gesture is live and follows the scale once it ends', async () => {
    const scale = ref(1)
    const gestureActive = ref(false)
    const { styleScale, nodeBorderWidth } = useStyleScale({ scale, gestureActive })
    expect(styleScale.value).toBe(1)
    expect(nodeBorderWidth.value).toBe(2)

    gestureActive.value = true
    scale.value = 0.3
    await nextTick()
    expect(styleScale.value).toBe(1)
    expect(nodeBorderWidth.value).toBe(2)

    gestureActive.value = false
    await nextTick()
    expect(styleScale.value).toBeCloseTo(quantiseScale(0.3))
    expect(nodeBorderWidth.value).toBeCloseTo(2 / quantiseScale(0.3))
  })

  it('follows a programmatic zoom at once, with no gesture to wait for', async () => {
    const scale = ref(1)
    const { styleScale } = useStyleScale({ scale, gestureActive: ref(false) })
    scale.value = 2.2
    await nextTick()
    expect(styleScale.value).toBeCloseTo(STYLE_SCALE_STEP ** 2)
  })
})
