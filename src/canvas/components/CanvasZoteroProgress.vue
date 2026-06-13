<script setup lang="ts">
defineProps<{
  visible: boolean
  progress: {
    current: number
    total: number
    currentItem: string
  } | null
}>()

const emit = defineEmits<{
  cancel: []
}>()
</script>

<template>
  <div v-if="visible && progress" class="citation-fetch-progress">
    <div class="citation-fetch-content">
      <div class="citation-fetch-header">
        <span class="citation-fetch-title">Adding to Zotero</span>
        <button class="citation-fetch-cancel" @click="emit('cancel')">
          Stop
        </button>
      </div>
      <div class="citation-fetch-info">
        <div class="citation-fetch-count">
          {{ progress.current }} / {{ progress.total }}
        </div>
        <div class="citation-fetch-paper">{{ progress.currentItem }}</div>
        <div class="citation-fetch-bar">
          <div
            class="citation-fetch-bar-fill"
            :style="{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
