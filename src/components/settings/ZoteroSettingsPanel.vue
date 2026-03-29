<script setup lang="ts">
/**
 * Zotero Settings Panel
 * Configures local Zotero library and Zotero Cloud API integration
 */
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useZotero } from '../../composables/useZotero'
import { useCitationGraph } from '../../composables/useCitationGraph'
import { useNodesStore } from '../../stores/nodes'
import { zoteroStorage } from '../../lib/storage'
import { zoteroApi, type ZoteroApiCollection, type ZoteroApiItem } from '../../lib/zoteroApi'
import { formatCitationAsMarkdown } from '../../lib/citationFormat'

const { t } = useI18n()
const store = useNodesStore()
const zotero = useZotero()

// Citation graph composable
const citationGraph = useCitationGraph({
  getNodes: () => store.filteredNodes,
  getEdges: () => store.filteredEdges,
  createNode: store.createNode,
  createEdge: store.createEdge,
  getCurrentWorkspaceId: () => store.currentWorkspaceId,
})

// Zotero Cloud API settings
const zoteroUserId = ref(zoteroStorage.getUserId())
const zoteroApiKey = ref(zoteroStorage.getApiKey())
const cloudStatus = ref<'idle' | 'testing' | 'valid' | 'invalid'>('idle')

// Cloud collections
const cloudCollections = ref<ZoteroApiCollection[]>([])
const cloudLoading = ref(false)
const cloudError = ref<string | null>(null)
const cloudImportProgress = ref<{ current: number; total: number; item: string } | null>(null)

// Citation graph options
const createStubs = ref(true)
const citationGraphResult = ref<{ edges: number; stubs: number } | null>(null)

// Import state
const importingCollection = ref<string | null>(null)

// Save cloud settings
watch(zoteroUserId, (value) => {
  zoteroStorage.setUserId(value)
  cloudStatus.value = 'idle'
})

watch(zoteroApiKey, (value) => {
  zoteroStorage.setApiKey(value)
  cloudStatus.value = 'idle'
})

// Cloud API configured
const isCloudConfigured = computed(() =>
  Boolean(zoteroUserId.value && zoteroApiKey.value)
)

// Test Zotero Cloud connection and fetch collections
async function testCloudConnection() {
  if (!isCloudConfigured.value) return

  cloudStatus.value = 'testing'
  cloudError.value = null
  try {
    const response = await fetch(
      `https://api.zotero.org/users/${zoteroUserId.value}/collections?limit=1`,
      {
        headers: {
          'Zotero-API-Key': zoteroApiKey.value,
        },
      }
    )
    if (response.ok) {
      cloudStatus.value = 'valid'
      // Fetch all collections
      await fetchCloudCollections()
    } else {
      cloudStatus.value = 'invalid'
    }
  } catch {
    cloudStatus.value = 'invalid'
  }
}

// Fetch collections from Zotero Cloud
async function fetchCloudCollections() {
  if (!isCloudConfigured.value) return

  cloudLoading.value = true
  cloudError.value = null
  try {
    const collections = await zoteroApi.getCollections()
    cloudCollections.value = collections
  } catch (e) {
    cloudError.value = String(e)
    cloudCollections.value = []
  } finally {
    cloudLoading.value = false
  }
}

// Format cloud item as markdown with frontmatter
function formatCloudItemAsMarkdown(item: ZoteroApiItem): string {
  return formatCitationAsMarkdown({
    title: item.title,
    doi: item.DOI,
    zoteroKey: item.key,
    itemType: item.itemType,
    date: item.date,
    journal: item.publicationTitle,
    volume: item.volume,
    issue: item.issue,
    pages: item.pages,
    authors: item.creators
      ?.filter(c => c.creatorType === 'author')
      .map(c => ({
        name: c.name,
        firstName: c.firstName,
        lastName: c.lastName,
      })),
    abstract: item.abstractNote,
  })
}

// Shared helper to import Zotero items as nodes
async function importZoteroItems(
  items: ZoteroApiItem[],
  emptyMessage: string
): Promise<void> {
  if (items.length === 0) {
    cloudError.value = emptyMessage
    return
  }

  const nodeIds: string[] = []
  const startX = 100
  const startY = 100
  const nodeWidth = 300
  const nodeHeight = 200
  const cols = Math.ceil(Math.sqrt(items.length))
  const padding = 40

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    cloudImportProgress.value = {
      current: i + 1,
      total: items.length,
      item: item.title || 'Untitled',
    }

    const col = i % cols
    const row = Math.floor(i / cols)
    const x = startX + col * (nodeWidth + padding)
    const y = startY + row * (nodeHeight + padding)

    const markdown = formatCloudItemAsMarkdown(item)

    try {
      const node = await store.createNode({
        title: item.title || 'Untitled',
        markdown_content: markdown,
        node_type: 'citation',
        canvas_x: x,
        canvas_y: y,
        width: nodeWidth,
        height: nodeHeight,
        workspace_id: store.currentWorkspaceId || undefined,
      })
      nodeIds.push(node.id)
    } catch {
      // Node creation failed - continue with remaining items
    }
  }

  cloudImportProgress.value = null

  if (nodeIds.length > 0) {
    await store.layoutNodes(nodeIds)
  }
}

