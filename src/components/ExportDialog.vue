<script setup lang="ts">
/**
 * Exports nodes as a document.
 *
 * PDF and Typst share one code path: the Typst source is generated first, and
 * a PDF is that source compiled by the Typst WASM already loaded for math
 * (PRODUCT_DESIGN.md > Document export).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { exportToTypst, generateExportFilename } from '../lib/typst-export'
import { exportToPdf } from '../lib/pdf-export'
import { saveExportFile } from '../lib/tauri'
import type { Node, Edge } from '../types'

const props = withDefaults(
  defineProps<{
    nodes: Node[]
    edges: Edge[]
    /** Keep the caller's node order; set for a storyline, whose sequence is the document */
    preserveOrder?: boolean
    /** Suggested document title, e.g. the storyline name */
    defaultTitle?: string
  }>(),
  { preserveOrder: false, defaultTitle: '' }
)

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()

type Format = 'pdf' | 'typst'

const format = ref<Format>('pdf')
const title = ref(props.defaultTitle)
const author = ref('')
const paperSize = ref<'a4' | 'us-letter' | 'a5'>('a4')
const includeConnections = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)

const nodeCount = computed(() => props.nodes.length)

function options() {
  return {
    title: title.value || t('export.untitled'),
    author: author.value || undefined,
    date: new Date().toISOString().split('T')[0],
    paperSize: paperSize.value,
    includeConnections: includeConnections.value,
    preserveOrder: props.preserveOrder,
  }
}

async function runExport() {
  if (busy.value || nodeCount.value === 0) return
  busy.value = true
  error.value = null

  try {
    // Compile before asking where to put it: a document that cannot be
    // produced must not leave a file behind
    const bytes =
      format.value === 'pdf'
        ? await exportToPdf(props.nodes, props.edges, options())
        : new TextEncoder().encode(exportToTypst(props.nodes, props.edges, options()))

    const extension = format.value === 'pdf' ? 'pdf' : 'typ'
    const suggested = generateExportFilename(title.value).replace(/\.typ$/, `.${extension}`)

    // The backend owns the dialog and the write; a null result is a cancel
    const written = await saveExportFile(bytes, suggested, extension)
    if (written) emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="export-backdrop" @click.self="emit('close')">
    <div class="export-dialog" role="dialog" aria-modal="true">
      <header class="export-header">
        <h2>{{ t('export.title') }}</h2>
        <span class="export-scope">{{ t('export.nodeCount', { count: nodeCount }) }}</span>
      </header>

      <div class="export-formats">
        <button
          v-for="option in (['pdf', 'typst'] as Format[])"
          :key="option"
          class="export-format"
          :class="{ active: format === option }"
          @click="format = option"
        >
          <strong>{{ t(`export.format.${option}`) }}</strong>
          <span>{{ t(`export.formatHint.${option}`) }}</span>
        </button>
      </div>

      <div class="export-field">
        <label for="export-title">{{ t('export.documentTitle') }}</label>
        <input id="export-title" v-model="title" type="text" :placeholder="t('export.untitled')" />
      </div>

      <div class="export-field">
        <label for="export-author">{{ t('export.author') }}</label>
        <input id="export-author" v-model="author" type="text" />
      </div>

      <div class="export-field">
        <label for="export-paper">{{ t('export.paperSize') }}</label>
        <select id="export-paper" v-model="paperSize">
          <option value="a4">A4</option>
          <option value="us-letter">US Letter</option>
          <option value="a5">A5</option>
        </select>
      </div>

      <label class="export-check">
        <input v-model="includeConnections" type="checkbox" />
        {{ t('export.includeConnections') }}
      </label>

      <p v-if="error" class="export-error">{{ error }}</p>

      <footer class="export-actions">
        <button class="export-cancel" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button class="export-confirm" :disabled="busy || nodeCount === 0" @click="runExport">
          {{ busy ? t('export.working') : t('export.confirm') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.export-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.export-dialog {
  width: min(440px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: 0 18px 48px var(--shadow-md);
}

.export-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.export-header h2 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main);
}

.export-scope {
  font-size: 11px;
  color: var(--text-muted);
}

.export-formats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.export-format {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  text-align: left;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
}

.export-format strong {
  font-size: 13px;
  color: var(--text-main);
}

.export-format span {
  font-size: 11px;
  line-height: 1.4;
}

.export-format.active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.export-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.export-field label {
  flex: 0 0 92px;
  font-size: 12px;
  color: var(--text-secondary);
}

.export-field input,
.export-field select {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-input, var(--bg-surface));
  color: var(--text-main);
  font-size: 12px;
}

.export-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.export-error {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--danger-color, #dc2626) 12%, transparent);
  font-size: 11px;
  line-height: 1.5;
  color: var(--danger-color, #dc2626);
}

.export-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.export-cancel,
.export-confirm {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.export-confirm {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
  font-weight: 600;
}

.export-confirm:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
