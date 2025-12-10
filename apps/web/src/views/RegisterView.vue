<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="6">
        <div class="text-center mb-6">
          <KawaLogo :size="120" />
        </div>
        <!-- Discord Registration Completion -->
        <v-card v-if="isDiscordRegistration && discordProfile">
          <v-card-title class="text-h5">Complete Your Registration</v-card-title>
          <v-card-text>
            <v-alert
              v-if="errorMessage"
              type="error"
              class="mb-4"
              closable
              @click:close="errorMessage = ''"
            >
              {{ errorMessage }}
            </v-alert>

            <!-- Discord Profile Info -->
            <div class="d-flex align-center mb-4 pa-3 bg-surface-variant rounded">
              <v-avatar size="48" class="mr-3">
                <v-img
                  v-if="discordAvatarUrl"
                  :src="discordAvatarUrl"
                  :alt="discordProfile.discordUsername"
                />
                <DiscordIcon v-else :size="32" />
              </v-avatar>
              <div>
                <div class="text-body-1 font-weight-medium text-high-emphasis">
                  {{ discordProfile.discordUsername }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  <DiscordIcon :size="14" class="mr-1" />
                  Discord Account Connected
                </div>
              </div>
            </div>

            <v-form @submit.prevent="handleDiscordRegister">
              <v-text-field
                v-model="username"
                label="Profile Name"
                prepend-icon="mdi-account"
                :disabled="loading"
                hint="Your unique login identifier (can be edited)"
                persistent-hint
                class="mb-2"
                :rules="[v => !!v || 'Profile name is required']"
                :error-messages="usernameAvailable === false ? usernameMessage : ''"
                :color="usernameAvailable === true ? 'success' : undefined"
              >
                <template #append-inner>
                  <v-progress-circular
                    v-if="checkingUsername"
                    size="20"
                    width="2"
                    indeterminate
                    color="grey"
                  />
                  <v-icon
                    v-else-if="usernameAvailable === true"
                    color="success"
                    icon="mdi-check-circle"
                  />
                  <v-icon
                    v-else-if="usernameAvailable === false"
                    color="error"
                    icon="mdi-close-circle"
                  />
                </template>
              </v-text-field>

              <v-text-field
                v-model="displayName"
                label="Display Name"
                required
                prepend-icon="mdi-card-account-details"
                :disabled="loading"
                hint="How your name appears to others (required)"
                persistent-hint
                class="mb-2"
                :rules="[v => !!v || 'Display name is required']"
              />

              <v-text-field
                v-model="email"
                label="Email (optional)"
                type="email"
                prepend-icon="mdi-email"
                :disabled="loading"
                hint="For password recovery and notifications"
                persistent-hint
                class="mb-4"
              />

              <v-btn
                type="submit"
                color="primary"
                block
                :loading="loading"
                :disabled="checkingUsername || usernameAvailable === false || !username.trim()"
              >
                Complete Registration
              </v-btn>
            </v-form>

            <v-btn
              variant="text"
              color="grey"
              block
              class="mt-2"
              :disabled="loading"
              @click="cancelDiscordRegistration"
            >
              Cancel
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Standard Registration -->
        <v-card v-else>
          <v-card-title class="text-h5">Register</v-card-title>
          <v-card-text>
            <v-alert
              v-if="errorMessage"
              type="error"
              class="mb-4"
              closable
              @click:close="errorMessage = ''"
            >
              {{ errorMessage }}
            </v-alert>
            <v-alert
              v-if="successMessage"
              type="success"
              class="mb-4"
              closable
              @click:close="successMessage = ''"
            >
              {{ successMessage }}
            </v-alert>

            <!-- Discord Registration Button -->
            <v-btn
              color="indigo"
              variant="outlined"
              block
              class="mb-4"
              :loading="discordLoading"
              :disabled="loading"
              @click="handleDiscordSignup"
            >
              <template #prepend>
                <DiscordIcon :size="20" />
              </template>
              Register with Discord
            </v-btn>

            <v-divider class="mb-4">
              <span class="text-caption text-medium-emphasis px-2">or</span>
            </v-divider>

            <v-form @submit.prevent="handleRegister">
              <v-text-field
                v-model="profileName"
                label="Profile Name"
                required
                prepend-icon="mdi-account"
                :disabled="loading || discordLoading"
              />
              <v-text-field
                v-model="password"
                label="Password"
                type="password"
                required
                prepend-icon="mdi-lock"
                :disabled="loading || discordLoading"
              />
              <v-text-field
                v-model="confirmPassword"
                label="Confirm Password"
                type="password"
                required
                prepend-icon="mdi-lock-check"
                :disabled="loading || discordLoading"
              />
              <v-btn
                type="submit"
                color="primary"
                block
                class="mt-4"
                :loading="loading"
                :disabled="discordLoading"
              >
                Register
              </v-btn>
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text to="/login" :disabled="loading || discordLoading">
              Already have an account? Login
            </v-btn>
          </v-card-actions>
        </v-card>
        <div class="text-center mt-4 text-caption text-medium-emphasis">
          <router-link to="/terms" class="text-decoration-none">Terms of Service</router-link>
          <span class="mx-2">|</span>
          <router-link to="/privacy" class="text-decoration-none">Privacy Policy</router-link>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../services/api'
import { useUserStore } from '../stores/user'
import DiscordIcon from '../components/DiscordIcon.vue'
import KawaLogo from '../components/KawaLogo.vue'
import type { DiscordProfileForRegistration, DiscordAuthUser } from '@kawakawa/types'
import type { User } from '../types'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// Standard registration state
const profileName = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const discordLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Discord registration state
const isDiscordRegistration = ref(false)
const discordProfile = ref<DiscordProfileForRegistration | null>(null)
const discordRegisterState = ref('')
const displayName = ref('')
const email = ref('')
const username = ref('') // Editable profile name for Discord registration
const usernameAvailable = ref<boolean | null>(null)
const usernameMessage = ref('')
const checkingUsername = ref(false)
let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null

// Convert Discord auth user to full User type
// Note: Settings (preferredCurrency, FIO credentials, etc.) are now managed via user-settings API
const discordAuthUserToUser = (authUser: DiscordAuthUser): User => ({
  profileName: authUser.username,
  displayName: authUser.displayName,
  roles: authUser.roles,
  permissions: authUser.permissions,
})

// Computed Discord avatar URL
const discordAvatarUrl = computed(() => {
  if (!discordProfile.value?.discordAvatar) return null
  return `https://cdn.discordapp.com/avatars/${discordProfile.value.discordId}/${discordProfile.value.discordAvatar}.png?size=128`
})

// Debounced username availability check
const checkUsernameAvailability = async (usernameToCheck: string) => {
  if (usernameCheckTimeout) {
    clearTimeout(usernameCheckTimeout)
  }

  if (!usernameToCheck.trim()) {
    usernameAvailable.value = null
    usernameMessage.value = ''
    return
  }

  usernameCheckTimeout = setTimeout(async () => {
    checkingUsername.value = true
    try {
      const result = await api.auth.checkUsernameAvailability(usernameToCheck.trim())
      usernameAvailable.value = result.available
      usernameMessage.value = result.message || ''
    } catch {
      usernameAvailable.value = null
      usernameMessage.value = 'Unable to check username availability'
    } finally {
      checkingUsername.value = false
    }
  }, 300)
}

// Watch username changes for validation
watch(username, newUsername => {
  checkUsernameAvailability(newUsername)
})

// Check for Discord registration data on mount
onMounted(() => {
  if (route.query.discord === 'true') {
    const state = sessionStorage.getItem('discord_register_state')
    const profileData = sessionStorage.getItem('discord_register_profile')

    if (state && profileData) {
      try {
        discordProfile.value = JSON.parse(profileData)
        discordRegisterState.value = state
        isDiscordRegistration.value = true
        // Pre-fill display name and username with Discord username
        const discordUsername = discordProfile.value?.discordUsername || ''
        displayName.value = discordUsername
        username.value = discordUsername
      } catch (e) {
        console.error('Failed to parse Discord profile:', e)
        errorMessage.value = 'Invalid Discord registration data. Please try again.'
        clearDiscordSession()
      }
    } else {
      errorMessage.value = 'Discord registration session expired. Please try again.'
      router.replace({ query: {} })
    }
  }
})

const handleRegister = async () => {
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }

  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await api.auth.register({
      profileName: profileName.value,
      password: password.value,
    })

    if (response.ok) {
      successMessage.value = 'Registration successful! Redirecting to login...'
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } else if (response.status === 409) {
      // Profile name already exists
      errorMessage.value = 'Profile name already taken. Please choose a different one.'
    } else if (response.status === 400) {
      const data = await response.json()
      // Check if it's a duplicate username error
      if (
        data.message &&
        (data.message.includes('already exists') || data.message.includes('already taken'))
      ) {
        errorMessage.value = 'Profile name already taken. Please choose a different one.'
      } else {
        errorMessage.value = data.message || 'Invalid registration data. Please check your input.'
      }
    } else if (response.status === 500) {
      // Backend returns 500 for validation errors, check message
      const data = await response.json()
      if (
        data.message &&
        (data.message.includes('already exists') || data.message.includes('already taken'))
      ) {
        errorMessage.value = 'Profile name already taken. Please choose a different one.'
      } else if (data.message) {
        errorMessage.value = data.message
      } else {
        errorMessage.value = 'An error occurred during registration. Please try again later.'
      }
    } else {
      errorMessage.value = 'An error occurred during registration. Please try again later.'
    }
  } catch (error) {
    console.error('Registration error:', error)
    errorMessage.value = 'Unable to connect to server. Please try again later.'
  } finally {
    loading.value = false
  }
}

