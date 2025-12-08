<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h4">Price Lists</h1>
      <v-btn variant="text" to="/prices/adjustments">
        <v-icon start>mdi-tune</v-icon>
        Adjustments
      </v-btn>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Exchange Tabs -->
    <v-card class="mb-4">
      <v-tabs v-model="selectedExchange" slider-color="primary">
        <v-tab v-for="exchange in exchanges" :key="exchange.code" :value="exchange.code">
          {{ exchange.code }}
          <v-chip v-if="exchange.locationId" size="x-small" class="ml-2" variant="tonal">
            {{ exchange.locationId }}
          </v-chip>
        </v-tab>
      </v-tabs>
    </v-card>

    <!-- Filters & Actions -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="6" sm="3">
            <KeyValueAutocomplete
              v-model="filters.location"
              :items="locationOptions"
              label="Location"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="3">
            <KeyValueAutocomplete
              v-model="filters.commodity"
              :items="commodityOptions"
              label="Commodity"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select
              v-model="filters.category"
              :items="categoryOptions"
              label="Category"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select
              v-model="filters.currency"
              :items="currencies"
              label="Currency"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
        </v-row>
        <v-row dense class="mt-2">
          <v-col cols="12" class="d-flex align-center justify-space-between flex-wrap ga-2">
            <div class="d-flex ga-2">
              <v-btn
                v-if="hasActiveFilters"
                variant="text"
                color="primary"
                size="small"
                @click="clearFilters"
              >
                Clear Filters
              </v-btn>
            </div>
            <div class="d-flex ga-2 flex-wrap">
              <v-btn
                v-if="isFioExchange && canSyncFio"
                variant="outlined"
                color="primary"
                size="small"
                :loading="syncing"
                @click="syncFioPrices"
              >
                <v-icon start>mdi-sync</v-icon>
                Sync FIO
              </v-btn>
              <v-menu v-if="prices.length > 0">
                <template #activator="{ props }">
                  <v-btn v-bind="props" variant="outlined" size="small">
                    <v-icon start>mdi-download</v-icon>
                    Export
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item @click="exportBasePrices">
                    <v-list-item-title>Base Prices (CSV)</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-if="filters.location && filters.currency"
                    @click="exportEffectivePrices"
                  >
                    <v-list-item-title>Effective Prices (CSV)</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
              <v-menu v-if="canImportPrices && !isFioExchange">
                <template #activator="{ props }">
                  <v-btn v-bind="props" variant="outlined" size="small">
                    <v-icon start>mdi-upload</v-icon>
                    Import
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item @click="csvImportDialog = true">
                    <template #prepend>
                      <v-icon>mdi-file-delimited</v-icon>
                    </template>
                    <v-list-item-title>From CSV File</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="googleSheetsImportDialog = true">
                    <template #prepend>
                      <v-icon>mdi-google-spreadsheet</v-icon>
                    </template>
                    <v-list-item-title>From Google Sheets</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
              <v-btn
                v-if="canManagePrices && !isFioExchange"
                color="primary"
                size="small"
                @click="openCreateDialog"
              >
                <v-icon start>mdi-plus</v-icon>
                Add Price
              </v-btn>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Sync Status (for FIO exchanges) -->
    <v-alert
      v-if="isFioExchange && syncStatus"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
    >
      <template #prepend>
        <v-icon>mdi-information</v-icon>
      </template>
      Last synced: {{ syncStatus.lastSyncedAt ? formatDate(syncStatus.lastSyncedAt) : 'Never' }}
      <span class="text-medium-emphasis ml-2">({{ syncStatus.priceCount }} prices)</span>
    </v-alert>

    <!-- Price Table -->
    <v-card>
      <v-card-title>
        <v-row align="center">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="search"
              prepend-icon="mdi-magnify"
              label="Search prices..."
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
          <v-col cols="12" md="6" class="text-right">
            <span class="text-body-2 text-medium-emphasis">
              {{ filteredPrices.length }} price(s)
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredPrices"
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
            v-if="getCommodityCategory(item.commodityTicker)"
            class="text-caption text-medium-emphasis clickable-cell"
            @click="setFilter('category', getCommodityCategory(item.commodityTicker))"
          >
            {{ getCommodityCategory(item.commodityTicker) }}
          </div>
        </template>

        <template #item.locationId="{ item }">
          <div
            class="font-weight-medium clickable-cell"
            @click="setFilter('location', item.locationId)"
          >
            {{ getLocationDisplay(item.locationId) }}
          </div>
        </template>

        <template #item.price="{ item }">
          <span class="font-weight-medium">
            {{
              parseFloat(item.price).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}
          </span>
          <span class="text-caption text-medium-emphasis ml-1">{{ item.currency }}</span>
        </template>

        <template #item.source="{ item }">
          <v-chip :color="getSourceColor(item.source)" size="small" variant="tonal">
            {{ formatSource(item.source) }}
          </v-chip>
        </template>

        <template #item.updatedAt="{ item }">
          <span class="text-caption">{{ formatDate(item.updatedAt) }}</span>
        </template>

        <template #item.actions="{ item }">
          <v-menu v-if="canManagePrices && canEditPrice(item)">
            <template #activator="{ props }">
              <v-btn v-bind="props" icon size="small" variant="text">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="openEditDialog(item)">
                <template #prepend>
                  <v-icon color="primary">mdi-pencil</v-icon>
                </template>
                <v-list-item-title>Edit</v-list-item-title>
              </v-list-item>
              <v-list-item @click="openDeleteDialog(item)">
                <template #prepend>
                  <v-icon color="error">mdi-delete</v-icon>
                </template>
                <v-list-item-title>Delete</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>

        <template #no-data>
          <div class="text-center py-8">
            <v-icon size="64" color="grey-lighten-1">mdi-currency-usd-off</v-icon>
            <p class="text-h6 mt-4">No prices found</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="hasActiveFilters">
                No prices match your filters.
                <a href="#" @click.prevent="clearFilters">Clear filters</a>
              </template>
              <template v-else-if="isFioExchange"> Sync prices from FIO to get started. </template>
              <template v-else> Add prices manually to get started. </template>
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit Price Dialog -->
    <v-dialog v-model="priceDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>{{ editingPrice ? 'Edit Price' : 'Add Price' }}</v-card-title>
        <v-card-text>
          <v-form ref="priceFormRef">
            <KeyValueAutocomplete
              v-if="!editingPrice"
              v-model="priceForm.commodityTicker"
              :items="allCommodityOptions"
              label="Commodity"
              :rules="[v => !!v || 'Commodity is required']"
              class="mb-2"
            />
            <v-alert v-else type="info" variant="tonal" density="compact" class="mb-4">
              {{ getCommodityDisplay(editingPrice.commodityTicker) }}
            </v-alert>

            <KeyValueAutocomplete
              v-if="!editingPrice"
              v-model="priceForm.locationId"
              :items="allLocationOptions"
              label="Location"
              :rules="[v => !!v || 'Location is required']"
              class="mb-2"
            />
            <v-alert v-else type="info" variant="tonal" density="compact" class="mb-4">
              {{ getLocationDisplay(editingPrice.locationId) }}
            </v-alert>

            <v-row>
              <v-col cols="8">
                <v-text-field
                  v-model.number="priceForm.price"
                  label="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  :rules="[v => v > 0 || 'Price must be positive']"
                />
              </v-col>
              <v-col cols="4">
                <v-select
                  v-model="priceForm.currency"
                  :items="currencies"
                  label="Currency"
                  :rules="[v => !!v || 'Currency is required']"
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="priceDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="savePrice">
            {{ editingPrice ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Price</v-card-title>
        <v-card-text>
          Are you sure you want to delete the price for
          <strong>{{
            deletingPrice ? getCommodityDisplay(deletingPrice.commodityTicker) : ''
          }}</strong>
          at <strong>{{ deletingPrice ? getLocationDisplay(deletingPrice.locationId) : '' }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- CSV Import Dialog -->
    <PriceImportDialog
      v-model="csvImportDialog"
      :exchange-code="selectedExchange"
      @imported="handleImportComplete"
    />

    <!-- Google Sheets Import Dialog -->
    <GoogleSheetsImportDialog
      v-model="googleSheetsImportDialog"
      :exchange-code="selectedExchange"
      @imported="handleImportComplete"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Currency } from '@kawakawa/types'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type PriceListResponse,
  type FioExchangeResponse,
  type ExchangeSyncStatus,
  type CsvImportResult,
} from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import PriceImportDialog from '../components/PriceImportDialog.vue'
import GoogleSheetsImportDialog from '../components/GoogleSheetsImportDialog.vue'

const userStore = useUserStore()

// State
const loading = ref(false)
const syncing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const search = ref('')

const exchanges = ref<FioExchangeResponse[]>([])
const selectedExchange = ref<string>('KAWA')
const prices = ref<PriceListResponse[]>([])
const syncStatuses = ref<ExchangeSyncStatus[]>([])

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Filters
const filters = ref<{
  location: string | null
  commodity: string | null
  category: string | null
  currency: Currency | null
}>({
  location: null,
  commodity: null,
  category: null,
  currency: null,
})

// Dialogs
const priceDialog = ref(false)
const deleteDialog = ref(false)
const csvImportDialog = ref(false)
const googleSheetsImportDialog = ref(false)
const editingPrice = ref<PriceListResponse | null>(null)
const deletingPrice = ref<PriceListResponse | null>(null)
const priceFormRef = ref()

const priceForm = ref({
  commodityTicker: '',
  locationId: '',
  price: 0,
  currency: 'CIS' as Currency,
})

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Computed
const isFioExchange = computed(() => {
  return selectedExchange.value !== 'KAWA'
})

const syncStatus = computed(() => {
  return syncStatuses.value.find(s => s.exchangeCode === selectedExchange.value)
})

const canManagePrices = computed(() => userStore.hasPermission(PERMISSIONS.PRICES_MANAGE))
const canSyncFio = computed(() => userStore.hasPermission(PERMISSIONS.PRICES_SYNC_FIO))
const canImportPrices = computed(() => userStore.hasPermission(PERMISSIONS.PRICES_IMPORT))

const headers = computed(() => {
  const base = [
    { title: 'Commodity', key: 'commodityTicker', sortable: true },
    { title: 'Location', key: 'locationId', sortable: true },
    { title: 'Price', key: 'price', sortable: true, align: 'end' as const },
    { title: 'Source', key: 'source', sortable: true },
    { title: 'Updated', key: 'updatedAt', sortable: true },
  ]
  if (canManagePrices.value) {
    base.push({ title: '', key: 'actions', sortable: false, width: 50 } as (typeof base)[0])
  }
  return base
})

const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(v => v !== null)
})

