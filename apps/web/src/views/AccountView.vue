<template>
  <v-container>
    <h1 class="text-h4 mb-4">Account Management</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-tabs v-model="activeTab" color="primary" class="mb-4">
      <v-tab value="profile">
        <v-icon start>mdi-account</v-icon>
        Profile
      </v-tab>
      <v-tab value="security">
        <v-icon start>mdi-shield-lock</v-icon>
        Security
      </v-tab>
      <v-tab value="fio">
        <v-icon start>mdi-cloud-sync</v-icon>
        FIO Integration
      </v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <!-- Profile Tab -->
      <v-tabs-window-item value="profile">
        <v-card :loading="loading">
          <v-card-text>
            <v-row>
              <!-- Profile Picture Placeholder -->
              <v-col cols="12" md="4" class="d-flex flex-column align-center justify-center">
                <v-avatar size="150" color="grey-darken-3" class="mb-4">
                  <v-icon size="80">mdi-account</v-icon>
                </v-avatar>
                <div class="text-body-2 text-medium-emphasis">Profile picture coming soon</div>

                <!-- Role Chips -->
                <div class="mt-4 text-center">
                  <div class="text-subtitle-2 mb-2">Roles</div>
                  <v-chip
                    v-for="role in account.roles"
                    :key="role.id"
                    :color="role.color"
                    class="ma-1"
                    size="small"
                  >
                    {{ role.name }}
                  </v-chip>
                  <v-chip v-if="account.roles.length === 0" color="grey" size="small">
                    No roles assigned
                  </v-chip>
                </div>
              </v-col>

              <!-- Profile Fields -->
              <v-col cols="12" md="8">
                <v-form>
                  <div class="text-subtitle-1 font-weight-bold mb-3">Account Information</div>

                  <v-text-field
                    v-model="account.profileName"
                    label="Profile Name"
                    prepend-icon="mdi-account"
                    readonly
                    hint="Your unique username (cannot be changed)"
                    persistent-hint
                    class="mb-2"
                  />

                  <v-text-field
                    v-model="account.displayName"
                    label="Display Name"
                    prepend-icon="mdi-card-account-details"
                    hint="How your name appears to others"
                    class="mb-4"
                  />

                  <v-divider class="my-4" />

                  <div class="text-subtitle-1 font-weight-bold mb-3">Preferences</div>

                  <v-select
                    v-model="account.preferredCurrency"
                    :items="currencies"
                    label="Preferred Currency"
                    prepend-icon="mdi-currency-usd"
                    hint="Default currency for your transactions"
                    class="mb-2"
                  />

                  <v-select
                    v-model="account.locationDisplayMode"
                    :items="locationDisplayModes"
                    label="Location Display Mode"
                    prepend-icon="mdi-map-marker"
                    hint="How to display location names in dropdowns and tables"
                    class="mb-2"
                  />

                  <v-select
                    v-model="account.commodityDisplayMode"
                    :items="commodityDisplayModes"
                    label="Commodity Display Mode"
                    prepend-icon="mdi-package-variant"
                    hint="How to display commodity names in dropdowns and tables"
                  />
                </v-form>
              </v-col>
            </v-row>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="primary"
              :loading="savingProfile"
              :disabled="savingProfile || loading"
              @click="saveProfile"
            >
              Save Changes
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-tabs-window-item>

      <!-- Security Tab -->
      <v-tabs-window-item value="security">
        <v-card :loading="loading" max-width="500">
          <v-card-title>
            <v-icon start>mdi-lock</v-icon>
            Change Password
          </v-card-title>
          <v-card-text>
            <v-form>
              <v-text-field
                v-model="passwordForm.current"
                label="Current Password"
                type="password"
                prepend-icon="mdi-lock"
                class="mb-2"
              />
              <v-text-field
                v-model="passwordForm.new"
                label="New Password"
                type="password"
                prepend-icon="mdi-lock-outline"
                hint="Minimum 8 characters"
                class="mb-2"
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
              :loading="changingPassword"
              :disabled="changingPassword || loading"
              @click="changePassword"
            >
              Update Password
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-tabs-window-item>

      <!-- FIO Integration Tab -->
      <v-tabs-window-item value="fio">
        <v-row>
          <!-- FIO Settings Card -->
          <v-col cols="12" md="6">
            <v-card :loading="loading">
              <v-card-title>
                <v-icon start>mdi-cog</v-icon>
                FIO Settings
              </v-card-title>
              <v-card-text>
                <v-form>
                  <v-text-field
                    v-model="account.fioUsername"
                    label="FIO Username"
                    prepend-icon="mdi-game-controller"
                    hint="Your Prosperous Universe username"
                    class="mb-2"
                  />
                  <v-text-field
                    v-model="fioApiKey"
                    :label="account.hasFioApiKey ? 'FIO API Key (configured)' : 'FIO API Key'"
                    :placeholder="
                      account.hasFioApiKey ? '••••••••••••••••' : 'Enter your FIO API key'
                    "
                    prepend-icon="mdi-key"
                    :append-inner-icon="showFioApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                    :type="showFioApiKey ? 'text' : 'password'"
                    hint="Get your API key from https://fio.fnar.net/settings"
                    persistent-hint
                    class="mb-4"
                    @click:append-inner="showFioApiKey = !showFioApiKey"
                  />

                  <v-divider class="my-4" />

                  <div class="text-subtitle-2 mb-3">Sync Preferences</div>

                  <v-switch
                    v-model="account.fioAutoSync"
                    label="Auto Sync"
                    color="primary"
                    hide-details
                    class="mb-2"
                  >
                    <template #prepend>
                      <v-icon>mdi-sync-circle</v-icon>
                    </template>
                  </v-switch>
                  <div class="text-caption text-medium-emphasis mb-4 ml-10">
                    Automatically sync your inventory every 3 hours
                  </div>

                  <v-text-field
                    v-model="excludedLocationsText"
                    label="Excluded Locations"
                    prepend-icon="mdi-map-marker-off"
                    hint="Comma-separated list of location IDs or names to exclude (e.g., UV-351a, Katoa)"
                    persistent-hint
                  />
                </v-form>
              </v-card-text>
              <v-card-actions>
                <v-spacer />
                <v-btn
                  color="primary"
                  :loading="savingProfile"
                  :disabled="savingProfile || loading"
                  @click="saveFioSettings"
                >
                  Save FIO Settings
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>

          <!-- FIO Actions Card -->
          <v-col cols="12" md="6">
            <v-card :loading="loadingFio">
              <v-card-title>
                <v-icon start>mdi-sync</v-icon>
                Sync Actions
              </v-card-title>
              <v-card-text>
                <p class="text-body-2 mb-4">
                  Sync your inventory data from FIO or clear all synced data.
                </p>
                <v-row>
                  <v-col cols="6">
                    <v-btn
                      color="primary"
                      block
                      :loading="syncing"
                      :disabled="syncing || clearing || !account.hasFioApiKey"
                      @click="syncFio"
                    >
                      <v-icon start>mdi-cloud-download</v-icon>
                      Sync Now
                    </v-btn>
                  </v-col>
                  <v-col cols="6">
                    <v-btn
                      color="error"
                      variant="outlined"
                      block
                      :loading="clearing"
                      :disabled="syncing || clearing || fioStats.totalItems === 0"
                      @click="confirmClearFio"
                    >
                      <v-icon start>mdi-delete</v-icon>
                      Clear Data
                    </v-btn>
                  </v-col>
                </v-row>

                <v-alert
                  v-if="!account.hasFioApiKey"
                  type="info"
                  variant="tonal"
                  class="mt-4"
                  density="compact"
                >
                  Configure your FIO API key to enable syncing.
                </v-alert>

                <v-alert
                  v-if="syncResult"
                  :type="syncResult.success ? 'success' : 'error'"
                  variant="tonal"
                  class="mt-4"
                  closable
                  @click:close="syncResult = null"
                >
                  <template v-if="syncResult.success">
                    Synced {{ syncResult.inserted }} items from
                    {{ syncResult.storageLocations }} storage locations.
                  </template>
                  <template v-else> Sync failed: {{ syncResult.errors.join(', ') }} </template>
                </v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- FIO Stats Card -->
          <v-col cols="12">
            <v-card :loading="loadingFio">
              <v-card-title>
                <v-icon start>mdi-chart-box</v-icon>
                FIO Statistics
              </v-card-title>
              <v-card-text>
                <v-row>
                  <v-col cols="6" sm="4" md="2">
                    <div class="text-center">
                      <div class="text-h4 font-weight-bold">{{ fioStats.totalItems }}</div>
                      <div class="text-caption text-medium-emphasis">Total Items</div>
                    </div>
                  </v-col>
                  <v-col cols="6" sm="4" md="2">
                    <div class="text-center">
                      <div class="text-h4 font-weight-bold">
                        {{ formatNumber(fioStats.totalQuantity) }}
                      </div>
                      <div class="text-caption text-medium-emphasis">Total Quantity</div>
                    </div>
                  </v-col>
                  <v-col cols="6" sm="4" md="2">
                    <div class="text-center">
                      <div class="text-h4 font-weight-bold">{{ fioStats.uniqueCommodities }}</div>
                      <div class="text-caption text-medium-emphasis">Unique Commodities</div>
                    </div>
                  </v-col>
                  <v-col cols="6" sm="4" md="2">
                    <div class="text-center">
                      <div class="text-h4 font-weight-bold">{{ fioStats.storageLocations }}</div>
                      <div class="text-caption text-medium-emphasis">Storage Locations</div>
                    </div>
                  </v-col>
                  <v-col cols="6" sm="4" md="4">
                    <div class="text-center">
                      <div class="text-body-1 font-weight-bold">
                        {{ formatDateTime(fioStats.newestSyncTime) }}
                      </div>
                      <div class="text-caption text-medium-emphasis">Last Synced</div>
                    </div>
                  </v-col>
                </v-row>

                <v-divider class="my-4" />

                <v-row>
                  <v-col cols="12" sm="6">
                    <div class="d-flex align-center">
                      <v-icon
                        class="mr-2"
                        :color="getDataAgeInfo(fioStats.oldestFioUploadTime).color"
                      >
                        {{ getDataAgeInfo(fioStats.oldestFioUploadTime).icon }}
                      </v-icon>
                      <div>
                        <div class="text-body-2">Oldest FIO Data</div>
                        <div class="text-caption text-medium-emphasis">
                          {{ formatDateTime(fioStats.oldestFioUploadTime) }}
                        </div>
                        <div v-if="fioStats.oldestFioUploadLocation" class="text-caption">
                          <v-chip size="x-small" class="mr-1">{{
                            fioStats.oldestFioUploadLocation.storageType
                          }}</v-chip>
                          <span class="text-medium-emphasis">{{
                            fioStats.oldestFioUploadLocation.locationNaturalId || 'Unknown'
                          }}</span>
                        </div>
                      </div>
                    </div>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <div class="d-flex align-center">
                      <v-icon
                        class="mr-2"
                        :color="getDataAgeInfo(fioStats.newestFioUploadTime).color"
                      >
                        {{ getDataAgeInfo(fioStats.newestFioUploadTime).icon }}
                      </v-icon>
                      <div>
                        <div class="text-body-2">Newest FIO Data</div>
                        <div class="text-caption text-medium-emphasis">
                          {{ formatDateTime(fioStats.newestFioUploadTime) }}
                        </div>
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Clear Confirmation Dialog -->
    <v-dialog v-model="clearDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">
          <v-icon start color="error">mdi-alert</v-icon>
          Clear FIO Data?
        </v-card-title>
        <v-card-text>
          This will permanently delete all your synced FIO inventory data. This action cannot be
          undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="clearDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="clearing" @click="clearFio">
            Clear All Data
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
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