// Import all items from Zotero Cloud library
async function importAllCloudItems() {
  if (importingCollection.value) return

  importingCollection.value = 'all'
  cloudError.value = null
  try {
    const items = await zoteroApi.getItems()
    await importZoteroItems(items, 'No items in library')
  } catch (e) {
    cloudError.value = String(e)
  } finally {
    importingCollection.value = null
    cloudImportProgress.value = null
  }
}

// Import collection from Zotero Cloud
async function importCloudCollection(collectionKey: string) {
  if (importingCollection.value) return

  importingCollection.value = collectionKey
  cloudError.value = null
  try {
    const items = await zoteroApi.getCollectionItems(collectionKey)
    await importZoteroItems(items, 'No items in collection')
  } catch (e) {
    cloudError.value = String(e)
  } finally {
    importingCollection.value = null
    cloudImportProgress.value = null
  }
}

// Import collection to canvas
async function importCollection(collectionKey: string) {
  if (importingCollection.value) return

  importingCollection.value = collectionKey
  try {
    const result = await zotero.importCollectionToCanvas(
      collectionKey,
      store.createNode,
      { workspaceId: store.currentWorkspaceId || undefined }
    )
    if (result.nodesCreated > 0) {
      // Layout the new nodes
      await store.layoutNodes(result.nodeIds)
    }
  } catch (e) {
    console.error('Failed to import collection:', e)
  } finally {
    importingCollection.value = null
  }
}

// Build citation graph
async function buildGraph() {
  citationGraphResult.value = null
  const result = await citationGraph.buildCitationGraph({
    createStubs: createStubs.value,
  })
  citationGraphResult.value = {
    edges: result.edgesCreated,
    stubs: result.stubNodesCreated,
  }
}
</script>

