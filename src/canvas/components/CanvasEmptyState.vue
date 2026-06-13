<script setup lang="ts">
defineProps<{
  visible: boolean
}>()
</script>

<template>
  <div v-if="visible" class="empty-state-overlay">
    <div class="empty-state-box">
      <h3>No nodes yet</h3>
      <p>Double-click anywhere to create a node</p>
    </div>
  </div>
</template>
