<template>
  <v-container>
    <h1 class="text-h4 mb-4">Account Management</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <div class="d-flex account-layout">
      <!-- Vertical Tabs Navigation -->
      <v-card class="account-nav flex-shrink-0 mr-4">
        <v-tabs v-model="activeTab" direction="vertical" color="primary">
          <v-tab value="general">
            <v-icon start>mdi-account-cog</v-icon>
            General
          </v-tab>
          <v-tab value="security">
            <v-icon start>mdi-shield-lock</v-icon>
            Security
          </v-tab>
          <v-tab value="interface">
            <v-icon start>mdi-palette-outline</v-icon>
            Interface
          </v-tab>
          <v-tab value="market">
            <v-icon start>mdi-store</v-icon>
            Market
          </v-tab>
          <v-tab value="notifications">
            <v-icon start>mdi-bell</v-icon>
            Notifications
          </v-tab>
          <v-tab value="fio">
            <v-icon start>mdi-cloud-sync</v-icon>
            FIO
          </v-tab>
          <v-tab value="discord">
            <DiscordIcon :size="20" class="mr-2" />
            Discord
          </v-tab>
          <v-divider class="my-2" />
          <v-tab value="danger" color="error">
            <v-icon start color="error">mdi-alert-circle</v-icon>
            <span class="text-error">Danger Zone</span>
          </v-tab>
        </v-tabs>
      </v-card>

      <!-- Tab Content -->
      <div class="account-content flex-grow-1">
        <v-tabs-window v-model="activeTab">
          <!-- General Tab -->
          <v-tabs-window-item value="general">
            <v-card :loading="loading">
              <v-card-text>
                <!-- Profile Picture and Roles - Stacked on top -->
                <div class="d-flex flex-column align-center mb-6">
                  <v-avatar size="120" color="grey-darken-3" class="mb-3">
                    <v-icon size="64">mdi-account</v-icon>
                  </v-avatar>
                  <div class="text-body-2 text-medium-emphasis mb-3">
                    Profile picture coming soon
                  </div>
                  <div class="d-flex flex-wrap justify-center ga-1">
                    <v-chip
                      v-for="role in account.roles"
                      :key="role.id"
                      :color="role.color"
                      size="small"
                    >
                      {{ role.name }}
                    </v-chip>
                    <v-chip v-if="account.roles.length === 0" color="grey" size="small">
                      No roles assigned
                    </v-chip>
                  </div>
                </div>

                <v-divider class="mb-6" />

                <!-- Account Information -->
                <v-form>
                  <div class="text-subtitle-1 font-weight-bold mb-3">Account Information</div>

                  <v-text-field
                    v-model="account.profileName"
                    label="Username"
                    prepend-icon="mdi-account"
                    readonly
                    class="mb-2"
                  >
                    <template #append-inner>
                      <v-tooltip location="top" text="Your unique username (cannot be changed)">
                        <template #activator="{ props }">
                          <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                        </template>
                      </v-tooltip>
                    </template>
                  </v-text-field>

                  <v-text-field
                    v-model="account.displayName"
                    label="Display Name"
                    prepend-icon="mdi-card-account-details"
                    class="mb-2"
                    @blur="saveDisplayName"
                  >
                    <template #append-inner>
                      <v-tooltip location="top" text="How your name appears to others">
                        <template #activator="{ props }">
                          <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                        </template>
                      </v-tooltip>
                    </template>
                  </v-text-field>

                  <v-text-field
                    v-model="account.email"
                    label="Email"
                    prepend-icon="mdi-email"
                    class="mb-2"
                    @blur="saveEmail"
                  >
                    <template #append-inner>
                      <v-tooltip location="top" text="Your email address (optional)">
                        <template #activator="{ props }">
                          <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                        </template>
                      </v-tooltip>
                    </template>
                  </v-text-field>
                </v-form>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>

          <!-- Security Tab -->
          <v-tabs-window-item value="security">
            <v-card :loading="loading">
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

          <!-- Interface Tab -->
          <v-tabs-window-item value="interface">
            <v-card :loading="loading">
              <v-card-text>
                <div class="text-subtitle-1 font-weight-bold mb-3">Display Preferences</div>

                <v-autocomplete
                  v-model="settingsStore.timezone.value"
                  :items="timezoneOptions"
                  label="Timezone"
                  prepend-icon="mdi-clock-outline"
                  class="mb-2"
                  @update:model-value="autoSaveSetting('general.timezone', $event)"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="Your preferred timezone for displaying dates and times"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-autocomplete>

                <v-select
                  v-model="settingsStore.locationDisplayMode.value"
                  :items="locationDisplayModes"
                  label="Location Display Mode"
                  prepend-icon="mdi-map-marker"
                  class="mb-2"
                  @update:model-value="autoSaveSetting('display.locationDisplayMode', $event)"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="How to display location names in dropdowns and tables"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-select>

                <v-select
                  v-model="settingsStore.commodityDisplayMode.value"
                  :items="commodityDisplayModes"
                  label="Commodity Display Mode"
                  prepend-icon="mdi-package-variant"
                  class="mb-4"
                  @update:model-value="autoSaveSetting('display.commodityDisplayMode', $event)"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="How to display commodity names in dropdowns and tables"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-select>

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Formatting</div>

                <v-select
                  v-model="datetimeFormatSelection"
                  :items="datetimeFormatOptions"
                  label="Datetime Format"
                  prepend-icon="mdi-calendar-clock"
                  class="mb-2"
                  @update:model-value="autoSaveDatetimeFormat"
                >
                  <template #append-inner>
                    <v-tooltip location="top" text="How dates and times are displayed">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-select>

                <v-text-field
                  v-if="datetimeFormatSelection === 'custom'"
                  v-model="customDatetimeFormat"
                  label="Custom Datetime Pattern"
                  prepend-icon="mdi-pencil"
                  class="mb-2"
                  @blur="autoSaveDatetimeFormat"
                >
                  <template #append-inner>
                    <v-tooltip location="top" text="Enter your custom datetime pattern">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-text-field>

                <v-expand-transition>
                  <v-alert
                    v-if="datetimeFormatSelection === 'custom'"
                    type="info"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                  >
                    <div class="text-subtitle-2 mb-2">Datetime Format Tokens</div>
                    <v-row dense>
                      <v-col cols="12" sm="6">
                        <div class="text-caption">
                          <strong>Date:</strong><br />
                          YYYY - 4-digit year (2024)<br />
                          YY - 2-digit year (24)<br />
                          MM - Month (01-12)<br />
                          MMM - Month short (Jan)<br />
                          MMMM - Month full (January)<br />
                          DD - Day (01-31)<br />
                          D - Day (1-31)<br />
                          ddd - Day short (Mon)<br />
                          dddd - Day full (Monday)
                        </div>
                      </v-col>
                      <v-col cols="12" sm="6">
                        <div class="text-caption">
                          <strong>Time:</strong><br />
                          HH - Hour 24h (00-23)<br />
                          hh - Hour 12h (01-12)<br />
                          mm - Minute (00-59)<br />
                          ss - Second (00-59)<br />
                          A - AM/PM<br />
                          a - am/pm<br /><br />
                          <strong>Examples:</strong><br />
                          YYYY-MM-DD HH:mm → 2024-01-15 14:30<br />
                          DD/MM/YYYY hh:mm A → 15/01/2024 02:30 PM
                        </div>
                      </v-col>
                    </v-row>
                  </v-alert>
                </v-expand-transition>

                <v-select
                  v-model="numberFormatSelection"
                  :items="numberFormatOptions"
                  label="Number Format"
                  prepend-icon="mdi-numeric"
                  class="mb-2"
                  @update:model-value="autoSaveNumberFormat"
                >
                  <template #append-inner>
                    <v-tooltip location="top" text="How numbers are formatted">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-select>

                <v-text-field
                  v-if="numberFormatSelection === 'custom'"
                  v-model="customNumberFormat"
                  label="Custom Number Format"
                  prepend-icon="mdi-pencil"
                  class="mb-2"
                  @blur="autoSaveNumberFormat"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="Format: [thousands separator][decimal separator]"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-text-field>

                <v-expand-transition>
                  <v-alert
                    v-if="numberFormatSelection === 'custom'"
                    type="info"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                  >
                    <div class="text-subtitle-2 mb-2">Number Format Options</div>
                    <div class="text-caption">
                      <strong>Format:</strong> [thousands][decimal]<br />
                      Thousands separator: <code>,</code> <code>.</code> <code>_</code> (space) or
                      none<br />
                      Decimal separator: <code>.</code> or <code>,</code><br /><br />
                      <strong>Examples:</strong><br />
                      <code>,.</code> → 1,234.56 (US style)<br />
                      <code>.,</code> → 1.234,56 (EU style)<br />
                      <code>_,</code> → 1 234,56 (SI with space)
                    </div>
                  </v-alert>
                </v-expand-transition>

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Behaviors</div>

                <v-switch
                  v-model="settingsStore.closeDialogOnClickOutside.value"
                  label="Close Dialogs on Click Outside"
                  color="primary"
                  hide-details
                  class="mb-2"
                  @update:model-value="autoSaveSetting('general.closeDialogOnClickOutside', $event)"
                >
                  <template #prepend>
                    <v-icon>mdi-gesture-tap</v-icon>
                  </template>
                  <template #append>
                    <v-tooltip
                      location="top"
                      text="Close dialogs and modals when clicking outside of them"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-switch>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>

          <!-- Market Tab -->
          <v-tabs-window-item value="market">
            <v-card :loading="loading">
              <v-card-text>
                <div class="text-subtitle-1 font-weight-bold mb-3">Currency & Pricing</div>

                <v-select
                  v-model="settingsStore.preferredCurrency.value"
                  :items="currencies"
                  label="Preferred Currency"
                  prepend-icon="mdi-currency-usd"
                  class="mb-2"
                  @update:model-value="autoSaveSetting('market.preferredCurrency', $event)"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="Default currency for displaying and entering prices"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-select>

                <v-autocomplete
                  v-model="settingsStore.defaultPriceList.value"
                  :items="priceListOptions"
                  :loading="loadingPriceLists"
                  label="Default Price List"
                  prepend-icon="mdi-clipboard-list"
                  class="mb-4"
                  clearable
                  @update:model-value="autoSaveSetting('market.defaultPriceList', $event)"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="Price list used for price suggestions in order forms"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-autocomplete>

                <v-switch
                  v-model="settingsStore.automaticPricing.value"
                  label="Automatic Pricing"
                  color="primary"
                  hide-details
                  class="mb-2"
                  @update:model-value="autoSaveSetting('market.automaticPricing', $event)"
                >
                  <template #prepend>
                    <v-icon>mdi-auto-fix</v-icon>
                  </template>
                  <template #append>
                    <v-tooltip
                      location="top"
                      text="Use your default price list for new orders instead of entering a fixed price"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-switch>

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Favorites</div>

                <v-autocomplete
                  v-model="settingsStore.favoritedLocations.value"
                  :items="locationOptions"
                  :loading="loadingLocations"
                  label="Favorite Locations"
                  prepend-icon="mdi-star-outline"
                  multiple
                  chips
                  closable-chips
                  class="mb-4"
                  @update:model-value="autoSaveSetting('market.favoritedLocations', $event)"
                >
                  <template #append-inner>
                    <v-tooltip location="top" text="Locations that appear first in dropdown menus">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-autocomplete>

                <v-autocomplete
                  v-model="settingsStore.favoritedCommodities.value"
                  :items="commodityOptions"
                  :loading="loadingCommodities"
                  label="Favorite Commodities"
                  prepend-icon="mdi-star-outline"
                  multiple
                  chips
                  closable-chips
                  class="mb-4"
                  @update:model-value="autoSaveSetting('market.favoritedCommodities', $event)"
                >
                  <template #append-inner>
                    <v-tooltip
                      location="top"
                      text="Commodities that appear first in dropdown menus"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-autocomplete>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>

          <!-- Notifications Tab -->
          <v-tabs-window-item value="notifications">
            <v-card :loading="loading">
              <v-card-text>
                <div class="text-subtitle-1 font-weight-bold mb-3">Browser Notifications</div>

                <div class="d-flex align-center mb-2">
                  <v-switch
                    v-model="browserNotificationsEnabled"
                    color="primary"
                    hide-details
                    @change="handleBrowserNotificationToggle"
                  >
                    <template #prepend>
                      <v-icon>mdi-bell-ring</v-icon>
                    </template>
                  </v-switch>
                  <div class="ml-2">
                    <div class="text-body-2">Enable Browser Notifications</div>
                    <div class="text-caption text-medium-emphasis">
                      {{ browserNotificationStatus }}
                    </div>
                  </div>
                </div>

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Order Notifications</div>

                <v-switch
                  v-model="settingsStore.reservationPlacedNotification.value"
                  label="Reservation Placed"
                  color="primary"
                  hide-details
                  class="mb-2"
                  @update:model-value="autoSaveSetting('notifications.reservationPlaced', $event)"
                >
                  <template #prepend>
                    <v-icon>mdi-cart-plus</v-icon>
                  </template>
                  <template #append>
                    <v-tooltip
                      location="top"
                      text="Notify when someone places a reservation on your order"
                    >
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-switch>

                <v-switch
                  v-model="settingsStore.reservationStatusChangeNotification.value"
                  label="Status Changes"
                  color="primary"
                  hide-details
                  class="mb-2"
                  @update:model-value="
                    autoSaveSetting('notifications.reservationStatusChange', $event)
                  "
                >
                  <template #prepend>
                    <v-icon>mdi-swap-horizontal</v-icon>
                  </template>
                  <template #append>
                    <v-tooltip location="top" text="Notify when reservation status changes">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small">mdi-help-circle-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </template>
                </v-switch>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>

          <!-- FIO Integration Tab -->
          <v-tabs-window-item value="fio">
            <v-card :loading="loading || loadingFio">
              <v-card-text>
                <!-- FIO Settings -->
                <div class="text-subtitle-1 font-weight-bold mb-3">FIO Credentials</div>

                <v-form>
                  <v-text-field
                    v-model="fioUsername"
                    label="FIO Username"
                    prepend-icon="mdi-game-controller"
                    hint="Your Prosperous Universe username"
                    class="mb-2"
                    @blur="saveFioUsername"
                  />
                  <v-text-field
                    v-model="fioApiKey"
                    :label="
                      settingsStore.hasFioCredentials.value
                        ? 'FIO API Key (configured)'
                        : 'FIO API Key'
                    "
                    :placeholder="
                      settingsStore.hasFioCredentials.value
                        ? '••••••••••••••••'
                        : 'Enter your FIO API key'
                    "
                    prepend-icon="mdi-key"
                    :append-inner-icon="showFioApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                    :type="showFioApiKey ? 'text' : 'password'"
                    hint="Get your API key from https://fio.fnar.net/settings"
                    persistent-hint
                    class="mb-4"
                    @click:append-inner="showFioApiKey = !showFioApiKey"
                    @blur="saveFioApiKey"
                  />
                </v-form>

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Sync Preferences</div>

                <v-switch
                  v-model="settingsStore.fioAutoSync.value"
                  label="Auto Sync"
                  color="primary"
                  hide-details
                  class="mb-2"
                  @update:model-value="autoSaveSetting('fio.autoSync', $event)"
                >
                  <template #prepend>
                    <v-icon>mdi-sync-circle</v-icon>
                  </template>
                </v-switch>
                <div class="text-caption text-medium-emphasis mb-4 ml-10">
                  Automatically sync your inventory every 3 hours
                </div>

                <v-autocomplete
                  v-model="settingsStore.fioExcludedLocations.value"
                  :items="sortedLocationOptions"
                  :loading="loadingLocations"
                  label="Excluded Locations"
                  prepend-icon="mdi-map-marker-off"
                  item-props
                  multiple
                  chips
                  closable-chips
                  hint="Locations to exclude from FIO sync"
                  persistent-hint
                  class="mb-4"
                  @update:model-value="autoSaveSetting('fio.excludedLocations', $event)"
                />

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Sync Actions</div>

                <div class="d-flex ga-2 flex-wrap mb-4">
                  <v-btn
                    color="primary"
                    :loading="syncing"
                    :disabled="syncing || clearing || !settingsStore.hasFioCredentials.value"
                    @click="syncFio"
                  >
                    <v-icon start>mdi-cloud-download</v-icon>
                    Sync Now
                  </v-btn>
                  <v-btn
                    color="error"
                    variant="outlined"
                    :loading="clearing"
                    :disabled="syncing || clearing || fioStats.totalItems === 0"
                    @click="confirmClearFio"
                  >
                    <v-icon start>mdi-delete</v-icon>
                    Clear Data
                  </v-btn>
                </div>

                <v-alert
                  v-if="!settingsStore.hasFioCredentials.value"
                  type="info"
                  variant="tonal"
                  class="mb-4"
                  density="compact"
                >
                  Configure your FIO API key to enable syncing.
                </v-alert>

                <v-alert
                  v-if="syncResult"
                  :type="syncResult.success ? 'success' : 'error'"
                  variant="tonal"
                  class="mb-4"
                  closable
                  @click:close="syncResult = null"
                >
                  <template v-if="syncResult.success">
                    Synced {{ syncResult.inserted }} items from
                    {{ syncResult.storageLocations }} storage locations.
                  </template>
                  <template v-else> Sync failed: {{ syncResult.errors.join(', ') }} </template>
                </v-alert>

                <!-- FIO Statistics -->
                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">Statistics</div>

                <div class="d-flex flex-wrap ga-6 mb-4 justify-center">
                  <div class="text-center">
                    <div class="text-h5 font-weight-bold">{{ fioStats.totalItems }}</div>
                    <div class="text-caption text-medium-emphasis">Items</div>
                  </div>
                  <div class="text-center">
                    <div class="text-h5 font-weight-bold">
                      {{ formatNumber(fioStats.totalQuantity) }}
                    </div>
                    <div class="text-caption text-medium-emphasis">Quantity</div>
                  </div>
                  <div class="text-center">
                    <div class="text-h5 font-weight-bold">{{ fioStats.uniqueCommodities }}</div>
                    <div class="text-caption text-medium-emphasis">Commodities</div>
                  </div>
                  <div class="text-center">
                    <div class="text-h5 font-weight-bold">{{ fioStats.storageLocations }}</div>
                    <div class="text-caption text-medium-emphasis">Locations</div>
                  </div>
                </div>

                <div class="d-flex flex-wrap ga-4 justify-center">
                  <div class="d-flex align-center">
                    <v-icon
                      class="mr-2"
                      size="small"
                      :color="getDataAgeInfo(fioStats.oldestFioUploadTime).color"
                    >
                      {{ getDataAgeInfo(fioStats.oldestFioUploadTime).icon }}
                    </v-icon>
                    <div>
                      <div class="text-body-2">
                        Oldest: {{ formatDateTime(fioStats.oldestFioUploadTime) }}
                      </div>
                    </div>
                  </div>
                  <div class="d-flex align-center">
                    <v-icon
                      class="mr-2"
                      size="small"
                      :color="getDataAgeInfo(fioStats.newestFioUploadTime).color"
                    >
                      {{ getDataAgeInfo(fioStats.newestFioUploadTime).icon }}
                    </v-icon>
                    <div>
                      <div class="text-body-2">
                        Newest: {{ formatDateTime(fioStats.newestFioUploadTime) }}
                      </div>
                    </div>
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>

          <!-- Discord Tab -->
          <v-tabs-window-item value="discord">
            <v-card :loading="loadingDiscord">
              <v-card-text>
                <!-- Not Connected State -->
                <template v-if="!discordStatus?.connected">
                  <div class="text-subtitle-1 font-weight-bold mb-3">Connect Discord</div>

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

                  <div class="d-flex ga-2 flex-wrap mb-4">
                    <v-btn
                      color="primary"
                      variant="outlined"
                      :loading="syncingRoles"
                      @click="syncDiscordRoles"
                    >
                      <v-icon start>mdi-sync</v-icon>
                      Sync Roles
                    </v-btn>

                    <v-btn
                      color="error"
                      variant="outlined"
                      :loading="disconnectingDiscord"
                      @click="confirmDisconnectDiscord"
                    >
                      <v-icon start>mdi-link-off</v-icon>
                      Disconnect Discord
                    </v-btn>
                  </div>
                </template>

                <v-divider class="my-4" />

                <div class="text-subtitle-1 font-weight-bold mb-3">About Discord Integration</div>

                <v-list density="compact" class="bg-transparent">
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
                  <strong>Warning:</strong> Actions in this section are permanent and cannot be
                  undone. Please proceed with caution.
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
                        <v-list-item-title
                          >Any external connections, such as Discord</v-list-item-title
                        >
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
      </div>
    </div>

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
import { useUrlTab } from '../composables'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import DiscordIcon from '../components/DiscordIcon.vue'
import { CURRENCIES } from '../types'
import type { LocationDisplayMode, CommodityDisplayMode, Role } from '../types'
import type { DiscordConnectionStatus } from '@kawakawa/types'
import { api } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
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

