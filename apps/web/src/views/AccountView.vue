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
      <v-tab value="discord">
        <DiscordIcon :size="20" class="mr-2" />
        Discord
      </v-tab>
      <v-spacer />
      <v-tab value="danger" color="error">
        <v-icon start color="error">mdi-alert-circle</v-icon>
        <span class="text-error">Danger Zone</span>
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
              variant="flat"
              size="large"
              prepend-icon="mdi-content-save"
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
              variant="flat"
              size="large"
              prepend-icon="mdi-lock-reset"
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
                  variant="flat"
                  size="large"
                  prepend-icon="mdi-content-save"
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

      <!-- Discord Tab -->
      <v-tabs-window-item value="discord">
        <v-row>
          <v-col cols="12" md="6">
            <v-card :loading="loadingDiscord">
              <v-card-title class="d-flex align-center">
                <DiscordIcon :size="24" class="mr-2 text-indigo" />
                Discord Connection
              </v-card-title>
              <v-card-text>
                <!-- Not Connected State -->
                <template v-if="!discordStatus?.connected">
                  <v-alert type="info" variant="tonal" class="mb-4">
                    Connect your Discord account to enable features like auto-approval and server
                    integration.
                  </v-alert>

                  <v-btn color="indigo" :loading="connectingDiscord" @click="connectDiscord">
                    <template #prepend>
                      <DiscordIcon :size="20" />
                    </template>
                    Connect Discord
                  </v-btn>
                </template>

                <!-- Connected State -->
                <template v-else>
                  <div class="d-flex align-center mb-4">
                    <v-avatar size="64" class="mr-4">
                      <v-img
                        v-if="discordAvatarUrl"
                        :src="discordAvatarUrl"
                        :alt="discordStatus.profile?.discordUsername"
                      />
                      <DiscordIcon v-else :size="48" />
                    </v-avatar>
                    <div>
                      <div class="text-h6">{{ discordStatus.profile?.discordUsername }}</div>
                      <div class="text-caption text-medium-emphasis">
                        Connected {{ formatRelativeTime(discordStatus.profile?.connectedAt) }}
                      </div>
                    </div>
                  </div>

                  <!-- Guild Membership Status -->
                  <v-alert
                    v-if="discordStatus.isMemberOfGuild !== null"
                    :type="discordStatus.isMemberOfGuild ? 'success' : 'warning'"
                    variant="tonal"
                    class="mb-4"
                    density="compact"
                  >
                    <template v-if="discordStatus.isMemberOfGuild">
                      You are a member of the Kawakawa Discord server
                    </template>
                    <template v-else>
                      You are not a member of the Kawakawa Discord server. Join the server to enable
                      auto-approval features.
                    </template>
                  </v-alert>

                  <v-divider class="my-4" />

                  <v-btn
                    color="error"
                    variant="outlined"
                    :loading="disconnectingDiscord"
                    @click="confirmDisconnectDiscord"
                  >
                    <v-icon start>mdi-link-off</v-icon>
                    Disconnect Discord
                  </v-btn>
                </template>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6">
            <v-card>
              <v-card-title>
                <v-icon start>mdi-information</v-icon>
                About Discord Integration
              </v-card-title>
              <v-card-text>
                <v-list density="compact">
                  <v-list-item prepend-icon="mdi-account-check">
                    <v-list-item-title>Auto-Approval</v-list-item-title>
                    <v-list-item-subtitle>
                      Members of the Kawakawa Discord server with certain roles may be automatically
                      approved
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-shield-account">
                    <v-list-item-title>Role Sync</v-list-item-title>
                    <v-list-item-subtitle>
                      Your Discord roles can determine your access level in the app
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-bell">
                    <v-list-item-title>Notifications (Coming Soon)</v-list-item-title>
                    <v-list-item-subtitle>
                      Receive Discord notifications for orders and updates
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- Danger Zone Tab -->
      <v-tabs-window-item value="danger">
        <v-card variant="outlined" color="error">
          <v-card-title class="text-error">
            <v-icon start color="error">mdi-alert-circle</v-icon>
            Danger Zone
          </v-card-title>
          <v-card-text>
            <v-alert type="warning" variant="tonal" class="mb-6">
              <strong>Warning:</strong> Actions in this section are permanent and cannot be undone.
              Please proceed with caution.
            </v-alert>

            <v-card variant="outlined" class="mb-4">
              <v-card-title class="text-subtitle-1">
                <v-icon start>mdi-account-remove</v-icon>
                Delete Account
              </v-card-title>
              <v-card-text>
                <p class="mb-4">
                  Once you delete your account, there is no going back. This will permanently
                  delete:
                </p>
                <v-list density="compact" class="mb-4">
                  <v-list-item prepend-icon="mdi-account">
                    <v-list-item-title>Your account and profile information</v-list-item-title>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-connection">
                    <v-list-item-title>Any external connections, such as Discord</v-list-item-title>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-cart">
                    <v-list-item-title>All your sell and buy orders</v-list-item-title>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-package-variant">
                    <v-list-item-title>Your FIO inventory data</v-list-item-title>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-database">
                    <v-list-item-title>All other associated data</v-list-item-title>
                  </v-list-item>
                </v-list>
                <v-btn
                  color="error"
                  variant="flat"
                  size="large"
                  prepend-icon="mdi-delete-forever"
                  @click="deleteAccountDialog = true"
                >
                  Delete My Account
                </v-btn>
              </v-card-text>
            </v-card>
          </v-card-text>
        </v-card>
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

    <!-- Disconnect Discord Confirmation Dialog -->
    <v-dialog v-model="disconnectDiscordDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">
          <v-icon start color="warning">mdi-link-off</v-icon>
          Disconnect Discord?
        </v-card-title>
        <v-card-text>
          Are you sure you want to disconnect your Discord account? You will need to reconnect to
          use Discord features like auto-approval.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="disconnectDiscordDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="disconnectingDiscord"
            @click="disconnectDiscord"
          >
            Disconnect
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Account Confirmation Dialog -->
    <v-dialog v-model="deleteAccountDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6 text-error">
          <v-icon start color="error">mdi-alert-circle</v-icon>
          Delete Account?
        </v-card-title>
        <v-card-text>
          <v-alert type="error" variant="tonal" class="mb-4">
            This action is <strong>permanent</strong> and cannot be undone.
          </v-alert>
          <p>Are you sure you want to delete your account?</p>
          <p class="text-body-2 text-medium-emphasis mt-2">This will permanently delete:</p>
          <ul class="text-body-2 text-medium-emphasis ml-4">
            <li>Your account and profile</li>
            <li>All sell and buy orders</li>
            <li>FIO inventory data</li>
            <li>Discord connection</li>
            <li>All other associated data</li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteAccountDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="deletingAccount" @click="deleteAccount">
            Delete My Account
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import DiscordIcon from '../components/DiscordIcon.vue'
import { CURRENCIES } from '../types'
import type { Currency, LocationDisplayMode, CommodityDisplayMode, Role } from '../types'
import type { DiscordConnectionStatus } from '@kawakawa/types'
import { api } from '../services/api'