const activeTab = ref('profile')

const account = ref<{
  profileName: string
  displayName: string
  fioUsername: string
  hasFioApiKey: boolean
  preferredCurrency: Currency
  locationDisplayMode: LocationDisplayMode
  commodityDisplayMode: CommodityDisplayMode
  fioAutoSync: boolean
  fioExcludedLocations: string[]
  roles: Role[]
}>({
  profileName: '',
  displayName: '',
  fioUsername: '',
  hasFioApiKey: false,
  preferredCurrency: 'CIS',
  locationDisplayMode: 'both',
  commodityDisplayMode: 'both',
  fioAutoSync: true,
  fioExcludedLocations: [],
  roles: [],
})

// FIO-specific state
const fioApiKey = ref('')
const showFioApiKey = ref(false)
const excludedLocationsText = ref('') // Comma-separated string for UI
const fioStats = ref({
  totalItems: 0,
  totalQuantity: 0,
  uniqueCommodities: 0,
  storageLocations: 0,
  newestSyncTime: null as string | null,
  oldestFioUploadTime: null as string | null,
  oldestFioUploadLocation: null as { storageType: string; locationNaturalId: string | null } | null,
  newestFioUploadTime: null as string | null,
})
const syncResult = ref<{
  success: boolean
  inserted: number
  storageLocations: number
  errors: string[]
} | null>(null)
const loadingFio = ref(false)
const syncing = ref(false)
const clearing = ref(false)
const clearDialog = ref(false)

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

