<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4" class="text-center">
        <KawaLogo :size="120" class="mb-6" />

        <!-- Loading State -->
        <template v-if="loading">
          <v-progress-circular indeterminate color="primary" size="64" class="mb-4" />
          <p class="text-body-1">Completing Discord authentication...</p>
        </template>

        <!-- Error State -->
        <template v-else-if="errorMessage">
          <v-alert type="error" class="mb-4 text-left">
            {{ errorMessage }}
          </v-alert>
          <v-btn color="primary" to="/login">Back to Login</v-btn>
        </template>

        <!-- Info State (account exists without Discord) -->
        <template v-else-if="infoMessage">
          <v-alert type="info" class="mb-4 text-left">
            {{ infoMessage }}
          </v-alert>
          <v-btn color="primary" to="/login">Back to Login</v-btn>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../services/api'
import { useUserStore } from '../stores/user'
import KawaLogo from '../components/KawaLogo.vue'
import type { User } from '../types'
import type { DiscordAuthUser } from '@kawakawa/types'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(true)
const errorMessage = ref('')
const infoMessage = ref('')

// Convert Discord auth user to full User type with defaults
const discordAuthUserToUser = (authUser: DiscordAuthUser): User => ({
  profileName: authUser.username,
  displayName: authUser.displayName,
  fioUsername: '',
  hasFioApiKey: false,
  preferredCurrency: 'CIS',
  locationDisplayMode: 'both',
  commodityDisplayMode: 'both',
  fioAutoSync: true,
  fioExcludedLocations: [],
  roles: authUser.roles,
  permissions: authUser.permissions,
})

const handleCallback = async () => {
  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined
  const error = route.query.error as string | undefined
  const errorDescription = route.query.error_description as string | undefined

  // Validate we have the expected parameters
  if (!code && !error) {
    errorMessage.value = 'Invalid callback: missing authorization code'
    loading.value = false
    return
  }

  // Check if this is an account connection flow (authenticated user connecting Discord)
  const accountConnectState = sessionStorage.getItem('discord_oauth_state')
  if (accountConnectState && state === accountConnectState) {
    // This is an account connection flow - redirect to /account with the callback params
    // The AccountView will handle the actual connection
    router.replace({
      path: '/account',
      query: { code, state, ...(error && { error }), ...(errorDescription && { error_description: errorDescription }) },
    })
    return
  }

  // This is a login/registration flow - validate against login state
  const storedState = sessionStorage.getItem('discord_auth_state')
  sessionStorage.removeItem('discord_auth_state')

  if (state !== storedState) {
    errorMessage.value = 'Discord authentication failed: Invalid state. Please try again.'
    loading.value = false
    return
  }

  try {
    const result = await api.discordAuth.handleCallback(code, state, error, errorDescription)

    switch (result.type) {
      case 'login': {
        // Successful login - store token and redirect
        localStorage.setItem('jwt', result.token)
        userStore.setUser(discordAuthUserToUser(result.user))

        const redirectTo = sessionStorage.getItem('discord_auth_redirect') || '/market'
        sessionStorage.removeItem('discord_auth_redirect')
        router.push(redirectTo)
        break
      }

      case 'register_required':
        // New user - redirect to registration with Discord data
        sessionStorage.setItem('discord_register_state', result.state)
        sessionStorage.setItem('discord_register_profile', JSON.stringify(result.discordProfile))
        router.push('/register?discord=true')
        break

      case 'account_exists_no_discord':
        // User exists but hasn't connected Discord
        infoMessage.value = `An account with username "${result.username}" already exists. Please log in with your password, then connect Discord from your profile settings.`
        loading.value = false
        break

      case 'consent_required':
        // User hasn't authorized before, need full consent flow
        errorMessage.value = 'Discord authorization is required. Please try again.'
        loading.value = false
        break

      case 'error':
        errorMessage.value = result.message
        loading.value = false
        break
    }
  } catch (err) {
    console.error('Discord callback error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Failed to complete Discord login'
    loading.value = false
  }
}

onMounted(() => {
  handleCallback()
})
</script>
