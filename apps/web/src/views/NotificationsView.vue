<template>
  <v-container>
    <h1 class="text-h4 mb-4">Notifications</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Actions Card -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row dense align="center">
          <v-col cols="6" sm="4" md="3">
            <v-select
              v-model="filter"
              :items="filterOptions"
              item-title="title"
              item-value="value"
              label="Filter"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="8" md="9" class="text-right">
            <v-btn
              color="primary"
              variant="text"
              :disabled="unreadCount === 0 || loading"
              @click="markAllAsRead"
            >
              Mark All Read
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Notifications List -->
    <v-card>
      <v-card-text v-if="loading" class="text-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </v-card-text>

      <v-card-text v-else-if="groupedNotifications.length === 0" class="text-center py-8">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-bell-off-outline</v-icon>
        <p class="text-h6 text-grey">No notifications</p>
        <p class="text-body-2 text-grey">
          {{
            filter === 'unread'
              ? 'You have no unread notifications.'
              : 'You have no notifications yet.'
          }}
        </p>
      </v-card-text>

      <v-list v-else lines="three" class="pa-0">
        <template v-for="(group, groupIndex) in groupedNotifications" :key="group.contextKey">
          <!-- Group Header (Latest Notification) -->
          <v-list-item
            :class="{
              'bg-grey-darken-4': group.unreadCount > 0,
              'group-header': group.count > 1,
            }"
            @click="
              group.count > 1
                ? toggleGroupExpanded(group.contextKey)
                : handleNotificationClick(group.latest)
            "
          >
            <template #prepend>
              <div class="d-flex align-center" style="min-width: 48px">
                <v-icon
                  size="small"
                  class="expand-icon"
                  :style="{ visibility: group.count > 1 ? 'visible' : 'hidden' }"
                >
                  {{ expandedGroups[group.contextKey] ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                </v-icon>
                <v-icon :color="getNotificationColor(group.latest.type)" size="large">
                  {{ getNotificationIcon(group.latest.type) }}
                </v-icon>
              </div>
            </template>

            <v-list-item-title class="font-weight-medium d-flex align-center ml-2">
              {{ group.latest.title }}
              <v-badge
                v-if="group.count > 1"
                :content="group.count"
                inline
                color="grey"
                class="ml-2"
              />
              <v-chip
                v-if="group.unreadCount > 0 && group.count > 1"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                {{ group.unreadCount }} unread
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle class="ml-2">
              {{ group.latest.message }}
            </v-list-item-subtitle>
            <v-list-item-subtitle class="text-caption mt-1 ml-4">
              {{ formatRelativeDate(group.latest.createdAt) }}
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex align-center ga-2">
                <v-btn
                  v-if="hasOrderLink(group.latest)"
                  variant="text"
                  color="primary"
                  size="small"
                  @click.stop="handleNotificationClick(group.latest)"
                >
                  View Order
                </v-btn>
                <v-btn
                  v-if="group.unreadCount > 0"
                  icon
                  variant="text"
                  size="small"
                  @click.stop="markGroupAsRead(group)"
                >
                  <v-icon>mdi-check</v-icon>
                  <v-tooltip activator="parent" location="top">
                    {{ group.count > 1 ? 'Mark all as read' : 'Mark as read' }}
                  </v-tooltip>
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  color="error"
                  @click.stop="deleteGroup(group)"
                >
                  <v-icon>mdi-delete-outline</v-icon>
                  <v-tooltip activator="parent" location="top">
                    {{ group.count > 1 ? 'Delete all' : 'Delete' }}
                  </v-tooltip>
                </v-btn>
              </div>
            </template>
          </v-list-item>

          <!-- Expanded Group Items (older notifications in the group) -->
          <template v-if="group.count > 1 && expandedGroups[group.contextKey]">
            <v-list-item
              v-for="notification in group.olderNotifications"
              :key="notification.id"
              :class="{
                'bg-grey-darken-4': !notification.isRead,
                'pl-12': true,
              }"
              density="compact"
            >
              <template #prepend>
                <v-icon :color="getNotificationColor(notification.type)" size="small">
                  {{ getNotificationIcon(notification.type) }}
                </v-icon>
              </template>

              <v-list-item-title class="text-body-2">
                {{ notification.title }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ notification.message }}
              </v-list-item-subtitle>
              <v-list-item-subtitle class="text-caption text-medium-emphasis mt-1">
                {{ formatRelativeDate(notification.createdAt) }}
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center ga-1">
                  <v-btn
                    v-if="!notification.isRead"
                    icon
                    variant="text"
                    size="x-small"
                    @click.stop="markAsRead(notification.id)"
                  >
                    <v-icon size="small">mdi-check</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    variant="text"
                    size="x-small"
                    color="error"
                    @click.stop="deleteNotification(notification.id)"
                  >
                    <v-icon size="small">mdi-delete-outline</v-icon>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </template>

          <v-divider v-if="groupIndex < groupedNotifications.length - 1" />
        </template>
      </v-list>

      <v-card-text v-if="hasMore && !loading" class="text-center">
        <v-btn variant="text" color="primary" @click="loadMore"> Load More </v-btn>
      </v-card-text>
    </v-card>

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-if="selectedOrder"
      v-model="orderDetailDialog"
      :order-type="selectedOrder.type"
      :order-id="selectedOrder.id"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { api } from '../services/api'
