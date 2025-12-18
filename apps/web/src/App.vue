<template>
  <v-app>
    <!-- App Update Banner -->
    <v-banner
      v-if="showAppUpdateBanner"
      color="info"
      icon="mdi-update"
      lines="one"
      sticky
      class="app-update-banner"
    >
      <template #text>
        A new version of the app is available.
        <a href="#" class="text-info-lighten-3" @click.prevent="refreshApp">Refresh to update</a>
      </template>
      <template #actions>
        <v-btn variant="text" size="small" @click="dismissAppUpdateBanner">Dismiss</v-btn>
      </template>
    </v-banner>

    <v-app-bar v-if="isAuthenticated" color="primary" density="compact">
      <template #prepend>
        <img src="/navbar-logo.svg" alt="Kawakawa CX" class="navbar-logo ml-3" />
      </template>
      <v-spacer />
      <!-- Only show navigation for verified users -->
      <template v-if="isVerified">
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/market" icon size="small" class="mx-1">
              <v-icon>mdi-store</v-icon>
            </v-btn>
          </template>
          Market
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/inventory" icon size="small" class="mx-1">
              <v-icon>mdi-package-variant</v-icon>
            </v-btn>
          </template>
          My Inventory
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/orders" icon size="small" class="mx-1">
              <v-icon>mdi-clipboard-list</v-icon>
            </v-btn>
          </template>
          My Orders
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/prices" icon size="small" class="mx-1">
              <v-icon>mdi-tag-multiple</v-icon>
            </v-btn>
          </template>
          Price Lists
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/account" icon size="small" class="mx-1">
              <v-icon>mdi-account-cog</v-icon>
            </v-btn>
          </template>
          Account
        </v-tooltip>
        <NotificationDropdown ref="notificationDropdown" />
        <v-tooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/admin" icon size="small" class="mx-1">
              <v-badge
                v-if="pendingApprovalsCount > 0"
                :content="pendingApprovalsCount"
                color="error"
                floating
              >
                <v-icon>mdi-shield-account</v-icon>
              </v-badge>
              <v-icon v-else>mdi-shield-account</v-icon>
            </v-btn>
          </template>
          Admin
        </v-tooltip>
      </template>
      <v-tooltip location="bottom">
        <template #activator="{ props }">
          <v-btn v-bind="props" icon size="small" class="mx-1" @click="logout">
            <v-icon>mdi-logout</v-icon>
          </v-btn>
        </template>
        Logout
      </v-tooltip>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>

    <!-- Data Update Snackbar -->
    <v-snackbar v-model="showDataUpdateSnackbar" timeout="4000" color="success" location="bottom">
      {{ dataUpdateMessage }}
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from './stores/user'
import { commodityService } from './services/commodityService'
import { locationService } from './services/locationService'
import { roleService } from './services/roleService'
import { api } from './services/api'
import { syncService, SYNC_EVENTS } from './services/syncService'
import NotificationDropdown from './components/NotificationDropdown.vue'
import type { SyncDataKey } from '@kawakawa/types'

const router = useRouter()
const userStore = useUserStore()
const isAuthenticated = ref(false)
const pendingApprovalsCount = ref(0)
const notificationDropdown = ref<InstanceType<typeof NotificationDropdown> | null>(null)

// App update banner state
const showAppUpdateBanner = ref(false)
const appUpdateDismissed = ref(false)

// Data update snackbar state
const showDataUpdateSnackbar = ref(false)
const dataUpdateMessage = ref('')

const isVerified = computed(() => {
  const user = userStore.getUser()
  // User is verified if they have any role other than 'unverified'
  return user?.roles?.some(r => r.id !== 'unverified') ?? false
})

const isAdmin = computed(() => {
  const user = userStore.getUser()
  return user?.roles?.some(r => r.id === 'administrator') ?? false
})

// Fetch pending approvals count for admins
const fetchPendingApprovalsCount = async () => {
  if (!isAdmin.value) {
    pendingApprovalsCount.value = 0
    return
  }
  try {
    const result = await api.admin.getPendingApprovalsCount()
    pendingApprovalsCount.value = result.count
  } catch (error) {
    console.error('Failed to fetch pending approvals count:', error)
    pendingApprovalsCount.value = 0
  }
}

// Watch for admin status changes
watch(isAdmin, newValue => {
  if (newValue) {
    fetchPendingApprovalsCount()
  } else {
    pendingApprovalsCount.value = 0
  }
})

