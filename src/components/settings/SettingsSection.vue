<script setup lang="ts">
/**
 * A named, collapsible group of settings. Every section of the modal uses it,
 * so a heading, its chevron and the open state behave the same everywhere.
 */
import { ref } from 'vue'

const props = defineProps<{
  title: string
  hint?: string
  collapsed?: boolean
}>()

const open = ref(!props.collapsed)
</script>

<template>
  <section class="settings-collapsible" :class="{ open }">
    <button
      type="button"
      class="settings-collapsible-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg
        class="chevron"
        :class="{ rotated: open }"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
      <span class="settings-collapsible-title">{{ title }}</span>
      <span v-if="hint" class="settings-collapsible-hint">{{ hint }}</span>
    </button>
    <div v-if="open" class="settings-collapsible-body">
      <slot />
    </div>
  </section>
</template>
