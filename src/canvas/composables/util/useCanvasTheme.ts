/**
 * Canvas theme composable
 *
 * Handles theme state tracking and theme change observation.
 * Provides reactive isDarkMode and currentTheme refs.
 */
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Return type for useCanvasTheme
 */
export interface UseCanvasThemeReturn {
  /** Whether dark mode is currently active */
  isDarkMode: Ref<boolean>
  /** Current theme name (e.g., 'light', 'dark', 'pitch-black', 'cyber') */
  currentTheme: Ref<string>
  /** Update theme state from DOM */
  updateTheme: () => void
}

/**
 * Context for theme-dependent actions
 */
export interface UseCanvasThemeContext {
  /** Callback when theme changes (e.g., to reinitialize Mermaid) */
  onThemeChange?: () => void
}

/**
 * Composable for canvas theme management
 *
 * Tracks the current theme from the data-theme attribute on document.documentElement
 * and provides reactive refs for isDarkMode and currentTheme.
 * Automatically observes theme changes via MutationObserver.
 */
export function useCanvasTheme(ctx?: UseCanvasThemeContext): UseCanvasThemeReturn {
  const isDarkMode = ref(false)
  const currentTheme = ref(document.documentElement.getAttribute('data-theme') || 'light')

  let observer: MutationObserver | null = null

  /**
   * Update theme state from DOM
   */
  function updateTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light'
    currentTheme.value = theme
    isDarkMode.value = theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
  }

  // Watch for theme changes to trigger callbacks
  if (ctx?.onThemeChange) {
    watch(isDarkMode, () => {
      ctx.onThemeChange?.()
    })
  }

  onMounted(() => {
    updateTheme()

    // Watch for theme changes via MutationObserver
    observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return {
    isDarkMode,
    currentTheme,
    updateTheme,
  }
}
