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
                Reserved: {{ item.reservedQuantity.toLocaleString() }}
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
              <v-list-item
                v-if="!item.isOwn && canReserveOrder(item)"
                @click="openReserveDialog(item)"
              >
                <template #prepend>
                  <v-icon color="success">{{
                    item.itemType === 'sell' ? 'mdi-cart-plus' : 'mdi-package-variant'
                  }}</v-icon>
                </template>
                <v-list-item-title>{{
                  item.itemType === 'sell' ? 'Reserve' : 'Fill'
                }}</v-list-item-title>
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
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PERMISSIONS, type Currency, type OrderType } from '@kawakawa/types'
import { api } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import OrderDialog from '../components/OrderDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'

const router = useRouter()
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

const headers = [
  { title: '', key: 'itemType', sortable: true, width: 70 },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'User', key: 'userName', sortable: true },
  { title: 'Price', key: 'price', sortable: true, align: 'end' as const },
  { title: 'Visibility', key: 'orderType', sortable: true },
  { title: '', key: 'actions', sortable: false, width: 50 },
]

const marketItems = ref<MarketItem[]>([])
const loading = ref(false)
const search = ref('')

const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

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

// Filters
const filters = ref<Filters>({
  itemType: null,
  commodity: null,
  category: null,
  location: null,
  userName: null,
  orderType: null,
})

// Row highlighting for own orders
const getRowProps = ({ item }: { item: MarketItem }) => {
  return item.isOwn ? { class: 'own-listing-row' } : {}
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
  router.push(`/orders/${item.itemType}/${item.id}`)
}

const openReserveDialog = (item: MarketItem) => {
  // Navigate to order detail page where user can reserve
  // In the future, this could open a ReservationDialog directly
  router.push(`/orders/${item.itemType}/${item.id}`)
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
</style>
