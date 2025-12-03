<template>
  <v-app>
    <v-app-bar v-if="isAuthenticated" color="primary" density="compact">
      <v-app-bar-title>KawaKawa CX</v-app-bar-title>
      <v-spacer />
      <v-btn to="/market" text>Market</v-btn>
      <v-btn to="/inventory" text>My Inventory</v-btn>
      <v-btn to="/orders" text>My Orders</v-btn>
      <v-btn to="/account" text>Account</v-btn>
      <v-btn v-if="isAdmin" to="/admin" text prepend-icon="mdi-shield-account">
        Admin
        <v-badge
          v-if="pendingApprovalsCount > 0"
          :content="pendingApprovalsCount"
          color="error"
          floating
          offset-x="-5"
          offset-y="-5"
        />
      </v-btn>
      <v-btn @click="logout" text prepend-icon="mdi-logout">Logout</v-btn>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
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

const router = useRouter()
const userStore = useUserStore()
const isAuthenticated = ref(false)
const pendingApprovalsCount = ref(0)

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

// Handle token refresh events - re-fetch user profile to update roles
const handleTokenRefreshed = async () => {
  try {
    const user = await api.account.getProfile()
    userStore.setUser(user)
    // Refresh pending approvals count after token refresh
    fetchPendingApprovalsCount()
  } catch (error) {
    console.error('Failed to refresh user profile:', error)
  }
}

// Listen for approval queue updates (emitted from AdminView)
const handleApprovalQueueUpdated = () => {
  fetchPendingApprovalsCount()
}

onMounted(() => {
  checkAuth()
  router.afterEach(() => {
    checkAuth()
  })

  // Listen for token refresh events
  window.addEventListener('token-refreshed', handleTokenRefreshed)
  window.addEventListener('approval-queue-updated', handleApprovalQueueUpdated)

  // Prefetch reference data on app startup
  if (isAuthenticated.value) {
    commodityService.prefetch().catch(err => console.error('Failed to prefetch commodities:', err))
    locationService.prefetch().catch(err => console.error('Failed to prefetch locations:', err))
    roleService.prefetch().catch(err => console.error('Failed to prefetch roles:', err))
    // Fetch pending approvals count for admins
    fetchPendingApprovalsCount()
  }
})

onUnmounted(() => {
  window.removeEventListener('token-refreshed', handleTokenRefreshed)
  window.removeEventListener('approval-queue-updated', handleApprovalQueueUpdated)
})
</script>
