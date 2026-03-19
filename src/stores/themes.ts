/**
 * Themes Pinia Store
 * Manages theme loading, parsing, and application
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { parse as parseYaml } from 'yaml'
import type {
  DbTheme,
  ParsedTheme,
  CreateThemeInput,
  UpdateThemeInput,
} from '../types/theme'
import { injectTheme } from '../lib/themeInjector'

const STORAGE_KEY = 'nodus-theme'

export const useThemesStore = defineStore('themes', () => {
  // State
  const themes = ref<DbTheme[]>([])
  const currentThemeName = ref<string>('light')
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const currentTheme = computed(() =>
    themes.value.find((t) => t.name === currentThemeName.value)
  )

  const parsedCurrentTheme = computed<ParsedTheme | null>(() => {
    const theme = currentTheme.value
    if (!theme) return null
    try {
      return parseYaml(theme.yaml_content) as ParsedTheme
    } catch {
      console.error('Failed to parse current theme YAML')
      return null
    }
  })

  const builtinThemes = computed(() =>
    themes.value.filter((t) => t.is_builtin === 1)
  )

  const customThemes = computed(() =>
    themes.value.filter((t) => t.is_builtin === 0)
  )

  const isDark = computed(() => parsedCurrentTheme.value?.is_dark ?? false)

  // Actions
  async function initialize() {
    isLoading.value = true
    error.value = null

    try {
      // Load themes from database
      const dbThemes = await invoke<DbTheme[]>('get_themes')
      themes.value = dbThemes

      // Restore saved theme preference
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && themes.value.some((t) => t.name === saved)) {
        currentThemeName.value = saved
      } else if (themes.value.length > 0) {
        // Default to light theme
        const lightTheme = themes.value.find((t) => t.name === 'light')
        currentThemeName.value = lightTheme?.name ?? themes.value[0].name
      }

      // Apply current theme
      applyCurrentTheme()
    } catch (e) {
      error.value = `Failed to load themes: ${e}`
      console.error(error.value)
    } finally {
      isLoading.value = false
    }
  }

  function applyCurrentTheme() {
    const parsed = parsedCurrentTheme.value
    if (parsed) {
      injectTheme(parsed)
      document.documentElement.setAttribute('data-theme', parsed.name)
    }
  }

  function setTheme(name: string) {
    if (!themes.value.some((t) => t.name === name)) {
      console.warn(`Theme '${name}' not found`)
      return
    }
    currentThemeName.value = name
    localStorage.setItem(STORAGE_KEY, name)
    applyCurrentTheme()
  }

  function cycleTheme() {
    const themeOrder = ['light', 'dark', 'pitch-black', 'cyber']
    const currentIndex = themeOrder.indexOf(currentThemeName.value)
    const nextIndex = (currentIndex + 1) % themeOrder.length
    const nextTheme = themeOrder[nextIndex]
    // Only cycle through themes that exist
    if (themes.value.some((t) => t.name === nextTheme)) {
      setTheme(nextTheme)
    } else {
      // Fallback: cycle through all themes
      const allNames = themes.value.map((t) => t.name)
      const idx = allNames.indexOf(currentThemeName.value)
      const next = allNames[(idx + 1) % allNames.length]
      setTheme(next)
    }
  }

  async function createTheme(input: CreateThemeInput): Promise<DbTheme> {
    console.log('[ThemesStore] Creating theme with input:', input.name)
    const newTheme = await invoke<DbTheme>('create_theme', { input })
    console.log('[ThemesStore] Received from backend:', newTheme)
    themes.value.push(newTheme)
    console.log('[ThemesStore] Themes after push:', themes.value.length, themes.value.map(t => t.name))
    return newTheme
  }

  async function updateTheme(input: UpdateThemeInput): Promise<void> {
    await invoke('update_theme', { input })
    // Refresh themes list
    const dbThemes = await invoke<DbTheme[]>('get_themes')
    themes.value = dbThemes
    // Re-apply if current theme was updated
    if (currentTheme.value?.id === input.id) {
      applyCurrentTheme()
    }
  }

  async function deleteTheme(id: string): Promise<boolean> {
    const theme = themes.value.find((t) => t.id === id)
    if (!theme || theme.is_builtin === 1) {
      return false
    }

    const deleted = await invoke<boolean>('delete_theme', { id })
    if (deleted) {
      themes.value = themes.value.filter((t) => t.id !== id)
      // Switch to light theme if current was deleted
      if (currentThemeName.value === theme.name) {
        setTheme('light')
      }
    }
    return deleted
  }

  async function validateYaml(yamlContent: string): Promise<boolean> {
    try {
      await invoke<boolean>('validate_theme_yaml', { yamlContent })
      return true
    } catch {
      return false
    }
  }

  function parseThemeYaml(yamlContent: string): ParsedTheme | null {
    try {
      return parseYaml(yamlContent) as ParsedTheme
    } catch {
      return null
    }
  }

  return {
    // State
    themes,
    currentThemeName,
    isLoading,
    error,
    // Computed
    currentTheme,
    parsedCurrentTheme,
    builtinThemes,
    customThemes,
    isDark,
    // Actions
    initialize,
    setTheme,
    cycleTheme,
    createTheme,
    updateTheme,
    deleteTheme,
    validateYaml,
    parseThemeYaml,
    applyCurrentTheme,
  }
})
