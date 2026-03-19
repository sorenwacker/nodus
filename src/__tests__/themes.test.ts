/**
 * Theme system tests
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  generateThemeCSS,
  injectTheme,
  clearInjectedTheme,
} from '../lib/themeInjector'
import type { ParsedTheme } from '../types/theme'

describe('themeInjector', () => {
  const mockLightTheme: ParsedTheme = {
    name: 'light',
    display_name: 'Light',
    is_dark: false,
    variables: {
      bg_canvas: '#f0f4f8',
      bg_surface: '#ffffff',
      bg_surface_alt: '#f8fafc',
      bg_elevated: '#ffffff',
      text_main: '#18181b',
      text_secondary: '#3f3f46',
      text_muted: '#71717a',
      border_default: '#c4c8cc',
      border_subtle: '#e4e4e7',
      primary_color: '#3b82f6',
      dot_color: '#dde3ea',
      shadow_sm: 'rgba(0, 0, 0, 0.08)',
      shadow_md: 'rgba(0, 0, 0, 0.12)',
    },
  }

  const mockCyberTheme: ParsedTheme = {
    name: 'cyber',
    display_name: 'Cyber',
    is_dark: true,
    variables: {
      bg_canvas: '#0a0a12',
      bg_surface: '#0d1117',
      bg_surface_alt: '#161b22',
      bg_elevated: '#21262d',
      text_main: '#00ffcc',
      text_secondary: '#7ee8fa',
      text_muted: '#58a6ff',
      border_default: 'rgba(0, 255, 204, 0.25)',
      border_subtle: '#30363d',
      primary_color: '#ff00ff',
      dot_color: 'rgba(0, 255, 204, 0.08)',
      shadow_sm: 'rgba(0, 255, 204, 0.1)',
      shadow_md: 'rgba(255, 0, 255, 0.15)',
    },
    extras: {
      accent_glow: '#00ffcc',
      neon_pink: '#ff00ff',
    },
    effects: {
      node_card: {
        box_shadow: '0 0 10px rgba(0, 255, 204, 0.3)',
        border_color: 'rgba(0, 255, 204, 0.4)',
      },
      node_card_hover: {
        box_shadow: '0 0 15px rgba(0, 255, 204, 0.5)',
      },
    },
  }

  afterEach(() => {
    clearInjectedTheme()
  })

  describe('generateThemeCSS', () => {
    it('generates CSS variables for light theme', () => {
      const css = generateThemeCSS(mockLightTheme)
      expect(css).toContain(':root {')
      expect(css).toContain('--bg-canvas: #f0f4f8')
      expect(css).toContain('--text-main: #18181b')
      expect(css).toContain('--primary-color: #3b82f6')
    })

    it('generates CSS with data-theme selector for non-light themes', () => {
      const css = generateThemeCSS(mockCyberTheme)
      expect(css).toContain("[data-theme='cyber']")
      expect(css).toContain('--bg-canvas: #0a0a12')
      expect(css).toContain('--text-main: #00ffcc')
    })

    it('includes extras variables', () => {
      const css = generateThemeCSS(mockCyberTheme)
      expect(css).toContain('--accent-glow: #00ffcc')
      expect(css).toContain('--neon-pink: #ff00ff')
    })

    it('generates effect rules', () => {
      const css = generateThemeCSS(mockCyberTheme)
      expect(css).toContain(".node-card {")
      expect(css).toContain('box-shadow: 0 0 10px rgba(0, 255, 204, 0.3)')
      expect(css).toContain(".node-card:hover {")
    })
  })

  describe('injectTheme', () => {
    it('creates style element with correct ID', () => {
      injectTheme(mockLightTheme)
      const styleEl = document.getElementById('nodus-dynamic-theme')
      expect(styleEl).toBeTruthy()
      expect(styleEl?.tagName).toBe('STYLE')
    })

    it('replaces existing style on re-injection', () => {
      injectTheme(mockLightTheme)
      injectTheme(mockCyberTheme)
      const styleEls = document.querySelectorAll('#nodus-dynamic-theme')
      expect(styleEls.length).toBe(1)
      expect(styleEls[0].textContent).toContain('cyber')
    })
  })

  describe('clearInjectedTheme', () => {
    it('removes the injected style element', () => {
      injectTheme(mockLightTheme)
      expect(document.getElementById('nodus-dynamic-theme')).toBeTruthy()
      clearInjectedTheme()
      expect(document.getElementById('nodus-dynamic-theme')).toBeFalsy()
    })
  })
})

describe('theme types', () => {
  it('ThemeVariables interface has required fields', () => {
    // Type-level test - if this compiles, the interface is correct
    const vars: ParsedTheme['variables'] = {
      bg_canvas: '#fff',
      bg_surface: '#fff',
      bg_surface_alt: '#fff',
      bg_elevated: '#fff',
      text_main: '#000',
      text_secondary: '#333',
      text_muted: '#666',
      border_default: '#ccc',
      border_subtle: '#eee',
      primary_color: '#00f',
      dot_color: '#ddd',
      shadow_sm: 'rgba(0,0,0,0.1)',
      shadow_md: 'rgba(0,0,0,0.2)',
    }
    expect(vars.bg_canvas).toBe('#fff')
  })

  it('ParsedTheme supports optional extras and effects', () => {
    const theme: ParsedTheme = {
      name: 'test',
      display_name: 'Test',
      is_dark: false,
      variables: {
        bg_canvas: '#fff',
        bg_surface: '#fff',
        bg_surface_alt: '#fff',
        bg_elevated: '#fff',
        text_main: '#000',
        text_secondary: '#333',
        text_muted: '#666',
        border_default: '#ccc',
        border_subtle: '#eee',
        primary_color: '#00f',
        dot_color: '#ddd',
        shadow_sm: 'rgba(0,0,0,0.1)',
        shadow_md: 'rgba(0,0,0,0.2)',
      },
    }
    expect(theme.extras).toBeUndefined()
    expect(theme.effects).toBeUndefined()
  })
})
