<template>
  <v-dialog v-model="dialog" max-width="700" scrollable>
    <v-card>
      <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
        {{ snackbar.message }}
      </v-snackbar>

      <!-- Loading State -->
      <v-card-text v-if="loading" class="text-center py-8">
        <v-progress-circular indeterminate color="primary" size="48" />
        <p class="mt-4 text-body-2">Loading order details...</p>
      </v-card-text>

      <!-- Error State -->
      <v-card-text v-else-if="error">
        <v-alert type="error">{{ error }}</v-alert>
      </v-card-text>

      <!-- Order Details -->
      <template v-else-if="order">
        <v-card-title class="d-flex align-center pb-0">
          <div>
            <span class="text-h6">
              {{ orderType === 'sell' ? 'Sell' : 'Buy' }} Order #{{ orderId }}
            </span>
            <div class="text-body-2 text-medium-emphasis">
              {{ getCommodityDisplay(order.commodityTicker) }} at
              {{ getLocationDisplay(order.locationId) }}
              <span v-if="!isOwnOrder && ownerName">
                &bull; {{ orderType === 'sell' ? 'Seller' : 'Buyer' }}: {{ ownerName }}
              </span>
            </div>
          </div>
          <v-spacer />
          <v-btn icon variant="text" size="small" @click="close">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="pt-4">
          <!-- Order Info Grid -->
          <v-row dense>
            <!-- Row 1: Commodity, Location, User/FIO Age, Visibility -->
            <v-col cols="6" sm="3">
              <div class="text-caption text-medium-emphasis">Commodity</div>
              <div class="text-body-1 font-weight-medium">
                {{ getCommodityDisplay(order.commodityTicker) }}
              </div>
              <div
                v-if="getCommodityCategory(order.commodityTicker)"
                class="text-caption text-medium-emphasis"
              >
                {{ getCommodityCategory(order.commodityTicker) }}
              </div>
            </v-col>
            <v-col cols="6" sm="3">
              <div class="text-caption text-medium-emphasis">Location</div>
              <div class="text-body-1 font-weight-medium">
                {{ getLocationDisplay(order.locationId) }}
              </div>
            </v-col>
            <!-- FIO Age column for sell orders only -->
            <v-col v-if="orderType === 'sell'" cols="6" sm="3">
              <div class="text-caption text-medium-emphasis">FIO Age</div>
              <v-chip
                v-if="(order as SellOrderData).fioUploadedAt"
                size="small"
                variant="tonal"
                :color="getFioAgeColor((order as SellOrderData).fioUploadedAt!)"
              >
                {{ formatRelativeTime((order as SellOrderData).fioUploadedAt!) }}
              </v-chip>
              <span v-else class="text-medium-emphasis">—</span>
            </v-col>
            <!-- Empty placeholder column for buy orders to maintain grid alignment -->
            <v-col v-else cols="6" sm="3" />
            <v-col cols="6" sm="3">
              <div class="text-caption text-medium-emphasis">Visibility</div>
              <v-chip
                :color="order.orderType === 'partner' ? 'primary' : 'default'"
                size="small"
                variant="tonal"
              >
                {{ order.orderType === 'partner' ? 'Partner' : 'Internal' }}
              </v-chip>
            </v-col>

            <!-- Row 2: Quantity, Remaining, Price -->
            <v-col cols="6" sm="3">
              <div class="text-caption text-medium-emphasis">
                {{ orderType === 'sell' ? 'Available' : 'Quantity' }}
              </div>
              <div class="text-body-1 font-weight-medium">
                {{
                  orderType === 'sell'
                    ? (order as SellOrderData).availableQuantity.toLocaleString()
                    : (order as BuyOrderData).quantity.toLocaleString()
                }}
              </div>
            </v-col>
            <v-col cols="6" sm="3">
              <div class="text-caption text-medium-emphasis">Remaining</div>
              <div class="text-body-1 font-weight-medium">
                {{ order.remainingQuantity.toLocaleString() }}
                <span v-if="order.reservedQuantity > 0" class="text-caption text-medium-emphasis">
                  ({{ order.reservedQuantity }} {{ orderType === 'buy' ? 'filled' : 'reserved' }})
                </span>
              </div>
            </v-col>
            <v-col cols="6" sm="6">
              <div class="text-caption text-medium-emphasis">Price</div>
              <div class="d-flex align-center">
                <div class="text-body-1 font-weight-medium">
                  <template v-if="displayPrice !== null">
                    {{ formatPrice(displayPrice) }}
                    <span class="text-caption text-medium-emphasis">{{ order.currency }}</span>
                  </template>
                  <span v-else class="text-medium-emphasis">--</span>
                </div>
                <!-- Fallback location indicator -->
                <v-tooltip v-if="order.isFallback && order.priceLocationId" location="top">
                  <template #activator="{ props: tooltipProps }">
                    <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-1">
                      mdi-map-marker-question
                    </v-icon>
                  </template>
                  <span>
                    Price from {{ getLocationDisplay(order.priceLocationId) }} (default location)
                  </span>
                </v-tooltip>
                <v-chip
                  v-if="order.priceListCode"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ order.priceListCode }}
                </v-chip>
                <v-chip v-else size="x-small" color="default" variant="outlined" class="ml-2">
                  Custom
                </v-chip>
              </div>
            </v-col>
          </v-row>

          <!-- Reservations Section (for own orders) -->
          <template v-if="isOwnOrder">
            <v-divider class="my-4" />

            <div class="d-flex align-center mb-2">
              <span class="text-subtitle-2">Reservations</span>
              <v-chip
                v-if="order.activeReservationCount > 0"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                {{ order.activeReservationCount }} active
              </v-chip>
              <v-spacer />
              <v-btn-toggle
                v-model="showActiveOnly"
                mandatory
                density="compact"
                variant="outlined"
                size="small"
              >
                <v-btn :value="true">Active</v-btn>
                <v-btn :value="false">All</v-btn>
              </v-btn-toggle>
            </div>

            <div v-if="loadingReservations" class="text-center py-4">
              <v-progress-circular indeterminate size="24" />
            </div>

            <div v-else-if="filteredReservations.length === 0" class="text-center py-4">
              <v-icon size="32" color="grey-lighten-1">mdi-clipboard-text-off-outline</v-icon>
              <p class="text-body-2 mt-1">
                {{ showActiveOnly ? 'No active reservations' : 'No reservations yet' }}
              </p>
              <v-btn
                v-if="showActiveOnly && reservations.length > 0"
                variant="text"
                size="small"
                @click="showActiveOnly = false"
              >
                Show all ({{ reservations.length }})
              </v-btn>
            </div>

            <!-- Reservations Table -->
            <v-table v-else density="compact" class="reservations-table">
              <thead>
                <tr>
                  <th style="width: 28px"></th>
                  <th class="text-left">Counterparty</th>
                  <th class="text-right">Qty</th>
                  <th class="text-left">Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <template
                  v-for="(reservation, index) in filteredReservations"
                  :key="reservation.id"
                >
                  <tr
                    class="reservation-row"
                    :class="{ 'alt-row': index % 2 === 1 }"
                    @click="toggleReservationExpanded(reservation.id)"
                  >
                    <td class="pa-0">
                      <v-icon size="small" class="expand-icon">
                        {{
                          expandedReservations[reservation.id]
                            ? 'mdi-chevron-down'
                            : 'mdi-chevron-right'
                        }}
                      </v-icon>
                    </td>
                    <td>
                      <div class="text-truncate" style="max-width: 120px">
                        {{ reservation.counterpartyName }}
                      </div>
                    </td>
                    <td class="text-right">{{ reservation.quantity.toLocaleString() }}</td>
                    <td>
                      <ReservationStatusChip :status="reservation.status" size="x-small" />
                    </td>
                    <td class="text-right" @click.stop>
                      <div class="d-flex justify-end ga-1">
                        <!-- Order owner actions on pending reservations -->
                        <template v-if="reservation.status === 'pending'">
                          <v-btn
                            color="success"
                            variant="text"
                            size="x-small"
                            icon
                            :loading="actionLoading === `confirm-${reservation.id}`"
                            @click="confirmReservation(reservation.id)"
                          >
                            <v-icon>mdi-check</v-icon>
                            <v-tooltip activator="parent" location="top">Confirm</v-tooltip>
                          </v-btn>
                          <v-btn
                            color="error"
                            variant="text"
                            size="x-small"
                            icon
                            :loading="actionLoading === `reject-${reservation.id}`"
                            @click="rejectReservation(reservation.id)"
                          >
                            <v-icon>mdi-close</v-icon>
                            <v-tooltip activator="parent" location="top">Reject</v-tooltip>
                          </v-btn>
                        </template>

                        <!-- Order owner actions on confirmed reservations -->
                        <template v-if="reservation.status === 'confirmed'">
                          <v-btn
                            color="success"
                            variant="text"
                            size="x-small"
                            icon
                            :loading="actionLoading === `fulfill-${reservation.id}`"
                            @click="fulfillReservation(reservation.id)"
                          >
                            <v-icon>mdi-check-all</v-icon>
                            <v-tooltip activator="parent" location="top">Mark Fulfilled</v-tooltip>
                          </v-btn>
                          <v-btn
                            color="warning"
                            variant="text"
                            size="x-small"
                            icon
                            :loading="actionLoading === `cancel-${reservation.id}`"
                            @click="cancelReservation(reservation.id)"
                          >
                            <v-icon>mdi-cancel</v-icon>
                            <v-tooltip activator="parent" location="top">Cancel</v-tooltip>
                          </v-btn>
                        </template>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="expandedReservations[reservation.id]" class="expanded-row">
                    <td colspan="5" class="pa-2 bg-grey-darken-4">
                      <div class="d-flex flex-wrap text-caption text-medium-emphasis ga-4">
                        <div>
                          <span class="text-uppercase">Created:</span>
                          <span class="text-body-2 ml-1">
                            {{ formatRelativeDate(reservation.createdAt) }}
                          </span>
                        </div>
                        <div v-if="reservation.expiresAt">
                          <span class="text-uppercase">Expires:</span>
                          <span class="text-body-2 ml-1">
                            {{ formatDateTime(reservation.expiresAt) }}
                          </span>
                        </div>
                        <div v-if="reservation.notes">
                          <span class="text-uppercase">Notes:</span>
                          <span class="text-body-2 ml-1">{{ reservation.notes }}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </v-table>
          </template>
        </v-card-text>

        <v-card-actions>
          <template v-if="isOwnOrder">
            <v-btn color="error" variant="text" prepend-icon="mdi-delete" @click="confirmDelete">
              Delete
            </v-btn>
            <v-spacer />
            <v-btn variant="text" @click="close">Close</v-btn>
            <v-btn color="primary" prepend-icon="mdi-pencil" @click="editOrder"> Edit </v-btn>
          </template>
          <template v-else>
            <v-spacer />
            <v-btn variant="text" @click="close">Close</v-btn>
            <v-btn
              v-if="canReserve"
              :color="orderType === 'sell' ? 'warning' : 'success'"
              :prepend-icon="orderType === 'sell' ? 'mdi-cart-plus' : 'mdi-package-variant'"
              @click="openReserveDialog"
            >
              {{ orderType === 'sell' ? 'Reserve' : 'Fill' }}
            </v-btn>
          </template>
        </v-card-actions>
      </template>
    </v-card>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete this {{ orderType }} order? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="deleteOrder">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reserve Dialog -->
    <v-dialog v-model="reserveDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>
          {{ orderType === 'sell' ? 'Reserve from Order' : 'Fill Order' }}
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model.number="reserveQuantity"
            type="number"
            label="Quantity"
            :min="1"
            :max="order?.remainingQuantity"
            :rules="[
              v => !!v || 'Quantity is required',
              v => v >= 1 || 'Minimum quantity is 1',
              v =>
                v <= (order?.remainingQuantity ?? 0) ||
                `Maximum quantity is ${order?.remainingQuantity}`,
            ]"
          />
          <v-textarea v-model="reserveNotes" label="Notes (optional)" rows="2" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="reserveDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="reserving"
            :disabled="
              !reserveQuantity ||
              reserveQuantity < 1 ||
              reserveQuantity > (order?.remainingQuantity ?? 0)
            "
            @click="createReservation"
          >
            {{ orderType === 'sell' ? 'Reserve' : 'Fill' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type SellOrderResponse,
  type BuyOrderResponse,
  type MarketListing,
  type MarketBuyRequest,
  type ReservationWithDetails,
} from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useFormatters } from '../composables'
import { formatRelativeDate, formatDateTime } from '../utils/dateFormat'
import ReservationStatusChip from './ReservationStatusChip.vue'

