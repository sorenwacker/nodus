/**
 * Settings tab registry. The modal renders tabs from this list; tests assert
 * the layout matches the documented six-tab structure.
 */
export type SettingsTabId =
  | 'general'
  | 'appearance'
  | 'canvas'
  | 'ai'
  | 'citations'
  | 'integrations'

export interface SettingsTab {
  id: SettingsTabId
  labelKey: string
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', labelKey: 'settings.tabs.general' },
  { id: 'appearance', labelKey: 'settings.tabs.appearance' },
  { id: 'canvas', labelKey: 'settings.tabs.canvas' },
  { id: 'ai', labelKey: 'settings.tabs.llm' },
  { id: 'citations', labelKey: 'settings.tabs.citations' },
  { id: 'integrations', labelKey: 'settings.tabs.integrations' },
]
