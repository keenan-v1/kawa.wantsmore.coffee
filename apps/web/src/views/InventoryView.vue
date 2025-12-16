<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">My Inventory</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Sync Info Card -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" md="6">
            <div v-if="lastSync.lastSyncedAt" class="text-body-2">
              <strong>Last synced:</strong> {{ formatDateTime(lastSync.lastSyncedAt) }}
              <v-chip
                v-if="lastSync.fioUploadedAt"
                size="x-small"
                class="ml-2"
                :color="getSyncStatusColor(lastSync.fioUploadedAt)"
              >
                FIO data: {{ formatRelativeTime(lastSync.fioUploadedAt) }}
              </v-chip>
            </div>
            <div v-else class="text-body-2 text-medium-emphasis">
              <template v-if="!fioConfigured">
                No inventory synced yet.
                <router-link to="/account?tab=fio">Configure FIO</router-link>
                to get started.
              </template>
              <template v-else>No inventory synced yet</template>
            </div>
          </v-col>
          <v-col cols="12" md="6" class="text-md-right">
            <v-tooltip v-if="!fioConfigured" location="top">
              <template #activator="{ props }">
                <span v-bind="props">
                  <v-btn color="primary" prepend-icon="mdi-sync" disabled> Sync from FIO </v-btn>
                </span>
              </template>
              Configure FIO credentials in Account settings first
            </v-tooltip>
            <v-btn
              v-else
              color="primary"
              prepend-icon="mdi-sync"
              :loading="syncing"
              @click="syncInventory"
            >
              Sync from FIO
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Filters Card -->
    <v-card class="mb-4">
      <v-card-text class="py-2">
        <!-- Active Filters Display - always visible when filters active -->
        <div v-if="hasActiveFilters" class="d-flex flex-wrap ga-2 mb-3">
          <v-chip
            v-for="ticker in filters.commodity"
            :key="`commodity-${ticker}`"
            closable
            size="small"
            color="primary"
            @click:close="filters.commodity = filters.commodity.filter(t => t !== ticker)"
          >
            {{ getCommodityDisplay(ticker) }}
          </v-chip>
          <v-chip
            v-if="filters.category"
            closable
            size="small"
            color="secondary"
            @click:close="filters.category = null"
          >
            Category: {{ localizeMaterialCategory(filters.category as CommodityCategory) }}
          </v-chip>
          <v-chip
            v-for="locId in filters.location"
            :key="`location-${locId}`"
            closable
            size="small"
            color="info"
            @click:close="filters.location = filters.location.filter(l => l !== locId)"
          >
            {{ getLocationDisplay(locId) }}
          </v-chip>
          <v-chip
            v-if="filters.locationType"
            closable
            size="small"
            color="warning"
            @click:close="filters.locationType = null"
          >
            {{ filters.locationType }}
          </v-chip>
          <v-chip
            v-if="filters.storageType"
            closable
            size="small"
            color="success"
            @click:close="filters.storageType = null"
          >
            {{ filters.storageType }}
          </v-chip>
        </div>

        <!-- Collapsible filter dropdowns -->
        <v-expand-transition>
          <v-row v-if="filtersExpanded" dense class="mb-2 filter-row">
            <v-col cols="12" sm="6" md="4" lg="2">
              <KeyValueAutocomplete
                v-model="filters.commodity"
                :items="commodityOptions"
                :favorites="settingsStore.favoritedCommodities.value"
                label="Commodity"
                density="compact"
                clearable
                hide-details
                multiple
                @update:favorites="
                  settingsStore.updateSetting('market.favoritedCommodities', $event)
                "
              />
            </v-col>
            <v-col cols="12" sm="6" md="4" lg="2">
              <v-select
                v-model="filters.category"
                :items="categoryOptions"
                label="Category"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="4" lg="2">
              <KeyValueAutocomplete
                v-model="filters.location"
                :items="locationOptions"
                :favorites="settingsStore.favoritedLocations.value"
                label="Location"
                density="compact"
                clearable
                hide-details
                multiple
                @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6" md="4" lg="2">
              <v-select
                v-model="filters.locationType"
                :items="locationTypeOptions"
                label="Location Type"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="4" lg="2">
              <v-select
                v-model="filters.storageType"
                :items="storageTypeOptions"
                label="Storage Type"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
          </v-row>
        </v-expand-transition>

        <!-- Always visible buttons row -->
        <v-row dense align="center">
          <v-col cols="auto" class="d-flex ga-2">
            <v-btn
              variant="outlined"
              size="small"
              :prepend-icon="filtersExpanded ? 'mdi-filter-variant-minus' : 'mdi-filter-variant'"
              @click="filtersExpanded = !filtersExpanded"
            >
              {{ filtersExpanded ? 'Hide Filters' : 'Filters' }}
            </v-btn>
            <v-btn
              v-if="hasActiveFilters"
              variant="text"
              color="primary"
              size="small"
              @click="clearFilters"
            >
              Clear Filters
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Inventory Table -->
    <v-card>
      <v-card-title>
        <v-row align="center">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="search"
              prepend-icon="mdi-magnify"
              label="Search inventory..."
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
          <v-col cols="12" md="6" class="text-right">
            <span class="text-body-2 text-medium-emphasis">
              {{ filteredInventory.length }} item(s)
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table
        v-model:expanded="expandedItems"
        :headers="headers"
        :items="filteredInventory"
        :loading="loading"
        :items-per-page="25"
        item-value="id"
        show-expand
        :class="['elevation-0', { 'icon-rows': hasIcons }]"
      >
        <!-- Custom expand toggle -->
        <template #item.data-table-expand="{ item, internalItem, isExpanded, toggleExpand }">
          <v-btn
            v-if="hasOrders(item)"
            icon
            variant="text"
            size="small"
            @click="toggleExpand(internalItem)"
          >
            <v-icon>{{
              isExpanded(internalItem) ? 'mdi-chevron-down' : 'mdi-chevron-right'
            }}</v-icon>
          </v-btn>
          <!-- Empty spacer to maintain alignment when no orders -->
          <div v-else style="width: 40px"></div>
        </template>

        <template #item.commodityTicker="{ item }">
          <div
            class="font-weight-medium clickable-cell"
            @click="setFilter('commodity', item.commodityTicker)"
          >
            <CommodityDisplay :ticker="item.commodityTicker" />
          </div>
        </template>

        <template #item.commodityCategory="{ item }">
          <span
            v-if="item.commodityCategory"
            class="clickable-cell"
            @click="setFilter('category', item.commodityCategory)"
          >
            {{ localizeMaterialCategory(item.commodityCategory as CommodityCategory) }}
          </span>
        </template>

        <template #item.locationId="{ item }">
          <div
            class="font-weight-medium clickable-cell"
            @click="item.locationId && setFilter('location', item.locationId)"
          >
            {{ getLocationDisplay(item.locationId) }}
          </div>
          <div class="text-caption text-medium-emphasis">
            <span class="clickable-cell" @click="setFilter('storageType', item.storageType)">
              {{ item.storageType }}
            </span>
            &bull;
            <span class="clickable-cell" @click="setFilter('locationType', item.locationType)">
              {{ item.locationType || 'Unknown' }}
            </span>
          </div>
        </template>

        <template #item.quantity="{ item }">
          <span class="font-weight-medium">{{ item.quantity.toLocaleString() }}</span>
        </template>

        <template #item.fioUploadedAt="{ item }">
          <FioAgeChip
            :fio-uploaded-at="item.fioUploadedAt"
            color-mode="syncStatus"
            empty-text="-"
          />
        </template>

        <template #item.actions="{ item }">
          <!-- Desktop: show buttons -->
          <div v-if="!hasOrders(item)" class="d-none d-sm-flex ga-1">
            <v-tooltip
              location="top"
              :text="
                canCreateAnyOrders
                  ? 'Create sell order'
                  : 'You do not have permission to create orders'
              "
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  color="success"
                  size="small"
                  variant="tonal"
                  :disabled="!canCreateAnyOrders"
                  @click="openSellDialog(item)"
                >
                  Sell
                </v-btn>
              </template>
            </v-tooltip>
          </div>
          <!-- Mobile: show menu -->
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon size="small" class="d-sm-none">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-tooltip
                :disabled="canCreateAnyOrders"
                text="You do not have permission to create orders"
                location="start"
              >
                <template #activator="{ props: tooltipProps }">
                  <v-list-item
                    v-bind="tooltipProps"
                    :disabled="!canCreateAnyOrders"
                    @click="openSellDialog(item)"
                  >
                    <template #prepend>
                      <v-icon color="success">mdi-tag</v-icon>
                    </template>
                    <v-list-item-title>Sell</v-list-item-title>
                  </v-list-item>
                </template>
              </v-tooltip>
            </v-list>
          </v-menu>
        </template>

        <!-- Expanded row showing existing orders -->
        <template #expanded-row="{ item, columns }">
          <tr class="expanded-row">
            <td :colspan="columns.length" class="pa-0">
              <div class="bg-grey-darken-4 pa-3">
                <!-- Sell Orders Section -->
                <template v-if="getSellOrdersForItem(item).length > 0">
                  <div class="text-caption text-medium-emphasis mb-2">
                    <v-icon size="small" class="mr-1" color="success">mdi-tag</v-icon>
                    Sell Orders
                  </div>
                  <v-table density="compact" class="bg-transparent mb-3">
                    <thead>
                      <tr>
                        <th class="text-left">Currency</th>
                        <th class="text-right">Price</th>
                        <th class="text-right">Available</th>
                        <th class="text-left">Type</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="order in getSellOrdersForItem(item)"
                        :key="`sell-${order.id}`"
                        class="order-row"
                        @click="viewSellOrder(order)"
                      >
                        <td>
                          <v-chip size="x-small" variant="tonal">{{ order.currency }}</v-chip>
                        </td>
                        <td class="text-right font-weight-medium">
                          <template v-if="order.pricingMode === 'dynamic'">
                            <span v-if="order.effectivePrice" class="text-info">
                              {{ order.effectivePrice.toFixed(2) }}
                            </span>
                            <span v-else class="text-medium-emphasis">Dynamic</span>
                          </template>
                          <template v-else>{{ order.price.toFixed(2) }}</template>
                        </td>
                        <td class="text-right">{{ order.remainingQuantity.toLocaleString() }}</td>
                        <td>
                          <v-chip
                            size="x-small"
                            :color="order.orderType === 'internal' ? 'primary' : 'warning'"
                            variant="tonal"
                          >
                            {{ order.orderType }}
                          </v-chip>
                        </td>
                        <td class="text-right">
                          <div class="d-flex justify-end ga-1">
                            <v-btn
                              size="small"
                              variant="tonal"
                              color="primary"
                              prepend-icon="mdi-pencil"
                              @click.stop="editSellOrder(order)"
                            >
                              Edit
                            </v-btn>
                            <v-btn
                              size="small"
                              variant="tonal"
                              color="error"
                              icon="mdi-delete"
                              @click.stop="confirmDeleteSellOrder(order)"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </template>

                <!-- Buy Orders Section -->
                <template v-if="getBuyOrdersForItem(item).length > 0">
                  <div class="text-caption text-medium-emphasis mb-2">
                    <v-icon size="small" class="mr-1" color="warning">mdi-cart</v-icon>
                    Buy Orders
                  </div>
                  <v-table density="compact" class="bg-transparent">
                    <thead>
                      <tr>
                        <th class="text-left">Currency</th>
                        <th class="text-right">Price</th>
                        <th class="text-right">Quantity</th>
                        <th class="text-left">Type</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="order in getBuyOrdersForItem(item)"
                        :key="`buy-${order.id}`"
                        class="order-row"
                        @click="viewBuyOrder(order)"
                      >
                        <td>
                          <v-chip size="x-small" variant="tonal">{{ order.currency }}</v-chip>
                        </td>
                        <td class="text-right font-weight-medium">
                          <template v-if="order.pricingMode === 'dynamic'">
                            <span v-if="order.effectivePrice" class="text-info">
                              {{ order.effectivePrice.toFixed(2) }}
                            </span>
                            <span v-else class="text-medium-emphasis">Dynamic</span>
                          </template>
                          <template v-else>{{ order.price.toFixed(2) }}</template>
                        </td>
                        <td class="text-right">{{ order.remainingQuantity.toLocaleString() }}</td>
                        <td>
                          <v-chip
                            size="x-small"
                            :color="order.orderType === 'internal' ? 'primary' : 'warning'"
                            variant="tonal"
                          >
                            {{ order.orderType }}
                          </v-chip>
                        </td>
                        <td class="text-right">
                          <div class="d-flex justify-end ga-1">
                            <v-btn
                              size="small"
                              variant="tonal"
                              color="primary"
                              prepend-icon="mdi-pencil"
                              @click.stop="editBuyOrder(order)"
                            >
                              Edit
                            </v-btn>
                            <v-btn
                              size="small"
                              variant="tonal"
                              color="error"
                              icon="mdi-delete"
                              @click.stop="confirmDeleteBuyOrder(order)"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </template>
              </div>
            </td>
          </tr>
        </template>

        <template #no-data>
          <div class="text-center py-8">
            <v-icon size="64" color="grey-lighten-1">mdi-package-variant</v-icon>
            <p class="text-h6 mt-4">No inventory items</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="hasActiveFilters">
                No items match your filters.
                <a href="#" @click.prevent="clearFilters">Clear filters</a>
              </template>
              <template v-else-if="!fioConfigured">
                No inventory synced yet.
                <router-link to="/account?tab=fio">Configure FIO</router-link>
                to get started.
              </template>
              <template v-else> Sync your FIO inventory to see your items here </template>
            </p>
            <v-btn
              v-if="!hasActiveFilters && fioConfigured"
              color="primary"
              class="mt-4"
              prepend-icon="mdi-sync"
              :loading="syncing"
              @click="syncInventory"
            >
              Sync from FIO
            </v-btn>
            <v-btn
              v-if="!hasActiveFilters && !fioConfigured"
              color="primary"
              class="mt-4"
              prepend-icon="mdi-cog"
              to="/account?tab=fio"
            >
              Configure FIO
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Order Dialog -->
    <OrderDialog
      v-model="orderDialog"
      initial-tab="sell"
      :inventory-item="selectedItem"
      @created="onOrderCreated"
    />

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-model="orderDetailDialog"
      :order-type="orderDetailType"
      :order-id="orderDetailId"
      @updated="onOrderUpdated"
      @deleted="onOrderDeleted"
    />

    <!-- Sell Order Edit Dialog -->
    <SellOrderEditDialog v-model="editSellDialog" :order="editingSellOrder" @saved="onEditSaved" />

    <!-- Buy Order Edit Dialog -->
    <BuyOrderEditDialog v-model="editBuyDialog" :order="editingBuyOrder" @saved="onEditSaved" />

    <!-- Delete Confirmation Dialog -->
    <ConfirmationDialog
      v-model="deleteDialog"
      :title="`Delete ${deletingOrderType === 'sell' ? 'Sell' : 'Buy'} Order?`"
      :message="`Are you sure you want to delete this ${deletingOrderType} order? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      icon="mdi-delete-alert"
      icon-color="error"
      :loading="deleting"
      @confirm="executeDelete"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type FioInventoryItem,
  type SellOrderResponse,
  type BuyOrderResponse,
} from '../services/api'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import {
  useSnackbar,
  useDisplayHelpers,
  useFormatters,
  useUrlFilters,
  useUrlState,
} from '../composables'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import SellOrderEditDialog from '../components/SellOrderEditDialog.vue'
import BuyOrderEditDialog from '../components/BuyOrderEditDialog.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import FioAgeChip from '../components/FioAgeChip.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import { localizeMaterialCategory } from '../utils/materials'
import type { CommodityCategory } from '@kawakawa/types'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay } = useDisplayHelpers()
const { formatDateTime, formatRelativeTime, getSyncStatusColor } = useFormatters()

