<script setup lang="ts">
/**
 * Offers to expand a dropped PDF into a graph.
 *
 * Which shape the paper takes is the reader's choice: sections, references,
 * verification and the semantic pass are each opt-in here, and declining
 * leaves the single document node as it is
 * (PRODUCT_DESIGN.md > PDF as a graph).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  filename: string
  sectionCount: number
  referenceCount: number
  /** Whether the Zotero integration is configured */
  zoteroAvailable: boolean
  /** Whether a language model is configured */
  llmAvailable: boolean
}>()

const emit = defineEmits<{
  (
    e: 'import',
    options: {
      sections: boolean
      references: boolean
      verify: boolean
      zotero: boolean
      semantic: boolean
    }
  ): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()

const sections = ref(props.sectionCount >= 3)
const references = ref(props.referenceCount > 0)
const verify = ref(props.referenceCount > 0)
const zotero = ref(false)
const semantic = ref(false)

const anythingChosen = computed(() => sections.value || references.value)

function confirm() {
  emit('import', {
    sections: sections.value,
    references: references.value,
    verify: references.value && verify.value,
    zotero: references.value && zotero.value,
    semantic: sections.value && semantic.value,
  })
}
</script>

<template>
  <div class="pdfgraph-backdrop" @click.self="emit('cancel')">
    <div class="pdfgraph-dialog" role="dialog" aria-modal="true">
      <header class="pdfgraph-header">
        <h2>{{ t('pdfGraph.title') }}</h2>
        <span class="pdfgraph-source">{{ filename }}</span>
      </header>

      <p class="pdfgraph-lead">{{ t('pdfGraph.lead') }}</p>

      <label class="pdfgraph-option">
        <input v-model="sections" type="checkbox" :disabled="sectionCount < 2" />
        <span>
          <strong>{{ t('pdfGraph.sections', { count: sectionCount }) }}</strong>
          <em>{{ t('pdfGraph.sectionsHint') }}</em>
        </span>
      </label>

      <label class="pdfgraph-option">
        <input v-model="references" type="checkbox" :disabled="referenceCount === 0" />
        <span>
          <strong>{{ t('pdfGraph.references', { count: referenceCount }) }}</strong>
          <em>{{ t('pdfGraph.referencesHint') }}</em>
        </span>
      </label>

      <label class="pdfgraph-option sub" :class="{ off: !references }">
        <input v-model="verify" type="checkbox" :disabled="!references" />
        <span>
          <strong>{{ t('pdfGraph.verify') }}</strong>
          <em>{{ t('pdfGraph.verifyHint') }}</em>
        </span>
      </label>

      <label v-if="zoteroAvailable" class="pdfgraph-option sub" :class="{ off: !references }">
        <input v-model="zotero" type="checkbox" :disabled="!references" />
        <span>
          <strong>{{ t('pdfGraph.zotero') }}</strong>
          <em>{{ t('pdfGraph.zoteroHint') }}</em>
        </span>
      </label>

      <label v-if="llmAvailable" class="pdfgraph-option" :class="{ off: !sections }">
        <input v-model="semantic" type="checkbox" :disabled="!sections" />
        <span>
          <strong>{{ t('pdfGraph.semantic') }}</strong>
          <em>{{ t('pdfGraph.semanticHint') }}</em>
        </span>
      </label>

      <footer class="pdfgraph-actions">
        <button class="pdfgraph-cancel" @click="emit('cancel')">
          {{ t('pdfGraph.keepSingle') }}
        </button>
        <button class="pdfgraph-confirm" :disabled="!anythingChosen" @click="confirm">
          {{ t('pdfGraph.confirm') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.pdfgraph-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.pdfgraph-dialog {
  width: min(480px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: 0 18px 48px var(--shadow-md);
}

.pdfgraph-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.pdfgraph-header h2 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main);
}

.pdfgraph-source {
  font-size: 11px;
  color: var(--text-muted);
}

.pdfgraph-lead {
  margin: 6px 0 14px;
  font-size: 12px;
  color: var(--text-secondary);
}

.pdfgraph-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 4px;
  cursor: pointer;
}

.pdfgraph-option.sub {
  margin-left: 24px;
}

.pdfgraph-option.off {
  opacity: 0.5;
}

.pdfgraph-option input {
  margin-top: 3px;
}

.pdfgraph-option strong {
  display: block;
  font-size: 13px;
  color: var(--text-main);
}

.pdfgraph-option em {
  display: block;
  font-style: normal;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}

.pdfgraph-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.pdfgraph-cancel,
.pdfgraph-confirm {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.pdfgraph-confirm {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
  font-weight: 600;
}

.pdfgraph-confirm:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