const ACCOUNT_TABS = [
  'general',
  'security',
  'interface',
  'market',
  'notifications',
  'fio',
  'discord',
  'danger',
] as const
const activeTab = useUrlTab({
  validTabs: ACCOUNT_TABS,
  defaultTab: 'general',
})

// Profile data (from API)
// Note: FIO credentials (fioUsername, fioApiKey) are now in user settings, not profile
const account = ref<{
  profileName: string
  displayName: string
  email: string | null
  roles: Role[]
}>({
  profileName: '',
  displayName: '',
  email: null,
  roles: [],
})

// Timezone options
const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const timezoneOptions = computed(() => {
  // Intl.supportedValuesOf is ES2022+ and may not be in all TypeScript configs
  const timezones =
    (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ||
    []
  return [
    { title: `Auto (${detectedTimezone})`, value: 'auto' },
    ...timezones.map((tz: string) => ({ title: tz, value: tz })),
  ]
})

// Datetime format options
const datetimeFormatOptions = [
  { title: 'Auto (Browser locale)', value: 'auto' },
  { title: 'ISO 8601 (2024-01-15 14:30)', value: 'iso' },
  { title: 'US format (01/15/2024 2:30 PM)', value: 'us' },
  { title: 'European format (15/01/2024 14:30)', value: 'eu' },
  { title: 'Long format (January 15, 2024 at 2:30 PM)', value: 'long' },
  { title: 'Custom pattern', value: 'custom' },
]
const datetimeFormatSelection = ref('auto')
const customDatetimeFormat = ref('')

// Number format options
const numberFormatOptions = [
  { title: 'Auto (Browser locale)', value: 'auto' },
  { title: 'US format (1,234.56)', value: 'us' },
  { title: 'European format (1.234,56)', value: 'eu' },
  { title: 'SI format (1 234.56)', value: 'si' },
  { title: 'Custom pattern', value: 'custom' },
]
const numberFormatSelection = ref('auto')
const customNumberFormat = ref('')

// Market tab data
const priceListOptions = ref<{ title: string; value: string }[]>([])
const locationOptions = ref<{ title: string; value: string }[]>([])
const commodityOptions = ref<{ title: string; value: string }[]>([])
const fioStorageLocationIds = ref<string[]>([])
const loadingPriceLists = ref(false)
const loadingLocations = ref(false)
const loadingCommodities = ref(false)

// Sorted location options with icons: favorites (star), FIO storage (house), then alphabetical
const sortedLocationOptions = computed(() => {
  const favorites = new Set(settingsStore.favoritedLocations.value || [])
  const fioStorage = new Set(fioStorageLocationIds.value || [])

  return [...locationOptions.value]
    .map(opt => {
      const isFavorite = favorites.has(opt.value)
      const isFioStorage = fioStorage.has(opt.value)
      return {
        ...opt,
        prependIcon: isFavorite ? 'mdi-star' : isFioStorage ? 'mdi-home' : undefined,
        priority: isFavorite ? 0 : isFioStorage ? 1 : 2,
      }
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.title.localeCompare(b.title)
    })
})

// FIO-specific state
const fioUsername = ref('')
const fioApiKey = ref('')
const showFioApiKey = ref(false)
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
const syncingRoles = ref(false)

// Delete account state
const deleteAccountDialog = ref(false)
const deletingAccount = ref(false)

// Browser notifications
const browserNotificationsEnabled = ref(userStore.getBrowserNotificationsEnabled())

const browserNotificationStatus = computed(() => {
  if (!('Notification' in window)) {
    return 'Not supported by your browser'
  }

  if (window.Notification.permission === 'denied') {
    return 'Blocked by browser - enable in browser settings'
  }

  if (browserNotificationsEnabled.value) {
    if (window.Notification.permission === 'granted') {
      return 'Enabled - you will receive browser notifications'
    }
    return 'Pending permission request'
  }

  return 'Disabled - enable to receive browser notifications'
})

const handleBrowserNotificationToggle = async () => {
  if (browserNotificationsEnabled.value) {
    // User wants to enable notifications
    if (!('Notification' in window)) {
      showSnackbar('Browser notifications are not supported', 'error')
      browserNotificationsEnabled.value = false
      return
    }

    if (window.Notification.permission === 'denied') {
      showSnackbar(
        'Browser notifications are blocked. Please enable them in your browser settings.',
        'error'
      )
      browserNotificationsEnabled.value = false
      return
    }

    if (window.Notification.permission !== 'granted') {
      // Request permission
      const permission = await window.Notification.requestPermission()
      if (permission !== 'granted') {
        showSnackbar('Browser notification permission was denied', 'error')
        browserNotificationsEnabled.value = false
        return
      }
    }

    userStore.setBrowserNotificationsEnabled(true)
    showSnackbar('Browser notifications enabled')

    // Show a test notification
    new window.Notification('Kawakawa CX', {
      body: 'Browser notifications are now enabled!',
      icon: '/logo.svg',
    })
  } else {
    // User wants to disable notifications
    userStore.setBrowserNotificationsEnabled(false)
    showSnackbar('Browser notifications disabled')
  }
}

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
    const [stats, storageLocations] = await Promise.all([
      api.fioInventory.getStats(),
      api.fioInventory.getStorageLocations(),
    ])
    fioStats.value = stats
    fioStorageLocationIds.value = storageLocations.locationIds
  } catch (error) {
    console.error('Failed to load FIO stats', error)
  } finally {
    loadingFio.value = false
  }
}

