<template>
  <v-container>
    <h1 class="text-h4 mb-4">Market</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Filters Card -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="4" lg="3">
            <v-select
              v-model="filters.commodity"
              :items="commodityOptions"
              label="Commodity"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="4" lg="3">
            <v-select
              v-model="filters.location"
              :items="locationOptions"
              label="Location"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="4" lg="3" class="d-flex align-center">
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
          <v-col cols="12" sm="6" md="12" lg="3" class="text-lg-right">
            <v-btn color="primary" prepend-icon="mdi-cart-plus" @click="openBuyOrderDialog">
              Add Buy Order
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Market Listings Table -->
    <v-card>
      <v-card-title>
        <v-row align="center">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="search"
              prepend-icon="mdi-magnify"
              label="Search market..."
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
          <v-col cols="12" md="6" class="text-right">
            <span class="text-body-2 text-medium-emphasis">
              {{ filteredListings.length }} listing(s)
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredListings"
        :loading="loading"
        :items-per-page="25"
        :row-props="getRowProps"
        class="elevation-0"
      >
        <template #item.commodityTicker="{ item }">
          <div
            class="font-weight-medium clickable-cell"
            @click="setFilter('commodity', item.commodityTicker)"
          >
            {{ getCommodityDisplay(item.commodityTicker) }}
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

        <template #item.sellerName="{ item }">
          <span :class="{ 'font-weight-medium': item.isOwn }">
            {{ item.sellerName }}
            <v-chip v-if="item.isOwn" size="x-small" color="info" class="ml-1">You</v-chip>
          </span>
        </template>

        <template #item.price="{ item }">
          <span class="font-weight-medium">
            {{
              item.price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}
          </span>
          <span class="text-caption text-medium-emphasis ml-1">{{ item.currency }}</span>
        </template>

        <template #item.availableQuantity="{ item }">
          <span class="font-weight-medium">{{ item.availableQuantity.toLocaleString() }}</span>
        </template>

        <template #item.orderType="{ item }">
          <v-chip
            :color="item.orderType === 'partner' ? 'primary' : 'default'"
            size="small"
            variant="tonal"
          >
            {{ item.orderType === 'partner' ? 'Partner' : 'Internal' }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-menu v-if="item.isOwn">
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
            <v-icon size="64" color="grey-lighten-1">mdi-storefront-outline</v-icon>
            <p class="text-h6 mt-4">No listings available</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="hasActiveFilters">
                No listings match your filters.
                <a href="#" @click.prevent="clearFilters">Clear filters</a>
              </template>
              <template v-else> No one is selling anything yet. Check back later! </template>
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Buy Order Dialog -->
    <BuyOrderDialog v-model="buyOrderDialog" @created="onBuyOrderCreated" />

    <!-- Edit Sell Order Dialog -->
    <v-dialog v-model="editDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>Edit Sell Order</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4" density="compact">
            <div>
              <strong>{{
                editingItem ? getCommodityDisplay(editingItem.commodityTicker) : ''
              }}</strong>
            </div>
            <div class="text-caption">
              {{ editingItem ? getLocationDisplay(editingItem.locationId) : '' }}
            </div>
          </v-alert>

          <v-form ref="editFormRef">
            <v-row>
              <v-col cols="8">
                <v-text-field
                  v-model.number="editForm.price"
                  label="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  :rules="[v => v > 0 || 'Price must be positive']"
                  required
                />
              </v-col>
              <v-col cols="4">
                <v-select v-model="editForm.currency" :items="currencies" label="Currency" />
              </v-col>
            </v-row>

            <v-select
              v-model="editForm.orderType"
              :items="orderTypes"
              item-title="title"
              item-value="value"
              label="Order Type"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveEdit"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Sell Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete your sell order for
          <strong>{{
            deletingItem ? getCommodityDisplay(deletingItem.commodityTicker) : ''
          }}</strong>
          at <strong>{{ deletingItem ? getLocationDisplay(deletingItem.locationId) : '' }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="confirmDelete"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Currency, OrderType } from '@kawakawa/types'
import { api, type MarketListing } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import BuyOrderDialog from '../components/BuyOrderDialog.vue'

const userStore = useUserStore()

interface Filters {
  commodity: string | null
  location: string | null
}

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const headers = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Seller', key: 'sellerName', sortable: true },
  { title: 'Price', key: 'price', sortable: true, align: 'end' as const },
  { title: 'Available', key: 'availableQuantity', sortable: true, align: 'end' as const },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: '', key: 'actions', sortable: false, width: 50 },
]

