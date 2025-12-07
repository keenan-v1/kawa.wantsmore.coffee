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
          <v-col cols="6" sm="4" lg="2">
            <v-select
              v-model="filters.itemType"
              :items="itemTypeOptions"
              item-title="title"
              item-value="value"
              label="Buy/Sell"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4" lg="2">
            <KeyValueAutocomplete
              v-model="filters.commodity"
              :items="commodityOptions"
              label="Commodity"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4" lg="2">
            <v-select
              v-model="filters.category"
              :items="categoryOptions"
              label="Category"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4" lg="2">
            <KeyValueAutocomplete
              v-model="filters.location"
              :items="locationOptions"
              label="Location"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4" lg="2">
            <v-select
              v-model="filters.userName"
              :items="userOptions"
              label="User"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4" lg="2">
            <v-select
              v-model="filters.orderType"
              :items="visibilityOptions"
              item-title="title"
              item-value="value"
              label="Visibility"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
        </v-row>
        <v-row dense class="mt-2">
          <v-col cols="12" class="d-flex align-center justify-space-between">
            <v-btn
              v-if="hasActiveFilters"
              variant="text"
              color="primary"
              size="small"
              @click="clearFilters"
            >
              Clear Filters
            </v-btn>
            <v-spacer />
            <v-tooltip
              :disabled="canCreateAnyOrders"
              text="You do not have permission to create orders"
              location="bottom"
            >
              <template #activator="{ props }">
                <span v-bind="props">
                  <v-btn
                    color="primary"
                    prepend-icon="mdi-plus"
                    :disabled="!canCreateAnyOrders"
                    @click="openOrderDialog"
                  >
                    Create Order
                  </v-btn>
                </span>
              </template>
            </v-tooltip>
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
              {{ filteredItems.length }} order(s)
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredItems"
        :loading="loading"
        :items-per-page="25"
        :row-props="getRowProps"
        class="elevation-0"
      >
        <template #item.itemType="{ item }">
          <v-chip
            :color="item.itemType === 'sell' ? 'success' : 'warning'"
            size="small"
            variant="flat"
            class="clickable-chip"
            @click="setFilter('itemType', item.itemType)"
          >
            {{ item.itemType === 'sell' ? 'SELL' : 'BUY' }}
          </v-chip>
        </template>

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

        <template #item.userName="{ item }">
          <div
            class="clickable-cell"
            :class="{ 'font-weight-medium': item.isOwn }"
            @click="setFilter('userName', item.userName)"
          >
            {{ item.userName }}
            <v-chip v-if="item.isOwn" size="x-small" color="info" class="ml-1">You</v-chip>
          </div>
        </template>

        <template #item.fioUploadedAt="{ item }">
          <v-chip
            v-if="item.fioUploadedAt"
            size="small"
            variant="tonal"
            :color="getFioAgeColor(item.fioUploadedAt)"
          >
            {{ formatFioAge(item.fioUploadedAt) }}
          </v-chip>
          <span v-else class="text-medium-emphasis text-caption">—</span>
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

        <template #item.quantity="{ item }">
          <v-tooltip location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium">
                {{ item.remainingQuantity.toLocaleString() }}
                <span v-if="item.reservedQuantity > 0" class="text-medium-emphasis">
                  / {{ item.quantity.toLocaleString() }}
                </span>
              </span>
            </template>
            <div>
              <div>Total: {{ item.quantity.toLocaleString() }}</div>
              <div v-if="item.reservedQuantity > 0">
                {{ item.itemType === 'buy' ? 'Filled' : 'Reserved' }}:
                {{ item.reservedQuantity.toLocaleString() }}
              </div>
              <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
            </div>
          </v-tooltip>
        </template>

        <template #item.orderType="{ item }">
          <v-chip
            :color="item.orderType === 'partner' ? 'primary' : 'default'"
            size="small"
            variant="tonal"
            class="clickable-chip"
            @click="setFilter('orderType', item.orderType)"
          >
            {{ item.orderType === 'partner' ? 'Partner' : 'Internal' }}
          </v-chip>
        </template>

        <template #item.reserve="{ item }">
          <v-btn
            v-if="!item.isOwn && canReserveOrder(item)"
            size="small"
            variant="tonal"
            :color="item.itemType === 'sell' ? 'warning' : 'success'"
            @click.stop="openReserveDialog(item)"
          >
            {{ item.itemType === 'sell' ? 'Reserve' : 'Fill' }}
          </v-btn>
        </template>

        <template #item.actions="{ item }">
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon size="small" variant="text">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="viewOrder(item)">
                <template #prepend>
                  <v-icon>mdi-eye</v-icon>
                </template>
                <v-list-item-title>View</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="item.isOwn" @click="openEditDialog(item)">
                <template #prepend>
                  <v-icon color="primary">mdi-pencil</v-icon>
                </template>
                <v-list-item-title>Edit</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="item.isOwn" @click="openDeleteDialog(item)">
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
            <p class="text-h6 mt-4">No orders available</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="hasActiveFilters">
                No orders match your filters.
                <a href="#" @click.prevent="clearFilters">Clear filters</a>
              </template>
              <template v-else> No orders yet. Check back later! </template>
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Order Dialog -->
    <OrderDialog v-model="orderDialog" :initial-tab="orderDialogTab" @created="onOrderCreated" />

    <!-- Edit Order Dialog -->
    <v-dialog v-model="editDialog" max-width="500" persistent>
      <v-card>
        <v-card-title
          >Edit {{ editingItem?.itemType === 'sell' ? 'Sell' : 'Buy' }} Order</v-card-title
        >
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
            <!-- Quantity (only for buy orders) -->
            <v-text-field
              v-if="editingItem?.itemType === 'buy'"
              v-model.number="editForm.quantity"
              label="Quantity"
              type="number"
              min="1"
              :rules="[v => v > 0 || 'Quantity must be positive']"
              required
              class="mb-2"
            />

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
              label="Visibility"
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
        <v-card-title
          >Delete {{ deletingItem?.itemType === 'sell' ? 'Sell' : 'Buy' }} Order</v-card-title
        >
        <v-card-text>
          Are you sure you want to delete your
          {{ deletingItem?.itemType === 'sell' ? 'sell' : 'buy' }} order for
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

    <!-- Reservation Dialog -->
    <ReservationDialog
      v-model="reserveDialog"
      :order="reservingItem"
      @reserved="onReservationCreated"
    />

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-model="orderDetailDialog"
      :order-type="orderDetailType"
      :order-id="orderDetailId"
      @deleted="loadMarketItems"
      @updated="loadMarketItems"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PERMISSIONS, type Currency, type OrderType } from '@kawakawa/types'
