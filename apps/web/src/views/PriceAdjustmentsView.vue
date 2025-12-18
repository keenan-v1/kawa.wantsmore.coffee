<template>
  <v-container fluid>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h4">Price Adjustments</h1>
      <v-btn variant="text" to="/prices">
        <v-icon start>mdi-arrow-left</v-icon>
        Back to Prices
      </v-btn>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Filters & Actions -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="6" sm="3">
            <v-select
              v-model="filters.exchange"
              :items="exchangeOptions"
              item-title="code"
              item-value="code"
              label="Exchange"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
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
            <v-select
              v-model="filters.activeOnly"
              :items="activeFilterOptions"
              label="Status"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="3" class="d-flex justify-end align-center">
            <v-btn
              v-if="canManageAdjustments"
              color="primary"
              size="small"
              @click="openCreateDialog"
            >
              <v-icon start>mdi-plus</v-icon>
              Add Adjustment
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Adjustments Table -->
    <v-card>
      <v-card-title>
        <v-row align="center">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="search"
              prepend-icon="mdi-magnify"
              label="Search adjustments..."
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
          <v-col cols="12" md="6" class="text-right">
            <span class="text-body-2 text-medium-emphasis">
              {{ filteredAdjustments.length }} adjustment(s)
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredAdjustments"
        :loading="loading"
        :items-per-page="25"
        class="elevation-0"
      >
        <template #item.scope="{ item }">
          <div>
            <v-chip v-if="item.priceListCode" size="x-small" class="mr-1">
              {{ item.priceListCode }}
            </v-chip>
            <v-chip v-else size="x-small" color="grey" class="mr-1">All Exchanges</v-chip>
          </div>
          <div
            v-if="item.commodityTicker || item.locationId"
            class="text-caption text-medium-emphasis mt-1"
          >
            <span v-if="item.commodityTicker">
              {{ getCommodityDisplay(item.commodityTicker) }}
            </span>
            <span v-if="item.commodityTicker && item.locationId"> @ </span>
            <span v-if="item.locationId">
              {{ getLocationDisplay(item.locationId) }}
            </span>
          </div>
          <div v-else class="text-caption text-medium-emphasis">All commodities / locations</div>
        </template>

        <template #item.adjustment="{ item }">
          <span class="font-weight-medium">
            <template v-if="item.adjustmentType === 'percentage'">
              {{ parseFloat(item.adjustmentValue) >= 0 ? '+' : ''
              }}{{ parseFloat(item.adjustmentValue).toFixed(2) }}%
            </template>
            <template v-else>
              {{ parseFloat(item.adjustmentValue) >= 0 ? '+' : ''
              }}{{ parseFloat(item.adjustmentValue).toFixed(2) }}
              <span v-if="item.currency" class="text-caption text-medium-emphasis">{{
                item.currency
              }}</span>
            </template>
          </span>
        </template>

        <template #item.priority="{ item }">
          <v-chip size="small" variant="tonal">{{ item.priority }}</v-chip>
        </template>

        <template #item.isActive="{ item }">
          <v-chip :color="item.isActive ? 'success' : 'grey'" size="small" variant="tonal">
            {{ item.isActive ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>

        <template #item.effectiveDates="{ item }">
          <div v-if="item.effectiveFrom || item.effectiveUntil" class="text-caption">
            <div v-if="item.effectiveFrom">From: {{ formatDate(item.effectiveFrom) }}</div>
            <div v-if="item.effectiveUntil">Until: {{ formatDate(item.effectiveUntil) }}</div>
          </div>
          <span v-else class="text-caption text-medium-emphasis">Always</span>
        </template>

        <template #item.createdBy="{ item }">
          <span class="text-caption">{{ item.createdByUsername || 'System' }}</span>
        </template>

        <template #item.actions="{ item }">
          <v-menu v-if="canManageAdjustments">
            <template #activator="{ props }">
              <v-btn v-bind="props" icon size="small" variant="text">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="toggleActive(item)">
                <template #prepend>
                  <v-icon :color="item.isActive ? 'warning' : 'success'">
                    {{ item.isActive ? 'mdi-pause' : 'mdi-play' }}
                  </v-icon>
                </template>
                <v-list-item-title>{{
                  item.isActive ? 'Deactivate' : 'Activate'
                }}</v-list-item-title>
              </v-list-item>
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
            <v-icon size="64" color="grey-lighten-1">mdi-tune-variant</v-icon>
            <p class="text-h6 mt-4">No adjustments found</p>
            <p class="text-body-2 text-medium-emphasis">
              Price adjustments let you apply percentage or fixed-amount changes to prices.
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit Dialog -->
    <v-dialog
      v-model="adjustmentDialog"
      max-width="600"
      :persistent="adjustmentDialogBehavior.persistent.value"
      :no-click-animation="adjustmentDialogBehavior.noClickAnimation"
    >
      <v-card>
        <v-card-title>{{ editingAdjustment ? 'Edit Adjustment' : 'Add Adjustment' }}</v-card-title>
        <v-card-text>
          <v-form ref="adjustmentFormRef">
            <v-row>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="adjustmentForm.priceListCode"
                  :items="exchangeOptionsWithNull"
                  item-title="label"
                  item-value="value"
                  label="Exchange"
                  hint="Leave empty to apply to all exchanges"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="adjustmentForm.currency"
                  :items="currenciesWithNull"
                  item-title="label"
                  item-value="value"
                  label="Currency"
                  hint="Leave empty to apply to all currencies"
                  persistent-hint
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12" sm="6">
                <KeyValueAutocomplete
                  v-model="adjustmentForm.locationId"
                  :items="allLocationOptions"
                  label="Location (optional)"
                  clearable
                />
              </v-col>
              <v-col cols="12" sm="6">
                <KeyValueAutocomplete
                  v-model="adjustmentForm.commodityTicker"
                  :items="allCommodityOptions"
                  :show-icons="hasIcons"
                  label="Commodity (optional)"
                  clearable
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12" sm="4">
                <v-select
                  v-model="adjustmentForm.adjustmentType"
                  :items="adjustmentTypes"
                  item-title="label"
                  item-value="value"
                  label="Type"
                  :rules="[v => !!v || 'Type is required']"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model.number="adjustmentForm.adjustmentValue"
                  label="Value"
                  type="number"
                  step="0.01"
                  :rules="[v => (v !== null && v !== undefined && v !== '') || 'Value is required']"
                  :hint="
                    adjustmentForm.adjustmentType === 'percentage'
                      ? 'e.g., 5 for +5%, -10 for -10%'
                      : 'Fixed amount to add/subtract'
                  "
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model.number="adjustmentForm.priority"
                  label="Priority"
                  type="number"
                  hint="Lower = applied first"
                  persistent-hint
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12">
                <v-text-field
                  v-model="adjustmentForm.description"
                  label="Description"
                  hint="Explain what this adjustment is for"
                  persistent-hint
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="adjustmentForm.effectiveFrom"
                  label="Effective From (optional)"
                  type="datetime-local"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="adjustmentForm.effectiveUntil"
                  label="Effective Until (optional)"
                  type="datetime-local"
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12">
                <v-checkbox v-model="adjustmentForm.isActive" label="Active" hide-details />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="adjustmentDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveAdjustment">
            {{ editingAdjustment ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Adjustment</v-card-title>
        <v-card-text>
          Are you sure you want to delete this adjustment?
          <v-alert v-if="deletingAdjustment?.description" type="info" variant="tonal" class="mt-2">
            {{ deletingAdjustment.description }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Currency } from '@kawakawa/types'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type PriceAdjustmentResponse,
  type FioExchangeResponse,
  type AdjustmentType,
} from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useDialogBehavior } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'

const userStore = useUserStore()
const settingsStore = useSettingsStore()

// State
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const search = ref('')

const adjustments = ref<PriceAdjustmentResponse[]>([])
const exchanges = ref<FioExchangeResponse[]>([])

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Filters
const filters = ref<{
  exchange: string | null
  location: string | null
  activeOnly: boolean | null
}>({
  exchange: null,
  location: null,
  activeOnly: null,
})

const activeFilterOptions = [
  { title: 'All', value: null },
  { title: 'Active Only', value: true },
  { title: 'Inactive Only', value: false },
]

// Dialogs
const adjustmentDialog = ref(false)
const adjustmentDialogBehavior = useDialogBehavior({ modelValue: adjustmentDialog })
const deleteDialog = ref(false)
const editingAdjustment = ref<PriceAdjustmentResponse | null>(null)
const deletingAdjustment = ref<PriceAdjustmentResponse | null>(null)
const adjustmentFormRef = ref()

const adjustmentForm = ref({
  priceListCode: null as string | null,
  commodityTicker: null as string | null,
  locationId: null as string | null,
  currency: null as Currency | null,
  adjustmentType: 'percentage' as AdjustmentType,
  adjustmentValue: 0,
  priority: 0,
  description: '',
  isActive: true,
  effectiveFrom: '',
  effectiveUntil: '',
})

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

const adjustmentTypes = [
  { label: 'Percentage (%)', value: 'percentage' },
  { label: 'Fixed Amount', value: 'fixed' },
]

// Computed
const canManageAdjustments = computed(() => userStore.hasPermission(PERMISSIONS.ADJUSTMENTS_MANAGE))

const headers = computed(() => {
  const base = [
    { title: 'Scope', key: 'scope', sortable: false },
    { title: 'Adjustment', key: 'adjustment', sortable: true },
    { title: 'Priority', key: 'priority', sortable: true, width: 100 },
    { title: 'Status', key: 'isActive', sortable: true, width: 100 },
    { title: 'Effective Dates', key: 'effectiveDates', sortable: false },
    { title: 'Description', key: 'description', sortable: false },
    { title: 'Created By', key: 'createdBy', sortable: false },
  ]
  if (canManageAdjustments.value) {
    base.push({ title: '', key: 'actions', sortable: false, width: 50 })
  }
  return base
})

const exchangeOptions = computed(() => exchanges.value)

const exchangeOptionsWithNull = computed(() => [
  { label: 'All Exchanges', value: null },
  ...exchanges.value.map(e => ({ label: e.code, value: e.code })),
])

const currenciesWithNull = computed(() => [
  { label: 'All Currencies', value: null },
  ...currencies.map(c => ({ label: c, value: c })),
])

// Display helpers
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

// Check if commodity icons are enabled
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

const locationOptions = computed((): KeyValueItem[] => {
  const locations = new Set(adjustments.value.map(a => a.locationId).filter(Boolean) as string[])
  return Array.from(locations).map(id => ({
    key: id,
    display: getLocationDisplay(id),
    locationType: locationService.getLocationType(id) ?? undefined,
    isUserLocation: locationService.isUserLocation(id),
    storageTypes: locationService.getStorageTypes(id),
  }))
})

const allLocationOptions = computed((): KeyValueItem[] => {
  return locationService.getAllLocationsSync().map(loc => ({
    key: loc.id,
    display: getLocationDisplay(loc.id),
    locationType: loc.type,
    isUserLocation: locationService.isUserLocation(loc.id),
    storageTypes: locationService.getStorageTypes(loc.id),
  }))
})

const allCommodityOptions = computed((): KeyValueItem[] => {
  return commodityService.getAllCommoditiesSync().map(c => ({
    key: c.ticker,
    display: getCommodityDisplay(c.ticker),
    name: c.name,
    category: c.category,
  }))
})

// Filtered adjustments
const filteredAdjustments = computed(() => {
  let result = adjustments.value

  if (filters.value.exchange) {
    result = result.filter(
      a => a.priceListCode === filters.value.exchange || a.priceListCode === null
    )
  }
  if (filters.value.location) {
    result = result.filter(a => a.locationId === filters.value.location || a.locationId === null)
  }
  if (filters.value.activeOnly !== null) {
    result = result.filter(a => a.isActive === filters.value.activeOnly)
  }

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      a =>
        (a.description?.toLowerCase().includes(searchLower) ?? false) ||
        (a.priceListCode?.toLowerCase().includes(searchLower) ?? false) ||
        (a.commodityTicker?.toLowerCase().includes(searchLower) ?? false) ||
        (a.locationId?.toLowerCase().includes(searchLower) ?? false)
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

const loadExchanges = async () => {
  try {
    exchanges.value = await api.fioExchanges.list()
  } catch (error) {
    console.error('Failed to load exchanges:', error)
  }
}

const loadAdjustments = async () => {
  try {
    loading.value = true
    adjustments.value = await api.priceAdjustments.list()
  } catch (error) {
    console.error('Failed to load adjustments:', error)
    showSnackbar('Failed to load adjustments', 'error')
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  editingAdjustment.value = null
  adjustmentForm.value = {
    priceListCode: null,
    commodityTicker: null,
    locationId: null,
    currency: null,
    adjustmentType: 'percentage',
    adjustmentValue: 0,
    priority: 0,
    description: '',
    isActive: true,
    effectiveFrom: '',
    effectiveUntil: '',
  }
  adjustmentDialog.value = true
}

const openEditDialog = (adjustment: PriceAdjustmentResponse) => {
  editingAdjustment.value = adjustment
  adjustmentForm.value = {
    priceListCode: adjustment.priceListCode,
    commodityTicker: adjustment.commodityTicker,
    locationId: adjustment.locationId,
    currency: adjustment.currency,
    adjustmentType: adjustment.adjustmentType,
    adjustmentValue: parseFloat(adjustment.adjustmentValue),
    priority: adjustment.priority,
    description: adjustment.description || '',
    isActive: adjustment.isActive,
    effectiveFrom: adjustment.effectiveFrom
      ? new Date(adjustment.effectiveFrom).toISOString().slice(0, 16)
      : '',
    effectiveUntil: adjustment.effectiveUntil
      ? new Date(adjustment.effectiveUntil).toISOString().slice(0, 16)
      : '',
  }
  adjustmentDialog.value = true
}

const saveAdjustment = async () => {
  const { valid } = await adjustmentFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true

    const data = {
      priceListCode: adjustmentForm.value.priceListCode || null,
      commodityTicker: adjustmentForm.value.commodityTicker || null,
      locationId: adjustmentForm.value.locationId || null,
      adjustmentType: adjustmentForm.value.adjustmentType,
      adjustmentValue: adjustmentForm.value.adjustmentValue,
      priority: adjustmentForm.value.priority,
      description: adjustmentForm.value.description || null,
      isActive: adjustmentForm.value.isActive,
      effectiveFrom: adjustmentForm.value.effectiveFrom
        ? new Date(adjustmentForm.value.effectiveFrom).toISOString()
        : null,
      effectiveUntil: adjustmentForm.value.effectiveUntil
        ? new Date(adjustmentForm.value.effectiveUntil).toISOString()
        : null,
    }

    if (editingAdjustment.value) {
      await api.priceAdjustments.update(editingAdjustment.value.id, data)
      showSnackbar('Adjustment updated')
    } else {
      await api.priceAdjustments.create(data)
      showSnackbar('Adjustment created')
    }
    adjustmentDialog.value = false
    await loadAdjustments()
  } catch (error) {
    console.error('Failed to save adjustment:', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to save adjustment', 'error')
  } finally {
    saving.value = false
  }
}

const toggleActive = async (adjustment: PriceAdjustmentResponse) => {
  try {
    await api.priceAdjustments.update(adjustment.id, { isActive: !adjustment.isActive })
    showSnackbar(adjustment.isActive ? 'Adjustment deactivated' : 'Adjustment activated')
    await loadAdjustments()
  } catch (error) {
    console.error('Failed to toggle adjustment:', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to update adjustment', 'error')
  }
}

const openDeleteDialog = (adjustment: PriceAdjustmentResponse) => {
  deletingAdjustment.value = adjustment
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingAdjustment.value) return

  try {
    deleting.value = true
    await api.priceAdjustments.delete(deletingAdjustment.value.id)
    showSnackbar('Adjustment deleted')
    deleteDialog.value = false
    await loadAdjustments()
  } catch (error) {
    console.error('Failed to delete adjustment:', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete adjustment', 'error')
  } finally {
    deleting.value = false
  }
}

// Initialize
onMounted(async () => {
  await loadExchanges()
  await loadAdjustments()
})
</script>
