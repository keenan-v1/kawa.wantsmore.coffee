<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">Market</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Delete Confirmation Dialog -->
    <ConfirmationDialog
      v-model="deleteDialog"
      :title="`Delete ${deletingItem?.itemType === 'sell' ? 'Sell' : 'Buy'} Order`"
      :loading="deleting"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="confirmDelete"
    >
      Are you sure you want to delete your
      {{ deletingItem?.itemType === 'sell' ? 'sell' : 'buy' }} order for
      <strong>{{ deletingItem ? getCommodityDisplay(deletingItem.commodityTicker) : '' }}</strong>
      at <strong>{{ deletingItem ? getLocationDisplay(deletingItem.locationId) : '' }}</strong
      >?
    </ConfirmationDialog>

    <!-- Filters Card -->
    <v-card class="mb-4">
      <v-card-text class="py-2">
        <!-- Collapsed view: single row with Filters button and Create Order -->
        <v-row v-if="!filtersExpanded && !hasActiveFilters" dense align="center">
          <v-col cols="auto">
            <v-btn
              variant="outlined"
              prepend-icon="mdi-filter-variant"
              @click="filtersExpanded = true"
            >
              Filters
            </v-btn>
          </v-col>
          <v-spacer />
          <v-col cols="auto">
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

        <!-- Expanded view: all filter dropdowns -->
        <template v-else>
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
                :favorites="settingsStore.favoritedCommodities.value"
                label="Commodity"
                density="compact"
                clearable
                hide-details
                @update:favorites="
                  settingsStore.updateSetting('market.favoritedCommodities', $event)
                "
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
                :favorites="settingsStore.favoritedLocations.value"
                label="Location"
                density="compact"
                clearable
                hide-details
                @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
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
                v-model="filters.pricing"
                :items="pricingOptions"
                item-title="title"
                item-value="value"
                label="Pricing"
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
              <div>
                <v-btn
                  v-if="hasActiveFilters"
                  variant="text"
                  color="primary"
                  size="small"
                  @click="clearFilters"
                >
                  Clear Filters
                </v-btn>
                <v-btn v-else variant="text" size="small" @click="filtersExpanded = false">
                  Hide Filters
                </v-btn>
              </div>
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
        </template>
      </v-card-text>
    </v-card>

    <!-- Market Listings Table -->
    <v-card>
      <v-card-title>
        <v-row>
          <v-col cols="12" md="4">
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
          <v-col cols="12" md="4" class="text-right">
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
        class="elevation-0 clickable-rows"
        @click:row="onRowClick"
      >
        <template #item.itemType="{ item }">
          <v-chip
            :color="item.itemType === 'sell' ? 'success' : 'warning'"
            size="small"
            variant="flat"
            class="clickable-chip"
            @click.stop="setFilter('itemType', item.itemType)"
          >
            {{ item.itemType === 'sell' ? 'SELL' : 'BUY' }}
          </v-chip>
        </template>

        <template #item.commodityTicker="{ item }">
          <a
            href="#"
            class="font-weight-medium filter-link"
            @click.stop.prevent="setFilter('commodity', item.commodityTicker)"
          >
            {{ getCommodityDisplay(item.commodityTicker) }}
          </a>
          <div v-if="getCommodityCategory(item.commodityTicker)" class="d-none d-lg-block">
            <a
              href="#"
              class="text-caption text-medium-emphasis filter-link"
              @click.stop.prevent="
                setFilter('category', getCommodityCategory(item.commodityTicker))
              "
            >
              {{ getCommodityCategory(item.commodityTicker) }}
            </a>
          </div>
        </template>

        <template #item.locationId="{ item }">
          <a
            href="#"
            class="font-weight-medium filter-link"
            @click.stop.prevent="setFilter('location', item.locationId)"
          >
            {{ getLocationDisplay(item.locationId) }}
          </a>
        </template>

        <template #item.userName="{ item }">
          <a
            href="#"
            class="filter-link"
            :class="{ 'font-weight-medium': item.isOwn }"
            @click.stop.prevent="setFilter('userName', item.userName)"
          >
            {{ item.userName }}
          </a>
        </template>

        <template #item.fioUploadedAt="{ item }">
          <v-chip
            v-if="item.fioUploadedAt"
            size="small"
            variant="tonal"
            :color="getFioAgeColor(item.fioUploadedAt)"
          >
            {{ formatRelativeTime(item.fioUploadedAt) }}
          </v-chip>
          <span v-else class="text-medium-emphasis text-caption">—</span>
        </template>

        <template #item.price="{ item }">
          <div class="d-flex align-center">
            <template v-if="getDisplayPrice(item) !== null">
              <span class="font-weight-medium">
                {{
                  getDisplayPrice(item)!.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                }}
              </span>
              <span class="text-caption text-medium-emphasis ml-1">{{ item.currency }}</span>
            </template>
            <span v-else class="text-medium-emphasis">--</span>
            <!-- Inline pricing chip for small screens -->
            <v-chip
              v-if="item.pricingMode === 'dynamic'"
              size="x-small"
              color="info"
              variant="tonal"
              class="ml-2 d-lg-none"
            >
              {{ item.priceListCode }}
            </v-chip>
          </div>
        </template>

        <template #item.pricingMode="{ item }">
          <v-chip
            v-if="item.pricingMode === 'dynamic'"
            size="small"
            color="info"
            variant="tonal"
            class="clickable-chip"
            @click.stop="setFilter('pricing', item.priceListCode)"
          >
            {{ item.priceListCode }}
          </v-chip>
          <v-chip
            v-else
            size="small"
            color="default"
            variant="outlined"
            class="clickable-chip"
            @click.stop="setFilter('pricing', 'custom')"
          >
            Custom
          </v-chip>
        </template>

        <template #item.quantity="{ item }">
          <v-tooltip location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium">
                {{ item.remainingQuantity.toLocaleString() }}
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
            @click.stop="setFilter('orderType', item.orderType)"
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
              <v-btn v-bind="props" icon size="small" variant="text" @click.stop>
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <!-- Reserve/Fill option for small screens -->
              <v-list-item
                v-if="!item.isOwn && canReserveOrder(item)"
                class="d-lg-none"
                @click="openReserveDialog(item)"
              >
                <template #prepend>
                  <v-icon :color="item.itemType === 'sell' ? 'warning' : 'success'">
                    {{ item.itemType === 'sell' ? 'mdi-cart-arrow-down' : 'mdi-package-variant' }}
                  </v-icon>
                </template>
                <v-list-item-title>
                  {{ item.itemType === 'sell' ? 'Reserve' : 'Fill' }}
                </v-list-item-title>
              </v-list-item>
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

            <!-- Automatic Pricing Toggle -->
            <div class="d-flex align-center mb-3 text-body-2">
              <span class="text-medium-emphasis">Automatic Pricing:</span>
              <a
                v-if="editForm.usePriceList"
                href="#"
                tabindex="-1"
                class="ml-2 font-weight-medium text-primary"
                @click.prevent="toggleEditPricing(false)"
              >
                ON
              </a>
              <a
                v-else-if="canUseDynamicPricing"
                href="#"
                tabindex="-1"
                class="ml-2 font-weight-medium text-primary"
                @click.prevent="toggleEditPricing(true)"
              >
                OFF
              </a>
              <span v-else class="ml-2 text-medium-emphasis">
                OFF
                <v-tooltip location="top">
                  <template #activator="{ props: tooltipProps }">
                    <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-1">
                      mdi-alert-circle-outline
                    </v-icon>
                  </template>
                  <span>Set a default price list in Account Settings to enable</span>
                </v-tooltip>
              </span>
              <v-chip
                v-if="editForm.usePriceList"
                size="x-small"
                color="info"
                variant="tonal"
                class="ml-2"
              >
                {{ editForm.priceListCode }}
              </v-chip>
            </div>

            <!-- Dynamic Pricing Display (when using price list) -->
            <PriceListDisplay
              v-if="editForm.usePriceList"
              :loading="loadingEditSuggestedPrice"
              :price="editSuggestedPrice"
              :price-list-code="settingsStore.defaultPriceList.value ?? ''"
              :requested-currency="editForm.currency"
              :fallback-location-display="
                editSuggestedPrice?.locationId
                  ? getLocationDisplay(editSuggestedPrice.locationId)
                  : ''
              "
              :requested-location-display="
                editSuggestedPrice?.requestedLocationId
                  ? getLocationDisplay(editSuggestedPrice.requestedLocationId)
                  : ''
              "
              class="mb-4"
            />

            <!-- Custom Price Input (when not using price list) -->
            <v-row v-if="!editForm.usePriceList">
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
      @edit="onEditFromDetail"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PERMISSIONS, type Currency, type OrderType } from '@kawakawa/types'
