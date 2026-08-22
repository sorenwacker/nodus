<script setup lang="ts">
/**
 * Tells the user a newer version exists and lets them install it.
 *
 * Deliberately unobtrusive: a strip at the bottom of the window that can be
 * dismissed, never a modal. An update is not urgent enough to interrupt what
 * someone is doing (PRODUCT_DESIGN.md > Updates).
 */
import { useI18n } from 'vue-i18n'
import type { AvailableUpdate } from '../composables/useUpdateCheck'

defineProps<{
  update: AvailableUpdate | null
  installing: boolean
  error: string | null
}>()

defineEmits<{
  (e: 'install'): void
  (e: 'dismiss'): void
}>()

const { t } = useI18n()
</script>

<template>
  <Transition name="update-notice">
    <div v-if="update" class="update-notice" role="status">
      <div class="update-text">
        <strong>{{ t('updates.available', { version: update.version }) }}</strong>
        <span class="update-current">{{ t('updates.installed', { version: update.currentVersion }) }}</span>
        <span v-if="error" class="update-error">{{ error }}</span>
      </div>
      <div class="update-actions">
        <button class="update-later" @click="$emit('dismiss')">{{ t('updates.later') }}</button>
        <button class="update-install" :disabled="installing" @click="$emit('install')">
          {{ installing ? t('updates.installing') : t('updates.install') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.update-notice {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 12px 16px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: 0 8px 28px var(--shadow-md);
}

.update-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-main);
}

.update-current {
  font-size: 11px;
  color: var(--text-muted);
}

.update-error {
  font-size: 11px;
  color: var(--danger-color, #dc2626);
}

.update-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.update-later,
.update-install {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
}

.update-install {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
  font-weight: 600;
}

.update-install:disabled {
  opacity: 0.6;
  cursor: default;
}

.update-later:hover {
  color: var(--text-main);
  border-color: var(--text-muted);
}

.update-notice-enter-active,
.update-notice-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.update-notice-enter-from,
.update-notice-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