const checkAuth = () => {
  isAuthenticated.value = !!localStorage.getItem('jwt')
}

const logout = () => {
  localStorage.removeItem('jwt')
  userStore.clearUser()
  isAuthenticated.value = false
  router.push('/login')
}

// Validate the session on startup - clears stale tokens
const validateSession = async () => {
  const token = localStorage.getItem('jwt')
  if (!token) return

  try {
    // Try to fetch user profile to validate the token
    const user = await api.account.getProfile()
    userStore.setUser(user)
    isAuthenticated.value = true
  } catch (error) {
    // Token is invalid or user doesn't exist - clear and redirect
    console.warn('Session invalid, clearing token:', error)
    localStorage.removeItem('jwt')
    userStore.clearUser()
    isAuthenticated.value = false
    router.push('/login')
  }
}

// Handle token refresh events - re-fetch user profile to update roles
const handleTokenRefreshed = async () => {
  try {
    const user = await api.account.getProfile()
    userStore.setUser(user)
    // Refresh counts after token refresh
    fetchPendingApprovalsCount()
    notificationDropdown.value?.loadUnreadCount()
  } catch (error) {
    console.error('Failed to refresh user profile:', error)
  }
}

// Listen for approval queue updates (emitted from AdminView)
const handleApprovalQueueUpdated = () => {
  fetchPendingApprovalsCount()
}

// Sync service event handlers
const handleAppVersionChanged = () => {
  if (!appUpdateDismissed.value) {
    showAppUpdateBanner.value = true
  }
}

const handleDataUpdated = (event: Event) => {
  const customEvent = event as CustomEvent<{ updatedKeys: SyncDataKey[] }>
  const keys = customEvent.detail.updatedKeys

  // Build human-readable message
  const keyLabels: Record<SyncDataKey, string> = {
    locations: 'Locations',
    commodities: 'Commodities',
    priceLists: 'Price lists',
    globalDefaults: 'Settings',
  }
  const labels = keys.map(k => keyLabels[k] || k)
  dataUpdateMessage.value = `${labels.join(', ')} updated`
  showDataUpdateSnackbar.value = true
}

const dismissAppUpdateBanner = () => {
  showAppUpdateBanner.value = false
  appUpdateDismissed.value = true
}

const refreshApp = () => {
  window.location.reload()
}

onMounted(async () => {
  // Listen for token refresh events
  window.addEventListener('token-refreshed', handleTokenRefreshed)
  window.addEventListener('approval-queue-updated', handleApprovalQueueUpdated)

  // Listen for sync events
  window.addEventListener(SYNC_EVENTS.APP_VERSION_CHANGED, handleAppVersionChanged)
  window.addEventListener(SYNC_EVENTS.DATA_UPDATED, handleDataUpdated)

  router.afterEach(() => {
    checkAuth()
  })

  // Validate session on startup (clears stale tokens)
  await validateSession()

  // Prefetch reference data if authenticated and verified
  if (isAuthenticated.value && isVerified.value) {
    commodityService.prefetch().catch(err => console.error('Failed to prefetch commodities:', err))
    locationService.prefetch().catch(err => console.error('Failed to prefetch locations:', err))
    locationService
      .loadUserLocations()
      .catch(err => console.error('Failed to load user locations:', err))
    roleService.prefetch().catch(err => console.error('Failed to prefetch roles:', err))
    // Fetch pending approvals count for admins
    fetchPendingApprovalsCount()
    // Start sync service polling
    syncService.startPolling()
  }
})

onUnmounted(() => {
  window.removeEventListener('token-refreshed', handleTokenRefreshed)
  window.removeEventListener('approval-queue-updated', handleApprovalQueueUpdated)
  window.removeEventListener(SYNC_EVENTS.APP_VERSION_CHANGED, handleAppVersionChanged)
  window.removeEventListener(SYNC_EVENTS.DATA_UPDATED, handleDataUpdated)
  syncService.stopPolling()
})
</script>

<style scoped>
.navbar-logo {
  height: 32px;
  width: auto;
}
</style>

<style>
/* Global tooltip styling - must be unscoped since tooltips render in a portal */
.kawa-tooltip {
  background-color: rgb(var(--v-theme-surface-bright)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  font-size: 0.875rem;
}
</style>