// Helper to parse datetime format setting value
const initDatetimeFormat = (value: string) => {
  const presets = ['auto', 'iso', 'us', 'eu', 'long']
  if (presets.includes(value)) {
    datetimeFormatSelection.value = value
    customDatetimeFormat.value = ''
  } else {
    datetimeFormatSelection.value = 'custom'
    customDatetimeFormat.value = value
  }
}

// Helper to parse number format setting value
const initNumberFormat = (value: string) => {
  const presets = ['auto', 'us', 'eu', 'si']
  if (presets.includes(value)) {
    numberFormatSelection.value = value
    customNumberFormat.value = ''
  } else {
    numberFormatSelection.value = 'custom'
    customNumberFormat.value = value
  }
}

// Load market data for autocomplete dropdowns
const loadMarketData = async () => {
  try {
    // Load price lists
    loadingPriceLists.value = true
    const priceLists = await api.priceLists.list()
    priceListOptions.value = priceLists.map(pl => ({
      title: `${pl.code} - ${pl.name}`,
      value: pl.code,
    }))
  } catch (error) {
    console.error('Failed to load price lists', error)
  } finally {
    loadingPriceLists.value = false
  }

  try {
    // Load locations using locationService
    loadingLocations.value = true
    locationOptions.value = await locationService.getLocationOptions('both')
  } catch (error) {
    console.error('Failed to load locations', error)
  } finally {
    loadingLocations.value = false
  }

  try {
    // Load commodities using commodityService
    loadingCommodities.value = true
    commodityOptions.value = await commodityService.getCommodityOptions('both')
  } catch (error) {
    console.error('Failed to load commodities', error)
  } finally {
    loadingCommodities.value = false
  }
}

