<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentPlan, PlanStep } from '../llm/types'

const { t } = useI18n()

const props = defineProps<{
  plan: AgentPlan | null
  visible: boolean
}>()

const emit = defineEmits<{
  approve: []
  reject: [reason?: string]
  modify: [stepId: string, newDescription: string]
  addStep: [description: string, afterStepId?: string]
  removeStep: [stepId: string]
  close: []
}>()

// Local editing state
const editingStepId = ref<string | null>(null)
const editingText = ref('')
const newStepText = ref('')
const showAddStep = ref(false)

// Keyboard handlers
function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return

  if (e.key === 'Escape') {
    if (editingStepId.value) {
      cancelEdit()
    } else {
      emit('close')
    }
    e.preventDefault()
  }

  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    handleApprove()
    e.preventDefault()
  }
}

// Step editing
function startEdit(step: PlanStep) {
  editingStepId.value = step.id
  editingText.value = step.description
}

function saveEdit() {
  if (editingStepId.value && editingText.value.trim()) {
    emit('modify', editingStepId.value, editingText.value.trim())
  }
  cancelEdit()
}

function cancelEdit() {
  editingStepId.value = null
  editingText.value = ''
}

// Add step
function toggleAddStep() {
  showAddStep.value = !showAddStep.value
  newStepText.value = ''
}

function submitNewStep() {
  if (newStepText.value.trim()) {
    emit('addStep', newStepText.value.trim())
    newStepText.value = ''
    showAddStep.value = false
  }
}

// Actions
function handleApprove() {
  console.log('[PlanModal] Approve clicked')
  if (editingStepId.value) saveEdit()
  emit('approve')
}

function handleReject() {
  console.log('[PlanModal] Reject clicked')
  emit('reject')
}

// Step count
const stepCount = computed(() => props.plan?.steps?.length ?? 0)

