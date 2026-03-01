<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PixiCanvas from './canvas/PixiCanvas.vue'
import NodePanel from './components/NodePanel.vue'
import { useNodesStore } from './stores/nodes'

const store = useNodesStore()
const theme = ref<'light' | 'dark'>('light')
const importing = ref(false)
const ready = ref(false)
const initError = ref<string | null>(null)

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
}

async function importVault() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Obsidian Vault',
    })

    if (selected && typeof selected === 'string') {
      importing.value = true
      await store.importVault(selected)
    }
  } catch (e) {
    console.error('Import failed:', e)
  } finally {
    importing.value = false
  }
}

function addNode() {
  const centerX = window.innerWidth / 2 - 100
  const centerY = window.innerHeight / 2 - 60
  store.createNode({
    title: 'New Note',
    node_type: 'note',
    canvas_x: centerX + Math.random() * 100 - 50,
    canvas_y: centerY + Math.random() * 100 - 50,
  })
}

onMounted(async () => {
  try {
    console.log('App: Initializing store...')
    await store.initialize()
    console.log('App: Store initialized, nodes:', store.nodes.length)
    ready.value = true
  } catch (e) {
    console.error('App: Init error', e)
    initError.value = String(e)
  }
})
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <div class="toolbar-left">
        <h1>Nodus</h1>
      </div>
      <div class="toolbar-center">
        <span class="node-count">{{ store.nodes.length }} nodes</span>
        <span class="edge-count">{{ store.edges.length }} edges</span>
      </div>
      <div class="toolbar-right">
        <button title="Add new node" @click="addNode">
          + Node
        </button>
        <button :disabled="importing" title="Import Obsidian vault" @click="importVault">
          {{ importing ? 'Importing...' : 'Import Vault' }}
        </button>
        <button @click="toggleTheme">
          {{ theme === 'light' ? 'Dark' : 'Light' }}
        </button>
      </div>
    </header>
    <main class="canvas-container">
      <div v-if="initError" class="error-message">
        Error: {{ initError }}
      </div>
      <div v-else-if="!ready" class="loading-message">
        Loading...
      </div>
      <template v-else>
        <PixiCanvas />
        <NodePanel />
      </template>
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
  background: #ffffff;
  border-bottom: 1px solid #e4e4e7;
  gap: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #71717a;
  font-size: 13px;
}

.toolbar h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.toolbar button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e4e4e7;
  background: #f4f4f5;
  color: #18181b;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.toolbar button:hover {
  background: #ffffff;
}

.toolbar button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.canvas-container {
  flex: 1;
  position: relative;
}

.error-message {
  color: red;
  padding: 20px;
  font-family: monospace;
}

.loading-message {
  padding: 20px;
  color: #71717a;
  font-size: 16px;
}
</style>
