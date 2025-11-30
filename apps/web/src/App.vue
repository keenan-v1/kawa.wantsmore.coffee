<template>
  <v-app>
    <v-app-bar v-if="isAuthenticated" color="primary" density="compact">
      <v-app-bar-title>KawaKawa Market</v-app-bar-title>
      <v-spacer />
      <v-btn to="/market" text>Market</v-btn>
      <v-btn to="/inventory" text>My Inventory</v-btn>
      <v-btn to="/demand" text>Demands</v-btn>
      <v-btn to="/account" text>Account</v-btn>
      <v-btn @click="logout" text prepend-icon="mdi-logout">Logout</v-btn>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from './stores/user'

const router = useRouter()
const userStore = useUserStore()
const isAuthenticated = ref(false)

const checkAuth = () => {
  isAuthenticated.value = !!localStorage.getItem('jwt')
}

const logout = () => {
  localStorage.removeItem('jwt')
  userStore.clearUser()
  isAuthenticated.value = false
  router.push('/login')
}

onMounted(() => {
  checkAuth()
  router.afterEach(() => {
    checkAuth()
  })
})
</script>
