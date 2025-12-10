<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    location="bottom end"
    transition="slide-y-transition"
    max-width="400"
    min-width="350"
  >
    <template #activator="{ props: menuProps }">
      <v-tooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <v-btn v-bind="{ ...menuProps, ...tooltipProps }" icon size="small" class="mx-1">
            <v-badge
              v-if="unreadCount > 0"
              :content="unreadCount > 99 ? '99+' : unreadCount"
              color="error"
              floating
            >
              <v-icon>mdi-bell</v-icon>
            </v-badge>
            <v-icon v-else>mdi-bell-outline</v-icon>
          </v-btn>
        </template>
        Notifications
      </v-tooltip>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center pb-2">
        <span class="text-subtitle-1">Notifications</span>
        <v-spacer />
        <v-btn
          v-if="unreadCount > 0"
          variant="text"
          size="small"
          color="primary"
          :loading="markingAllAsRead"
          @click="markAllAsRead"
        >
          Mark all read
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text v-if="loading" class="text-center py-4">
        <v-progress-circular indeterminate size="24" />
      </v-card-text>

      <v-card-text v-else-if="groupedNotifications.length === 0" class="text-center py-6">
        <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-bell-off-outline</v-icon>
        <div class="text-body-2 text-grey">No notifications</div>
      </v-card-text>

      <v-list v-else density="compact" class="pa-0 notification-list">
        <template v-for="group in groupedNotifications" :key="group.contextKey">
          <v-list-item
            :class="{ 'bg-grey-darken-4': !group.latest.isRead }"
            @click="handleNotificationClick(group)"
          >
            <template #prepend>
              <v-icon :color="getNotificationColor(group.latest.type)" size="small" class="mr-2">
                {{ getNotificationIcon(group.latest.type) }}
              </v-icon>
            </template>

            <v-list-item-title class="text-body-2">
              {{ group.latest.title }}
              <v-badge
                v-if="group.count > 1"
                :content="group.count"
                inline
                color="grey"
                class="ml-1"
              />
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-truncate" style="max-width: 280px">
              {{ group.latest.message }}
            </v-list-item-subtitle>
            <v-list-item-subtitle class="text-caption text-medium-emphasis mt-1">
              {{ formatRelativeDate(group.latest.createdAt) }}
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                v-if="!group.latest.isRead"
                icon
                variant="text"
                size="x-small"
                @click.stop="markGroupAsRead(group)"
              >
                <v-icon size="small">mdi-check</v-icon>
                <v-tooltip activator="parent" location="left">Mark as read</v-tooltip>
              </v-btn>
            </template>
          </v-list-item>
        </template>
      </v-list>

      <v-divider />

      <v-card-actions class="justify-center py-2">
        <v-btn variant="text" color="primary" size="small" to="/notifications" @click="closeMenu">
          View all notifications
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>

  <!-- Order Detail Dialog -->
  <OrderDetailDialog
    v-if="selectedOrder"
    v-model="orderDetailDialog"
    :order-type="selectedOrder.type"
    :order-id="selectedOrder.id"
    @updated="handleOrderUpdated"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import type { Notification, NotificationType } from '../services/api'
import { formatRelativeDate } from '../utils/dateFormat'
import { useUserStore } from '../stores/user'
import OrderDetailDialog from './OrderDetailDialog.vue'

interface NotificationGroup {
  contextKey: string
  latest: Notification
  count: number
  unreadCount: number
  notifications: Notification[]
}

const router = useRouter()
const userStore = useUserStore()

const menuOpen = ref(false)
const loading = ref(false)
const notifications = ref<Notification[]>([])
const unreadCount = ref(0)
const previousUnreadCount = ref(0)
const markingAllAsRead = ref(false)

// Polling interval (30 seconds)
const POLL_INTERVAL = 30000
let pollIntervalId: ReturnType<typeof setInterval> | null = null

// Order detail dialog
const orderDetailDialog = ref(false)
const selectedOrder = ref<{ type: 'sell' | 'buy'; id: number } | null>(null)

// Get notification context key for grouping
function getContextKey(notification: Notification): string {
  const data = notification.data as Record<string, unknown> | null
  if (!data) return `generic-${notification.id}`

  // Group by reservation
  if (notification.type.startsWith('reservation_') && data.reservationId) {
    return `reservation-${data.reservationId}`
  }

  // Group by sell order
  if (data.sellOrderId) {
    return `sell-${data.sellOrderId}`
  }

  // Group by buy order
  if (data.buyOrderId) {
    return `buy-${data.buyOrderId}`
  }

  // Group by user (for approval notifications)
  if (notification.type.startsWith('user_') && data.userId) {
    return `user-${data.userId}`
  }

  return `generic-${notification.id}`
}

// Group notifications by context
const groupedNotifications = computed<NotificationGroup[]>(() => {
  const groups = new Map<string, NotificationGroup>()

  for (const notification of notifications.value) {
    const key = getContextKey(notification)
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        contextKey: key,
        latest: notification,
        count: 1,
        unreadCount: notification.isRead ? 0 : 1,
        notifications: [notification],
      })
    } else {
      existing.count++
      if (!notification.isRead) existing.unreadCount++
      existing.notifications.push(notification)
      // Keep the latest (notifications are already sorted by createdAt desc)
    }
  }

  // Return top 5 groups
  return Array.from(groups.values()).slice(0, 5)
})

async function loadNotifications() {
  loading.value = true
  try {
    // Load recent notifications
    const [notifs, countResult] = await Promise.all([
      api.notifications.list(20, 0),
      api.notifications.getUnreadCount(),
    ])
    notifications.value = notifs
    unreadCount.value = countResult.count
  } catch (error) {
    console.error('Failed to load notifications:', error)
  } finally {
    loading.value = false
  }
}

