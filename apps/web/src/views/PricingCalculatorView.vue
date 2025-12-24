<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">Pricing Calculator</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Controls Card -->
    <v-card class="calculator-card mb-4">
      <v-card-text>
        <v-row dense align="center">
          <v-col cols="12" sm="4" md="3">
            <v-select
              v-model="selectedPriceList"
              :items="priceListOptions"
              item-title="title"
              item-value="value"
              label="Price List"
              density="compact"
              hide-details
              :loading="loadingPriceLists"
            />
          </v-col>
          <v-col cols="12" sm="4" md="3">
            <KeyValueAutocomplete
              v-model="selectedLocation"
              :items="locationOptions"
              :favorites="settingsStore.favoritedLocations.value"
              label="Location"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </v-col>
          <v-col v-if="hasFallbackPrices" cols="12" sm="4" md="6">
            <v-chip color="info" size="small" variant="tonal" prepend-icon="mdi-information">
              Some prices from {{ fallbackLocationDisplay }}
            </v-chip>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Calculator Table Card -->
    <v-card class="calculator-card">
      <v-card-text class="pa-4">
        <!-- Header -->
        <div class="calc-header d-flex align-center text-caption text-medium-emphasis mb-2">
          <div class="col-icon"></div>
          <div class="col-material">Material</div>
          <div class="col-amount text-right">Amount</div>
          <div class="col-price text-right">Unit Price</div>
          <div class="col-total text-right">Total</div>
          <div class="col-actions"></div>
        </div>

        <!-- Rows -->
        <div v-for="(row, index) in rows" :key="row.id" class="calc-row d-flex align-center">
          <div class="col-icon">
            <CommodityIcon
              v-if="row.commodityTicker && getCommodity(row.commodityTicker)"
              :commodity="getCommodity(row.commodityTicker)!"
              class="row-icon"
            />
          </div>
          <div class="col-material">
            <KeyValueAutocomplete
              :ref="el => setMaterialRef(index, el as FocusableComponent | null)"
              v-model="row.commodityTicker"
              :items="commodityOptions"
              :favorites="settingsStore.favoritedCommodities.value"
              :show-icons="hasIcons"
              label=""
              density="compact"
              hide-details
              variant="outlined"
              @update:favorites="settingsStore.updateSetting('market.favoritedCommodities', $event)"
              @update:model-value="onMaterialChange(index)"
              @keydown.tab="onMaterialTab($event, index)"
            />
          </div>
          <div class="col-amount">
            <v-text-field
              :ref="el => setAmountRef(index, el as FocusableComponent | null)"
              v-model.number="row.amount"
              type="number"
              min="0"
              placeholder="0"
              density="compact"
              hide-details
              variant="outlined"
              class="amount-input"
              @update:model-value="onAmountChange(index)"
              @keydown.tab="onAmountTab($event, index)"
            />
          </div>
          <div class="col-price text-right">
            <span v-if="getUnitPrice(row.commodityTicker) !== null" class="font-weight-medium">
              {{
                getUnitPrice(row.commodityTicker)!.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }}
              <span class="text-caption text-medium-emphasis ml-1">{{ currency }}</span>
            </span>
            <span v-else-if="row.commodityTicker" class="text-medium-emphasis">N/A</span>
          </div>
          <div class="col-total text-right">
            <span v-if="getRowTotal(row) !== null" class="font-weight-medium">
              {{
                getRowTotal(row)!.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }}
              <span class="text-caption text-medium-emphasis ml-1">{{ currency }}</span>
            </span>
          </div>
          <div class="col-actions">
            <v-btn
              v-if="rows.length > 1 && index < rows.length - 1"
              icon
              size="x-small"
              variant="text"
              color="error"
              @click="removeRow(index)"
            >
              <v-icon size="small">mdi-close</v-icon>
            </v-btn>
          </div>
        </div>

        <!-- Total -->
        <v-divider class="my-3" />
        <div class="calc-total d-flex align-center justify-end">
          <span class="font-weight-bold mr-4">Total:</span>
          <span class="font-weight-bold text-h6">
            {{
              grandTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}
            <span class="text-caption text-medium-emphasis ml-1">{{ currency }}</span>
          </span>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn variant="outlined" prepend-icon="mdi-plus" @click="addRow"> Add Row </v-btn>
        <v-btn
          variant="outlined"
          prepend-icon="mdi-delete-outline"
          :disabled="!hasFilledRows"
          @click="clearAll"
        >
          Clear
        </v-btn>
        <v-spacer />
        <v-btn
          variant="tonal"
          prepend-icon="mdi-content-copy"
          :disabled="!hasFilledRows"
          @click="copyAmounts"
        >
          Copy Amounts
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-content-copy"
          :disabled="!hasFilledRows"
          @click="copyAll"
        >
          Copy All
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import type { Currency } from '@kawakawa/types'
import { api, type EffectivePrice } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useSnackbar, useDisplayHelpers } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import CommodityIcon from '../components/CommodityIcon.vue'