const formatNumber = (num: number): string => {
  return num.toLocaleString()
}

const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  return date.toLocaleString()
}

const getDataAgeInfo = (dateStr: string | null): { color: string; icon: string } => {
  if (!dateStr) return { color: 'grey', icon: 'mdi-clock-outline' }

  const date = new Date(dateStr)
  const now = new Date()
  const hoursAgo = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

  if (hoursAgo < 24) {
    return { color: 'success', icon: 'mdi-clock-check' }
  } else if (hoursAgo < 48) {
    return { color: 'warning', icon: 'mdi-clock-alert-outline' }
  } else {
    return { color: 'error', icon: 'mdi-clock-remove-outline' }
  }
}

const loadFioStats = async () => {
  try {
    loadingFio.value = true
    const stats = await api.fioInventory.getStats()
    fioStats.value = stats
  } catch (error) {
    console.error('Failed to load FIO stats', error)
  } finally {
    loadingFio.value = false
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
      fioAutoSync: profile.fioAutoSync ?? true,
      fioExcludedLocations: profile.fioExcludedLocations || [],
    }
    // Initialize excluded locations text from array
    excludedLocationsText.value = (profile.fioExcludedLocations || []).join(', ')
    userStore.setUser(profile)

    // Load FIO stats
    await loadFioStats()
  } catch (error) {
    console.error('Failed to load profile', error)
    // Fallback to localStorage
    const cachedUser = userStore.getUser()
    if (cachedUser) {
      account.value = {
        ...cachedUser,
        locationDisplayMode: cachedUser.locationDisplayMode || 'both',
        commodityDisplayMode: cachedUser.commodityDisplayMode || 'both',
        fioAutoSync: cachedUser.fioAutoSync ?? true,
        fioExcludedLocations: cachedUser.fioExcludedLocations || [],
      }
      excludedLocationsText.value = (cachedUser.fioExcludedLocations || []).join(', ')
    }
    showSnackbar('Failed to load profile from server', 'error')
  } finally {
    loading.value = false
  }
})

