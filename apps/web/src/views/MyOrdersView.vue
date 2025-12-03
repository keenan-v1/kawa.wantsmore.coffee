<template>
  <v-container>
    <h1 class="text-h4 mb-4">My Orders</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="sell">
        <v-icon start>mdi-tag</v-icon>
        Sell Orders
        <v-badge
          v-if="sellOrders.length > 0"
          :content="sellOrders.length"
          color="success"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="buy">
        <v-icon start>mdi-cart</v-icon>
        Buy Orders
        <v-badge
          v-if="buyOrders.length > 0"
          :content="buyOrders.length"
          color="primary"
          inline
          class="ml-2"
        />
      </v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <!-- SELL ORDERS TAB -->
      <v-tabs-window-item value="sell">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="sellSearch"
                  prepend-icon="mdi-magnify"
                  label="Search sell orders..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="success"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openSellOrderDialog"
                      >
                        Create Sell Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table
            :headers="sellHeaders"
            :items="filteredSellOrders"
            :loading="loadingSell"
            :items-per-page="25"
            class="elevation-0"
          >
            <template #item.commodityTicker="{ item }">
              <span class="font-weight-medium">{{
                getCommodityDisplay(item.commodityTicker)
              }}</span>
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.price="{ item }">
              <span class="font-weight-medium">{{ formatPrice(item.price) }}</span>
              <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
            </template>

            <template #item.availableQuantity="{ item }">
              <div>
                <span class="font-weight-medium">{{
                  item.availableQuantity.toLocaleString()
                }}</span>
                <span
                  v-if="item.availableQuantity !== item.fioQuantity"
                  class="text-medium-emphasis"
                >
                  / {{ item.fioQuantity.toLocaleString() }}
                </span>
              </div>
              <div v-if="item.limitMode !== 'none'" class="text-caption text-medium-emphasis">
                {{ getLimitModeLabel(item.limitMode) }}
                <span v-if="item.limitQuantity">: {{ item.limitQuantity.toLocaleString() }}</span>
              </div>
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
              <div class="d-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="openEditSellDialog(item)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteSell(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete order
                </v-tooltip>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-tag-multiple</v-icon>
                <p class="text-h6 mt-4">No sell orders</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create sell orders to list items for sale
                </p>
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="success"
                        class="mt-4"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openSellOrderDialog"
                      >
                        Create Sell Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>

      <!-- BUY ORDERS TAB -->
      <v-tabs-window-item value="buy">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="buySearch"
                  prepend-icon="mdi-magnify"
                  label="Search buy orders..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
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
                        @click="openBuyOrderDialog"
                      >
                        Create Buy Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table
            :headers="buyHeaders"
            :items="filteredBuyOrders"
            :loading="loadingBuy"
            :items-per-page="25"
            class="elevation-0"
          >
            <template #item.commodityTicker="{ item }">
              <span class="font-weight-medium">{{
                getCommodityDisplay(item.commodityTicker)
              }}</span>
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.price="{ item }">
              <span class="font-weight-medium">{{ formatPrice(item.price) }}</span>
              <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
            </template>

            <template #item.quantity="{ item }">
              <span class="font-weight-medium">{{ item.quantity.toLocaleString() }}</span>
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
              <div class="d-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="openEditBuyDialog(item)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteBuy(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete order
                </v-tooltip>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-cart</v-icon>
                <p class="text-h6 mt-4">No buy orders</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create buy orders to request items from other members
                </p>
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="primary"
                        class="mt-4"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openBuyOrderDialog"
                      >
                        Create Buy Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Order Dialog -->
    <OrderDialog v-model="orderDialog" :initial-tab="orderDialogTab" @created="onOrderCreated" />

    <!-- Edit Sell Order Dialog -->
    <v-dialog v-model="editSellDialog" max-width="500" persistent>
      <v-card v-if="editingSellOrder">
        <v-card-title>Edit Sell Order</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4" density="compact">
            <div>
              <strong>{{ getCommodityDisplay(editingSellOrder.commodityTicker) }}</strong>
              at {{ getLocationDisplay(editingSellOrder.locationId) }}
            </div>
            <div class="text-caption">
              FIO Quantity: {{ editingSellOrder.fioQuantity.toLocaleString() }}
            </div>
          </v-alert>

          <v-form ref="editSellFormRef">
            <v-row>
              <v-col cols="8">
                <v-text-field
                  v-model.number="editSellForm.price"
                  label="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  :rules="[v => v > 0 || 'Price must be positive']"
                  required
                />
              </v-col>
              <v-col cols="4">
                <v-select v-model="editSellForm.currency" :items="currencies" label="Currency" />
              </v-col>
            </v-row>

            <v-select
              v-model="editSellForm.limitMode"
              :items="limitModes"
              item-title="title"
              item-value="value"
              label="Quantity Limit"
            />

            <v-text-field
              v-if="editSellForm.limitMode !== 'none'"
              v-model.number="editSellForm.limitQuantity"
              :label="
                editSellForm.limitMode === 'max_sell' ? 'Maximum to sell' : 'Reserve quantity'
              "
              type="number"
              min="0"
              :rules="[v => v >= 0 || 'Quantity must be non-negative']"
              class="mt-2"
            />

            <v-select
              v-model="editSellForm.orderType"
              :items="orderTypes"
              item-title="title"
              item-value="value"
              label="Order Type"
              class="mt-4"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="editSellDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="savingSell" @click="saveEditSell"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Edit Buy Order Dialog -->
    <v-dialog v-model="editBuyDialog" max-width="500" persistent>
      <v-card v-if="editingBuyOrder">
        <v-card-title>Edit Buy Order</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4" density="compact">
            <div>
              <strong>{{ getCommodityDisplay(editingBuyOrder.commodityTicker) }}</strong>
              at {{ getLocationDisplay(editingBuyOrder.locationId) }}
            </div>
          </v-alert>

          <v-form ref="editBuyFormRef">
            <v-text-field
              v-model.number="editBuyForm.quantity"
              label="Quantity"
              type="number"
              min="1"
              :rules="[v => v > 0 || 'Quantity must be positive']"
              required
            />

            <v-row>
              <v-col cols="8">
                <v-text-field
                  v-model.number="editBuyForm.price"
                  label="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  :rules="[v => v > 0 || 'Price must be positive']"
                  required
                />
              </v-col>
              <v-col cols="4">
                <v-select v-model="editBuyForm.currency" :items="currencies" label="Currency" />
              </v-col>
            </v-row>

            <v-select
              v-model="editBuyForm.orderType"
              :items="orderTypes"
              item-title="title"
              item-value="value"
              label="Order Type"
              class="mt-4"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="editBuyDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="savingBuy" @click="saveEditBuy"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Sell Order Confirmation -->
    <v-dialog v-model="deleteSellDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Sell Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the sell order for
          <strong>{{
            deletingSellOrder ? getCommodityDisplay(deletingSellOrder.commodityTicker) : ''
          }}</strong>
          at
          <strong>{{
            deletingSellOrder ? getLocationDisplay(deletingSellOrder.locationId) : ''
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteSellDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingSell" @click="deleteSellOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Buy Order Confirmation -->
    <v-dialog v-model="deleteBuyDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Buy Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the buy order for
          <strong>{{
            deletingBuyOrder ? getCommodityDisplay(deletingBuyOrder.commodityTicker) : ''
          }}</strong>
          at
          <strong>{{
            deletingBuyOrder ? getLocationDisplay(deletingBuyOrder.locationId) : ''
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteBuyDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingBuy" @click="deleteBuyOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PERMISSIONS, type Currency, type SellOrderLimitMode, type OrderType } from '@kawakawa/types'
import { api, type SellOrderResponse, type BuyOrderResponse } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import OrderDialog from '../components/OrderDialog.vue'

const userStore = useUserStore()

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const activeTab = ref('sell')

const sellHeaders = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Available', key: 'availableQuantity', sortable: true, align: 'end' as const },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

const buyHeaders = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

// Sell orders state
const sellOrders = ref<SellOrderResponse[]>([])
const loadingSell = ref(false)
const sellSearch = ref('')

// Buy orders state
const buyOrders = ref<BuyOrderResponse[]>([])
const loadingBuy = ref(false)
const buySearch = ref('')
const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

// Edit sell order state
const editSellDialog = ref(false)
const editingSellOrder = ref<SellOrderResponse | null>(null)
const editSellFormRef = ref()
const savingSell = ref(false)

// Edit buy order state
const editBuyDialog = ref(false)
const editingBuyOrder = ref<BuyOrderResponse | null>(null)
const editBuyFormRef = ref()
const savingBuy = ref(false)

// Delete state
const deleteSellDialog = ref(false)
const deletingSellOrder = ref<SellOrderResponse | null>(null)
const deletingSell = ref(false)

const deleteBuyDialog = ref(false)
const deletingBuyOrder = ref<BuyOrderResponse | null>(null)
const deletingBuy = ref(false)

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

const limitModes = [
  { title: 'No limit (sell all available)', value: 'none' },
  { title: 'Maximum to sell', value: 'max_sell' },
  { title: 'Reserve quantity (keep minimum)', value: 'reserve' },
]

// Check permissions for order creation
const canCreateInternalOrders = computed(() => userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL))
const canCreatePartnerOrders = computed(() => userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER))

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

const editSellForm = ref({
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
  limitMode: 'none' as SellOrderLimitMode,
  limitQuantity: 0,
})

const editBuyForm = ref({
  quantity: 1,
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
})

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const filteredSellOrders = computed(() => {
  if (!sellSearch.value) return sellOrders.value
  const searchLower = sellSearch.value.toLowerCase()
  return sellOrders.value.filter(
    order =>
      order.commodityTicker.toLowerCase().includes(searchLower) ||
      order.locationId.toLowerCase().includes(searchLower)
  )
})

const filteredBuyOrders = computed(() => {
  if (!buySearch.value) return buyOrders.value
  const searchLower = buySearch.value.toLowerCase()
  return buyOrders.value.filter(
    order =>
      order.commodityTicker.toLowerCase().includes(searchLower) ||
      order.locationId.toLowerCase().includes(searchLower)
  )
})

const formatPrice = (price: number): string => {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getLimitModeLabel = (mode: SellOrderLimitMode): string => {
  switch (mode) {
    case 'max_sell':
      return 'Max sell'
    case 'reserve':
      return 'Reserve'
    default:
      return ''
  }
}

// Load functions
const loadSellOrders = async () => {
  try {
    loadingSell.value = true
    sellOrders.value = await api.sellOrders.list()
  } catch (error) {
    console.error('Failed to load sell orders', error)
    showSnackbar('Failed to load sell orders', 'error')
  } finally {
    loadingSell.value = false
  }
}

const loadBuyOrders = async () => {
  try {
    loadingBuy.value = true
    buyOrders.value = await api.buyOrders.list()
  } catch (error) {
    console.error('Failed to load buy orders', error)
    showSnackbar('Failed to load buy orders', 'error')
  } finally {
    loadingBuy.value = false
  }
}

// Open order dialogs
const openBuyOrderDialog = () => {
  orderDialogTab.value = 'buy'
  orderDialog.value = true
}

const openSellOrderDialog = () => {
  orderDialogTab.value = 'sell'
  orderDialog.value = true
}

// Handler for OrderDialog creation
const onOrderCreated = async (type: 'buy' | 'sell') => {
  if (type === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

// Edit sell order functions
const openEditSellDialog = (order: SellOrderResponse) => {
  editingSellOrder.value = order
  editSellForm.value = {
    price: order.price,
    currency: order.currency,
    orderType: order.orderType,
    limitMode: order.limitMode,
    limitQuantity: order.limitQuantity ?? 0,
  }
  editSellDialog.value = true
}

const saveEditSell = async () => {
  if (!editingSellOrder.value) return

  const { valid } = await editSellFormRef.value.validate()
  if (!valid) return

  try {
    savingSell.value = true
    await api.sellOrders.update(editingSellOrder.value.id, {
      price: editSellForm.value.price,
      currency: editSellForm.value.currency,
      orderType: editSellForm.value.orderType,
      limitMode: editSellForm.value.limitMode,
      limitQuantity:
        editSellForm.value.limitMode === 'none' ? null : editSellForm.value.limitQuantity,
    })
    showSnackbar('Sell order updated successfully')
    editSellDialog.value = false
    await loadSellOrders()
  } catch (error) {
    console.error('Failed to update sell order', error)
    const message = error instanceof Error ? error.message : 'Failed to update sell order'
    showSnackbar(message, 'error')
  } finally {
    savingSell.value = false
  }
}

// Edit buy order functions
const openEditBuyDialog = (order: BuyOrderResponse) => {
  editingBuyOrder.value = order
  editBuyForm.value = {
    quantity: order.quantity,
    price: order.price,
    currency: order.currency,
    orderType: order.orderType,
  }
  editBuyDialog.value = true
}

const saveEditBuy = async () => {
  if (!editingBuyOrder.value) return

  const { valid } = await editBuyFormRef.value.validate()
  if (!valid) return

  try {
    savingBuy.value = true
    await api.buyOrders.update(editingBuyOrder.value.id, {
      quantity: editBuyForm.value.quantity,
      price: editBuyForm.value.price,
      currency: editBuyForm.value.currency,
      orderType: editBuyForm.value.orderType,
    })
    showSnackbar('Buy order updated successfully')
    editBuyDialog.value = false
    await loadBuyOrders()
  } catch (error) {
    console.error('Failed to update buy order', error)
    const message = error instanceof Error ? error.message : 'Failed to update buy order'
    showSnackbar(message, 'error')
  } finally {
    savingBuy.value = false
  }
}

// Delete sell order functions
const confirmDeleteSell = (order: SellOrderResponse) => {
  deletingSellOrder.value = order
  deleteSellDialog.value = true
}

const deleteSellOrder = async () => {
  if (!deletingSellOrder.value) return

  try {
    deletingSell.value = true
    await api.sellOrders.delete(deletingSellOrder.value.id)
    showSnackbar('Sell order deleted successfully')
    deleteSellDialog.value = false
    await loadSellOrders()
  } catch (error) {
    console.error('Failed to delete sell order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete sell order'
    showSnackbar(message, 'error')
  } finally {
    deletingSell.value = false
  }
}

// Delete buy order functions
const confirmDeleteBuy = (order: BuyOrderResponse) => {
  deletingBuyOrder.value = order
  deleteBuyDialog.value = true
}

const deleteBuyOrder = async () => {
  if (!deletingBuyOrder.value) return

  try {
    deletingBuy.value = true
    await api.buyOrders.delete(deletingBuyOrder.value.id)
    showSnackbar('Buy order deleted successfully')
    deleteBuyDialog.value = false
    await loadBuyOrders()
  } catch (error) {
    console.error('Failed to delete buy order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete buy order'
    showSnackbar(message, 'error')
  } finally {
    deletingBuy.value = false
  }
}

onMounted(() => {
  loadSellOrders()
  loadBuyOrders()
})
</script>