import { api } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import ReservationDialog from '../components/ReservationDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'

const userStore = useUserStore()

// Unified market item type
type MarketItemType = 'sell' | 'buy'

interface MarketItem {
  id: number
  itemType: MarketItemType
  commodityTicker: string
  locationId: string
  userName: string // sellerName or buyerName
  price: number
  currency: Currency
  orderType: OrderType
  quantity: number // availableQuantity or quantity
  remainingQuantity: number
  reservedQuantity: number
  activeReservationCount: number
  isOwn: boolean
  fioUploadedAt: string | null // When seller's FIO inventory was last synced
}

interface Filters {
  itemType: MarketItemType | null
  commodity: string | null
  category: string | null
  location: string | null
  userName: string | null
  orderType: OrderType | null
}

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const getCommodityCategory = (ticker: string): string | null => {
  return commodityService.getCommodityCategory(ticker)
}

// Format FIO age as a short duration (e.g., "2h", "3d")
const formatFioAge = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = Date.now()
  const diffMs = now - date.getTime()

  if (diffMs < 0) return 'Future?'

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return '<1m'
}

// Get color based on FIO data age (fresh = green, stale = red)
const getFioAgeColor = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = Date.now()
  const hoursAgo = (now - date.getTime()) / (1000 * 60 * 60)

  if (hoursAgo < 1) return 'success' // Less than 1 hour - very fresh
  if (hoursAgo < 24) return 'default' // Less than 24 hours - fine
  if (hoursAgo < 72) return 'warning' // 1-3 days - getting stale
  return 'error' // More than 3 days - very stale
}

const headers = [
  { title: '', key: 'itemType', sortable: true, width: 70 },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'User', key: 'userName', sortable: true },
  { title: 'FIO Age', key: 'fioUploadedAt', sortable: true },
  { title: 'Price', key: 'price', sortable: true, align: 'end' as const },
  { title: 'Visibility', key: 'orderType', sortable: true },
  { title: '', key: 'reserve', sortable: false, width: 90 },
  { title: '', key: 'actions', sortable: false, width: 50 },
]

const marketItems = ref<MarketItem[]>([])
const loading = ref(false)
const search = ref('')

const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

// Order detail dialog
const orderDetailDialog = ref(false)
const orderDetailType = ref<'sell' | 'buy'>('sell')
const orderDetailId = ref<number>(0)

// Edit dialog
const editDialog = ref(false)
const editingItem = ref<MarketItem | null>(null)
const editFormRef = ref()
const saving = ref(false)

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)

