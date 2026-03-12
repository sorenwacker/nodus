<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useTypst } from '../composables/useTypst'

const props = defineProps<{
  content: string
}>()

const { init, renderMathInContent, hasMath, isInitialized } = useTypst()

const renderedHtml = ref('')
const isRendering = ref(false)
const hasError = ref(false)

async function render() {
  if (!props.content || !hasMath(props.content)) {
    renderedHtml.value = props.content
    return
  }

  isRendering.value = true
  hasError.value = false

  try {
    await init()
    const result = await renderMathInContent(props.content)
    renderedHtml.value = result.html

    // Check for any errors
    hasError.value = result.mathBlocks.some(b => !!b.error)
  } catch (e) {
    console.error('[MathRenderer] Error:', e)
    renderedHtml.value = props.content
    hasError.value = true
  } finally {
    isRendering.value = false
  }
}

watch(() => props.content, render, { immediate: true })
onMounted(render)
</script>

<template>
  <div class="math-renderer" :class="{ rendering: isRendering, error: hasError }">
    <div v-if="isRendering" class="loading-indicator">
      <span class="spinner"></span>
    </div>
    <div v-html="renderedHtml" class="rendered-content"></div>
  </div>
</template>

<style scoped>
.math-renderer {
  position: relative;
}

.loading-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0.6;
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-default);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.rendered-content :deep(.typst-math) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.rendered-content :deep(.typst-display) {
  display: flex;
  justify-content: center;
  margin: 1em 0;
}

.rendered-content :deep(.typst-inline) {
  display: inline-flex;
  margin: 0 0.1em;
}

.rendered-content :deep(.typst-math svg) {
  max-width: 100%;
  height: auto;
}

.rendered-content :deep(.typst-error) {
  color: var(--color-error, #ef4444);
  background: var(--color-error-bg, #fef2f2);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}
</style>
