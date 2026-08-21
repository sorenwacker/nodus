/**
 * usePanelReveal - edge-step reveal state and user-set size for a panel
 *
 * The panel opens on an edge push and stays open until explicitly closed
 * (a step back or the toolbar toggle). Its size - width for a side panel,
 * height for a bottom sheet - is user-resizable within a clamped range and
 * persisted under a storage key.
 */
import { ref, computed } from 'vue'

/** Which screen edge the panel is attached to; decides the resize axis */
export type PanelSide = 'left' | 'right' | 'bottom'

export interface PanelRevealOptions {
  minSize?: number
  maxSize?: number
  defaultSize?: number
  side?: PanelSide
  /** localStorage key for the persisted size; omit to disable persistence */
  storageKey?: string
}

export function usePanelReveal(options: PanelRevealOptions = {}) {
  const {
    minSize = 200,
    maxSize = 480,
    defaultSize = 260,
    side = 'left',
    storageKey,
  } = options

  const pinned = ref(false)
  const peeking = ref(false)
  const resizing = ref(false)
  const stored = readStored()
  /** True once the user has chosen a size; callers may size to content until then */
  const hasStoredSize = ref(stored !== null)
  const size = ref(stored ?? defaultSize)

  const isOpen = computed(() => pinned.value || peeking.value)

  function readStored(): number | null {
    if (!storageKey) return null
    const value = Number(localStorage.getItem(storageKey))
    return Number.isFinite(value) && value > 0 ? clamp(value) : null
  }

  function clamp(value: number): number {
    return Math.min(maxSize, Math.max(minSize, value))
  }

  function onEdgeEnter() {
    peeking.value = true
  }

  function togglePin() {
    pinned.value = !pinned.value
    if (!pinned.value) {
      peeking.value = false
    }
  }

  /** Close unconditionally, releasing a pin if set */
  function close() {
    pinned.value = false
    peeking.value = false
  }

  function setSize(value: number) {
    size.value = clamp(value)
    hasStoredSize.value = true
    if (storageKey) {
      localStorage.setItem(storageKey, String(size.value))
    }
  }

  /**
   * Start a pointer-driven resize from the panel's separator.
   *
   * Each side grows in the direction that points away from its edge: a
   * right-hand panel widens as the separator is dragged left, a bottom sheet
   * grows taller as it is dragged up.
   */
  function beginResize(e: PointerEvent) {
    e.preventDefault()
    resizing.value = true
    const vertical = side === 'bottom'
    const start = vertical ? e.clientY : e.clientX
    const startSize = size.value
    const sign = side === 'left' ? 1 : -1

    function onMove(ev: PointerEvent) {
      const current = vertical ? ev.clientY : ev.clientX
      setSize(startSize + sign * (current - start))
    }
    function onUp() {
      resizing.value = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return {
    isOpen,
    pinned,
    resizing,
    size,
    hasStoredSize,
    onEdgeEnter,
    togglePin,
    close,
    setSize,
    beginResize,
  }
}