onMounted(async () => {
  try {
    loading.value = true

    // Load profile data from API
    const profile = await api.account.getProfile()
    account.value = {
      profileName: profile.profileName,
      displayName: profile.displayName,
      email: profile.email ?? null,
      roles: profile.roles,
    }
    userStore.setUser(profile)

    // Settings are loaded by the settings store (triggered by setUser)
    // Initialize format selections from settings
    initDatetimeFormat(settingsStore.datetimeFormat.value)
    initNumberFormat(settingsStore.numberFormat.value)

    // Initialize FIO settings for local editing
    fioUsername.value = settingsStore.fioUsername.value || ''

    // Load FIO stats
    await loadFioStats()

    // Load market data for autocomplete
    await loadMarketData()
  } catch (error) {
    console.error('Failed to load profile', error)
    // Fallback to localStorage
    const cachedUser = userStore.getUser()
    if (cachedUser) {
      account.value = {
        profileName: cachedUser.profileName,
        displayName: cachedUser.displayName,
        email: cachedUser.email ?? null,
        roles: cachedUser.roles,
      }
      // Settings should be loaded from cache by settings store
      initDatetimeFormat(settingsStore.datetimeFormat.value)
      initNumberFormat(settingsStore.numberFormat.value)
      fioUsername.value = settingsStore.fioUsername.value || ''
    }
    showSnackbar('Failed to load profile from server', 'error')
  } finally {
    loading.value = false
  }
})

