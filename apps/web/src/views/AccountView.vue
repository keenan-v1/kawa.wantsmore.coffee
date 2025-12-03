<template>
  <v-container>
    <h1 class="text-h4 mb-4">Account Management</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-row>
      <v-col cols="12" md="6">
        <v-card :loading="loading">
          <v-card-title>Profile Information</v-card-title>
          <v-card-text>
            <v-form>
              <v-text-field
                v-model="account.profileName"
                label="Profile Name"
                prepend-icon="mdi-account"
                readonly
              />
              <v-text-field
                v-model="account.displayName"
                label="Display Name"
                prepend-icon="mdi-card-account-details"
              />
              <v-text-field
                v-model="account.fioUsername"
                label="FIO Username"
                prepend-icon="mdi-game-controller"
                hint="Your Prosperous Universe username"
              />
              <v-text-field
                v-model="fioApiKey"
                :label="account.hasFioApiKey ? 'FIO API Key (configured)' : 'FIO API Key'"
                :placeholder="account.hasFioApiKey ? '••••••••••••••••' : 'Enter your FIO API key'"
                prepend-icon="mdi-key"
                :append-inner-icon="showFioApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                :type="showFioApiKey ? 'text' : 'password'"
                @click:append-inner="showFioApiKey = !showFioApiKey"
                hint="Get your API key from https://fio.fnar.net/settings"
                persistent-hint
              />
              <v-select
                v-model="account.preferredCurrency"
                :items="currencies"
                label="Preferred Currency"
                prepend-icon="mdi-currency-usd"
                hint="Default currency for your transactions"
              />
              <v-select
                v-model="account.locationDisplayMode"
                :items="locationDisplayModes"
                label="Location Display Mode"
                prepend-icon="mdi-map-marker"
                hint="How to display location names in dropdowns and tables"
              />
              <v-select
                v-model="account.commodityDisplayMode"
                :items="commodityDisplayModes"
                label="Commodity Display Mode"
                prepend-icon="mdi-package-variant"
                hint="How to display commodity names in dropdowns and tables"
              />
              <v-text-field
                :model-value="roleNames"
                label="Roles"
                prepend-icon="mdi-account-group"
                readonly
                hint="Your assigned roles (managed by administrators)"
              />
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="primary"
              @click="saveProfile"
              :loading="savingProfile"
              :disabled="savingProfile || loading"
            >
              Save Changes
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card :loading="loading">
          <v-card-title>Change Password</v-card-title>
          <v-card-text>
            <v-form>
              <v-text-field
                v-model="passwordForm.current"
                label="Current Password"
                type="password"
                prepend-icon="mdi-lock"
              />
              <v-text-field
                v-model="passwordForm.new"
                label="New Password"
                type="password"
                prepend-icon="mdi-lock-outline"
              />
              <v-text-field
                v-model="passwordForm.confirm"
                label="Confirm New Password"
                type="password"
                prepend-icon="mdi-lock-check"
              />
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="primary"
              @click="changePassword"
              :loading="changingPassword"
              :disabled="changingPassword || loading"
            >
              Update Password
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { roleService } from '../services/roleService'
import { CURRENCIES } from '../types'
import type { Currency, LocationDisplayMode, CommodityDisplayMode, Role } from '../types'
import { api } from '../services/api'

const userStore = useUserStore()
const currencies = CURRENCIES
const locationDisplayModes: { title: string; value: LocationDisplayMode }[] = [
  { title: 'Names Only (e.g., Benton Station, Katoa)', value: 'names-only' },
  { title: 'Natural IDs Only (e.g., BEN, UV-351a)', value: 'natural-ids-only' },
  { title: 'Both (e.g., Benton Station (BEN), Katoa (UV-351a))', value: 'both' },
]
const commodityDisplayModes: { title: string; value: CommodityDisplayMode }[] = [
  { title: 'Ticker Only (e.g., RAT)', value: 'ticker-only' },
  { title: 'Name Only (e.g., Basic Rations)', value: 'name-only' },
  { title: 'Both (e.g., RAT - Basic Rations)', value: 'both' },
]

const account = ref<{
  profileName: string
  displayName: string
  fioUsername: string
  hasFioApiKey: boolean
  preferredCurrency: Currency
  locationDisplayMode: LocationDisplayMode
  commodityDisplayMode: CommodityDisplayMode
  roles: Role[]
}>({
  profileName: '',
  displayName: '',
  fioUsername: '',
  hasFioApiKey: false,
  preferredCurrency: 'CIS',
  locationDisplayMode: 'both',
  commodityDisplayMode: 'both',
  roles: [],
})

// Separate ref for FIO API key (write-only, never pre-populated)
const fioApiKey = ref('')
const showFioApiKey = ref(false)

const roleNames = computed(() => {
  return roleService.getRoleNames(account.value.roles)
})

const passwordForm = ref({
  current: '',
  new: '',
  confirm: '',
})

const loading = ref(false)
const savingProfile = ref(false)
const changingPassword = ref(false)
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = {
    show: true,
    message,
    color,
  }
}

onMounted(async () => {
  try {
    loading.value = true
    const profile = await api.account.getProfile()
    account.value = {
      ...profile,
      locationDisplayMode: profile.locationDisplayMode || 'both',
      commodityDisplayMode: profile.commodityDisplayMode || 'both',
    }
    userStore.setUser(profile)
  } catch (error) {
    console.error('Failed to load profile', error)
    // Fallback to localStorage
    const cachedUser = userStore.getUser()
    if (cachedUser) {
      account.value = {
        ...cachedUser,
        locationDisplayMode: cachedUser.locationDisplayMode || 'both',
        commodityDisplayMode: cachedUser.commodityDisplayMode || 'both',
      }
    }
    showSnackbar('Failed to load profile from server', 'error')
  } finally {
    loading.value = false
  }
})

const saveProfile = async () => {
  try {
    savingProfile.value = true
    const updateData: {
      displayName: string
      fioUsername: string
      fioApiKey?: string
      preferredCurrency: Currency
      locationDisplayMode: LocationDisplayMode
      commodityDisplayMode: CommodityDisplayMode
    } = {
      displayName: account.value.displayName,
      fioUsername: account.value.fioUsername || '',
      preferredCurrency: account.value.preferredCurrency,
      locationDisplayMode: account.value.locationDisplayMode,
      commodityDisplayMode: account.value.commodityDisplayMode,
    }

    // Only include fioApiKey if user entered a new one
    if (fioApiKey.value) {
      updateData.fioApiKey = fioApiKey.value
    }

    const updated = await api.account.updateProfile(updateData)

    account.value.hasFioApiKey = updated.hasFioApiKey
    userStore.setUser(updated)

    // Clear the API key field after successful save
    fioApiKey.value = ''
    showFioApiKey.value = false

    showSnackbar('Profile updated successfully')
  } catch (error) {
    console.error('Failed to update profile', error)
    showSnackbar('Failed to update profile', 'error')
  } finally {
    savingProfile.value = false
  }
}

const changePassword = async () => {
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showSnackbar('New passwords do not match', 'error')
    return
  }

  if (passwordForm.value.new.length < 8) {
    showSnackbar('Password must be at least 8 characters', 'error')
    return
  }

  try {
    changingPassword.value = true
    await api.account.changePassword({
      currentPassword: passwordForm.value.current,
      newPassword: passwordForm.value.new,
    })

    showSnackbar('Password updated successfully')
    passwordForm.value = { current: '', new: '', confirm: '' }
  } catch (error) {
    console.error('Failed to change password', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to change password'
    showSnackbar(errorMessage, 'error')
  } finally {
    changingPassword.value = false
  }
}
</script>