<template>
  <div class="settings-section">
    <!-- Local Zotero Library -->
    <div class="setting-group">
      <label>{{ t('settings.zotero.library') }}</label>

      <div v-if="!zotero.isConnected.value" class="zotero-connect">
        <button
          class="detect-btn"
          :disabled="zotero.isLoading.value"
          @click="zotero.detectZotero()"
        >
          {{ zotero.isLoading.value ? t('settings.zotero.detecting') : t('settings.zotero.detect') }}
        </button>
        <span class="hint">{{ t('settings.zotero.detectHint') }}</span>
      </div>

      <div v-else class="zotero-connected">
        <div class="connected-status">
          <span class="status-icon">&#10003;</span>
          <span>{{ t('settings.zotero.connected') }}</span>
          <button class="disconnect-btn" @click="zotero.disconnect()">
            {{ t('settings.zotero.disconnect') }}
          </button>
        </div>
        <div class="zotero-path">{{ zotero.zoteroPath.value }}</div>
      </div>

      <div v-if="zotero.error.value" class="error-message">
        {{ zotero.error.value }}
      </div>
    </div>

    <!-- Collections with Import -->
    <div v-if="zotero.isConnected.value" class="setting-group">
      <label>{{ t('settings.zotero.collections') }} ({{ zotero.collections.value.length }})</label>

      <div v-if="zotero.isLoading.value" class="loading">
        {{ t('settings.zotero.loading') }}
      </div>

      <div v-else-if="zotero.collections.value.length === 0" class="no-collections">
        {{ t('settings.zotero.noCollections') }}
      </div>

      <div v-else class="collections-list">
        <div
          v-for="collection in zotero.topLevelCollections.value"
          :key="collection.key"
          class="collection-item"
        >
          <div class="collection-info">
            <span class="collection-name">{{ collection.name }}</span>
            <span class="collection-count">{{ collection.item_count }} {{ t('settings.zotero.items') }}</span>
          </div>
          <button
            class="import-btn"
            :disabled="importingCollection === collection.key"
            @click="importCollection(collection.key)"
          >
            <template v-if="importingCollection === collection.key && zotero.importProgress.value">
              {{ zotero.importProgress.value.current }}/{{ zotero.importProgress.value.total }}
            </template>
            <template v-else>
              {{ t('settings.zotero.import') }}
            </template>
          </button>
        </div>
      </div>

      <!-- Import Progress -->
      <div v-if="zotero.importProgress.value" class="import-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${(zotero.importProgress.value.current / zotero.importProgress.value.total) * 100}%` }"
          />
        </div>
        <span class="progress-text">
          {{ t('settings.zotero.importing') }} {{ zotero.importProgress.value.currentItem }}
        </span>
      </div>

      <span class="hint">{{ t('settings.zotero.collectionsHint') }}</span>
    </div>

    <!-- Citation Graph Builder -->
    <div class="setting-group citation-section">
      <label>{{ t('settings.zotero.citationGraph.title') }}</label>
      <span class="hint section-hint">{{ t('settings.zotero.citationGraph.hint') }}</span>

      <div class="citation-options">
        <label class="checkbox-label">
          <input v-model="createStubs" type="checkbox" />
          {{ t('settings.zotero.citationGraph.createStubs') }}
        </label>
        <span class="hint">{{ t('settings.zotero.citationGraph.stubsHint') }}</span>
      </div>

      <button
        class="build-btn"
        :disabled="citationGraph.isBuilding.value"
        @click="buildGraph"
      >
        {{ citationGraph.isBuilding.value ? t('settings.zotero.citationGraph.building') : t('settings.zotero.citationGraph.build') }}
      </button>

      <!-- Build Progress -->
      <div v-if="citationGraph.progress.value && citationGraph.isBuilding.value" class="import-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${(citationGraph.progress.value.current / citationGraph.progress.value.total) * 100}%` }"
          />
        </div>
        <span class="progress-text">
          {{ t(`settings.zotero.citationGraph.${citationGraph.progress.value.phase}`) }}
          <template v-if="citationGraph.progress.value.currentPaper">
            - {{ citationGraph.progress.value.currentPaper }}
          </template>
        </span>
      </div>

      <!-- Result -->
      <div v-if="citationGraphResult" class="result-message">
        {{ t('settings.zotero.citationGraph.result', { edges: citationGraphResult.edges, stubs: citationGraphResult.stubs }) }}
      </div>
    </div>

    <!-- Zotero Cloud API -->
    <div class="setting-group cloud-section">
      <label>{{ t('settings.zotero.cloud.title') }}</label>
      <span class="hint section-hint">{{ t('settings.zotero.cloud.hint') }}</span>

      <div class="cloud-fields">
        <div class="field-group">
          <label class="field-label">{{ t('settings.zotero.cloud.userId') }}</label>
          <input
            v-model="zoteroUserId"
            type="text"
            :placeholder="t('settings.zotero.cloud.userIdPlaceholder')"
          />
        </div>

        <div class="field-group">
          <label class="field-label">{{ t('settings.zotero.cloud.apiKey') }}</label>
          <div class="input-with-status">
            <input
              v-model="zoteroApiKey"
              type="password"
              :placeholder="t('settings.zotero.cloud.apiKeyPlaceholder')"
            />
            <button
              v-if="isCloudConfigured && cloudStatus !== 'testing'"
              class="validate-btn"
              :title="t('settings.zotero.cloud.testConnection')"
              @click="testCloudConnection"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </button>
            <span
              v-if="cloudStatus !== 'idle'"
              class="status-indicator"
              :class="cloudStatus"
              :title="cloudStatus === 'valid' ? t('settings.zotero.cloud.valid') : cloudStatus === 'invalid' ? t('settings.zotero.cloud.invalid') : t('settings.zotero.cloud.testing')"
            />
          </div>
        </div>
      </div>

      <span class="hint">
        {{ t('settings.zotero.cloud.getKey') }}
        <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener">
          zotero.org/settings/keys
        </a>
      </span>

      <!-- Cloud Collections -->
      <div v-if="cloudStatus === 'valid'" class="cloud-collections">
        <label>{{ t('settings.zotero.collections') }} ({{ cloudCollections.length }})</label>

        <!-- Import All Items button -->
        <button
          class="import-all-btn"
          :disabled="importingCollection === 'all'"
          @click="importAllCloudItems"
        >
          <template v-if="importingCollection === 'all' && cloudImportProgress">
            {{ cloudImportProgress.current }}/{{ cloudImportProgress.total }}
          </template>
          <template v-else>
            {{ t('settings.zotero.cloud.importAll') }}
          </template>
        </button>

        <div v-if="cloudLoading" class="loading">
          {{ t('settings.zotero.loading') }}
        </div>

        <div v-else-if="cloudCollections.length === 0" class="no-collections">
          {{ t('settings.zotero.noCollections') }}
          <button class="refresh-btn" @click="fetchCloudCollections">
            {{ t('settings.zotero.cloud.refresh') }}
          </button>
        </div>

        <div v-else class="collections-list">
          <div
            v-for="collection in cloudCollections"
            :key="collection.key"
            class="collection-item"
          >
            <div class="collection-info">
              <span class="collection-name">{{ collection.data.name }}</span>
            </div>
            <button
              class="import-btn"
              :disabled="importingCollection === collection.key"
              @click="importCloudCollection(collection.key)"
            >
              <template v-if="importingCollection === collection.key && cloudImportProgress">
                {{ cloudImportProgress.current }}/{{ cloudImportProgress.total }}
              </template>
              <template v-else>
                {{ t('settings.zotero.import') }}
              </template>
            </button>
          </div>
        </div>

        <!-- Cloud Import Progress -->
        <div v-if="cloudImportProgress" class="import-progress">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${(cloudImportProgress.current / cloudImportProgress.total) * 100}%` }"
            />
          </div>
          <span class="progress-text">
            {{ t('settings.zotero.importing') }} {{ cloudImportProgress.item }}
          </span>
        </div>

        <div v-if="cloudError" class="error-message">
          {{ cloudError }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-group > label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group > label {
  color: #f4f4f5;
}

.hint {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

.hint a {
  color: var(--primary-color, #3b82f6);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

.section-hint {
  margin-bottom: 8px;
}

/* Zotero Connect */
.zotero-connect {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detect-btn {
  padding: 10px 20px;
  font-size: 14px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.detect-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.detect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.zotero-connected {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connected-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  color: #22c55e;
  font-weight: bold;
}

.disconnect-btn {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
}

.disconnect-btn:hover {
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .disconnect-btn {
  border-color: #3f3f46;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .disconnect-btn:hover {
  background: #3f3f46;
  color: #f4f4f5;
}

.zotero-path {
  font-size: 12px;
  color: var(--text-muted, #71717a);
  font-family: monospace;
  word-break: break-all;
}

.error-message {
  color: #ef4444;
  font-size: 13px;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
}

.loading {
  color: var(--text-muted, #71717a);
  font-size: 13px;
  font-style: italic;
}

.no-collections {
  color: var(--text-muted, #71717a);
  font-size: 13px;
}

/* Collections List */
.collections-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.collection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 6px;
  font-size: 13px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .collection-item {
  background: #18181b;
}

.collection-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.collection-name {
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .collection-name {
  color: #f4f4f5;
}

.collection-count {
  color: var(--text-muted, #71717a);
  font-size: 11px;
}

.import-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.15s;
  min-width: 60px;
}

.import-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.import-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

/* Import Progress */
.import-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 6px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .import-progress {
  background: #18181b;
}

.progress-bar {
  height: 4px;
  background: var(--border-node, #e4e4e7);
  border-radius: 2px;
  overflow: hidden;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .progress-bar {
  background: #3f3f46;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color, #3b82f6);
  transition: width 0.2s;
}

.progress-text {
  font-size: 11px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Cloud Section */
.cloud-section {
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-node, #e4e4e7);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .cloud-section {
  border-color: #3f3f46;
}

.cloud-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted, #71717a);
}

.field-group input {
  padding: 8px 12px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  font-size: 14px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .field-group input {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.field-group input:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
}

.input-with-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-status input {
  flex: 1;
}

.validate-btn {
  padding: 6px;
  background: var(--border-node, #e4e4e7);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-main, #18181b);
  display: flex;
  align-items: center;
  justify-content: center;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .validate-btn {
  background: #3f3f46;
  color: #f4f4f5;
}

.validate-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator.testing {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.status-indicator.valid {
  background: #10b981;
}

.status-indicator.invalid {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Citation Graph Section */
.citation-section {
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-node, #e4e4e7);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .citation-section {
  border-color: #3f3f46;
}

.citation-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-main, #18181b);
  cursor: pointer;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .checkbox-label {
  color: #f4f4f5;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.build-btn {
  padding: 10px 20px;
  font-size: 14px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.build-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.build-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-message {
  padding: 8px 12px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid #22c55e;
  border-radius: 6px;
  color: #16a34a;
  font-size: 13px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .result-message {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

/* Cloud Collections */
.cloud-collections {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-node, #e4e4e7);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .cloud-collections {
  border-color: #3f3f46;
}

.cloud-collections > label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .cloud-collections > label {
  color: #f4f4f5;
}

.refresh-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: var(--border-node, #e4e4e7);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-main, #18181b);
  margin-left: 8px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .refresh-btn {
  background: #3f3f46;
  color: #f4f4f5;
}

.refresh-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.import-all-btn {
  padding: 10px 20px;
  font-size: 14px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.import-all-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.import-all-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>