import { api, type EffectivePrice } from '../services/api'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useSnackbar, useDisplayHelpers, useFormatters } from '../composables'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import ReservationDialog from '../components/ReservationDialog.vue'
import PriceListDisplay from '../components/PriceListDisplay.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay, getCommodityCategory } = useDisplayHelpers()
const { formatRelativeTime, getFioAgeColor } = useFormatters()

// Unified market item type
type MarketItemType = 'sell' | 'buy'
type PricingMode = 'fixed' | 'dynamic'

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
  pricingMode: PricingMode
  effectivePrice: number | null
  priceListCode: string | null
}

// Get display price for an item (effective price for dynamic, regular price for fixed)
const getDisplayPrice = (item: MarketItem): number | null => {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price
}

interface Filters {
  itemType: MarketItemType | null
  commodity: string | null
  category: string | null
  location: string | null
  userName: string | null
  orderType: OrderType | null
  pricing: string | null // 'custom' or price list code
}

const headers = [
  {
    title: '',
    key: 'itemType',
    sortable: true,
    width: 70,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  { title: 'Qty', key: 'quantity', sortable: true, align: 'end' as const, width: 80 },
  {
    title: 'Commodity',
    key: 'commodityTicker',
    sortable: true,
    cellProps: { class: 'col-commodity' },
    headerProps: { class: 'col-commodity' },
  },
  {
    title: 'Location',
    key: 'locationId',
    sortable: true,
    cellProps: { class: 'col-location' },
    headerProps: { class: 'col-location' },
  },
  { title: 'User', key: 'userName', sortable: true, width: 120 },
  {
    title: 'FIO Age',
    key: 'fioUploadedAt',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  { title: 'Price', key: 'price', sortable: true },
  {
    title: 'Pricing',
    key: 'pricingMode',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  {
    title: 'Visibility',
    key: 'orderType',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  {
    title: '',
    key: 'reserve',
    sortable: false,
    width: 90,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
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
  usePriceList: false,
  priceListCode: null as string | null,
})

// Suggested price for edit dialog
const loadingEditSuggestedPrice = ref(false)
const editSuggestedPrice = ref<EffectivePrice | null>(null)

// Check if user can use dynamic pricing (has a default price list)
const canUseDynamicPricing = computed(() => {
  return settingsStore.defaultPriceList.value !== null
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
  pricing: null,
})
const filtersExpanded = ref(false)

// Get FIO age border class for responsive view
const getFioBorderClass = (fioUploadedAt: string | null): string => {
  if (!fioUploadedAt) return 'fio-border-none'
  const color = getFioAgeColor(fioUploadedAt)
  return `fio-border-${color}`
}

// Row highlighting for own orders and alternating colors
const getRowProps = ({ item, index }: { item: MarketItem; index: number }) => {
  const classes: string[] = []
  if (item.isOwn) classes.push('own-listing-row')
  if (index % 2 === 1) classes.push('alt-row')
  // Add border classes for responsive view
  classes.push(item.itemType === 'sell' ? 'type-border-sell' : 'type-border-buy')
  classes.push(getFioBorderClass(item.fioUploadedAt))
  return { class: classes.join(' ') }
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

const pricingOptions = computed(() => {
  const options: { title: string; value: string }[] = [{ title: 'Custom', value: 'custom' }]
  const priceLists = new Set(
    marketItems.value.filter(l => l.priceListCode).map(l => l.priceListCode!)
  )
  for (const code of Array.from(priceLists).sort()) {
    options.push({ title: code, value: code })
  }
  return options
})

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
    pricing: null,
  }
}

const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
  if (value) {
    filters.value[key] = value
  }
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
  if (filters.value.pricing) {
    if (filters.value.pricing === 'custom') {
      result = result.filter(l => l.pricingMode === 'fixed')
    } else {
      result = result.filter(l => l.priceListCode === filters.value.pricing)
    }
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
      pricingMode: listing.pricingMode,
      effectivePrice: listing.effectivePrice,
      priceListCode: listing.priceListCode,
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
      pricingMode: request.pricingMode,
      effectivePrice: request.effectivePrice,
      priceListCode: request.priceListCode,
    }))

    // Combine and sort by commodity, then location, then price (using effective price for dynamic)
    marketItems.value = [...sellItems, ...buyItems].sort((a, b) => {
      if (a.commodityTicker !== b.commodityTicker) {
        return a.commodityTicker.localeCompare(b.commodityTicker)
      }
      if (a.locationId !== b.locationId) {
        return a.locationId.localeCompare(b.locationId)
      }
      // Use display price for sorting (effective for dynamic, regular for fixed)
      const priceA = getDisplayPrice(a) ?? Infinity
      const priceB = getDisplayPrice(b) ?? Infinity
      return priceA - priceB
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

// Handler for row clicks on the data table
const onRowClick = (_event: Event, { item }: { item: MarketItem }) => {
  viewOrder(item)
}

// Handler for edit event from OrderDetailDialog
const onEditFromDetail = (orderType: 'sell' | 'buy', orderId: number) => {
  const item = marketItems.value.find(i => i.itemType === orderType && i.id === orderId)
  if (item) {
    openEditDialog(item)
  }
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

// Load suggested price for edit dialog
const loadEditSuggestedPrice = async () => {
  if (!editingItem.value) return
  const commodity = editingItem.value.commodityTicker
  const location = editingItem.value.locationId
  const currency = editForm.value.currency
  const priceList = settingsStore.defaultPriceList.value

  if (!commodity || !location || !currency || !priceList) {
    editSuggestedPrice.value = null
    return
  }

  try {
    loadingEditSuggestedPrice.value = true
    const prices = await api.prices.getEffective(priceList, location, currency)
    const price = prices.find((p: EffectivePrice) => p.commodityTicker === commodity)
    editSuggestedPrice.value = price ?? null
  } catch {
    editSuggestedPrice.value = null
  } finally {
    loadingEditSuggestedPrice.value = false
  }
}

const openEditDialog = (item: MarketItem) => {
  editingItem.value = item
  const usePriceList = item.pricingMode === 'dynamic' && item.priceListCode !== null
  editForm.value = {
    price: item.price,
    currency: item.currency,
    orderType: item.orderType,
    quantity: item.quantity,
    usePriceList,
    priceListCode: item.priceListCode,
  }
  editSuggestedPrice.value = null
  editDialog.value = true
  // Load suggested price if user has a default price list
  if (settingsStore.defaultPriceList.value) {
    loadEditSuggestedPrice()
  }
}

// Toggle automatic pricing in edit form
const toggleEditPricing = (enable: boolean) => {
  editForm.value.usePriceList = enable
  if (enable) {
    editForm.value.priceListCode = settingsStore.defaultPriceList.value
    editForm.value.price = 0
  } else {
    editForm.value.priceListCode = null
    // Keep the existing price or set a default
    if (editForm.value.price === 0 && editingItem.value) {
      // If switching from dynamic to custom, use effective price if available
      editForm.value.price = editingItem.value.effectivePrice ?? 1
    }
  }
}

const saveEdit = async () => {
  if (!editingItem.value) return

  const { valid } = await editFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    const priceListCode = editForm.value.usePriceList ? editForm.value.priceListCode : null
    const price = editForm.value.usePriceList ? 0 : editForm.value.price

    if (editingItem.value.itemType === 'sell') {
      await api.sellOrders.update(editingItem.value.id, {
        price,
        currency: editForm.value.currency,
        orderType: editForm.value.orderType,
        priceListCode,
      })
    } else {
      await api.buyOrders.update(editingItem.value.id, {
        price,
        currency: editForm.value.currency,
        orderType: editForm.value.orderType,
        quantity: editForm.value.quantity,
        priceListCode,
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
.filter-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}

.filter-link:hover {
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

/* Column width constraints */
.col-commodity {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-location {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style>
/* Non-scoped to target v-data-table rows */
.clickable-rows tbody tr {
  cursor: pointer;
}

.clickable-rows tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

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

/* Responsive borders for smaller screens (below lg breakpoint) */
@media (max-width: 1279px) {
  /* Left border for Buy/Sell type */
  .type-border-sell > td:nth-child(2) {
    border-left: 6px solid rgb(var(--v-theme-success)) !important;
  }
  .type-border-buy > td:nth-child(2) {
    border-left: 6px solid rgb(var(--v-theme-warning)) !important;
  }

  /* Right border for FIO age */
  .fio-border-success > td:last-child {
    border-right: 6px solid rgb(var(--v-theme-success)) !important;
  }
  .fio-border-default > td:last-child {
    border-right: 6px solid rgba(var(--v-theme-on-surface), 0.3) !important;
  }
  .fio-border-warning > td:last-child {
    border-right: 6px solid rgb(var(--v-theme-warning)) !important;
  }
  .fio-border-error > td:last-child {
    border-right: 6px solid rgb(var(--v-theme-error)) !important;
  }
  .fio-border-none > td:last-child {
    border-right: 6px solid rgba(var(--v-theme-on-surface), 0.12) !important;
  }

  /* Hide columns that should be hidden below lg breakpoint */
  .v-data-table th.col-hidden-below-lg,
  .v-data-table td.col-hidden-below-lg {
    display: none !important;
  }
}
</style>
