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
        <!-- Active Filters Display - always visible when filters active -->
        <div v-if="hasActiveFilters" class="d-flex flex-wrap ga-2 mb-3">
          <v-chip
            v-if="filters.itemType"
            closable
            size="small"
            :color="filters.itemType === 'sell' ? 'success' : 'warning'"
            @click:close="filters.itemType = null"
          >
            {{ filters.itemType === 'sell' ? 'Sell' : 'Buy' }}
          </v-chip>
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
            v-if="filters.userName"
            closable
            size="small"
            color="default"
            @click:close="filters.userName = null"
          >
            User: {{ filters.userName }}
          </v-chip>
          <v-chip
            v-if="filters.orderType"
            closable
            size="small"
            :color="filters.orderType === 'partner' ? 'primary' : 'default'"
            @click:close="filters.orderType = null"
          >
            {{ filters.orderType === 'partner' ? 'Partner' : 'Internal' }}
          </v-chip>
          <v-chip
            v-if="filters.pricing"
            closable
            size="small"
            :color="filters.pricing === 'custom' ? 'default' : 'info'"
            @click:close="filters.pricing = null"
          >
            {{ filters.pricing === 'custom' ? 'Custom Pricing' : filters.pricing }}
          </v-chip>
        </div>

        <!-- Collapsible filter dropdowns -->
        <v-expand-transition>
          <v-row v-if="filtersExpanded" dense class="mb-2 filter-row">
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
                multiple
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
                multiple
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
      </v-card-text>
    </v-card>

    <!-- Market Listings Table -->
    <v-card>
      <v-card-title>
        <v-text-field
          v-model="search"
          prepend-icon="mdi-magnify"
          label="Search market..."
          single-line
          hide-details
          clearable
          density="compact"
          style="max-width: 400px"
        />
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredItems"
        :loading="loading"
        :items-per-page="25"
        :row-props="getRowProps"
        :class="['elevation-0', 'clickable-rows', { 'icon-rows': hasIcons }]"
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
            <CommodityDisplay :ticker="item.commodityTicker" />
          </a>
        </template>

        <template #item.category="{ item }">
          <a
            v-if="getCommodityCategory(item.commodityTicker)"
            href="#"
            class="filter-link"
            @click.stop.prevent="setFilter('category', getCommodityCategory(item.commodityTicker))"
          >
            {{
              localizeMaterialCategory(
                getCommodityCategory(item.commodityTicker) as CommodityCategory
              )
            }}
          </a>
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
          <FioAgeChip :fio-uploaded-at="item.fioUploadedAt" />
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
            <PricingModeChip
              v-if="item.pricingMode === 'dynamic'"
              :pricing-mode="item.pricingMode"
              :price-list-code="item.priceListCode"
              size="x-small"
              class="ml-2 d-lg-none"
            />
          </div>
        </template>

        <template #item.pricingMode="{ item }">
          <PricingModeChip
            :pricing-mode="item.pricingMode"
            :price-list-code="item.priceListCode"
            clickable
            @click:dynamic="setFilter('pricing', $event)"
            @click:custom="setFilter('pricing', 'custom')"
          />
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
          <OrderTypeChip
            :order-type="item.orderType"
            clickable
            @click="setFilter('orderType', $event)"
          />
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
    <v-dialog
      v-model="editDialog"
      max-width="500"
      :persistent="editDialogBehavior.persistent.value"
      :no-click-animation="editDialogBehavior.noClickAnimation"
    >
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
import {
  useSnackbar,
  useDisplayHelpers,
  useFormatters,
  useOrderDeepLink,
  useUrlFilters,
  useUrlState,
  useDialogBehavior,
  useMarketData,
  getDisplayPrice,
  type MarketItem,
  type MarketItemType,
} from '../composables'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import ReservationDialog from '../components/ReservationDialog.vue'
import PriceListDisplay from '../components/PriceListDisplay.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import FioAgeChip from '../components/FioAgeChip.vue'
import OrderTypeChip from '../components/OrderTypeChip.vue'
import PricingModeChip from '../components/PricingModeChip.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import { localizeMaterialCategory } from '../utils/materials'
import type { CommodityCategory } from '@kawakawa/types'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay, getCommodityCategory } = useDisplayHelpers()
const { getFioAgeColor } = useFormatters()

// Check if commodity icons are enabled
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Market data from composable
const { marketItems, loading, loadMarketItems } = useMarketData({
  onError: () => showSnackbar('Failed to load market items', 'error'),
})

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
    title: 'Category',
    key: 'category',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
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

// Search with URL deep linking
const search = useUrlState<string | null>({
  param: 'search',
  defaultValue: null,
  debounce: 150,
})

const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

// Order detail dialog with deep linking
const {
  dialogOpen: orderDetailDialog,
  orderType: orderDetailType,
  orderId: orderDetailId,
  openOrder,
} = useOrderDeepLink()

// Edit dialog
const editDialog = ref(false)
const editDialogBehavior = useDialogBehavior({ modelValue: editDialog })
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

// Filters with URL deep linking
const { filters, hasActiveFilters, clearFilters, setFilter } = useUrlFilters({
  schema: {
    itemType: { type: 'string' },
    commodity: { type: 'array' },
    category: { type: 'string' },
    location: { type: 'array' },
    userName: { type: 'string' },
    orderType: { type: 'string' },
    pricing: { type: 'string' },
  },
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
  return Array.from(categories)
    .sort()
    .map(cat => ({
      title: localizeMaterialCategory(cat as CommodityCategory),
      value: cat,
    }))
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

// hasActiveFilters, clearFilters, and setFilter are provided by useUrlFilters

const filteredItems = computed(() => {
  let result = marketItems.value

  // Apply string filters (single-select)
  if (filters.value.itemType) {
    result = result.filter(l => l.itemType === filters.value.itemType)
  }
  if (filters.value.category) {
    result = result.filter(l => getCommodityCategory(l.commodityTicker) === filters.value.category)
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

  // Apply array filters (multi-select)
  if (filters.value.commodity.length > 0) {
    result = result.filter(l => filters.value.commodity.includes(l.commodityTicker))
  }
  if (filters.value.location.length > 0) {
    result = result.filter(l => filters.value.location.includes(l.locationId))
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

const openOrderDialog = () => {
  orderDialogTab.value = 'buy'
  orderDialog.value = true
}

const viewOrder = (item: MarketItem) => {
  openOrder(item.itemType, item.id)
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

/* Larger row height when commodity icons are enabled */
.icon-rows tbody tr td {
  height: 64px !important;
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

<style>
/* Unscoped: align all filter inputs to same height */
.filter-row .v-field__input {
  min-height: 48px;
  padding-top: 12px;
  padding-bottom: 2px;
}
</style>
