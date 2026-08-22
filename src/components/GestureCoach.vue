<script setup lang="ts">
/**
 * Teaches one edge gesture at a time by asking the user to perform it.
 *
 * The card sits against the edge being taught, with a pulse marking where to
 * push. It never blocks the canvas: the gesture it asks for has to remain
 * possible while the card is on screen (PRODUCT_DESIGN.md > First-run gesture
 * coach).
 */
import { useI18n } from 'vue-i18n'
import type { GestureLesson } from '../composables/useGestureCoach'

defineProps<{
  lesson: GestureLesson | null
  step: number
  total: number
}>()

defineEmits<{ (e: 'skip'): void }>()

const { t } = useI18n()
</script>

<template>
  <Transition name="coach">
    <div v-if="lesson" class="gesture-coach" :class="`edge-${lesson}`" role="status">
      <span class="coach-pulse" aria-hidden="true"></span>
      <div class="coach-body">
        <span class="coach-progress">{{ step }} / {{ total }}</span>
        <strong class="coach-title">{{ t(`gestureCoach.${lesson}.title`) }}</strong>
        <span class="coach-instruction">{{ t(`gestureCoach.${lesson}.instruction`) }}</span>
      </div>
      <button class="coach-skip" @click="$emit('skip')">{{ t('gestureCoach.skip') }}</button>
    </div>
  </Transition>
</template>

<style scoped>
.gesture-coach {
  position: fixed;
  z-index: 2500;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: 0 10px 30px var(--shadow-md);
  /* The gesture must stay performable while the card is up */
  pointer-events: none;
  max-width: 320px;
}

.gesture-coach.edge-right {
  top: 50%;
  right: 56px;
  transform: translateY(-50%);
}

.gesture-coach.edge-left {
  top: 50%;
  left: 56px;
  transform: translateY(-50%);
}

.gesture-coach.edge-bottom {
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
}

.coach-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.coach-progress {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.coach-title {
  font-size: 13px;
  color: var(--text-main);
}

.coach-instruction {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.coach-skip {
  pointer-events: auto;
  flex-shrink: 0;
  align-self: flex-start;
  padding: 4px 8px;
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
}

.coach-skip:hover {
  color: var(--text-main);
}

.coach-pulse {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary-color);
  animation: coach-pulse 1.6s ease-out infinite;
}

@keyframes coach-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary-color) 55%, transparent); }
  70% { box-shadow: 0 0 0 12px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .coach-pulse { animation: none; }
}

.coach-enter-active,
.coach-leave-active {
  transition: opacity 0.25s ease;
}

.coach-enter-from,
.coach-leave-to {
  opacity: 0;
}
</style>
