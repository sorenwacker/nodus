<script setup lang="ts">
defineProps<{
  visible: boolean
  fetchProgress: {
    current: number
    total: number
    paperTitle: string
    paperIndex?: number
    paperCount?: number
  } | null
  queueSize: number
  waitStatus: {
    isWaiting: boolean
    remainingSeconds: number
    reason: 'backoff' | 'rateLimit'
  } | null
}>()

const emit = defineEmits<{
  cancel: []
}>()
</script>

<template>
  <div v-if="visible" class="citation-fetch-progress">
    <div class="citation-fetch-content">
      <div class="citation-fetch-header">
        <span class="citation-fetch-title">Fetching Citations</span>
        <span v-if="queueSize > 0" class="citation-fetch-queue">({{ queueSize }} queued)</span>
        <button class="citation-fetch-cancel" @click="emit('cancel')">
          Cancel
        </button>
      </div>
      <div v-if="fetchProgress" class="citation-fetch-info">
        <div v-if="fetchProgress.paperCount && fetchProgress.paperCount > 1" class="citation-fetch-papers">
          Paper {{ fetchProgress.paperIndex }} / {{ fetchProgress.paperCount }}
        </div>
        <div class="citation-fetch-count">
          Citation {{ fetchProgress.current }} / {{ fetchProgress.total }}
        </div>
        <div class="citation-fetch-paper">{{ fetchProgress.paperTitle }}</div>
        <div class="citation-fetch-bar">
          <div
            class="citation-fetch-bar-fill"
            :style="{ width: `${(fetchProgress.current / Math.max(fetchProgress.total, 1)) * 100}%` }"
          ></div>
        </div>
      </div>
      <!-- Wait countdown display -->
      <div v-if="waitStatus?.isWaiting" class="citation-fetch-wait">
        <span class="citation-fetch-wait-icon">&#8987;</span>
        <span class="citation-fetch-wait-text">
          {{ waitStatus.reason === 'backoff' ? 'Rate limited, retrying in' : 'Next request in' }}
          {{ waitStatus.remainingSeconds }}s
        </span>
      </div>
    </div>
  </div>
</template>
