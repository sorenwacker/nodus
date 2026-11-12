/**
 * The scale that sizes what is drawn in canvas units but read in screen
 * pixels: card borders and edge strokes
 * (PRODUCT_DESIGN.md > Zooming a canvas of cards).
 *
 * Sized from the live scale, both changed on every frame of a zoom, and each
 * change restyled every mounted card and rewrote every edge path: measured at
 * 30% on 71 collapsed cards and 563 edge paths, a border change cost 0.9 s
 * and a stroke change 1.2 s, against 0.1 s for the zoom transform itself.
 * So the scale they are sized from is held while a gesture is live, and is
 * taken in steps of 1.5x, so that a short zoom restyles nothing at all and a
 * long one restyles once, when it ends. Within a step a border meant to be
 * 2 px on screen is between 1.6 and 2.4 px.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

/** Scales within one step of this factor share a style scale */
export const STYLE_SCALE_STEP = 1.5

/** The on-screen width a card border aims for, in px */
const BORDER_SCREEN_PX = 2

/** The step of the scale ladder nearest to `scale` */
export function quantiseScale(scale: number): number {
  return STYLE_SCALE_STEP ** Math.round(Math.log(scale) / Math.log(STYLE_SCALE_STEP))
}

export interface UseStyleScaleContext {
  /** The live viewport scale */
  scale: Ref<number>
  /** True while any viewport gesture is live (useCanvasInput) */
  gestureActive: Ref<boolean>
}

export interface UseStyleScaleReturn {
  /** The scale borders and strokes are sized for: a ladder step, held during a gesture */
  styleScale: Ref<number>
  /** Border width of a card in canvas px, about 2 px on screen */
  nodeBorderWidth: ComputedRef<number>
}

export function useStyleScale(ctx: UseStyleScaleContext): UseStyleScaleReturn {
  const styleScale = ref(quantiseScale(ctx.scale.value))
  watch([ctx.scale, ctx.gestureActive], ([scale, live]) => {
    if (!live) styleScale.value = quantiseScale(scale)
  })
  const nodeBorderWidth = computed(() => Math.max(1, BORDER_SCREEN_PX / styleScale.value))
  return { styleScale, nodeBorderWidth }
}
