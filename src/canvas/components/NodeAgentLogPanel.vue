<script setup lang="ts">
defineProps<{
  visible: boolean
  log: string[]
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div
    v-if="visible && log.length > 0"
    class="node-agent-log-panel"
    @mousedown.stop
  >
    <div class="log-header">
      <span>Agent Log</span>
      <button @click="$emit('close')">x</button>
    </div>
    <div class="log-content">
      <div v-for="(line, i) in log" :key="i" class="log-line">{{ line }}</div>
    </div>
  </div>
</template>
