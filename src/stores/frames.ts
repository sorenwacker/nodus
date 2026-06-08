/**
 * Frames store
 * Manages frame CRUD operations, selection, and node assignment
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import { generateShortId } from '../lib/ids'
import type { Frame } from '../types'
import { clampCoord, clampFrameSize } from '../lib/geometry'

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
   * "default" workspace is treated as null (no workspace_id)
   */
  function getFramesForWorkspace(workspaceId: string | null): Frame[] {
    // Treat "default" as null - the default workspace uses null in the database
    if (!workspaceId || workspaceId === 'default') {
      // Match frames with null, undefined, empty string, or "default" workspace_id
      return frames.value.filter((f) => !f.workspace_id || f.workspace_id === 'default')
    }
    return frames.value.filter((f) => f.workspace_id === workspaceId)
  }

  /**
   * Create a new frame
   * Returns a Frame object. The database persist happens asynchronously.
   * Use createFrameAsync if you need to wait for database persistence.
   */
  function createFrame(
    x: number,
    y: number,
    width = 400,
    height = 300,
    title = 'Frame',
    workspaceId: string | null = null,
    folderPath: string | null = null,
    parentFrameId: string | null = null
  ): Frame {
    const frame: Frame = {
      id: generateShortId(),
      title,
      parent_frame_id: parentFrameId,
      canvas_x: x,
      canvas_y: y,
      width,
      height,
      color: null,
      workspace_id: workspaceId,
      folder_path: folderPath,
    }
    frames.value.push(frame)

    // Persist to database - fire and forget for backward compatibility
    persistFrame(frame).catch((e) => storeLogger.error('Failed to create frame:', e))

    return frame
  }

  /**
   * Persist a frame to the database
   */
  async function persistFrame(frame: Frame): Promise<void> {
    await invoke('create_frame', {
      input: {
        id: frame.id,
        title: frame.title,
        parentFrameId: frame.parent_frame_id,
        canvasX: frame.canvas_x,
        canvasY: frame.canvas_y,
        width: frame.width,
        height: frame.height,
        color: frame.color,
        workspaceId: frame.workspace_id,
        folderPath: frame.folder_path,
      },
    })
  }

  /**
   * Create a new frame and wait for database persistence
   */
  async function createFrameAsync(
    x: number,
    y: number,
    width = 400,
    height = 300,
    title = 'Frame',
    workspaceId: string | null = null,
    folderPath: string | null = null,
    parentFrameId: string | null = null
  ): Promise<Frame> {
    const frame: Frame = {
      id: generateShortId(),
      title,
      parent_frame_id: parentFrameId,
      canvas_x: x,
      canvas_y: y,
      width,
      height,
      color: null,
      workspace_id: workspaceId,
      folder_path: folderPath,
    }
    frames.value.push(frame)

    // Persist to database and wait for completion
    await persistFrame(frame)

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
      const clampedWidth = clampFrameSize(width)
      const clampedHeight = clampFrameSize(height)
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
   * Update frame parent (for nesting frames)
   */
  function updateFrameParent(id: string, parentFrameId: string | null): void {
    const frame = frames.value.find((f) => f.id === id)
    if (frame) {
      frame.parent_frame_id = parentFrameId
      invoke('update_frame_parent', { id, parentFrameId }).catch((e) =>
        storeLogger.error('Failed to update frame parent:', e)
      )
    }
  }

  /**
   * Get child frames of a parent frame
   */
  function getChildFrames(parentFrameId: string | null): Frame[] {
    return frames.value.filter((f) => f.parent_frame_id === parentFrameId)
  }

  /**
   * Get the full path of frame titles (for nested frames)
   */
  function getFramePath(frameId: string): string[] {
    const path: string[] = []
    let currentFrame = getFrame(frameId)
    while (currentFrame) {
      path.unshift(currentFrame.title)
      currentFrame = currentFrame.parent_frame_id
        ? getFrame(currentFrame.parent_frame_id)
        : undefined
    }
    return path
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

  /**
   * Find frame by folder path within a workspace
   */
  function findFrameByFolderPath(
    folderPath: string,
    workspaceId: string | null
  ): Frame | undefined {
    const workspaceFrames = getFramesForWorkspace(workspaceId)
    return workspaceFrames.find((f) => f.folder_path === folderPath)
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
    createFrameAsync,
    updateFramePosition,
    updateFrameSize,
    updateFrameTitle,
    updateFrameColor,
    updateFrameParent,
    getChildFrames,
    getFramePath,
    deleteFrame,
    selectFrame,
    getFrame,
    isPointInFrame,
    findFrameAtPoint,
    findFrameByFolderPath,
  }
})

export type { Frame }