import type { Notification, NotificationType } from '../services/api'
import { formatRelativeDate } from '../utils/dateFormat'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'

interface NotificationGroup {
  contextKey: string
  latest: Notification
  olderNotifications: Notification[]
  count: number
  unreadCount: number
}

const loading = ref(false)
const notifications = ref<Notification[]>([])
const unreadCount = ref(0)
const offset = ref(0)
const limit = 50
const hasMore = ref(true)
const expandedGroups = ref<Record<string, boolean>>({})

// Order detail dialog
const orderDetailDialog = ref(false)
const selectedOrder = ref<{ type: 'sell' | 'buy'; id: number } | null>(null)

const filter = ref<'all' | 'unread'>('all')
const filterOptions = [
  { title: 'All', value: 'all' },
  { title: 'Unread', value: 'unread' },
]

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

function showSnackbar(message: string, color: string = 'success') {
  snackbar.value = { show: true, message, color }
}

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
  const filtered =
    filter.value === 'unread' ? notifications.value.filter(n => !n.isRead) : notifications.value

  const groups = new Map<string, NotificationGroup>()

  for (const notification of filtered) {
    const key = getContextKey(notification)
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        contextKey: key,
        latest: notification,
        olderNotifications: [],
        count: 1,
        unreadCount: notification.isRead ? 0 : 1,
      })
    } else {
      existing.count++
      if (!notification.isRead) existing.unreadCount++
      existing.olderNotifications.push(notification)
    }
  }

  return Array.from(groups.values())
})

function toggleGroupExpanded(contextKey: string) {
  expandedGroups.value[contextKey] = !expandedGroups.value[contextKey]
}

async function loadNotifications(append = false) {
  loading.value = true
  try {
    const newNotifications = await api.notifications.list(limit, append ? offset.value : 0)

    if (append) {
      notifications.value = [...notifications.value, ...newNotifications]
    } else {
      notifications.value = newNotifications
      offset.value = 0
      expandedGroups.value = {}
    }

    hasMore.value = newNotifications.length === limit
    offset.value += newNotifications.length
  } catch (error) {
    console.error('Failed to load notifications:', error)
    showSnackbar('Failed to load notifications', 'error')
  } finally {
    loading.value = false
  }
}

async function loadUnreadCount() {
  try {
    const result = await api.notifications.getUnreadCount()
    unreadCount.value = result.count
  } catch (error) {
    console.error('Failed to load unread count:', error)
  }
}