// Check permissions for reservations
const canReserveInternal = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_INTERNAL)
)
const canReservePartner = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_PARTNER)
)

const canReserveOrder = (item: MarketItem): boolean => {
  if (item.isOwn) return false
  if (item.remainingQuantity <= 0) return false
  if (item.orderType === 'internal') return canReserveInternal.value
  if (item.orderType === 'partner') return canReservePartner.value
  return false
}

const orderTypes = computed(() => {
  const types: { title: string; value: OrderType }[] = []
  if (canCreateInternalOrders.value) {
    types.push({ title: 'Internal (members only)', value: 'internal' })
  }
  if (canCreatePartnerOrders.value) {
    types.push({ title: 'Partner (trade partners)', value: 'partner' })
  }
  return types
})

// Check if user can create any orders at all
const canCreateAnyOrders = computed(() => orderTypes.value.length > 0)

const editForm = ref({
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
  quantity: 0, // Only used for buy orders
})

// Delete dialog
const deleteDialog = ref(false)
const deletingItem = ref<MarketItem | null>(null)
const deleting = ref(false)

// Reserve dialog
const reserveDialog = ref(false)
const reservingItem = ref<MarketItem | null>(null)

// Filters
const filters = ref<Filters>({
  itemType: null,
  commodity: null,
  category: null,
  location: null,
  userName: null,
  orderType: null,
})

// Row highlighting for own orders and alternating colors
const getRowProps = ({ item, index }: { item: MarketItem; index: number }) => {
  const classes: string[] = []
  if (item.isOwn) classes.push('own-listing-row')
  if (index % 2 === 1) classes.push('alt-row')
  return classes.length > 0 ? { class: classes.join(' ') } : {}
}

// Computed filter options based on market items data
const itemTypeOptions = [
  { title: 'Sell', value: 'sell' as MarketItemType },
  { title: 'Buy', value: 'buy' as MarketItemType },
]

const commodityOptions = computed((): KeyValueItem[] => {
  const tickers = new Set(marketItems.value.map(l => l.commodityTicker))
  return Array.from(tickers).map(ticker => ({
    key: ticker,
    display: getCommodityDisplay(ticker),
  }))
})

const categoryOptions = computed(() => {
  const categories = new Set(
    marketItems.value.map(l => getCommodityCategory(l.commodityTicker)).filter(Boolean)
  )
  return Array.from(categories).sort() as string[]
})

const locationOptions = computed((): KeyValueItem[] => {
  const locations = new Set(marketItems.value.map(l => l.locationId))
  return Array.from(locations).map(id => ({
    key: id,
    display: getLocationDisplay(id),
  }))
})

const userOptions = computed(() => {
  const users = new Set(marketItems.value.map(l => l.userName))
  return Array.from(users).sort()
})

const visibilityOptions = [
  { title: 'Internal', value: 'internal' as OrderType },
  { title: 'Partner', value: 'partner' as OrderType },
]

const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(v => v !== null)
})

const clearFilters = () => {
  filters.value = {
    itemType: null,
    commodity: null,
    category: null,
    location: null,
    userName: null,
    orderType: null,
  }
}

const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
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

const filteredItems = computed(() => {
  let result = marketItems.value

  // Apply filters
  if (filters.value.itemType) {
    result = result.filter(l => l.itemType === filters.value.itemType)
  }
  if (filters.value.commodity) {
    result = result.filter(l => l.commodityTicker === filters.value.commodity)
  }
  if (filters.value.category) {
    result = result.filter(l => getCommodityCategory(l.commodityTicker) === filters.value.category)
  }
  if (filters.value.location) {
    result = result.filter(l => l.locationId === filters.value.location)
  }
  if (filters.value.userName) {
    result = result.filter(l => l.userName === filters.value.userName)
  }
  if (filters.value.orderType) {
    result = result.filter(l => l.orderType === filters.value.orderType)
  }

  // Apply search
  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      item =>
        item.commodityTicker.toLowerCase().includes(searchLower) ||
        item.locationId.toLowerCase().includes(searchLower) ||
        item.userName.toLowerCase().includes(searchLower) ||
        (getCommodityCategory(item.commodityTicker)?.toLowerCase().includes(searchLower) ?? false)
    )
  }

  return result
})