// Display helpers
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const getCommodityCategory = (ticker: string): string | null => {
  return commodityService.getCommodityCategory(ticker)
}

// Filter options from loaded prices
const locationOptions = computed((): KeyValueItem[] => {
  const locations = new Set(prices.value.map(p => p.locationId))
  return Array.from(locations).map(id => ({
    key: id,
    display: getLocationDisplay(id),
  }))
})

const commodityOptions = computed((): KeyValueItem[] => {
  const tickers = new Set(prices.value.map(p => p.commodityTicker))
  return Array.from(tickers).map(ticker => ({
    key: ticker,
    display: getCommodityDisplay(ticker),
  }))
})

const categoryOptions = computed(() => {
  const categories = new Set(
    prices.value.map(p => getCommodityCategory(p.commodityTicker)).filter(Boolean)
  )
  return Array.from(categories).sort() as string[]
})

// All options for create dialog (use sync methods - data is prefetched on app startup)
const allLocationOptions = computed((): KeyValueItem[] => {
  return locationService.getAllLocationsSync().map(loc => ({
    key: loc.id,
    display: getLocationDisplay(loc.id),
  }))
})

const allCommodityOptions = computed((): KeyValueItem[] => {
  return commodityService.getAllCommoditiesSync().map(c => ({
    key: c.ticker,
    display: getCommodityDisplay(c.ticker),
  }))
})

