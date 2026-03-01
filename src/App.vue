<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PixiCanvas from './canvas/PixiCanvas.vue'
import { useNodesStore } from './stores/nodes'

const store = useNodesStore()
const theme = ref<'light' | 'dark'>('light')

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
}

onMounted(() => {
  // Initialize store
  store.initialize()
})
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <h1>Nodus</h1>
      <button @click="toggleTheme">
        {{ theme === 'light' ? 'Dark' : 'Light' }}
      </button>
    </header>
    <main class="canvas-container">
      <PixiCanvas />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-node);
  border-bottom: 1px solid var(--border-node);
}

.toolbar h1 {
  font-size: 18px;
  font-weight: 600;
}

.toolbar button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-node);
  background: var(--bg-canvas);
  color: var(--text-main);
  cursor: pointer;
}

.canvas-container {
  flex: 1;
  position: relative;
}
</style>
