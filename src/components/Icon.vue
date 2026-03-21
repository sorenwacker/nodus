<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  size?: number
  color?: 'primary' | 'danger' | 'success' | 'warning' | 'muted' | 'inherit'
}>()

const icons: Record<string, string> = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  back: '<polyline points="15 18 9 12 15 6"/>',
  forward: '<polyline points="9 18 15 12 9 6"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  'arrow-down': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  'arrow-up': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  drag: '<circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>',
  comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
}

const fillIcons = ['drag'] // Icons that use fill instead of stroke

const colorClass = computed(() => {
  if (!props.color || props.color === 'inherit') return ''
  return `icon-${props.color}`
})
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <svg
    class="icon"
    :class="colorClass"
    :width="size || 16"
    :height="size || 16"
    viewBox="0 0 24 24"
    :fill="fillIcons.includes(name) ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="icons[name] || ''"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.icon {
  flex-shrink: 0;
}

.icon-primary {
  color: var(--primary-color);
}

.icon-danger {
  color: var(--danger-color, #ef4444);
}

.icon-success {
  color: var(--success-color, #22c55e);
}

.icon-warning {
  color: var(--warning-color, #f59e0b);
}

.icon-muted {
  color: var(--text-muted);
}
</style>
