<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  activeIndex: number
  totalNodes: number
}>()

defineEmits<{
  (e: 'previous'): void
  (e: 'next'): void
  (e: 'goto', index: number): void
}>()
</script>

<template>
  <footer class="reader-footer" role="navigation" aria-label="Page navigation">
    <button
      class="nav-btn prev"
      :disabled="activeIndex === 0"
      aria-label="Go to previous section"
      @click="$emit('previous')"
    >
      <Icon name="back" :size="16" />
      <span>Previous</span>
    </button>

    <div class="nav-dots" role="tablist" aria-label="Section navigation">
      <button
        v-for="index in totalNodes"
        :key="index - 1"
        class="nav-dot"
        role="tab"
        :class="{ active: activeIndex === index - 1 }"
        :aria-selected="activeIndex === index - 1"
        :aria-label="`Go to section ${index}`"
        @click="$emit('goto', index - 1)"
      ></button>
    </div>

    <button
      class="nav-btn next"
      :disabled="activeIndex === totalNodes - 1"
      aria-label="Go to next section"
      @click="$emit('next')"
    >
      <span>Next</span>
      <Icon name="forward" :size="16" />
    </button>
  </footer>
</template>

<style scoped>
.reader-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  min-width: 100px;
}

.nav-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-btn.prev {
  justify-content: flex-start;
}

.nav-btn.next {
  justify-content: flex-end;
}

.nav-dots {
  display: flex;
  gap: 6px;
}

.nav-dot {
  width: 8px;
  height: 8px;
  border: none;
  border-radius: 50%;
  background: var(--border-default);
  cursor: pointer;
  padding: 0;
}

.nav-dot:hover {
  background: var(--text-muted);
}

.nav-dot.active {
  background: var(--primary-color);
}
</style>
