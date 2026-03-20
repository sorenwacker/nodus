<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale, getLocale, loadLocale } from '../i18n'

const { t } = useI18n()

const STORAGE_KEY = 'nodus-onboarding-complete'

// Language selection
const selectedLanguage = ref(getLocale())
const languages = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Francais' },
  { code: 'es', name: 'Espanol' },
  { code: 'it', name: 'Italiano' },
]

async function selectLanguage(code: string) {
  selectedLanguage.value = code
  await loadLocale(code)
  setLocale(code)
}

const emit = defineEmits<{
  complete: []
}>()

const isVisible = ref(false)
const currentStep = ref(0)

const stepKeys = ['language', 'welcome', 'nodes', 'edges', 'import', 'math'] as const
const stepIcons = ['language', 'graph', 'node', 'edge', 'import', 'math']

const steps = computed(() => stepKeys.map((key, i) => ({
  title: t(`onboarding.${key}.title`),
  description: t(`onboarding.${key}.description`),
  icon: stepIcons[i],
})))

const isLastStep = computed(() => currentStep.value === steps.length - 1)
const progress = computed(() => ((currentStep.value + 1) / steps.length) * 100)

function nextStep() {
  if (isLastStep.value) {
    complete()
  } else {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function skip() {
  complete()
}

function complete() {
  localStorage.setItem(STORAGE_KEY, 'true')
  isVisible.value = false
  emit('complete')
}

onMounted(() => {
  // Skip onboarding in dev mode if env var is set
  if (import.meta.env.DEV && import.meta.env.VITE_SKIP_ONBOARDING) {
    return
  }

  const completed = localStorage.getItem(STORAGE_KEY)
  if (!completed) {
    isVisible.value = true
  }
})

// Expose for manual triggering (e.g., from help menu)
defineExpose({
  show: () => {
    currentStep.value = 0
    isVisible.value = true
  },
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      class="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div class="onboarding-modal" role="document">
        <!-- Progress bar -->
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>

        <!-- Step content -->
        <div class="step-content">
          <div class="step-icon" :data-icon="steps[currentStep].icon">
            <template v-if="steps[currentStep].icon === 'language'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </template>
            <template v-else-if="steps[currentStep].icon === 'graph'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" />
                <path d="M9 6h6M6 9v6M18 9v6M9 18h6" />
              </svg>
            </template>
            <template v-else-if="steps[currentStep].icon === 'node'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M7 8h10M7 12h6" />
              </svg>
            </template>
            <template v-else-if="steps[currentStep].icon === 'edge'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="5" cy="12" r="3" /><circle cx="19" cy="12" r="3" />
                <path d="M8 12h8" />
              </svg>
            </template>
            <template v-else-if="steps[currentStep].icon === 'import'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
                <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
            </template>
            <template v-else-if="steps[currentStep].icon === 'math'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12h16M4 6l8 12M12 6l8 12" />
              </svg>
            </template>
          </div>

          <h2 id="onboarding-title">{{ steps[currentStep].title }}</h2>
          <p>{{ steps[currentStep].description }}</p>

          <!-- Language selector for language step -->
          <div v-if="steps[currentStep].icon === 'language'" class="language-grid">
            <button
              v-for="lang in languages"
              :key="lang.code"
              class="language-option"
              :class="{ selected: selectedLanguage === lang.code }"
              @click="selectLanguage(lang.code)"
            >
              {{ lang.name }}
            </button>
          </div>
        </div>

        <!-- Navigation -->
        <div class="step-nav">
          <button v-if="currentStep > 0" class="nav-btn secondary" @click="prevStep">
            {{ t('onboarding.buttons.back') }}
          </button>
          <button class="nav-btn skip" @click="skip">
            {{ t('onboarding.buttons.skip') }}
          </button>
          <button class="nav-btn primary" @click="nextStep">
            {{ isLastStep ? t('onboarding.buttons.getStarted') : t('onboarding.buttons.next') }}
          </button>
        </div>

        <!-- Step dots -->
        <div class="step-dots">
          <span
            v-for="(_, i) in steps"
            :key="i"
            class="dot"
            :class="{ active: i === currentStep, completed: i < currentStep }"
            @click="currentStep = i"
          ></span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.onboarding-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  animation: fade-in 0.3s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.onboarding-modal {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  box-shadow: 0 16px 64px var(--shadow-md);
  width: 420px;
  max-width: 90vw;
  overflow: hidden;
  animation: slide-up 0.3s ease-out;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.progress-bar {
  height: 4px;
  background: var(--border-default);
}

.progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.3s ease;
}

.step-content {
  padding: 40px 32px 24px;
  text-align: center;
}

.step-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  color: var(--primary-color);
}

.step-icon svg {
  width: 100%;
  height: 100%;
}

.step-content h2 {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-main);
}

.step-content p {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.step-nav {
  display: flex;
  gap: 10px;
  padding: 0 24px 24px;
  justify-content: center;
}

.nav-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-btn.primary {
  background: var(--primary-color);
  color: white;
  border: none;
  min-width: 120px;
}

.nav-btn.primary:hover {
  filter: brightness(1.1);
}

.nav-btn.secondary {
  background: var(--bg-surface-alt);
  color: var(--text-main);
  border: 1px solid var(--border-default);
}

.nav-btn.secondary:hover {
  background: var(--bg-elevated);
}

.nav-btn.skip {
  background: none;
  border: none;
  color: var(--text-muted);
}

.nav-btn.skip:hover {
  color: var(--text-main);
}

.step-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding-bottom: 20px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-default);
  cursor: pointer;
  transition: all 0.2s ease;
}

.dot.active {
  background: var(--primary-color);
  transform: scale(1.2);
}

.dot.completed {
  background: var(--primary-color);
  opacity: 0.5;
}

.dot:hover {
  background: var(--text-muted);
}

/* Language selector */
.language-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.language-option {
  padding: 10px 20px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-alt);
  color: var(--text-main);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.language-option:hover {
  border-color: var(--primary-color);
  background: var(--bg-elevated);
}

.language-option.selected {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: white;
}
</style>
