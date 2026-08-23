<script setup lang="ts">
/**
 * The application's one tooltip.
 *
 * Every `[data-tooltip]` element is served from here, positioned by measuring
 * the trigger and the label rather than by a rule written for the container the
 * trigger happens to sit in (PRODUCT_DESIGN.md > Tooltip placement).
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { placeTooltip, type TooltipSide } from '../lib/tooltipPlacement'

const text = ref('')
const left = ref(0)
const top = ref(0)
const visible = ref(false)
const labelRef = ref<HTMLElement | null>(null)

let current: HTMLElement | null = null

const SIDES: TooltipSide[] = ['top', 'bottom', 'left', 'right']

function requestedSide(element: HTMLElement): TooltipSide | undefined {
  const value = element.getAttribute('data-tooltip-pos')
  return SIDES.find(side => side === value)
}

async function show(element: HTMLElement) {
  const label = element.getAttribute('data-tooltip')
  if (!label) return

  current = element
  text.value = label
  visible.value = true

  // Measure the label before placing it: its width decides which sides fit
  await new Promise(requestAnimationFrame)
  if (current !== element) return

  const node = labelRef.value
  if (!node) return

  const placed = placeTooltip(
    element.getBoundingClientRect(),
    { width: node.offsetWidth, height: node.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    requestedSide(element)
  )
  left.value = placed.left
  top.value = placed.top
}

function hide() {
  current = null
  visible.value = false
}

function onOver(event: PointerEvent) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-tooltip]')
  if (target instanceof HTMLElement) {
    if (target !== current) void show(target)
  } else if (current) {
    hide()
  }
}

function onFocus(event: FocusEvent) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-tooltip]')
  if (target instanceof HTMLElement) void show(target)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

onMounted(() => {
  document.addEventListener('pointerover', onOver, true)
  document.addEventListener('pointerdown', hide, true)
  document.addEventListener('focusin', onFocus, true)
  document.addEventListener('focusout', hide, true)
  document.addEventListener('keydown', onKey, true)
  // A tooltip anchored to something that moved is pointing at nothing
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
})

onUnmounted(() => {
  document.removeEventListener('pointerover', onOver, true)
  document.removeEventListener('pointerdown', hide, true)
  document.removeEventListener('focusin', onFocus, true)
  document.removeEventListener('focusout', hide, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
})
</script>

<template>
  <div
    v-show="visible"
    ref="labelRef"
    class="tooltip-layer"
    role="tooltip"
    :style="{ left: `${left}px`, top: `${top}px` }"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.tooltip-layer {
  position: fixed;
  z-index: 99999;
  padding: 6px 10px;
  max-width: 320px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-main);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  box-shadow: 0 4px 12px var(--shadow-md);
  pointer-events: none;
}
</style>
