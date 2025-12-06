<template>
  <v-container>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" size="64" />
      <p class="mt-4">Loading order details...</p>
    </div>

    <!-- Error State -->
    <v-alert v-else-if="error" type="error" class="mb-4">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="$router.push('/orders')">Go to My Orders</v-btn>
      </template>
    </v-alert>

    <!-- Order Details -->
    <template v-else-if="order">
      <!-- Header -->
      <div class="d-flex align-center mb-4">
        <v-btn icon variant="text" class="mr-2" @click="$router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <div class="flex-grow-1">
          <h1 class="text-h5">{{ orderType === 'sell' ? 'Sell' : 'Buy' }} Order #{{ orderId }}</h1>
          <p class="text-body-2 text-medium-emphasis">
            {{ getCommodityDisplay(order.commodityTicker) }} at
            {{ getLocationDisplay(order.locationId) }}
          </p>
        </div>
        <div v-if="isOwnOrder" class="d-flex ga-2">
          <v-btn color="primary" variant="outlined" prepend-icon="mdi-pencil" @click="editOrder">
            Edit
          </v-btn>
          <v-btn color="error" variant="outlined" prepend-icon="mdi-delete" @click="confirmDelete">
            Delete
          </v-btn>
        </div>
        <div v-else>
          <v-btn
            v-if="canReserve"
            color="primary"
            :prepend-icon="orderType === 'sell' ? 'mdi-cart-plus' : 'mdi-package-variant'"
            @click="openReserveDialog"
          >
            {{ orderType === 'sell' ? 'Reserve' : 'Fill' }}
          </v-btn>
        </div>
      </div>

      <!-- Order Info Card -->
      <v-card class="mb-4">
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <div class="text-caption text-medium-emphasis">Price</div>
              <div class="text-h6">
                {{ formatPrice(order.price) }}
                <span class="text-body-2 text-medium-emphasis">{{ order.currency }}</span>
              </div>
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <div class="text-caption text-medium-emphasis">
                {{ orderType === 'sell' ? 'Available' : 'Quantity' }}
              </div>
              <div class="text-h6">
                {{
                  orderType === 'sell'
                    ? (order as SellOrderData).availableQuantity.toLocaleString()
                    : (order as BuyOrderData).quantity.toLocaleString()
                }}
              </div>
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <div class="text-caption text-medium-emphasis">Remaining</div>
              <div class="text-h6">
                {{ order.remainingQuantity.toLocaleString() }}
                <span
                  v-if="order.reservedQuantity > 0"
                  class="text-body-2 text-medium-emphasis ml-1"
                >
                  ({{ order.reservedQuantity }} reserved)
                </span>
              </div>
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <div class="text-caption text-medium-emphasis">Type</div>
              <div>
                <v-chip
                  :color="order.orderType === 'partner' ? 'primary' : 'default'"
                  size="small"
                  variant="tonal"
                >
                  {{ order.orderType === 'partner' ? 'Partner' : 'Internal' }}
                </v-chip>
              </div>
            </v-col>
          </v-row>
          <v-row v-if="!isOwnOrder && ownerName">
            <v-col cols="12">
              <div class="text-caption text-medium-emphasis">
                {{ orderType === 'sell' ? 'Seller' : 'Buyer' }}
              </div>
              <div class="text-body-1">{{ ownerName }}</div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Reservations Section (for own orders) -->
      <v-card v-if="isOwnOrder">
        <v-card-title>
          Reservations
          <v-chip v-if="order.activeReservationCount > 0" size="small" color="primary" class="ml-2">
            {{ order.activeReservationCount }} active
          </v-chip>
        </v-card-title>

        <v-card-text v-if="loadingReservations" class="text-center py-4">
          <v-progress-circular indeterminate color="primary" />
        </v-card-text>

        <v-card-text v-else-if="reservations.length === 0" class="text-center py-8">
          <v-icon size="48" color="grey-lighten-1">mdi-clipboard-text-off-outline</v-icon>
          <p class="text-body-1 mt-2">No reservations yet</p>
        </v-card-text>

        <v-list v-else lines="two">
          <template v-for="(reservation, index) in reservations" :key="reservation.id">
            <v-list-item>
              <template #prepend>
                <v-avatar color="grey-lighten-3">
                  <v-icon>mdi-account</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title>
                {{ orderType === 'sell' ? reservation.buyerName : reservation.sellerName }}
                <ReservationStatusChip :status="reservation.status" class="ml-2" />
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ reservation.quantity.toLocaleString() }} units
                <span class="mx-2">•</span>
                {{ formatRelativeDate(reservation.createdAt) }}
                <template v-if="reservation.expiresAt">
                  <span class="mx-2">•</span>
                  Expires: {{ formatDateTime(reservation.expiresAt) }}
                </template>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex ga-1">
                  <!-- Seller actions on pending reservations -->
                  <template v-if="orderType === 'sell' && reservation.status === 'pending'">
                    <v-btn
                      color="success"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `confirm-${reservation.id}`"
                      @click="confirmReservation(reservation.id)"
                    >
                      Confirm
                    </v-btn>
                    <v-btn
                      color="error"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `reject-${reservation.id}`"
                      @click="rejectReservation(reservation.id)"
                    >
                      Reject
                    </v-btn>
                  </template>

                  <!-- Seller actions on confirmed reservations -->
                  <template v-if="orderType === 'sell' && reservation.status === 'confirmed'">
                    <v-btn
                      color="success"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `fulfill-${reservation.id}`"
                      @click="fulfillReservation(reservation.id)"
                    >
                      Mark Fulfilled
                    </v-btn>
                    <v-btn
                      color="warning"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `cancel-${reservation.id}`"
                      @click="cancelReservation(reservation.id)"
                    >
                      Cancel
                    </v-btn>
                  </template>

                  <!-- Buyer actions on pending reservations -->
                  <template v-if="orderType === 'buy' && reservation.status === 'pending'">
                    <v-btn
                      color="warning"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `cancel-${reservation.id}`"
                      @click="cancelReservation(reservation.id)"
                    >
                      Cancel
                    </v-btn>
                  </template>

                  <!-- Buyer actions on confirmed reservations -->
                  <template v-if="orderType === 'buy' && reservation.status === 'confirmed'">
                    <v-btn
                      color="success"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `fulfill-${reservation.id}`"
                      @click="fulfillReservation(reservation.id)"
                    >
                      Mark Fulfilled
                    </v-btn>
                    <v-btn
                      color="warning"
                      variant="tonal"
                      size="small"
                      :loading="actionLoading === `cancel-${reservation.id}`"
                      @click="cancelReservation(reservation.id)"
                    >
                      Cancel
                    </v-btn>
                  </template>
                </div>
              </template>
            </v-list-item>
            <v-divider v-if="index < reservations.length - 1" />
          </template>
        </v-list>
      </v-card>
    </template>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete this {{ orderType }} order? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="deleteOrder">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reserve Dialog (placeholder - will be replaced with ReservationDialog component) -->
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
          <v-btn text @click="reserveDialog = false">Cancel</v-btn>
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
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
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
import { formatRelativeDate, formatDateTime } from '../utils/dateFormat'
import ReservationStatusChip from '../components/ReservationStatusChip.vue'