function loadMore() {
  loadNotifications(true)
}

async function markAsRead(id: number) {
  try {
    await api.notifications.markAsRead(id)
    const notification = notifications.value.find(n => n.id === id)
    if (notification && !notification.isRead) {
      notification.isRead = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    showSnackbar('Marked as read')
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to mark as read:', error)
    showSnackbar('Failed to mark as read', 'error')
  }
}

async function markGroupAsRead(group: NotificationGroup) {
  try {
    // Collect all unread notifications in the group
    const unreadNotifications = [group.latest, ...group.olderNotifications].filter(n => !n.isRead)

    // Mark them all as read
    await Promise.all(unreadNotifications.map(n => api.notifications.markAsRead(n.id)))

    // Update local state
    for (const notification of unreadNotifications) {
      notification.isRead = true
    }
    unreadCount.value = Math.max(0, unreadCount.value - unreadNotifications.length)

    showSnackbar(`Marked ${unreadNotifications.length} notification(s) as read`)
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to mark group as read:', error)
    showSnackbar('Failed to mark as read', 'error')
  }
}

async function markAllAsRead() {
  try {
    const result = await api.notifications.markAllAsRead()
    notifications.value.forEach(n => (n.isRead = true))
    unreadCount.value = 0
    showSnackbar(`Marked ${result.count} notification(s) as read`)
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to mark all as read:', error)
    showSnackbar('Failed to mark all as read', 'error')
  }
}

async function deleteNotification(id: number) {
  try {
    await api.notifications.delete(id)
    const index = notifications.value.findIndex(n => n.id === id)
    if (index !== -1) {
      const notification = notifications.value[index]
      if (!notification.isRead) {
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
      notifications.value.splice(index, 1)
    }
    showSnackbar('Notification deleted')
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to delete notification:', error)
    showSnackbar('Failed to delete notification', 'error')
  }
}

async function deleteGroup(group: NotificationGroup) {
  try {
    const allNotifications = [group.latest, ...group.olderNotifications]
    const unreadInGroup = allNotifications.filter(n => !n.isRead).length

    // Delete all notifications in the group
    await Promise.all(allNotifications.map(n => api.notifications.delete(n.id)))

    // Remove from local state
    const idsToRemove = new Set(allNotifications.map(n => n.id))
    notifications.value = notifications.value.filter(n => !idsToRemove.has(n.id))
    unreadCount.value = Math.max(0, unreadCount.value - unreadInGroup)

    showSnackbar(`Deleted ${allNotifications.length} notification(s)`)
    window.dispatchEvent(new CustomEvent('notifications-updated'))
  } catch (error) {
    console.error('Failed to delete group:', error)
    showSnackbar('Failed to delete notifications', 'error')
  }
}

async function handleNotificationClick(notification: Notification) {
  const data = notification.data as Record<string, unknown> | null

  if (data) {
    if (notification.type.startsWith('reservation_')) {
      if (data.sellOrderId) {
        selectedOrder.value = { type: 'sell', id: data.sellOrderId as number }
        await nextTick() // Wait for OrderDetailDialog to mount
        orderDetailDialog.value = true
        return
      } else if (data.buyOrderId) {
        selectedOrder.value = { type: 'buy', id: data.buyOrderId as number }
        await nextTick() // Wait for OrderDetailDialog to mount
        orderDetailDialog.value = true
        return
      }
    }
  }
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

function hasOrderLink(notification: Notification): boolean {
  const data = notification.data as Record<string, unknown> | null
  if (!data) return false

  if (notification.type.startsWith('reservation_')) {
    return !!(data.sellOrderId || data.buyOrderId)
  }

  return false
}

onMounted(() => {
  loadNotifications()
  loadUnreadCount()
})
</script>

<style scoped>
.group-header {
  cursor: pointer;
}

.group-header:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.expand-icon {
  opacity: 0.6;
  transition: transform 0.2s;
}
</style>