const route = useRoute()
const router = useRouter()
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

// Discord state
const discordStatus = ref<DiscordConnectionStatus | null>(null)
const loadingDiscord = ref(false)
const connectingDiscord = ref(false)
const disconnectingDiscord = ref(false)
const disconnectDiscordDialog = ref(false)

// Delete account state
const deleteAccountDialog = ref(false)
const deletingAccount = ref(false)

// Computed Discord avatar URL
const discordAvatarUrl = computed(() => {
  const profile = discordStatus.value?.profile
  if (!profile?.discordAvatar) return null
  return `https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.discordAvatar}.png?size=128`
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

// Discord functions
const formatRelativeTime = (dateStr: string | undefined): string => {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return 'just now'
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

const loadDiscordStatus = async () => {
  try {
    loadingDiscord.value = true
    discordStatus.value = await api.discord.getStatus()
  } catch (error) {
    console.error('Failed to load Discord status', error)
  } finally {
    loadingDiscord.value = false
  }
}

const connectDiscord = async () => {
  try {
    connectingDiscord.value = true
    const { url, state } = await api.discord.getAuthUrl()
    // Store state in sessionStorage for validation when callback returns
    sessionStorage.setItem('discord_oauth_state', state)
    // Redirect to Discord OAuth
    window.location.href = url
  } catch (error) {
    console.error('Failed to initiate Discord connection', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect Discord'
    showSnackbar(errorMessage, 'error')
    connectingDiscord.value = false
  }
}

const handleDiscordCallback = async () => {
  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined
  const storedState = sessionStorage.getItem('discord_oauth_state')

  if (!code || !state) return

  // Clear the stored state
  sessionStorage.removeItem('discord_oauth_state')

  // Validate state
  if (state !== storedState) {
    showSnackbar('Discord authentication failed: Invalid state', 'error')
    // Clear query params
    router.replace({ query: {} })
    return
  }

  try {
    connectingDiscord.value = true
    await api.discord.handleCallback({ code, state })
    showSnackbar('Discord account connected successfully!')
    // Refresh Discord status
    await loadDiscordStatus()
  } catch (error) {
    console.error('Failed to complete Discord connection', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect Discord'
    showSnackbar(errorMessage, 'error')
  } finally {
    connectingDiscord.value = false
    // Clear query params
    router.replace({ query: {} })
  }
}

const confirmDisconnectDiscord = () => {
  disconnectDiscordDialog.value = true
}

const disconnectDiscord = async () => {
  try {
    disconnectingDiscord.value = true
    await api.discord.disconnect()
    discordStatus.value = {
      connected: false,
      profile: null,
      isMemberOfGuild: null,
      guildRoles: null,
    }
    disconnectDiscordDialog.value = false
    showSnackbar('Discord account disconnected')
  } catch (error) {
    console.error('Failed to disconnect Discord', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect Discord'
    showSnackbar(errorMessage, 'error')
  } finally {
    disconnectingDiscord.value = false
  }
}

// Delete account
const deleteAccount = async () => {
  try {
    deletingAccount.value = true
    await api.account.deleteAccount()
    // Account deleted - redirect to login with message
    router.push({ path: '/login', query: { message: 'account_deleted' } })
  } catch (error) {
    console.error('Failed to delete account', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete account'
    showSnackbar(errorMessage, 'error')
    deleteAccountDialog.value = false
  } finally {
    deletingAccount.value = false
  }
}

// Watch for Discord tab to load status
watch(activeTab, async newTab => {
  if (newTab === 'discord' && !discordStatus.value) {
    await loadDiscordStatus()
  }
})

// Handle Discord OAuth callback on mount
watch(
  () => route.query,
  async query => {
    if (query.code && query.state) {
      activeTab.value = 'discord'
      await handleDiscordCallback()
    }
  },
  { immediate: true }
)
</script>