// Filtered prices
const filteredPrices = computed(() => {
  let result = prices.value

  if (filters.value.location) {
    result = result.filter(p => p.locationId === filters.value.location)
  }
  if (filters.value.commodity) {
    result = result.filter(p => p.commodityTicker === filters.value.commodity)
  }
  if (filters.value.category) {
    result = result.filter(p => getCommodityCategory(p.commodityTicker) === filters.value.category)
  }
  if (filters.value.currency) {
    result = result.filter(p => p.currency === filters.value.currency)
  }

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      p =>
        p.commodityTicker.toLowerCase().includes(searchLower) ||
        (p.commodityName?.toLowerCase().includes(searchLower) ?? false) ||
        p.locationId.toLowerCase().includes(searchLower) ||
        (p.locationName?.toLowerCase().includes(searchLower) ?? false) ||
        (getCommodityCategory(p.commodityTicker)?.toLowerCase().includes(searchLower) ?? false)
    )
  }

  return result
})

// Methods
const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString()
}

const formatSource = (source: string): string => {
  const map: Record<string, string> = {
    manual: 'Manual',
    csv_import: 'CSV Import',
    google_sheets: 'Google Sheets',
    fio_exchange: 'FIO',
  }
  return map[source] || source
}

const getSourceColor = (source: string): string => {
  const map: Record<string, string> = {
    manual: 'primary',
    csv_import: 'info',
    google_sheets: 'success',
    fio_exchange: 'warning',
  }
  return map[source] || 'default'
}

const canEditPrice = (price: PriceListResponse): boolean => {
  // Can only edit non-FIO prices
  return price.source !== 'fio_exchange'
}

const setFilter = (key: keyof typeof filters.value, value: string | null) => {
  if (key === 'currency') {
    filters.value[key] = value as Currency | null
  } else {
    filters.value[key] = value
  }
}

