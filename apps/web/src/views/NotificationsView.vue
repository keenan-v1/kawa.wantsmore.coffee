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

      <v-card-text v-else-if="filteredNotifications.length === 0" class="text-center py-8">
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

      <v-list v-else lines="three">
        <template v-for="(notification, index) in filteredNotifications" :key="notification.id">
          <v-list-item
            :class="{
              'bg-grey-darken-4': !notification.isRead,
            }"
          >
            <template #prepend>
              <v-icon :color="getNotificationColor(notification.type)" size="large">
                {{ getNotificationIcon(notification.type) }}
              </v-icon>
            </template>

            <v-list-item-title class="font-weight-medium">
              {{ notification.title }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ notification.message }}
            </v-list-item-subtitle>
            <v-list-item-subtitle class="text-caption mt-1">
              {{ formatRelativeDate(notification.createdAt) }}
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex align-center ga-2">
                <v-btn
                  v-if="getOrderLink(notification)"
                  variant="text"
                  color="primary"
                  size="small"
                  :to="getOrderLink(notification)!"
                >
                  View Order
                </v-btn>
                <v-btn
                  v-if="!notification.isRead"
                  icon
                  variant="text"
                  size="small"
                  @click.stop="markAsRead(notification.id)"
                >
                  <v-icon>mdi-check</v-icon>
                  <v-tooltip activator="parent" location="top">Mark as read</v-tooltip>
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  color="error"
                  @click.stop="deleteNotification(notification.id)"
                >
                  <v-icon>mdi-delete-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Delete</v-tooltip>
                </v-btn>
              </div>
            </template>
          </v-list-item>

          <v-divider v-if="index < filteredNotifications.length - 1" />
        </template>
      </v-list>

      <v-card-text v-if="hasMore && !loading" class="text-center">
        <v-btn variant="text" color="primary" @click="loadMore"> Load More </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../services/api'
import type { Notification, NotificationType } from '../services/api'
import { formatRelativeDate } from '../utils/dateFormat'

const loading = ref(false)
const notifications = ref<Notification[]>([])
const unreadCount = ref(0)
const offset = ref(0)
const limit = 20
const hasMore = ref(true)

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

const filteredNotifications = computed(() => {
  if (filter.value === 'unread') {
    return notifications.value.filter(n => !n.isRead)
  }
  return notifications.value
})

async function loadNotifications(append = false) {
  loading.value = true
  try {
    const newNotifications = await api.notifications.list(
      limit,
      append ? offset.value : 0,
      filter.value === 'unread'
    )

    if (append) {
      notifications.value = [...notifications.value, ...newNotifications]
    } else {
      notifications.value = newNotifications
      offset.value = 0
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
    if (notification) {
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

function getOrderLink(notification: Notification): string | null {
  const data = notification.data as Record<string, unknown> | null
  if (!data) return null

  // Reservation notifications link to the order detail
  if (notification.type.startsWith('reservation_')) {
    if (data.sellOrderId) {
      return `/orders/sell/${data.sellOrderId}`
    }
    if (data.buyOrderId) {
      return `/orders/buy/${data.buyOrderId}`
    }
  }

  return null
}

// Reload notifications when filter changes
watch(filter, () => {
  loadNotifications()
})

onMounted(() => {
  loadNotifications()
  loadUnreadCount()
})
</script>