// Pricing mode type
type PricingMode = 'fixed' | 'dynamic'

// Types for normalized order data with price list info
type SellOrderData = SellOrderResponse & {
  sellerName?: string
  priceListCode?: string | null
  effectivePrice?: number | null
  isFallback?: boolean
  priceLocationId?: string | null
  pricingMode?: PricingMode
  fioUploadedAt?: string | null
}
type BuyOrderData = BuyOrderResponse & {
  buyerName?: string
  priceListCode?: string | null
  effectivePrice?: number | null
  isFallback?: boolean
  priceLocationId?: string | null
  pricingMode?: PricingMode
}
type OrderData = SellOrderData | BuyOrderData

const props = defineProps<{
  modelValue: boolean
  orderType: 'sell' | 'buy'
  orderId: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'deleted'): void
  (e: 'updated'): void
  (e: 'edit', orderType: 'sell' | 'buy', orderId: number): void
}>()

const userStore = useUserStore()
const { formatRelativeTime, getFioAgeColor } = useFormatters()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// State
const loading = ref(true)
const error = ref<string | null>(null)
const order = ref<OrderData | null>(null)
const ownerName = ref<string | null>(null)
const isOwnOrder = ref(false)
const reservations = ref<ReservationWithDetails[]>([])
const loadingReservations = ref(false)
const actionLoading = ref<string | null>(null)
const showActiveOnly = ref(true)
const expandedReservations = ref<Record<number, boolean>>({})