const clearFilters = () => {
  filters.value = {
    location: null,
    commodity: null,
    category: null,
    currency: null,
  }
}

const loadExchanges = async () => {
  try {
    exchanges.value = await api.fioExchanges.list()
    // Default to KAWA
    if (!exchanges.value.find(e => e.code === selectedExchange.value)) {
      selectedExchange.value = exchanges.value[0]?.code ?? 'KAWA'
    }
  } catch (error) {
    console.error('Failed to load exchanges:', error)
    showSnackbar('Failed to load exchanges', 'error')
  }
}

const loadPrices = async () => {
  try {
    loading.value = true
    prices.value = await api.prices.getByExchange(selectedExchange.value)
  } catch (error) {
    console.error('Failed to load prices:', error)
    showSnackbar('Failed to load prices', 'error')
  } finally {
    loading.value = false
  }
}

const loadSyncStatus = async () => {
  try {
    syncStatuses.value = await api.fioPriceSync.getStatus()
  } catch (error) {
    console.error('Failed to load sync status:', error)
  }
}

const syncFioPrices = async () => {
  try {
    syncing.value = true
    const result = await api.fioPriceSync.syncExchange(selectedExchange.value)
    if (result.success) {
      showSnackbar(`Synced ${result.totalUpdated} prices`)
      await loadPrices()
      await loadSyncStatus()
    } else {
      showSnackbar(result.errors.join(', ') || 'Sync failed', 'error')
    }
  } catch (error) {
    console.error('Failed to sync prices:', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to sync prices', 'error')
  } finally {
    syncing.value = false
  }
}

const exportBasePrices = () => {
  const queryParts: string[] = []
  if (filters.value.location)
    queryParts.push(`location=${encodeURIComponent(filters.value.location)}`)
  if (filters.value.currency)
    queryParts.push(`currency=${encodeURIComponent(filters.value.currency)}`)

  const query = queryParts.length > 0 ? '?' + queryParts.join('&') : ''
  window.open(`/api/prices/export/${selectedExchange.value}${query}`, '_blank')
}

const exportEffectivePrices = () => {
  if (!filters.value.location || !filters.value.currency) {
    showSnackbar('Select a location and currency to export effective prices', 'error')
    return
  }
  const url = `/api/prices/export/${selectedExchange.value}/${filters.value.location}/effective?currency=${filters.value.currency}`
  window.open(url, '_blank')
}

const openCreateDialog = () => {
  editingPrice.value = null
  priceForm.value = {
    commodityTicker: '',
    locationId: '',
    price: 0,
    currency: 'CIS',
  }
  priceDialog.value = true
}

const openEditDialog = (price: PriceListResponse) => {
  editingPrice.value = price
  priceForm.value = {
    commodityTicker: price.commodityTicker,
    locationId: price.locationId,
    price: parseFloat(price.price),
    currency: price.currency,
  }
  priceDialog.value = true
}

const savePrice = async () => {
  const { valid } = await priceFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    if (editingPrice.value) {
      await api.prices.update(editingPrice.value.id, {
        price: priceForm.value.price,
        currency: priceForm.value.currency,
      })
      showSnackbar('Price updated')
    } else {
      await api.prices.create({
        exchangeCode: selectedExchange.value,
        commodityTicker: priceForm.value.commodityTicker,
        locationId: priceForm.value.locationId,
        price: priceForm.value.price,
        currency: priceForm.value.currency,
      })
      showSnackbar('Price created')
    }
    priceDialog.value = false
    await loadPrices()
  } catch (error) {
    console.error('Failed to save price:', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to save price', 'error')
  } finally {
    saving.value = false
  }
}

const openDeleteDialog = (price: PriceListResponse) => {
  deletingPrice.value = price
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingPrice.value) return

  try {
    deleting.value = true
    await api.prices.delete(deletingPrice.value.id)
    showSnackbar('Price deleted')
    deleteDialog.value = false
    await loadPrices()
  } catch (error) {
    console.error('Failed to delete price:', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete price', 'error')
  } finally {
    deleting.value = false
  }
}

// Import result handler
const handleImportComplete = async (result: CsvImportResult) => {
  const total = result.imported + result.updated
  if (total > 0) {
    showSnackbar(`Imported ${result.imported} new and updated ${result.updated} prices`)
    await loadPrices()
  } else if (result.skipped > 0) {
    showSnackbar(`Import completed with ${result.skipped} skipped rows`, 'error')
  }
}

// Watch for exchange changes
watch(selectedExchange, () => {
  loadPrices()
})

// Initialize
onMounted(async () => {
  await loadExchanges()
  await loadPrices()
  await loadSyncStatus()
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