async function loadUnreadCount() {
  try {
    const result = await api.notifications.getUnreadCount()
    const newCount = result.count

    // Check if we have new notifications
    if (newCount > previousUnreadCount.value && previousUnreadCount.value !== 0) {
      const newNotificationCount = newCount - previousUnreadCount.value
      showBrowserNotification(newNotificationCount)
    }

    previousUnreadCount.value = newCount
    unreadCount.value = newCount
  } catch (error) {
    console.error('Failed to load unread count:', error)
  }
}

// Show browser notification for new notifications
function showBrowserNotification(count: number) {
  // Check if browser notifications are enabled in user preferences
  if (!userStore.getBrowserNotificationsEnabled()) {
    return
  }

  // Check if browser supports notifications
  if (!('Notification' in window)) {
    return
  }

  // Check if permission is granted
  if (window.Notification.permission !== 'granted') {
    return
  }

  // Show the notification
  const title = 'Kawakawa CX'
  const body = count === 1 ? 'You have a new notification' : `You have ${count} new notifications`

  new window.Notification(title, {
    body,
    icon: '/logo.svg',
    tag: 'kawakawa-notifications', // Replaces previous notification
  })
}

// Start polling for new notifications
function startPolling() {
  if (pollIntervalId) return // Already polling

  pollIntervalId = setInterval(() => {
    loadUnreadCount()
  }, POLL_INTERVAL)
}

// Stop polling
function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

async function markGroupAsRead(group: NotificationGroup) {
  try {
    // Mark all notifications in the group as read
    await Promise.all(
      group.notifications.filter(n => !n.isRead).map(n => api.notifications.markAsRead(n.id))
    )

    // Update local state
    for (const notification of group.notifications) {
      notification.isRead = true
    }
    unreadCount.value = Math.max(0, unreadCount.value - group.unreadCount)

    // Notify other components
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to mark as read:', error)
  }
}

async function markAllAsRead() {
  markingAllAsRead.value = true
  try {
    await api.notifications.markAllAsRead()
    notifications.value.forEach(n => (n.isRead = true))
    unreadCount.value = 0
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to mark all as read:', error)
  } finally {
    markingAllAsRead.value = false
  }
}

async function handleNotificationClick(group: NotificationGroup) {
  const notification = group.latest
  const data = notification.data as Record<string, unknown> | null

  // Mark the group as read
  if (!notification.isRead) {
    markGroupAsRead(group)
  }

  // Determine what to open based on notification type
  if (data) {
    if (notification.type.startsWith('reservation_')) {
      // Open the order detail dialog
      if (data.sellOrderId) {
        selectedOrder.value = { type: 'sell', id: data.sellOrderId as number }
        await nextTick() // Wait for OrderDetailDialog to mount
        orderDetailDialog.value = true
        closeMenu()
        return
      } else if (data.buyOrderId) {
        selectedOrder.value = { type: 'buy', id: data.buyOrderId as number }
        await nextTick() // Wait for OrderDetailDialog to mount
        orderDetailDialog.value = true
        closeMenu()
        return
      }
    }

    // For user notifications, go to admin page
    if (
      notification.type.startsWith('user_') &&
      notification.type !== 'user_approved' &&
      notification.type !== 'user_rejected' &&
      notification.type !== 'user_auto_approved'
    ) {
      router.push('/admin')
      closeMenu()
      return
    }
  }

  // Default: go to notifications page
  router.push('/notifications')
  closeMenu()
}

function handleOrderUpdated() {
  loadNotifications()
}

function closeMenu() {
  menuOpen.value = false
}

function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'reservation_placed':
      return 'mdi-cart-plus'
    case 'reservation_confirmed':
      return 'mdi-check-circle'
    case 'reservation_rejected':
      return 'mdi-close-circle'
    case 'reservation_fulfilled':
      return 'mdi-check-all'
    case 'reservation_cancelled':
      return 'mdi-cancel'
    case 'reservation_expired':
      return 'mdi-clock-alert'
    case 'user_needs_approval':
      return 'mdi-account-clock'
    case 'user_auto_approved':
    case 'user_approved':
      return 'mdi-account-check'
    case 'user_rejected':
      return 'mdi-account-remove'
    default:
      return 'mdi-bell'
  }
}

function getNotificationColor(type: NotificationType): string {
  switch (type) {
    case 'reservation_placed':
      return 'info'
    case 'reservation_confirmed':
    case 'reservation_fulfilled':
    case 'user_approved':
    case 'user_auto_approved':
      return 'success'
    case 'reservation_rejected':
    case 'reservation_cancelled':
    case 'reservation_expired':
    case 'user_rejected':
      return 'error'
    case 'user_needs_approval':
      return 'warning'
    default:
      return 'grey'
  }
}

// Listen for updates from other components
const handleNotificationsUpdated = () => {
  loadUnreadCount()
}

// Load notifications when menu opens
watch(menuOpen, newValue => {
  if (newValue) {
    loadNotifications()
  }
})

onMounted(() => {
  loadUnreadCount()
  startPolling()
  window.addEventListener('notifications-updated', handleNotificationsUpdated)
})

onUnmounted(() => {
  stopPolling()
  window.removeEventListener('notifications-updated', handleNotificationsUpdated)
})

// Expose for parent component
defineExpose({
  loadUnreadCount,
})
</script>

<style scoped>
.notification-list {
  max-height: 360px;
  overflow-y: auto;
}
</style>