// Compute effective datetime format value for saving
const getDatetimeFormatValue = (): string => {
  if (datetimeFormatSelection.value === 'custom') {
    return customDatetimeFormat.value || 'auto'
  }
  return datetimeFormatSelection.value
}

// Compute effective number format value for saving
const getNumberFormatValue = (): string => {
  if (numberFormatSelection.value === 'custom') {
    return customNumberFormat.value || 'auto'
  }
  return numberFormatSelection.value
}

// ==================== AUTO-SAVE FUNCTIONS ====================

// Save display name on blur
const saveDisplayName = async () => {
  try {
    const profileData = { displayName: account.value.displayName }
    const updated = await api.account.updateProfile(profileData)
    userStore.setUser(updated)
  } catch (error) {
    console.error('Failed to save display name', error)
    showSnackbar('Failed to save display name', 'error')
  }
}

// Save email on blur
const saveEmail = async () => {
  try {
    const profileData = { email: account.value.email }
    const updated = await api.account.updateProfile(profileData)
    userStore.setUser(updated)
  } catch (error) {
    console.error('Failed to save email', error)
    showSnackbar('Failed to save email', 'error')
  }
}

// Generic auto-save for a single setting
const autoSaveSetting = async (key: string, value: unknown) => {
  try {
    await settingsStore.updateSettings({ [key]: value })
  } catch (error) {
    console.error(`Failed to save setting ${key}`, error)
    showSnackbar(`Failed to save setting`, 'error')
  }
}

