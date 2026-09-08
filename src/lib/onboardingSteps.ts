/**
 * The steps of the first-run tour, in order.
 *
 * Held here rather than inside the component so the tour can be checked: that
 * it teaches the features nobody would guess, and that every step exists in
 * every locale (PRODUCT_DESIGN.md > First-run tour).
 *
 * Each step points at something the seeded default workspace already contains,
 * so it can be followed the moment it is read.
 */
export interface OnboardingStep {
  /** Names the `onboarding.<key>.title` and `.description` strings */
  key: string
  /** Which drawing the step shows */
  icon: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: 'language', icon: 'language' },
  { key: 'welcome', icon: 'graph' },
  { key: 'nodes', icon: 'node' },
  { key: 'edges', icon: 'edge' },
  { key: 'import', icon: 'import' },
  { key: 'math', icon: 'math' },
  { key: 'neighborhood', icon: 'focus' },
  { key: 'storylines', icon: 'story' },
  { key: 'agent', icon: 'agent' },
]
