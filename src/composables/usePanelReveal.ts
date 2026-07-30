/**
 * usePanelReveal - edge-step reveal state for a side panel
 *
 * The panel opens on an edge push and stays open until explicitly closed
 * (a step back or the toolbar toggle). The panel width is user-resizable
 * within a clamped range and persisted under a storage key.
 */
import { ref, computed } from 'vue'

export interface PanelRevealOptions {
  minWidth?: number
  maxWidth?: number
  defaultWidth?: number
  /** Which screen edge the panel lives on; affects resize direction */
  side?: 'left' | 'right'
  /** localStorage key for the persisted width; omit to disable persistence */
  storageKey?: string
}

export function usePanelReveal(options: PanelRevealOptions = {}) {
  const {
    minWidth = 200,
    maxWidth = 480,
    defaultWidth = 260,
    side = 'left',
    storageKey,
  } = options

  const pinned = ref(false)
  const peeking = ref(false)
  const resizing = ref(false)
  const width = ref(restoreWidth())

  const isOpen = computed(() => pinned.value || peeking.value)

  function restoreWidth(): number {
    if (storageKey) {
      const stored = Number(localStorage.getItem(storageKey))
      if (Number.isFinite(stored) && stored > 0) {
        return clamp(stored)
      }
    }
    return defaultWidth
  }

  function clamp(value: number): number {
    return Math.min(maxWidth, Math.max(minWidth, value))
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

  function setWidth(value: number) {
    width.value = clamp(value)
    if (storageKey) {
      localStorage.setItem(storageKey, String(width.value))
    }
  }

  /** Start a pointer-driven resize from the panel's separator */
  function beginResize(e: PointerEvent) {
    e.preventDefault()
    resizing.value = true
    const startX = e.clientX
    const startWidth = width.value

    // A right-side panel grows when the separator is dragged leftwards
    const sign = side === 'right' ? -1 : 1
    function onMove(ev: PointerEvent) {
      setWidth(startWidth + sign * (ev.clientX - startX))
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
    width,
    onEdgeEnter,
    togglePin,
    close,
    setWidth,
    beginResize,
  }
}