// Check if FIO is configured
const fioConfigured = computed(() => {
  return settingsStore.hasFioCredentials.value
})

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)

// Check if user can create any orders at all
const canCreateAnyOrders = computed(
  () => canCreateInternalOrders.value || canCreatePartnerOrders.value
)

interface LastSync {
  lastSyncedAt: string | null
  fioUploadedAt: string | null
}

const headers = [
  { title: '', key: 'data-table-expand', sortable: false, width: 40 },
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Category', key: 'commodityCategory', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'FIO Age', key: 'fioUploadedAt', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

// Check if icons are enabled for dynamic row height
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

const inventory = ref<FioInventoryItem[]>([])
const loading = ref(false)
const syncing = ref(false)
const lastSync = ref<LastSync>({ lastSyncedAt: null, fioUploadedAt: null })

// Orders for showing in expanded rows
const sellOrders = ref<SellOrderResponse[]>([])
const buyOrders = ref<BuyOrderResponse[]>([])
const loadingOrders = ref(false)
const expandedItems = ref<string[]>([]) // Track expanded rows by item id (as string)

const orderDialog = ref(false)
const selectedItem = ref<FioInventoryItem | null>(null)

// Order detail dialog state
const orderDetailDialog = ref(false)
const orderDetailType = ref<'sell' | 'buy'>('sell')
const orderDetailId = ref<number>(0)

// Edit dialog state
const editSellDialog = ref(false)
const editingSellOrder = ref<SellOrderResponse | null>(null)
const editBuyDialog = ref(false)
const editingBuyOrder = ref<BuyOrderResponse | null>(null)

// Delete dialog state
const deleteDialog = ref(false)
const deletingOrderType = ref<'sell' | 'buy'>('sell')
const deletingOrderId = ref<number>(0)
const deleting = ref(false)

// Filters with URL deep linking
const { filters, hasActiveFilters, clearFilters, setFilter } = useUrlFilters({
  schema: {
    commodity: { type: 'array' },
    location: { type: 'array' },
    category: { type: 'string' },
    locationType: { type: 'string' },
    storageType: { type: 'string' },
  },
})
const filtersExpanded = ref(false)

// Search with URL deep linking
const search = useUrlState<string | null>({
  param: 'search',
  defaultValue: null,
  debounce: 150,
})

// Computed filter options based on inventory data
const commodityOptions = computed((): KeyValueItem[] => {
  const tickers = new Set(inventory.value.map(i => i.commodityTicker))
  return Array.from(tickers).map(ticker => ({
    key: ticker,
    display: getCommodityDisplay(ticker),
  }))
})

const categoryOptions = computed(() => {
  const categories = new Set(inventory.value.map(i => i.commodityCategory).filter(Boolean))
  return Array.from(categories)
    .sort()
    .map(cat => ({
      title: localizeMaterialCategory(cat as CommodityCategory),
      value: cat,
    }))
})

const locationOptions = computed((): KeyValueItem[] => {
  const locations = new Set(
    inventory.value.map(i => i.locationId).filter((id): id is string => id !== null)
  )
  return Array.from(locations).map(id => ({
    key: id,
    display: getLocationDisplay(id),
  }))
})

const locationTypeOptions = computed(() => {
  const types = new Set(inventory.value.map(i => i.locationType).filter(Boolean))
  return Array.from(types).sort() as string[]
})

const storageTypeOptions = computed(() => {
  const types = new Set(inventory.value.map(i => i.storageType).filter(Boolean))
  return Array.from(types).sort() as string[]
})

// hasActiveFilters, clearFilters, and setFilter are provided by useUrlFilters

const filteredInventory = computed(() => {
  let result = inventory.value

  // Apply array filters (multi-select)
  if (filters.value.commodity.length > 0) {
    result = result.filter(i => filters.value.commodity.includes(i.commodityTicker))
  }
  if (filters.value.location.length > 0) {
    result = result.filter(i => i.locationId && filters.value.location.includes(i.locationId))
  }

  // Apply string filters (single-select)
  if (filters.value.category) {
    result = result.filter(i => i.commodityCategory === filters.value.category)
  }
  if (filters.value.locationType) {
    result = result.filter(i => i.locationType === filters.value.locationType)
  }
  if (filters.value.storageType) {
    result = result.filter(i => i.storageType === filters.value.storageType)
  }

  // Apply search
  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      item =>
        item.commodityTicker.toLowerCase().includes(searchLower) ||
        item.commodityName?.toLowerCase().includes(searchLower) ||
        item.locationId?.toLowerCase().includes(searchLower) ||
        item.locationName?.toLowerCase().includes(searchLower)
    )
  }

  return result
})