// Active statuses are pending and confirmed
const activeStatuses = ['pending', 'confirmed']

const filteredReservations = computed(() => {
  if (!showActiveOnly.value) {
    return reservations.value
  }
  return reservations.value.filter(r => activeStatuses.includes(r.status))
})

// Get display price - effective price for dynamic, regular price for fixed
const displayPrice = computed((): number | null => {
  if (!order.value) return null
  if (order.value.pricingMode === 'dynamic') {
    return order.value.effectivePrice ?? null
  }
  return order.value.price
})

const toggleReservationExpanded = (id: number) => {
  expandedReservations.value[id] = !expandedReservations.value[id]
}

// Dialog state
const deleteDialog = ref(false)
const deleting = ref(false)
const reserveDialog = ref(false)
const reserveQuantity = ref(1)
const reserveNotes = ref('')
const reserving = ref(false)

// Snackbar
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

function showSnackbar(message: string, color: string = 'success') {
  snackbar.value = { show: true, message, color }
}

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

const formatPrice = (price: number): string => {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Permission checks
const canReserveInternal = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_INTERNAL)
)
const canReservePartner = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_PARTNER)
)

const canReserve = computed(() => {
  if (!order.value || isOwnOrder.value) return false
  if (order.value.remainingQuantity <= 0) return false
  if (order.value.orderType === 'internal') return canReserveInternal.value
  if (order.value.orderType === 'partner') return canReservePartner.value
  return false
})