interface CalculatorRow {
  id: number
  commodityTicker: string | null
  amount: number | null
}

interface PriceListOption {
  title: string
  value: string
  currency: Currency
  defaultLocationId: string | null
}

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay } = useDisplayHelpers()

// Get commodity object for icon display
const getCommodity = (ticker: string) => {
  const category = commodityService.getCommodityCategory(ticker)
  if (category === null) return null
  return {
    ticker,
    name: commodityService.getCommodityDisplay(ticker, 'name-only'),
    category,
  }
}

// Check if commodity icons are enabled
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Price list state
const loadingPriceLists = ref(false)
const priceLists = ref<PriceListOption[]>([])
const selectedPriceList = ref<string | null>(null)

// Location state
const loadingLocations = ref(false)
const locations = ref<KeyValueItem[]>([])
const selectedLocation = ref<string | null>(null)

// Effective prices state
const loadingPrices = ref(false)
const effectivePrices = ref<EffectivePrice[]>([])

// LocalStorage key
const STORAGE_KEY = 'kawakawa-calculator-rows'

// Calculator rows
let nextRowId = 1
const rows = ref<CalculatorRow[]>(loadRowsFromStorage())

function loadRowsFromStorage(): CalculatorRow[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CalculatorRow[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Update nextRowId to be higher than any existing id
        nextRowId = Math.max(...parsed.map(r => r.id)) + 1
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return [{ id: nextRowId++, commodityTicker: null, amount: null }]
}

function saveRowsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.value))
  } catch {
    // Ignore storage errors
  }
}

// Refs for focus management - using ComponentPublicInstance for template refs
interface FocusableComponent {
  focus?: () => void
}
const materialRefs = ref<Record<number, FocusableComponent | null>>({})
const amountRefs = ref<Record<number, FocusableComponent | null>>({})

const setMaterialRef = (index: number, el: FocusableComponent | null) => {
  materialRefs.value[index] = el
}

const setAmountRef = (index: number, el: FocusableComponent | null) => {
  amountRefs.value[index] = el
}

// Computed values
const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({
    title: `${pl.title} (${pl.currency})`,
    value: pl.value,
  }))
)

const locationOptions = computed((): KeyValueItem[] => locations.value)

const commodityOptions = computed((): KeyValueItem[] => {
  const commodities = commodityService.getAllCommoditiesSync()
  return commodities.map(c => ({
    key: c.ticker,
    display: getCommodityDisplay(c.ticker),
    name: c.name,
    category: c.category,
  }))
})

const selectedPriceListData = computed(() =>
  priceLists.value.find(pl => pl.value === selectedPriceList.value)
)

const currency = computed(() => selectedPriceListData.value?.currency ?? 'CIS')

const hasFallbackPrices = computed(() => effectivePrices.value.some(p => p.isFallback))

const fallbackLocationDisplay = computed(() => {
  const defaultLocId = selectedPriceListData.value?.defaultLocationId
  return defaultLocId ? getLocationDisplay(defaultLocId) : 'default location'
})

const priceMap = computed(() => {
  const map = new Map<string, number>()
  for (const price of effectivePrices.value) {
    map.set(price.commodityTicker, price.finalPrice)
  }
  return map
})