const loadInventory = async () => {
  try {
    loading.value = true
    inventory.value = await api.fioInventory.get()
  } catch (error) {
    console.error('Failed to load inventory', error)
    showSnackbar('Failed to load inventory', 'error')
  } finally {
    loading.value = false
  }
}

const loadLastSync = async () => {
  try {
    lastSync.value = await api.fioInventory.getLastSync()
  } catch (error) {
    console.error('Failed to load last sync time', error)
  }
}

const syncInventory = async () => {
  try {
    syncing.value = true
    const result = await api.fioInventory.sync()
    if (result.success) {
      showSnackbar(`Synced ${result.inserted} items from ${result.storageLocations} locations`)
      await loadInventory()
      await loadLastSync()
    } else {
      showSnackbar(`Sync completed with errors: ${result.errors.join(', ')}`, 'warning')
    }
  } catch (error) {
    console.error('Failed to sync inventory', error)
    const message = error instanceof Error ? error.message : 'Failed to sync inventory'
    showSnackbar(message, 'error')
  } finally {
    syncing.value = false
  }
}

const openSellDialog = (item: FioInventoryItem) => {
  selectedItem.value = item
  orderDialog.value = true
}

const onOrderCreated = (type: 'buy' | 'sell') => {
  showSnackbar(`${type === 'buy' ? 'Buy' : 'Sell'} order created successfully`)
  // Refresh orders to show the new order
  loadOrders()
}

