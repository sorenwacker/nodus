/**
 * Notification system for user-facing error and success messages
 */
import { ref, readonly } from 'vue'

export type NotificationType = 'error' | 'warning' | 'success' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  details?: string
  timeout: number
  createdAt: number
}

const notifications = ref<Notification[]>([])
const maxNotifications = 5

/**
 * Add a notification
 */
function notify(
  type: NotificationType,
  message: string,
  options?: { details?: string; timeout?: number }
) {
  const id = crypto.randomUUID()
  const timeout = options?.timeout ?? (type === 'error' ? 8000 : 4000)

  const notification: Notification = {
    id,
    type,
    message,
    details: options?.details,
    timeout,
    createdAt: Date.now(),
  }

  notifications.value.push(notification)

  // Limit max notifications
  if (notifications.value.length > maxNotifications) {
    notifications.value.shift()
  }

  // Auto-dismiss after timeout
  if (timeout > 0) {
    setTimeout(() => dismiss(id), timeout)
  }

  return id
}

/**
 * Dismiss a notification
 */
function dismiss(id: string) {
  const idx = notifications.value.findIndex(n => n.id === id)
  if (idx >= 0) {
    notifications.value.splice(idx, 1)
  }
}

/**
 * Clear all notifications
 */
function clearAll() {
  notifications.value = []
}

// Convenience methods
function error(message: string, details?: string) {
  console.error(`[notify] ${message}`, details || '')
  return notify('error', message, { details })
}

function warning(message: string, details?: string) {
  console.warn(`[notify] ${message}`, details || '')
  return notify('warning', message, { details })
}

function success(message: string, details?: string) {
  return notify('success', message, { details })
}

function info(message: string, details?: string) {
  return notify('info', message, { details })
}

export function useNotifications() {
  return {
    notifications: readonly(notifications),
    notify,
    dismiss,
    clearAll,
    error,
    warning,
    success,
    info,
  }
}

// Singleton instance for use outside Vue components
export const notifications$ = {
  error,
  warning,
  success,
  info,
  dismiss,
  clearAll,
}
