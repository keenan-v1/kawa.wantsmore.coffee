<template>
  <v-container>
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
              No inventory synced yet
            </div>
          </v-col>
          <v-col cols="12" md="6" class="text-md-right">
            <v-btn
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
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="4" lg="2">
            <v-select
              v-model="filters.commodity"
              :items="commodityOptions"
              label="Commodity"
              density="compact"
              clearable
              hide-details
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
            <v-select
              v-model="filters.location"
              :items="locationOptions"
              label="Location"
              density="compact"
              clearable
              hide-details
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
          <v-col cols="12" sm="6" md="4" lg="2" class="d-flex align-center">
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

        <!-- Active Filters Display -->
        <div v-if="hasActiveFilters" class="mt-3 d-flex flex-wrap ga-2">
          <v-chip
            v-if="filters.commodity"
            closable
            size="small"
            color="primary"
            @click:close="filters.commodity = null"
          >
            Commodity: {{ filters.commodity }}
          </v-chip>
          <v-chip
            v-if="filters.category"
            closable
            size="small"
            color="secondary"
            @click:close="filters.category = null"
          >
            Category: {{ filters.category }}
          </v-chip>
          <v-chip
            v-if="filters.location"
            closable
            size="small"
            color="info"
            @click:close="filters.location = null"
          >
            Location: {{ getLocationDisplay(filters.location) }}
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
        :headers="headers"
        :items="filteredInventory"
        :loading="loading"
        :items-per-page="25"
        class="elevation-0"
      >
        <template #item.commodityTicker="{ item }">
          <div
            class="font-weight-medium clickable-cell"
            @click="setFilter('commodity', item.commodityTicker)"
          >
            {{ getCommodityDisplay(item.commodityTicker) }}
          </div>
          <div
            v-if="item.commodityCategory"
            class="text-caption text-medium-emphasis clickable-cell"
            @click="setFilter('category', item.commodityCategory)"
          >
            {{ item.commodityCategory }}
          </div>
        </template>

        <template #item.locationId="{ item }">
          <div
            class="font-weight-medium clickable-cell"
            @click="setFilter('location', item.locationId)"
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

        <template #item.actions="{ item }">
          <!-- Desktop: show buttons -->
          <div class="d-none d-sm-flex ga-1">
            <v-tooltip location="top">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  color="success"
                  size="small"
                  variant="tonal"
                  @click="openSellDialog(item)"
                >
                  Sell
                </v-btn>
              </template>
              Create sell order
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
              <v-list-item @click="openSellDialog(item)">
                <template #prepend>
                  <v-icon color="success">mdi-tag</v-icon>
                </template>
                <v-list-item-title>Sell</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
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
              <template v-else>
                Sync your FIO inventory to see your items here
              </template>
            </p>
            <v-btn
              v-if="!hasActiveFilters"
              color="primary"
              class="mt-4"
              prepend-icon="mdi-sync"
              :loading="syncing"
              @click="syncInventory"
            >
              Sync from FIO
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Sell Order Dialog -->
    <SellOrderDialog
      v-model="sellDialog"
      :inventory-item="selectedItem"
      @created="onOrderCreated"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api, type FioInventoryItem } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import SellOrderDialog from '../components/SellOrderDialog.vue'

const userStore = useUserStore()

interface LastSync {
  lastSyncedAt: string | null
  fioUploadedAt: string | null
}

interface Filters {
  commodity: string | null
  category: string | null
  location: string | null
  locationType: string | null
  storageType: string | null
}

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string | null): string => {
  if (!locationId) return 'Unknown'
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const headers = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

const inventory = ref<FioInventoryItem[]>([])
const loading = ref(false)
const syncing = ref(false)
const search = ref('')
const lastSync = ref<LastSync>({ lastSyncedAt: null, fioUploadedAt: null })

const sellDialog = ref(false)
const selectedItem = ref<FioInventoryItem | null>(null)

// Filters
const filters = ref<Filters>({
  commodity: null,
  category: null,
  location: null,
  locationType: null,
  storageType: null,
})

// Computed filter options based on inventory data
const commodityOptions = computed(() => {
  const tickers = new Set(inventory.value.map(i => i.commodityTicker))
  return Array.from(tickers).sort()
})

const categoryOptions = computed(() => {
  const categories = new Set(inventory.value.map(i => i.commodityCategory).filter(Boolean))
  return Array.from(categories).sort() as string[]
})

const locationOptions = computed(() => {
  const locations = new Set(inventory.value.map(i => i.locationId).filter(Boolean))
  return Array.from(locations).sort().map(id => ({
    title: getLocationDisplay(id),
    value: id,
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

const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(v => v !== null)
})

const clearFilters = () => {
  filters.value = {
    commodity: null,
    category: null,
    location: null,
    locationType: null,
    storageType: null,
  }
}

const setFilter = (key: keyof Filters, value: string | null) => {
  if (value) {
    filters.value[key] = value
  }
}

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

const showSnackbar = (message: string, color: 'success' | 'error' | 'warning' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const filteredInventory = computed(() => {
  let result = inventory.value

  // Apply filters
  if (filters.value.commodity) {
    result = result.filter(i => i.commodityTicker === filters.value.commodity)
  }
  if (filters.value.category) {
    result = result.filter(i => i.commodityCategory === filters.value.category)
  }
  if (filters.value.location) {
    result = result.filter(i => i.locationId === filters.value.location)
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
    result = result.filter(item =>
      item.commodityTicker.toLowerCase().includes(searchLower) ||
      item.commodityName?.toLowerCase().includes(searchLower) ||
      item.locationId?.toLowerCase().includes(searchLower) ||
      item.locationName?.toLowerCase().includes(searchLower)
    )
  }

  return result
})

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString()
}

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const getSyncStatusColor = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours > 48) return 'error'
  if (diffHours > 24) return 'warning'
  return 'success'
}

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
  sellDialog.value = true
}

const onOrderCreated = () => {
  showSnackbar('Sell order created successfully')
}

onMounted(() => {
  loadInventory()
  loadLastSync()
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
</style>