// Types for normalized order data
type SellOrderData = SellOrderResponse & { sellerName?: string }
type BuyOrderData = BuyOrderResponse & { buyerName?: string }
type OrderData = SellOrderData | BuyOrderData

const props = defineProps<{
  orderType: 'sell' | 'buy'
  orderId: number
}>()

const router = useRouter()
const userStore = useUserStore()

// State
const loading = ref(true)
const error = ref<string | null>(null)
const order = ref<OrderData | null>(null)
const ownerName = ref<string | null>(null)
const isOwnOrder = ref(false)
const reservations = ref<ReservationWithDetails[]>([])
const loadingReservations = ref(false)
const actionLoading = ref<string | null>(null)

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

  try {
    // First try to get it as own order
    if (props.orderType === 'sell') {
      try {
        const sellOrder = await api.sellOrders.get(props.orderId)
        order.value = sellOrder
        isOwnOrder.value = true
      } catch {
        // Not our order, try to find in market
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
            // These fields are not available from market
            limitMode: 'none',
            limitQuantity: null,
            fioQuantity: listing.availableQuantity,
            sellerName: listing.sellerName,
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
        // Not our order, try to find in market
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
          } as BuyOrderData
          ownerName.value = request.buyerName
          isOwnOrder.value = false
        } else {
          throw new Error('Order not found')
        }
      }
    }

    // Load reservations if it's our order
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
    const role = props.orderType === 'sell' ? 'seller' : 'buyer'
    const allReservations = await api.reservations.list(role)
    // Filter to only reservations for this order
    reservations.value = allReservations.filter((r: ReservationWithDetails) =>
      props.orderType === 'sell' ? r.sellOrderId === props.orderId : r.buyOrderId === props.orderId
    )
  } catch (e) {
    console.error('Failed to load reservations:', e)
  } finally {
    loadingReservations.value = false
  }
}

// Order actions
function editOrder() {
  // Navigate to orders page with edit dialog open
  // For now, just go to orders page
  router.push('/orders')
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
    router.push('/orders')
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
    // For reserving from a sell order, we need a buy order
    // For filling a buy order, we need a sell order
    // This is a simplified flow - the full ReservationDialog will handle this better

    // For now, show a message that the user needs to create an order first
    showSnackbar(
      'To place a reservation, please create a matching order first from the Market page.',
      'info'
    )
    reserveDialog.value = false
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
    showSnackbar('Reservation cancelled')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to cancel reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

// Watch for route changes
watch(
  () => [props.orderType, props.orderId],
  () => {
    loadOrder()
  }
)

onMounted(() => {
  loadOrder()
})
</script>