const getUnitPrice = (ticker: string | null): number | null => {
  if (!ticker) return null
  return priceMap.value.get(ticker) ?? null
}

const getRowTotal = (row: CalculatorRow): number | null => {
  const price = getUnitPrice(row.commodityTicker)
  if (price === null || !row.amount) return null
  return price * row.amount
}

const grandTotal = computed(() => {
  let total = 0
  for (const row of rows.value) {
    const rowTotal = getRowTotal(row)
    if (rowTotal !== null) {
      total += rowTotal
    }
  }
  return total
})

const hasFilledRows = computed(() =>
  rows.value.some(r => r.commodityTicker && r.amount && r.amount > 0)
)

// Load price lists
const loadPriceLists = async () => {
  try {
    loadingPriceLists.value = true
    const data = await api.priceLists.list()
    priceLists.value = data.map(pl => ({
      title: pl.name,
      value: pl.code,
      currency: pl.currency,
      defaultLocationId: pl.defaultLocationId,
    }))

    // Set default from user settings
    const defaultPriceList = settingsStore.defaultPriceList.value
    if (defaultPriceList && priceLists.value.some(pl => pl.value === defaultPriceList)) {
      selectedPriceList.value = defaultPriceList
    } else if (priceLists.value.length > 0) {
      selectedPriceList.value = priceLists.value[0].value
    }
  } catch (error) {
    console.error('Failed to load price lists', error)
    showSnackbar('Failed to load price lists', 'error')
  } finally {
    loadingPriceLists.value = false
  }
}

// Load locations
const loadLocations = async () => {
  try {
    loadingLocations.value = true
    const [data] = await Promise.all([
      locationService.getAllLocations(),
      locationService.loadUserLocations(),
    ])
    locations.value = data.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, userStore.getLocationDisplayMode()),
      locationType: l.type,
      isUserLocation: locationService.isUserLocation(l.id),
      storageTypes: locationService.getStorageTypes(l.id),
    }))

    // Set default location from price list's default
    if (selectedPriceListData.value?.defaultLocationId) {
      selectedLocation.value = selectedPriceListData.value.defaultLocationId
    } else if (locations.value.length > 0) {
      selectedLocation.value = locations.value[0].key
    }
  } catch (error) {
    console.error('Failed to load locations', error)
    showSnackbar('Failed to load locations', 'error')
  } finally {
    loadingLocations.value = false
  }
}

// Load effective prices
const loadEffectivePrices = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    effectivePrices.value = []
    return
  }

  try {
    loadingPrices.value = true
    effectivePrices.value = await api.prices.getEffective(
      selectedPriceList.value,
      selectedLocation.value,
      currency.value
    )
  } catch (error) {
    console.error('Failed to load effective prices', error)
    showSnackbar('Failed to load prices', 'error')
    effectivePrices.value = []
  } finally {
    loadingPrices.value = false
  }
}

// Row management
const addRow = () => {
  rows.value.push({ id: nextRowId++, commodityTicker: null, amount: null })
  // Focus the new row's material field
  nextTick(() => {
    const newIndex = rows.value.length - 1
    materialRefs.value[newIndex]?.focus?.()
  })
}

const removeRow = (index: number) => {
  rows.value.splice(index, 1)
}

const ensureEmptyLastRow = () => {
  const lastRow = rows.value[rows.value.length - 1]
  if (lastRow.commodityTicker || (lastRow.amount && lastRow.amount > 0)) {
    rows.value.push({ id: nextRowId++, commodityTicker: null, amount: null })
  }
}

const onMaterialChange = (index: number) => {
  if (index === rows.value.length - 1) {
    ensureEmptyLastRow()
  }
  // Focus the amount field after selecting a commodity
  nextTick(() => {
    amountRefs.value[index]?.focus?.()
  })
}

const onAmountChange = (index: number) => {
  if (index === rows.value.length - 1) {
    ensureEmptyLastRow()
  }
}

const onMaterialTab = (event: globalThis.KeyboardEvent, index: number) => {
  if (!event.shiftKey) {
    // Forward tab: focus amount field in same row
    event.preventDefault()
    nextTick(() => {
      amountRefs.value[index]?.focus?.()
    })
  }
}

