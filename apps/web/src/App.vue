<template>
  <v-app>
    <v-app-bar v-if="isAuthenticated" color="primary" density="compact">
      <v-app-bar-title>KawaKawa Market</v-app-bar-title>
      <v-spacer />
      <v-btn to="/market" text>Market</v-btn>
      <v-btn to="/inventory" text>My Inventory</v-btn>
      <v-btn to="/demand" text>Demands</v-btn>
      <v-btn to="/account" text>Account</v-btn>
      <v-btn v-if="isAdmin" to="/admin" text prepend-icon="mdi-shield-account">Admin</v-btn>
      <v-btn @click="logout" text prepend-icon="mdi-logout">Logout</v-btn>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from './stores/user'
import { commodityService } from './services/commodityService'
import { locationService } from './services/locationService'
import { api } from './services/api'

const router = useRouter()
const userStore = useUserStore()
const isAuthenticated = ref(false)

const isAdmin = computed(() => {
  const user = userStore.getUser()
  return user?.roles?.some(r => r.id === 'administrator') ?? false
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
  } catch (error) {
    console.error('Failed to refresh user profile:', error)
  }
}

onMounted(() => {
  checkAuth()
  router.afterEach(() => {
    checkAuth()
  })

  // Listen for token refresh events
  window.addEventListener('token-refreshed', handleTokenRefreshed)

  // Prefetch commodities and locations data on app startup
  if (isAuthenticated.value) {
    commodityService.prefetch().catch(err => console.error('Failed to prefetch commodities:', err))
    locationService.prefetch().catch(err => console.error('Failed to prefetch locations:', err))
  }
})

onUnmounted(() => {
  window.removeEventListener('token-refreshed', handleTokenRefreshed)
})
</script>