const handleDiscordSignup = async () => {
  try {
    discordLoading.value = true
    errorMessage.value = ''

    const { url, state } = await api.discordAuth.getAuthUrl()

    // Store state for validation when callback returns
    sessionStorage.setItem('discord_auth_state', state)
    // Store that we're registering (not logging in)
    sessionStorage.setItem('discord_auth_redirect', '/register')

    // Redirect to Discord OAuth
    window.location.href = url
  } catch (error) {
    console.error('Discord signup error:', error)
    errorMessage.value =
      error instanceof Error ? error.message : 'Failed to initiate Discord registration'
    discordLoading.value = false
  }
}

const handleDiscordRegister = async () => {
  if (!username.value.trim()) {
    errorMessage.value = 'Profile name is required'
    return
  }

  if (!displayName.value.trim()) {
    errorMessage.value = 'Display name is required'
    return
  }

  if (usernameAvailable.value === false) {
    errorMessage.value = usernameMessage.value || 'Username is not available'
    return
  }

  try {
    loading.value = true
    errorMessage.value = ''

    const result = await api.discordAuth.completeRegistration({
      state: discordRegisterState.value,
      username: username.value.trim(),
      displayName: displayName.value.trim(),
      email: email.value || undefined,
    })

    // Store token and user data
    localStorage.setItem('jwt', result.token)
    userStore.setUser(discordAuthUserToUser(result.user))

    // Clear Discord registration session
    clearDiscordSession()

    // Redirect to market (or account page for profile completion)
    router.push('/market')
  } catch (error) {
    console.error('Discord registration error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to complete registration'
  } finally {
    loading.value = false
  }
}

const cancelDiscordRegistration = () => {
  clearDiscordSession()
  isDiscordRegistration.value = false
  discordProfile.value = null
  router.replace({ query: {} })
}

const clearDiscordSession = () => {
  sessionStorage.removeItem('discord_register_state')
  sessionStorage.removeItem('discord_register_profile')
}
</script>
