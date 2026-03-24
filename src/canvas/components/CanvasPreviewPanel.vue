<script setup lang="ts">
defineProps<{
  visible: boolean
  title: string
  content: string
}>()

const emit = defineEmits<{
  close: []
  zoomToNode: []
}>()
</script>

<template>
  <Transition name="slide-in">
    <div
      v-if="visible"
      class="node-preview-panel"
      @wheel.stop
      @pointerdown.stop
    >
      <div class="preview-header">
        <h3>{{ title }}</h3>
        <button class="preview-close" @click="emit('close')">&times;</button>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="preview-content" v-html="content"></div>
      <div class="preview-actions">
        <button @click="emit('zoomToNode')">Zoom to Node</button>
      </div>
    </div>
  </Transition>
</template>
