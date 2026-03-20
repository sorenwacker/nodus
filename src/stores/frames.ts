/**
 * Frames store
 * Manages frame CRUD operations, selection, and node assignment
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import type { Frame } from '../types'

// Maximum canvas coordinate bounds
const MAX_CANVAS_COORD = 100_000
const MIN_FRAME_SIZE = 50
const MAX_FRAME_SIZE = 10_000

/**
 * Validate and clamp a coordinate value
 */
function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-MAX_CANVAS_COORD, Math.min(MAX_CANVAS_COORD, value))
}

/**
 * Validate and clamp a size value
 */
function clampSize(value: number, min = MIN_FRAME_SIZE, max = MAX_FRAME_SIZE): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export const useFramesStore = defineStore('frames', () => {
  const frames = ref<Frame[]>([])
  const selectedFrameId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Get selected frame object
  const selectedFrame = computed(() =>
    frames.value.find((f) => f.id === selectedFrameId.value)
  )

  /**
   * Initialize frames from database
   */
  async function initialize(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const fetchedFrames = await invoke<Frame[]>('get_frames')
      frames.value = fetchedFrames
    } catch (e) {
      error.value = String(e)
      storeLogger.warn('Failed to load frames (migration may not have run yet):', e)
      frames.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Filter frames by workspace
   */
  function getFramesForWorkspace(workspaceId: string | null): Frame[] {
    if (!workspaceId) {
      return frames.value.filter((f) => !f.workspace_id)
    }
    return frames.value.filter((f) => f.workspace_id === workspaceId)
  }

  /**
   * Create a new frame
   */
  function createFrame(
    x: number,
    y: number,
    width = 400,
    height = 300,
    title = 'Frame',
    workspaceId: string | null = null
  ): Frame {
    const frame: Frame = {
      id: crypto.randomUUID(),
      title,
      canvas_x: x,
      canvas_y: y,
      width,
      height,
      color: null,
      workspace_id: workspaceId,
    }
    frames.value.push(frame)

    // Persist to database
    invoke('create_frame', {
      input: {
        id: frame.id,
        title: frame.title,
        canvasX: frame.canvas_x,
        canvasY: frame.canvas_y,
        width: frame.width,
        height: frame.height,
        color: frame.color,
        workspaceId: frame.workspace_id,
      },
    }).catch((e) => storeLogger.error('Failed to create frame:', e))

    return frame
  }

  /**
   * Update frame position
   */
  function updateFramePosition(id: string, x: number, y: number): void {
    const frame = frames.value.find((f) => f.id === id)
    if (frame) {
      const clampedX = clampCoord(x)
      const clampedY = clampCoord(y)
      frame.canvas_x = clampedX
      frame.canvas_y = clampedY
      invoke('update_frame_position', { id, x: clampedX, y: clampedY }).catch((e) =>
        storeLogger.error('Failed to update frame position:', e)
      )
    }
  }

  /**
   * Update frame size
   */
  function updateFrameSize(id: string, width: number, height: number): void {
    const frame = frames.value.find((f) => f.id === id)
    if (frame) {
      const clampedWidth = clampSize(width)
      const clampedHeight = clampSize(height)
      frame.width = clampedWidth
      frame.height = clampedHeight
      invoke('update_frame_size', { id, width: clampedWidth, height: clampedHeight }).catch((e) =>
        storeLogger.error('Failed to update frame size:', e)
      )
    }
  }

  /**
   * Update frame title
   */
  function updateFrameTitle(id: string, title: string): void {
    const frame = frames.value.find((f) => f.id === id)
    if (frame) {
      frame.title = title
      invoke('update_frame_title', { id, title }).catch((e) =>
        storeLogger.error('Failed to update frame title:', e)
      )
    }
  }

  /**
   * Update frame color
   */
  function updateFrameColor(id: string, color: string | null): void {
    const frame = frames.value.find((f) => f.id === id)
    if (frame) {
      frame.color = color
      invoke('update_frame_color', { id, color }).catch((e) =>
        storeLogger.error('Failed to update frame color:', e)
      )
    }
  }

  /**
   * Delete a frame
   */
  function deleteFrame(id: string): void {
    frames.value = frames.value.filter((f) => f.id !== id)
    if (selectedFrameId.value === id) {
      selectedFrameId.value = null
    }
    invoke('delete_frame', { id }).catch((e) =>
      storeLogger.error('Failed to delete frame:', e)
    )
  }

  /**
   * Select a frame (deselects nodes)
   */
  function selectFrame(id: string | null): void {
    selectedFrameId.value = id
  }

  /**
   * Get frame by ID
   */
  function getFrame(id: string): Frame | undefined {
    return frames.value.find((f) => f.id === id)
  }

  /**
   * Check if a point is inside a frame
   */
  function isPointInFrame(x: number, y: number, frameId: string): boolean {
    const frame = getFrame(frameId)
    if (!frame) return false
    return (
      x >= frame.canvas_x &&
      x <= frame.canvas_x + frame.width &&
      y >= frame.canvas_y &&
      y <= frame.canvas_y + frame.height
    )
  }

  /**
   * Find frame containing a point
   */
  function findFrameAtPoint(x: number, y: number, workspaceId: string | null): Frame | undefined {
    const workspaceFrames = getFramesForWorkspace(workspaceId)
    return workspaceFrames.find((f) => isPointInFrame(x, y, f.id))
  }

  return {
    // State
    frames,
    selectedFrameId,
    selectedFrame,
    loading,
    error,

    // Methods
    initialize,
    getFramesForWorkspace,
    createFrame,
    updateFramePosition,
    updateFrameSize,
    updateFrameTitle,
    updateFrameColor,
    deleteFrame,
    selectFrame,
    getFrame,
    isPointInFrame,
    findFrameAtPoint,
  }
})

export type { Frame }
