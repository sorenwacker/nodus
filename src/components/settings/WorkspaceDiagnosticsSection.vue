<script setup lang="ts">
/**
 * Workspace Diagnostics Section
 * Displays workspace statistics and allows switching/recovering workspaces
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../../stores/nodes'

const { t } = useI18n()
const nodesStore = useNodesStore()

const emit = defineEmits<{
  close: []
}>()

// Workspace diagnostics
interface WorkspaceStats {
  id: string
  name: string
  nodeCount: number
}
const workspaceStats = ref<WorkspaceStats[]>([])
const scanningWorkspaces = ref(false)

async function scanWorkspaces() {
  scanningWorkspaces.value = true
  try {
    const { invoke } = await import('@tauri-apps/api/core')

    // Get all nodes from database
    interface NodeWithWorkspace { workspace_id: string | null }
    const allNodes = await invoke<NodeWithWorkspace[]>('get_nodes')

    // Count nodes per workspace
    const counts = new Map<string, number>()
    for (const node of allNodes) {
      const wsId = node.workspace_id || '(none)'
      counts.set(wsId, (counts.get(wsId) || 0) + 1)
    }

    // Build stats with workspace names
    const stats: WorkspaceStats[] = []

    // Add known workspaces
    for (const ws of nodesStore.workspaces) {
      stats.push({
        id: ws.id,
        name: ws.name,
        nodeCount: counts.get(ws.id) || 0
      })
      counts.delete(ws.id)
    }

    // Add orphaned workspace IDs (nodes exist but workspace not in list)
    for (const [wsId, count] of counts) {
      if (wsId !== '(none)') {
        stats.push({
          id: wsId,
          name: '(deleted)',
          nodeCount: count
        })
      }
    }

    // Add nodes with no workspace
    const noWorkspaceCount = counts.get('(none)') || 0
    if (noWorkspaceCount > 0) {
      stats.push({
        id: '',
        name: '(no workspace)',
        nodeCount: noWorkspaceCount
      })
    }

    // Sort by node count descending
    stats.sort((a, b) => b.nodeCount - a.nodeCount)
    workspaceStats.value = stats

    console.log('[Settings] Workspace stats:', stats)
  } catch (e) {
    console.error('[Settings] Failed to scan workspaces:', e)
  } finally {
    scanningWorkspaces.value = false
  }
}

async function switchToWorkspace(id: string) {
  if (id === '') {
    nodesStore.switchWorkspace(null)
  } else {
    // Check if workspace exists in list, if not try to recover it
    const exists = nodesStore.workspaces.some(w => w.id === id)
    if (!exists) {
      await nodesStore.recoverWorkspace(id)
    }
    nodesStore.switchWorkspace(id)
  }
  emit('close')
}
</script>

<template>
  <div class="setting-group">
    <label>{{ t('settings.workspaceDiagnostics') }}</label>
    <button
      class="scan-btn"
      :disabled="scanningWorkspaces"
      @click="scanWorkspaces"
    >
      {{ scanningWorkspaces ? t('settings.scanning') : t('settings.scanWorkspaces') }}
    </button>
    <div v-if="workspaceStats.length > 0" class="workspace-stats">
      <table>
        <thead>
          <tr>
            <th>{{ t('settings.workspace') }}</th>
            <th>{{ t('settings.nodes') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ws in workspaceStats"
            :key="ws.id"
            :class="{ deleted: ws.name === '(deleted)' }"
          >
            <td :title="ws.id">{{ ws.name }}</td>
            <td>{{ ws.nodeCount }}</td>
            <td>
              <button
                v-if="ws.nodeCount > 0"
                class="switch-btn"
                @click="switchToWorkspace(ws.id)"
              >
                {{ ws.name === '(deleted)' ? t('settings.recover') : t('settings.switch') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <span class="hint">
      {{ t('settings.workspaceStatsHint') }}
    </span>
  </div>
</template>

<style scoped>
.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-group > label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #18181b);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group > label {
  color: #f4f4f5;
}

.hint {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

.scan-btn {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .scan-btn {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.scan-btn:hover {
  border-color: var(--primary-color, #3b82f6);
}

.scan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-stats {
  margin-top: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.workspace-stats table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.workspace-stats th,
.workspace-stats td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .workspace-stats th,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .workspace-stats td {
  border-color: #3f3f46;
}

.workspace-stats th {
  font-weight: 500;
  color: var(--text-muted, #71717a);
  font-size: 11px;
  text-transform: uppercase;
}

.workspace-stats td:first-child {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-stats tr.deleted td:first-child {
  color: #ef4444;
}

.switch-btn {
  padding: 4px 10px;
  font-size: 11px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.switch-btn:hover {
  opacity: 0.9;
}
</style>