const onAmountTab = (event: globalThis.KeyboardEvent, index: number) => {
  if (!event.shiftKey) {
    // Forward tab: focus material field in next row
    event.preventDefault()
    const nextIndex = index + 1
    if (nextIndex >= rows.value.length) {
      // Add new row if we're on the last one
      addRow()
    } else {
      nextTick(() => {
        materialRefs.value[nextIndex]?.focus?.()
      })
    }
  }
}

// Copy amounts only (space-separated: "TIC 100")
const copyAmounts = async () => {
  const text = rows.value
    .filter(r => r.commodityTicker && r.amount && r.amount > 0)
    .map(r => `${r.commodityTicker} ${r.amount}`)
    .join('\n')

  try {
    await navigator.clipboard.writeText(text)
    showSnackbar('Copied to clipboard')
  } catch (error) {
    console.error('Failed to copy to clipboard', error)
    showSnackbar('Failed to copy to clipboard', 'error')
  }
}

// Copy all data (CSV with ticker, amount, unit price, total)
const copyAll = async () => {
  const filledRows = rows.value.filter(r => r.commodityTicker && r.amount && r.amount > 0)
  const lines = filledRows.map(r => {
    const unitPrice = getUnitPrice(r.commodityTicker)
    const total = getRowTotal(r)
    return `${r.commodityTicker},${r.amount},${unitPrice ?? ''},${total ?? ''}`
  })
  const csv = `Ticker,Amount,Unit Price,Total\n${lines.join('\n')}\nTotal,,,${grandTotal.value}`

  try {
    await navigator.clipboard.writeText(csv)
    showSnackbar('Copied to clipboard')
  } catch (error) {
    console.error('Failed to copy to clipboard', error)
    showSnackbar('Failed to copy to clipboard', 'error')
  }
}

// Clear all rows
const clearAll = () => {
  rows.value = [{ id: nextRowId++, commodityTicker: null, amount: null }]
  saveRowsToStorage()
}

// Watch for price list changes to update default location
watch(selectedPriceList, newPriceList => {
  if (newPriceList) {
    const priceListData = priceLists.value.find(pl => pl.value === newPriceList)
    if (priceListData?.defaultLocationId) {
      selectedLocation.value = priceListData.defaultLocationId
    }
  }
})

// Watch for price list or location changes to reload prices
watch([selectedPriceList, selectedLocation], () => {
  loadEffectivePrices()
})

// Watch rows to persist to localStorage
watch(
  rows,
  () => {
    saveRowsToStorage()
  },
  { deep: true }
)

onMounted(async () => {
  await Promise.all([loadPriceLists(), loadLocations(), commodityService.prefetch()])
})
</script>

<style scoped>
/* Card responsive width and centering */
.calculator-card {
  width: 100%;
  margin-inline: auto;
}

@media (min-width: 1280px) {
  .calculator-card {
    width: 80%;
  }
}

@media (min-width: 1920px) {
  .calculator-card {
    width: 60%;
  }
}

/* Flex row layout */
.calc-header,
.calc-row {
  gap: 0.75rem;
}

.calc-row {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.calc-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

/* Column flex sizing */
.col-icon {
  flex: 0 0 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-material {
  flex: 1 1 auto;
  min-width: 0;
}

.col-amount {
  flex: 0 0 10rem;
}

.col-price,
.col-total {
  flex: 0 0 10rem;
}

.col-actions {
  flex: 0 0 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Icon styling */
.row-icon {
  width: 28px;
  height: 28px;
}

/* Input styling */
.amount-input :deep(.v-field__input) {
  text-align: right;
}

/* Remove number input spinners */
.amount-input :deep(input[type='number']) {
  -moz-appearance: textfield;
}

.amount-input :deep(input[type='number']::-webkit-outer-spin-button),
.amount-input :deep(input[type='number']::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .col-price {
    display: none;
  }

  .col-amount,
  .col-total {
    flex-basis: 4.5rem;
  }
}
</style>