// Auto-save datetime format
const autoSaveDatetimeFormat = async () => {
  try {
    await settingsStore.updateSettings({
      'general.datetimeFormat': getDatetimeFormatValue(),
    })
  } catch (error) {
    console.error('Failed to save datetime format', error)
    showSnackbar('Failed to save datetime format', 'error')
  }
}

// Auto-save number format
const autoSaveNumberFormat = async () => {
  try {
    await settingsStore.updateSettings({
      'general.numberFormat': getNumberFormatValue(),
    })
  } catch (error) {
    console.error('Failed to save number format', error)
    showSnackbar('Failed to save number format', 'error')
  }
}

// Auto-save FIO username
const saveFioUsername = async () => {
  try {
    await settingsStore.updateSettings({ 'fio.username': fioUsername.value })
  } catch (error) {
    console.error('Failed to save FIO username', error)
    showSnackbar('Failed to save FIO username', 'error')
  }
}

// Auto-save FIO API key
const saveFioApiKey = async () => {
  if (!fioApiKey.value) return // Don't save empty values
  try {
    await settingsStore.updateSettings({ 'fio.apiKey': fioApiKey.value })
    // Clear the API key field after successful save
    fioApiKey.value = ''
    showFioApiKey.value = false
  } catch (error) {
    console.error('Failed to save FIO API key', error)
    showSnackbar('Failed to save FIO API key', 'error')
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

const syncDiscordRoles = async () => {
  try {
    syncingRoles.value = true
    const result = await api.discord.syncRoles()
    if (result.rolesAdded.length > 0) {
      showSnackbar(`Added ${result.rolesAdded.length} role(s): ${result.rolesAdded.join(', ')}`)
      // Refresh the profile to get updated roles
      const profile = await api.account.getProfile()
      account.value.roles = profile.roles
      userStore.setUser(profile)
    } else {
      showSnackbar('Roles are already up to date')
    }
  } catch (error) {
    console.error('Failed to sync Discord roles', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync Discord roles'
    showSnackbar(errorMessage, 'error')
  } finally {
    syncingRoles.value = false
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

<style scoped>
.account-layout {
  max-width: 900px;
  align-items: flex-start;
}

.account-nav {
  width: 200px;
  min-width: 200px;
  position: sticky;
  top: 80px;
}

.account-nav :deep(.v-tab) {
  justify-content: flex-start;
  text-transform: none;
  letter-spacing: normal;
}

.account-content {
  min-width: 0;
  max-width: 600px;
}
</style>