// Load user's orders (both sell and buy)
const loadOrders = async () => {
  try {
    loadingOrders.value = true
    const [sellData, buyData] = await Promise.all([api.sellOrders.list(), api.buyOrders.list()])
    sellOrders.value = sellData
    buyOrders.value = buyData
  } catch (error) {
    console.error('Failed to load orders', error)
  } finally {
    loadingOrders.value = false
  }
}

// Get existing sell orders for an inventory item (matches commodity + location)
const getSellOrdersForItem = (item: FioInventoryItem): SellOrderResponse[] => {
  return sellOrders.value.filter(
    order => order.commodityTicker === item.commodityTicker && order.locationId === item.locationId
  )
}

// Get existing buy orders for an inventory item (matches commodity + location)
const getBuyOrdersForItem = (item: FioInventoryItem): BuyOrderResponse[] => {
  return buyOrders.value.filter(
    order => order.commodityTicker === item.commodityTicker && order.locationId === item.locationId
  )
}

// Check if an inventory item has existing orders
const hasOrders = (item: FioInventoryItem): boolean => {
  return getSellOrdersForItem(item).length > 0 || getBuyOrdersForItem(item).length > 0
}

// Open edit dialog for a sell order
const editSellOrder = (order: SellOrderResponse) => {
  editingSellOrder.value = order
  editSellDialog.value = true
}