// Watch visibility to reset state
watch(() => props.visible, (visible) => {
  if (!visible) {
    cancelEdit()
    showAddStep.value = false
    newStepText.value = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && plan && plan.steps"
      class="plan-modal-overlay"
      tabindex="0"
      @click.self="emit('close')"
      @keydown="onKeydown"
    >
      <div class="plan-modal" @click.stop>
        <header class="plan-modal-header">
          <h2>{{ t('plan.reviewPlan') }}</h2>
          <button class="close-btn" :aria-label="t('common.close')" @click.stop="emit('close')">
            X
          </button>
        </header>

        <div class="plan-modal-content">
          <h3 class="plan-title">{{ plan?.title || 'Plan' }}</h3>

          <div class="steps-list">
            <div
              v-for="(step, index) in (plan?.steps || [])"
              :key="step.id"
              class="step-item"
            >
              <span class="step-number">{{ index + 1 }}.</span>

              <div v-if="editingStepId === step.id" class="step-edit">
                <input
                  v-model="editingText"
                  type="text"
                  class="step-input"
                  autofocus
                  @keydown.enter="saveEdit"
                  @keydown.escape="cancelEdit"
                />
                <button class="btn-sm btn-primary" @click="saveEdit">{{ t('common.save') }}</button>
                <button class="btn-sm btn-secondary" @click="cancelEdit">{{ t('common.cancel') }}</button>
              </div>

              <div v-else class="step-content">
                <span class="step-description">{{ step.description }}</span>
                <div class="step-actions">
                  <button
                    class="btn-icon"
                    :title="t('plan.editStep')"
                    @click="startEdit(step)"
                  >
                    {{ t('common.edit') }}
                  </button>
                  <button
                    class="btn-icon btn-danger"
                    :title="t('plan.removeStep')"
                    @click="emit('removeStep', step.id)"
                  >
                    {{ t('common.remove') }}
                  </button>
                </div>
              </div>

              <p v-if="step.details" class="step-details">{{ step.details }}</p>
            </div>
          </div>

          <!-- Add step -->
          <div class="add-step-section">
            <button
              v-if="!showAddStep"
              class="btn-add-step"
              @click="toggleAddStep"
            >
              + {{ t('plan.addStep') }}
            </button>
            <div v-else class="add-step-form">
              <input
                v-model="newStepText"
                type="text"
                class="step-input"
                :placeholder="t('plan.newStepPlaceholder')"
                autofocus
                @keydown.enter="submitNewStep"
                @keydown.escape="toggleAddStep"
              />
              <button class="btn-sm btn-primary" @click="submitNewStep">{{ t('common.add') }}</button>
              <button class="btn-sm btn-secondary" @click="toggleAddStep">{{ t('common.cancel') }}</button>
            </div>
          </div>
        </div>

        <footer class="plan-modal-footer">
          <div class="footer-info">
            {{ stepCount }} {{ stepCount === 1 ? t('plan.step') : t('plan.steps') }}
          </div>
          <div class="footer-actions">
            <button class="btn btn-secondary" @click.stop="handleReject">
              {{ t('plan.reject') }}
            </button>
            <button class="btn btn-primary" @click.stop="handleApprove">
              {{ t('plan.approveShortcut') }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.plan-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.plan-modal {
  background: var(--bg-surface, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: min(600px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.plan-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default, #e5e5e5);
}

.plan-modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main, #111);
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted, #666);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-surface-alt, #f5f5f5);
}

.plan-modal-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.plan-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main, #111);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--bg-surface-alt, #f9f9f9);
  border-radius: 8px;
  border: 1px solid var(--border-subtle, #eee);
}

.step-number {
  font-weight: 600;
  color: var(--primary-color, #3b82f6);
  font-size: 14px;
  min-width: 24px;
}

.step-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.step-description {
  flex: 1;
  font-size: 14px;
  color: var(--text-main, #111);
  line-height: 1.5;
}

.step-details {
  margin: 4px 0 0 24px;
  font-size: 12px;
  color: var(--text-muted, #666);
}

.step-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.step-item:hover .step-actions {
  opacity: 1;
}

.step-edit {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.step-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-default, #ddd);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg-surface, #fff);
  color: var(--text-main, #111);
}

.step-input:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.btn-icon {
  padding: 4px 8px;
  font-size: 12px;
  background: none;
  border: 1px solid var(--border-default, #ddd);
  border-radius: 4px;
  color: var(--text-secondary, #444);
  cursor: pointer;
}

.btn-icon:hover {
  background: var(--bg-surface-alt, #f5f5f5);
}

.btn-icon.btn-danger {
  color: var(--danger-color, #ef4444);
  border-color: var(--danger-border, #fecaca);
}

.btn-icon.btn-danger:hover {
  background: var(--danger-bg, #fef2f2);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
}

.btn-sm.btn-primary {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.btn-sm.btn-secondary {
  background: var(--bg-surface-alt, #f5f5f5);
  color: var(--text-main, #111);
  border: 1px solid var(--border-default, #ddd);
}

.add-step-section {
  margin-top: 16px;
}

.btn-add-step {
  width: 100%;
  padding: 12px;
  border: 2px dashed var(--border-default, #ddd);
  border-radius: 8px;
  background: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  font-size: 14px;
}

.btn-add-step:hover {
  border-color: var(--primary-color, #3b82f6);
  color: var(--primary-color, #3b82f6);
}

.add-step-form {
  display: flex;
  gap: 8px;
}

.plan-modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--border-default, #e5e5e5);
}

.footer-info {
  font-size: 13px;
  color: var(--text-muted, #666);
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  transition: background 0.15s, transform 0.1s;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #2563eb);
}

.btn-secondary {
  background: var(--bg-surface-alt, #f5f5f5);
  color: var(--text-main, #111);
  border: 1px solid var(--border-default, #ddd);
}

.btn-secondary:hover {
  background: var(--bg-elevated, #eee);
}
</style>