// Fetch order data
async function loadOrder() {
  loading.value = true
  error.value = null
  expandedReservations.value = {}

  try {
    if (props.orderType === 'sell') {
      try {
        const sellOrder = await api.sellOrders.get(props.orderId)
        order.value = sellOrder
        isOwnOrder.value = true
      } catch {
        const listings = await api.market.getListings()
        const listing = listings.find((l: MarketListing) => l.id === props.orderId)
        if (listing) {
          order.value = {
            id: listing.id,
            commodityTicker: listing.commodityTicker,
            locationId: listing.locationId,
            price: listing.price,
            currency: listing.currency,
            orderType: listing.orderType,
            availableQuantity: listing.availableQuantity,
            activeReservationCount: listing.activeReservationCount,
            reservedQuantity: listing.reservedQuantity,
            remainingQuantity: listing.remainingQuantity,
            limitMode: 'none',
            limitQuantity: null,
            fioQuantity: listing.availableQuantity,
            sellerName: listing.sellerName,
            priceListCode: listing.priceListCode,
            effectivePrice: listing.effectivePrice,
            isFallback: listing.isFallback,
            priceLocationId: listing.priceLocationId,
            pricingMode: listing.pricingMode,
            fioUploadedAt: listing.fioUploadedAt,
          } as SellOrderData
          ownerName.value = listing.sellerName
          isOwnOrder.value = false
        } else {
          throw new Error('Order not found')
        }
      }
    } else {
      try {
        const buyOrder = await api.buyOrders.get(props.orderId)
        order.value = buyOrder
        isOwnOrder.value = true
      } catch {
        const requests = await api.market.getBuyRequests()
        const request = requests.find((r: MarketBuyRequest) => r.id === props.orderId)
        if (request) {
          order.value = {
            id: request.id,
            commodityTicker: request.commodityTicker,
            locationId: request.locationId,
            quantity: request.quantity,
            price: request.price,
            currency: request.currency,
            orderType: request.orderType,
            activeReservationCount: request.activeReservationCount,
            reservedQuantity: request.reservedQuantity,
            remainingQuantity: request.remainingQuantity,
            buyerName: request.buyerName,
            priceListCode: request.priceListCode,
            effectivePrice: request.effectivePrice,
            isFallback: request.isFallback,
            priceLocationId: request.priceLocationId,
            pricingMode: request.pricingMode,
          } as BuyOrderData
          ownerName.value = request.buyerName
          isOwnOrder.value = false
        } else {
          throw new Error('Order not found')
        }
      }
    }

    if (isOwnOrder.value) {
      await loadReservations()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load order'
  } finally {
    loading.value = false
  }
}

async function loadReservations() {
  loadingReservations.value = true
  try {
    // Use 'owner' role to get reservations where user owns the order
    const allReservations = await api.reservations.list('owner')
    reservations.value = allReservations.filter((r: ReservationWithDetails) =>
      props.orderType === 'sell' ? r.sellOrderId === props.orderId : r.buyOrderId === props.orderId
    )
  } catch (e) {
    console.error('Failed to load reservations:', e)
  } finally {
    loadingReservations.value = false
  }
}

function close() {
  dialog.value = false
}

function editOrder() {
  emit('edit', props.orderType, props.orderId)
  close()
}

function confirmDelete() {
  deleteDialog.value = true
}

async function deleteOrder() {
  deleting.value = true
  try {
    if (props.orderType === 'sell') {
      await api.sellOrders.delete(props.orderId)
    } else {
      await api.buyOrders.delete(props.orderId)
    }
    showSnackbar('Order deleted successfully')
    emit('deleted')
    close()
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to delete order', 'error')
  } finally {
    deleting.value = false
    deleteDialog.value = false
  }
}

// Reserve dialog
function openReserveDialog() {
  reserveQuantity.value = Math.min(order.value?.remainingQuantity ?? 1, 100)
  reserveNotes.value = ''
  reserveDialog.value = true
}

async function createReservation() {
  if (!order.value) return

  reserving.value = true
  try {
    if (props.orderType === 'sell') {
      await api.reservations.createForSellOrder({
        sellOrderId: props.orderId,
        quantity: reserveQuantity.value,
        notes: reserveNotes.value || undefined,
      })
    } else {
      await api.reservations.createForBuyOrder({
        buyOrderId: props.orderId,
        quantity: reserveQuantity.value,
        notes: reserveNotes.value || undefined,
      })
    }
    showSnackbar('Reservation created successfully')
    reserveDialog.value = false
    emit('updated')
    close()
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to create reservation', 'error')
  } finally {
    reserving.value = false
  }
}

// Reservation actions
async function confirmReservation(id: number) {
  actionLoading.value = `confirm-${id}`
  try {
    await api.reservations.confirm(id)
    await loadReservations()
    await loadOrder()
    emit('updated')
    showSnackbar('Reservation confirmed')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to confirm reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function rejectReservation(id: number) {
  actionLoading.value = `reject-${id}`
  try {
    await api.reservations.reject(id)
    await loadReservations()
    await loadOrder()
    emit('updated')
    showSnackbar('Reservation rejected')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to reject reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function fulfillReservation(id: number) {
  actionLoading.value = `fulfill-${id}`
  try {
    await api.reservations.fulfill(id)
    await loadReservations()
    await loadOrder()
    emit('updated')
    showSnackbar('Reservation marked as fulfilled')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to fulfill reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function cancelReservation(id: number) {
  actionLoading.value = `cancel-${id}`
  try {
    await api.reservations.cancel(id)
    await loadReservations()
    await loadOrder()
    emit('updated')
    showSnackbar('Reservation cancelled')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to cancel reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

// Watch for dialog open to load data
watch(dialog, open => {
  if (open) {
    loadOrder()
  } else {
    // Reset state when closing
    order.value = null
    error.value = null
    reservations.value = []
    expandedReservations.value = {}
    showActiveOnly.value = true
  }
})
</script>

<style scoped>
.reservations-table {
  font-size: 0.875rem;
}

.reservations-table th {
  font-weight: 500;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.reservations-table .reservation-row {
  cursor: pointer;
}

.reservations-table .reservation-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.reservations-table .reservation-row.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.reservations-table .expand-icon {
  opacity: 0.6;
}
</style>