// Open edit dialog for a buy order
const editBuyOrder = (order: BuyOrderResponse) => {
  editingBuyOrder.value = order
  editBuyDialog.value = true
}

// Open detail dialog for a sell order (clicking on the row)
const viewSellOrder = (order: SellOrderResponse) => {
  orderDetailType.value = 'sell'
  orderDetailId.value = order.id
  orderDetailDialog.value = true
}

// Open detail dialog for a buy order (clicking on the row)
const viewBuyOrder = (order: BuyOrderResponse) => {
  orderDetailType.value = 'buy'
  orderDetailId.value = order.id
  orderDetailDialog.value = true
}

// Handle edit dialog saved
const onEditSaved = () => {
  showSnackbar('Order updated successfully')
  loadOrders()
}

// Confirm delete sell order
const confirmDeleteSellOrder = (order: SellOrderResponse) => {
  deletingOrderType.value = 'sell'
  deletingOrderId.value = order.id
  deleteDialog.value = true
}

// Confirm delete buy order
const confirmDeleteBuyOrder = (order: BuyOrderResponse) => {
  deletingOrderType.value = 'buy'
  deletingOrderId.value = order.id
  deleteDialog.value = true
}

// Execute the delete
const executeDelete = async () => {
  try {
    deleting.value = true
    if (deletingOrderType.value === 'sell') {
      await api.sellOrders.delete(deletingOrderId.value)
    } else {
      await api.buyOrders.delete(deletingOrderId.value)
    }
    showSnackbar(`${deletingOrderType.value === 'sell' ? 'Sell' : 'Buy'} order deleted`)
    deleteDialog.value = false
    loadOrders()
  } catch (error) {
    console.error('Failed to delete order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete order'
    showSnackbar(message, 'error')
  } finally {
    deleting.value = false
  }
}

// Handle order updated from detail dialog
const onOrderUpdated = () => {
  loadOrders()
}

// Handle order deleted from detail dialog
const onOrderDeleted = () => {
  loadOrders()
}

onMounted(() => {
  loadInventory()
  loadLastSync()
  loadOrders()
})
</script>

<style scoped>
.clickable-cell {
  cursor: pointer;
  transition: color 0.2s;
}

.clickable-cell:hover {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}

.order-row {
  cursor: pointer;
  transition: background-color 0.2s;
}

.order-row:hover {
  background-color: rgba(var(--v-theme-primary), 0.08);
}
</style>

<style>
/* Unscoped: align all filter inputs to same height */
.filter-row .v-field__input {
  min-height: 48px;
  padding-top: 12px;
  padding-bottom: 2px;
}

/* Unscoped: taller rows when icons are enabled */
.icon-rows tbody tr td {
  height: 64px !important;
}
</style>