const saveProfile = async () => {
  try {
    savingProfile.value = true
    const updateData = {
      displayName: account.value.displayName,
      preferredCurrency: account.value.preferredCurrency,
      locationDisplayMode: account.value.locationDisplayMode,
      commodityDisplayMode: account.value.commodityDisplayMode,
    }

    const updated = await api.account.updateProfile(updateData)
    userStore.setUser(updated)
    showSnackbar('Profile updated successfully')
  } catch (error) {
    console.error('Failed to update profile', error)
    showSnackbar('Failed to update profile', 'error')
  } finally {
    savingProfile.value = false
  }
}

const saveFioSettings = async () => {
  try {
    savingProfile.value = true

    // Parse excluded locations from comma-separated text
    const excludedLocations = excludedLocationsText.value
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    const updateData: {
      fioUsername: string
      fioApiKey?: string
      fioAutoSync: boolean
      fioExcludedLocations: string[]
    } = {
      fioUsername: account.value.fioUsername || '',
      fioAutoSync: account.value.fioAutoSync,
      fioExcludedLocations: excludedLocations,
    }

    // Only include fioApiKey if user entered a new one
    if (fioApiKey.value) {
      updateData.fioApiKey = fioApiKey.value
    }

    const updated = await api.account.updateProfile(updateData)
    account.value.hasFioApiKey = updated.hasFioApiKey
    account.value.fioAutoSync = updated.fioAutoSync
    account.value.fioExcludedLocations = updated.fioExcludedLocations
    userStore.setUser(updated)

    // Clear the API key field after successful save
    fioApiKey.value = ''
    showFioApiKey.value = false

    showSnackbar('FIO settings updated successfully')
  } catch (error) {
    console.error('Failed to update FIO settings', error)
    showSnackbar('Failed to update FIO settings', 'error')
  } finally {
    savingProfile.value = false
  }
}

const syncFio = async () => {
  try {
    syncing.value = true
    syncResult.value = null
    const result = await api.fioInventory.sync()
    syncResult.value = result

    // Refresh stats after sync
    await loadFioStats()

    if (result.success) {
      showSnackbar(`Synced ${result.inserted} items successfully`)
    }
  } catch (error) {
    console.error('Failed to sync FIO', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync FIO'
    showSnackbar(errorMessage, 'error')
  } finally {
    syncing.value = false
  }
}

const confirmClearFio = () => {
  clearDialog.value = true
}

const clearFio = async () => {
  try {
    clearing.value = true
    const result = await api.fioInventory.clear()
    clearDialog.value = false

    // Refresh stats after clearing
    await loadFioStats()
    syncResult.value = null

    showSnackbar(
      `Cleared ${result.deletedItems} items from ${result.deletedStorages} storage locations`
    )
  } catch (error) {
    console.error('Failed to clear FIO data', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to clear FIO data'
    showSnackbar(errorMessage, 'error')
  } finally {
    clearing.value = false
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
