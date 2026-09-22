/**
 * The sections of Settings > AI, in order. The panel renders them from this
 * list; a test asserts it matches the documented structure
 * (PRODUCT_DESIGN.md > Settings > AI).
 */
export type AISettingsSectionId = 'connection' | 'generation' | 'search' | 'prompts' | 'agent'

export interface AISettingsSection {
  id: AISettingsSectionId
  labelKey: string
  /** Collapsed by default: the controls have working defaults and read as optional */
  collapsed: boolean
}

export const AI_SETTINGS_SECTIONS: AISettingsSection[] = [
  { id: 'connection', labelKey: 'settings.ai.connection', collapsed: false },
  { id: 'generation', labelKey: 'settings.ai.generation', collapsed: true },
  { id: 'search', labelKey: 'settings.ai.search', collapsed: false },
  { id: 'prompts', labelKey: 'settings.ai.prompts', collapsed: false },
  { id: 'agent', labelKey: 'settings.ai.agent', collapsed: false },
]
