<script setup lang="ts">
import { useNotifications, type Notification } from '../composables/useNotifications'

const { notifications, dismiss } = useNotifications()

function getColor(type: Notification['type']): string {
  switch (type) {
    case 'error': return 'var(--color-error, #ef4444)'
    case 'warning': return 'var(--color-warning, #f59e0b)'
    case 'success': return 'var(--color-success, #22c55e)'
    case 'info': return 'var(--color-info, #3b82f6)'
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="notification-container">
      <TransitionGroup name="notification">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="notification"
          :style="{ '--accent-color': getColor(notification.type) }"
        >
          <div class="notification-icon">
            <svg
              v-if="notification.type === 'error'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <svg
              v-else-if="notification.type === 'warning'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg
              v-else-if="notification.type === 'success'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="9 12 12 15 16 10" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div class="notification-content">
            <div class="notification-message">{{ notification.message }}</div>
            <div v-if="notification.details" class="notification-details">
              {{ notification.details }}
            </div>
          </div>
          <button class="notification-close" @click="dismiss(notification.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.notification-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
  pointer-events: none;
}

.notification {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-node, #ffffff);
  border: 1px solid var(--border-node, #e4e4e7);
  border-left: 4px solid var(--accent-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
}

.notification-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--accent-color);
}

.notification-icon svg {
  width: 100%;
  height: 100%;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-message {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main, #18181b);
  word-break: break-word;
}

.notification-details {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #71717a);
  word-break: break-word;
}

.notification-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted, #71717a);
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.notification-close:hover {
  opacity: 1;
}

.notification-close svg {
  width: 100%;
  height: 100%;
}

/* Transitions */
.notification-enter-active {
  transition: all 0.3s ease-out;
}

.notification-leave-active {
  transition: all 0.2s ease-in;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-move {
  transition: transform 0.3s ease;
}

/* Dark theme support */
[data-theme='dark'] .notification,
[data-theme='pitch-black'] .notification,
[data-theme='cyber'] .notification {
  background: var(--bg-node, #27272a);
  border-color: var(--border-node, #3f3f46);
}
</style>