const listings = ref<MarketListing[]>([])
const loading = ref(false)
const search = ref('')

const buyOrderDialog = ref(false)

// Edit dialog
const editDialog = ref(false)
const editingItem = ref<MarketListing | null>(null)
const editFormRef = ref()
const saving = ref(false)

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']
const orderTypes = [
  { title: 'Internal (members only)', value: 'internal' },
  { title: 'Partner (trade partners)', value: 'partner' },
]

const editForm = ref({
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
})

// Delete dialog
const deleteDialog = ref(false)
const deletingItem = ref<MarketListing | null>(null)
const deleting = ref(false)

// Filters
const filters = ref<Filters>({
  commodity: null,
  location: null,
})

// Row highlighting for own orders
const getRowProps = ({ item }: { item: MarketListing }) => {
  return item.isOwn ? { class: 'own-listing-row' } : {}
}

// Computed filter options based on listings data
const commodityOptions = computed(() => {
  const tickers = new Set(listings.value.map(l => l.commodityTicker))
  return Array.from(tickers).sort()
})

const locationOptions = computed(() => {
  const locations = new Set(listings.value.map(l => l.locationId))
  return Array.from(locations)
    .sort()
    .map(id => ({
      title: getLocationDisplay(id),
      value: id,
    }))
})

const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(v => v !== null)
})

const clearFilters = () => {
  filters.value = {
    commodity: null,
    location: null,
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

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const filteredListings = computed(() => {
  let result = listings.value

  // Apply filters
  if (filters.value.commodity) {
    result = result.filter(l => l.commodityTicker === filters.value.commodity)
  }
  if (filters.value.location) {
    result = result.filter(l => l.locationId === filters.value.location)
  }

  // Apply search
  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      item =>
        item.commodityTicker.toLowerCase().includes(searchLower) ||
        item.locationId.toLowerCase().includes(searchLower) ||
        item.sellerName.toLowerCase().includes(searchLower)
    )
  }

  return result
})

const loadListings = async () => {
  try {
    loading.value = true
    listings.value = await api.market.getListings()
  } catch (error) {
    console.error('Failed to load market listings', error)
    showSnackbar('Failed to load market listings', 'error')
  } finally {
    loading.value = false
  }
}

const openBuyOrderDialog = () => {
  buyOrderDialog.value = true
}

const onBuyOrderCreated = () => {
  showSnackbar('Buy order created successfully')
}

const openEditDialog = (item: MarketListing) => {
  editingItem.value = item
  editForm.value = {
    price: item.price,
    currency: item.currency,
    orderType: item.orderType,
  }
  editDialog.value = true
}

const saveEdit = async () => {
  if (!editingItem.value) return

  const { valid } = await editFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    await api.sellOrders.update(editingItem.value.id, {
      price: editForm.value.price,
      currency: editForm.value.currency,
      orderType: editForm.value.orderType,
    })
    showSnackbar('Order updated successfully')
    editDialog.value = false
    await loadListings()
  } catch (error) {
    console.error('Failed to update order', error)
    const message = error instanceof Error ? error.message : 'Failed to update order'
    showSnackbar(message, 'error')
  } finally {
    saving.value = false
  }
}

const openDeleteDialog = (item: MarketListing) => {
  deletingItem.value = item
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingItem.value) return

  try {
    deleting.value = true
    await api.sellOrders.delete(deletingItem.value.id)
    showSnackbar('Order deleted successfully')
    deleteDialog.value = false
    await loadListings()
  } catch (error) {
    console.error('Failed to delete order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete order'
    showSnackbar(message, 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  loadListings()
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

<style>
/* Non-scoped to target v-data-table rows */
.own-listing-row {
  background-color: rgba(var(--v-theme-info), 0.08) !important;
}
</style>
