<script setup lang="ts">
/**
 * MCP Server Settings Panel
 *
 * Configure and control the MCP WebSocket server for AI tool integrations.
 * Uses shared MCP state from App.vue via inject.
 */
import { ref, computed, onMounted, watch, inject, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Inject shared MCP state from App.vue
const mcpRunning = inject<Ref<boolean>>('mcpRunning')
const mcpConnections = inject<Ref<string[]>>('mcpConnections')
const mcpPort = inject<Ref<number | null>>('mcpPort')
const mcpStartServer = inject<() => Promise<void>>('mcpStartServer')
const mcpStopServer = inject<() => Promise<void>>('mcpStopServer')

// Local state
const isEnabled = ref(false)
const error = ref<string | null>(null)

// Computed from injected state
const isRunning = computed(() => mcpRunning?.value ?? false)
const port = computed(() => mcpPort?.value ?? null)
const activeConnections = computed(() => mcpConnections?.value?.length ?? 0)

// Load MCP enabled state from localStorage
const MCP_ENABLED_KEY = 'nodus-mcp-enabled'
let initialLoad = true

onMounted(async () => {
  // Sync isEnabled with actual server state on mount
  const storedEnabled = localStorage.getItem(MCP_ENABLED_KEY) === 'true'
  isEnabled.value = storedEnabled || isRunning.value
  // Save the synced state
  localStorage.setItem(MCP_ENABLED_KEY, isEnabled.value ? 'true' : 'false')
  initialLoad = false

  // Auto-start if enabled but not running
  if (isEnabled.value && !isRunning.value) {
    await startServer()
  }
})

// Watch enabled toggle - skip initial load to prevent stopping server
watch(isEnabled, async (enabled) => {
  if (initialLoad) return
  localStorage.setItem(MCP_ENABLED_KEY, enabled ? 'true' : 'false')
  if (enabled && !isRunning.value) {
    await startServer()
  } else if (!enabled && isRunning.value) {
    await stopServer()
  }
})

async function startServer() {
  if (!mcpStartServer) return
  try {
    error.value = null
    await mcpStartServer()
  } catch (e) {
    error.value = String(e)
    isEnabled.value = false
  }
}

async function stopServer() {
  if (!mcpStopServer) return
  try {
    error.value = null
    await mcpStopServer()
  } catch (e) {
    error.value = String(e)
  }
}

// Generate Claude Desktop config snippet
const configSnippet = `{
  "mcpServers": {
    "nodus": {
      "command": "npx",
      "args": ["nodus-mcp-server"]
    }
  }
}`
</script>

<template>
  <div class="mcp-settings">
    <div class="setting-group">
      <label class="checkbox-label">
        <input v-model="isEnabled" type="checkbox" />
        {{ t('mcp.enableServer') }}
      </label>
      <span class="hint">{{ t('mcp.serverHint') }}</span>
    </div>

    <div v-if="isEnabled" class="server-status">
      <div class="status-row">
        <span class="status-label">{{ t('mcp.status') }}:</span>
        <span :class="['status-value', { running: isRunning }]">
          {{ isRunning ? t('mcp.running') : t('mcp.stopped') }}
        </span>
      </div>

      <div v-if="isRunning" class="status-row">
        <span class="status-label">{{ t('mcp.port') }}:</span>
        <code class="status-value">{{ port }}</code>
      </div>

      <div v-if="activeConnections > 0" class="status-row">
        <span class="status-label">{{ t('mcp.connections') }}:</span>
        <span class="status-value">{{ activeConnections }}</span>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div class="config-section">
        <span class="hint">{{ t('mcp.configHint') }}</span>
        <pre class="config-snippet">{{ configSnippet }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcp-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary-color);
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.server-status {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 90px;
}

.status-value {
  font-size: 13px;
  color: var(--text-main);
}

.status-value.running {
  color: var(--success-color, #22c55e);
  font-weight: 500;
}

.status-value code,
code.status-value {
  font-family: ui-monospace, monospace;
  background: var(--bg-surface);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-default);
}

.error-message {
  padding: 10px 12px;
  background: var(--danger-bg, rgba(239, 68, 68, 0.1));
  color: var(--danger-color, #ef4444);
  border-radius: 6px;
  font-size: 12px;
  border: 1px solid var(--danger-border, rgba(239, 68, 68, 0.2));
}

.config-section {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-snippet {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 12px;
  margin: 0;
  overflow-x: auto;
  white-space: pre;
  color: var(--text-main);
}
</style>