const loadMarketItems = async () => {
  try {
    loading.value = true
    // Fetch both sell listings and buy requests in parallel
    const [sellListings, buyRequests] = await Promise.all([
      api.market.getListings(),
      api.market.getBuyRequests(),
    ])

    // Transform sell listings to unified format
    const sellItems: MarketItem[] = sellListings.map(listing => ({
      id: listing.id,
      itemType: 'sell' as MarketItemType,
      commodityTicker: listing.commodityTicker,
      locationId: listing.locationId,
      userName: listing.sellerName,
      price: listing.price,
      currency: listing.currency,
      orderType: listing.orderType,
      quantity: listing.availableQuantity,
      remainingQuantity: listing.remainingQuantity,
      reservedQuantity: listing.reservedQuantity,
      activeReservationCount: listing.activeReservationCount,
      isOwn: listing.isOwn,
      fioUploadedAt: listing.fioUploadedAt,
    }))

    // Transform buy requests to unified format
    const buyItems: MarketItem[] = buyRequests.map(request => ({
      id: request.id,
      itemType: 'buy' as MarketItemType,
      commodityTicker: request.commodityTicker,
      locationId: request.locationId,
      userName: request.buyerName,
      price: request.price,
      currency: request.currency,
      orderType: request.orderType,
      quantity: request.quantity,
      remainingQuantity: request.remainingQuantity,
      reservedQuantity: request.reservedQuantity,
      activeReservationCount: request.activeReservationCount,
      isOwn: request.isOwn,
      fioUploadedAt: request.fioUploadedAt,
    }))

    // Combine and sort by commodity, then location, then price
    marketItems.value = [...sellItems, ...buyItems].sort((a, b) => {
      if (a.commodityTicker !== b.commodityTicker) {
        return a.commodityTicker.localeCompare(b.commodityTicker)
      }
      if (a.locationId !== b.locationId) {
        return a.locationId.localeCompare(b.locationId)
      }
      return a.price - b.price
    })
  } catch (error) {
    console.error('Failed to load market items', error)
    showSnackbar('Failed to load market items', 'error')
  } finally {
    loading.value = false
  }
}

const openOrderDialog = () => {
  orderDialogTab.value = 'buy'
  orderDialog.value = true
}

const viewOrder = (item: MarketItem) => {
  orderDetailType.value = item.itemType
  orderDetailId.value = item.id
  orderDetailDialog.value = true
}

const openReserveDialog = (item: MarketItem) => {
  reservingItem.value = item
  reserveDialog.value = true
}

const onReservationCreated = async () => {
  showSnackbar('Reservation created successfully')
  await loadMarketItems()
}

const onOrderCreated = async (type: 'buy' | 'sell') => {
  showSnackbar(`${type === 'buy' ? 'Buy' : 'Sell'} order created successfully`)
  await loadMarketItems()
}

const openEditDialog = (item: MarketItem) => {
  editingItem.value = item
  editForm.value = {
    price: item.price,
    currency: item.currency,
    orderType: item.orderType,
    quantity: item.quantity,
  }
  editDialog.value = true
}

const saveEdit = async () => {
  if (!editingItem.value) return

  const { valid } = await editFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    if (editingItem.value.itemType === 'sell') {
      await api.sellOrders.update(editingItem.value.id, {
        price: editForm.value.price,
        currency: editForm.value.currency,
        orderType: editForm.value.orderType,
      })
    } else {
      await api.buyOrders.update(editingItem.value.id, {
        price: editForm.value.price,
        currency: editForm.value.currency,
        orderType: editForm.value.orderType,
        quantity: editForm.value.quantity,
      })
    }
    showSnackbar('Order updated successfully')
    editDialog.value = false
    await loadMarketItems()
  } catch (error) {
    console.error('Failed to update order', error)
    const message = error instanceof Error ? error.message : 'Failed to update order'
    showSnackbar(message, 'error')
  } finally {
    saving.value = false
  }
}

const openDeleteDialog = (item: MarketItem) => {
  deletingItem.value = item
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingItem.value) return

  try {
    deleting.value = true
    if (deletingItem.value.itemType === 'sell') {
      await api.sellOrders.delete(deletingItem.value.id)
    } else {
      await api.buyOrders.delete(deletingItem.value.id)
    }
    showSnackbar('Order deleted successfully')
    deleteDialog.value = false
    await loadMarketItems()
  } catch (error) {
    console.error('Failed to delete order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete order'
    showSnackbar(message, 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  loadMarketItems()
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

.clickable-chip {
  cursor: pointer;
  transition: opacity 0.2s;
}

.clickable-chip:hover {
  opacity: 0.8;
}
</style>

<style>
/* Non-scoped to target v-data-table rows */
.own-listing-row {
  background-color: rgba(var(--v-theme-info), 0.08) !important;
}

.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}

/* Ensure own-listing-row takes precedence over alt-row */
.own-listing-row.alt-row {
  background-color: rgba(var(--v-theme-info), 0.08) !important;
}
</style>
