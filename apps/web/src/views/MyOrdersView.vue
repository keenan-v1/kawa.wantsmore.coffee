<template>
  <v-container>
    <h1 class="text-h4 mb-4">My Orders</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Orders Table -->
    <v-card>
      <v-card-title>
        <v-row align="center">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="search"
              prepend-icon="mdi-magnify"
              label="Search orders..."
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
          <v-col cols="12" md="6" class="text-right">
            <span class="text-body-2 text-medium-emphasis">
              {{ filteredOrders.length }} order(s)
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredOrders"
        :loading="loading"
        :items-per-page="25"
        class="elevation-0"
      >
        <template #item.commodityTicker="{ item }">
          <span class="font-weight-medium">{{ getCommodityDisplay(item.commodityTicker) }}</span>
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
            <span class="font-weight-medium">{{ item.availableQuantity.toLocaleString() }}</span>
            <span v-if="item.availableQuantity !== item.fioQuantity" class="text-medium-emphasis">
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
          <!-- Desktop: show buttons -->
          <div class="d-none d-sm-flex ga-1">
            <v-tooltip location="top">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon
                  size="small"
                  variant="text"
                  @click="openEditDialog(item)"
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
                  @click="confirmDelete(item)"
                >
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </template>
              Delete order
            </v-tooltip>
          </div>
          <!-- Mobile: show menu -->
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon size="small" class="d-sm-none">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="openEditDialog(item)">
                <template #prepend>
                  <v-icon>mdi-pencil</v-icon>
                </template>
                <v-list-item-title>Edit</v-list-item-title>
              </v-list-item>
              <v-list-item @click="confirmDelete(item)">
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
            <v-icon size="64" color="grey-lighten-1">mdi-tag-multiple</v-icon>
            <p class="text-h6 mt-4">No sell orders</p>
            <p class="text-body-2 text-medium-emphasis">
              Create sell orders from your inventory to list items for sale
            </p>
            <v-btn color="primary" class="mt-4" to="/inventory"> Go to Inventory </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Edit Order Dialog -->
    <v-dialog v-model="editDialog" max-width="500" persistent>
      <v-card v-if="editingOrder">
        <v-card-title>Edit Sell Order</v-card-title>
        <v-card-text>
          <!-- Item Info -->
          <v-alert type="info" variant="tonal" class="mb-4" density="compact">
            <div>
              <strong>{{ getCommodityDisplay(editingOrder.commodityTicker) }}</strong>
              at {{ getLocationDisplay(editingOrder.locationId) }}
            </div>
            <div class="text-caption">
              FIO Quantity: {{ editingOrder.fioQuantity.toLocaleString() }}
            </div>
          </v-alert>

          <v-form ref="editFormRef">
            <!-- Price -->
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

            <!-- Limit Mode -->
            <v-select
              v-model="editForm.limitMode"
              :items="limitModes"
              item-title="title"
              item-value="value"
              label="Quantity Limit"
            />

            <!-- Limit Quantity -->
            <v-text-field
              v-if="editForm.limitMode !== 'none'"
              v-model.number="editForm.limitQuantity"
              :label="editForm.limitMode === 'max_sell' ? 'Maximum to sell' : 'Reserve quantity'"
              type="number"
              min="0"
              :rules="[v => v >= 0 || 'Quantity must be non-negative']"
              class="mt-2"
            />

            <!-- Order Type -->
            <v-select
              v-model="editForm.orderType"
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
          <v-btn text @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveEdit"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the sell order for
          <strong>{{
            deletingOrder ? getCommodityDisplay(deletingOrder.commodityTicker) : ''
          }}</strong>
          at <strong>{{ deletingOrder ? getLocationDisplay(deletingOrder.locationId) : '' }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="deleteOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Currency, SellOrderLimitMode, OrderType } from '@kawakawa/types'
import { api, type SellOrderResponse } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()

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
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Available', key: 'availableQuantity', sortable: true, align: 'end' as const },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

const orders = ref<SellOrderResponse[]>([])
const loading = ref(false)
const search = ref('')

const editDialog = ref(false)
const editingOrder = ref<SellOrderResponse | null>(null)
const editFormRef = ref()
const saving = ref(false)

const deleteDialog = ref(false)
const deletingOrder = ref<SellOrderResponse | null>(null)
const deleting = ref(false)

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

const orderTypes = [
  { title: 'Internal (members only)', value: 'internal' },
  { title: 'Partner (trade partners)', value: 'partner' },
]

const editForm = ref({
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
  limitMode: 'none' as SellOrderLimitMode,
  limitQuantity: 0,
})

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const filteredOrders = computed(() => {
  if (!search.value) return orders.value
  const searchLower = search.value.toLowerCase()
  return orders.value.filter(
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

const loadOrders = async () => {
  try {
    loading.value = true
    orders.value = await api.sellOrders.list()
  } catch (error) {
    console.error('Failed to load orders', error)
    showSnackbar('Failed to load orders', 'error')
  } finally {
    loading.value = false
  }
}

const openEditDialog = (order: SellOrderResponse) => {
  editingOrder.value = order
  editForm.value = {
    price: order.price,
    currency: order.currency,
    orderType: order.orderType,
    limitMode: order.limitMode,
    limitQuantity: order.limitQuantity ?? 0,
  }
  editDialog.value = true
}

const saveEdit = async () => {
  if (!editingOrder.value) return

  const { valid } = await editFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    await api.sellOrders.update(editingOrder.value.id, {
      price: editForm.value.price,
      currency: editForm.value.currency,
      orderType: editForm.value.orderType,
      limitMode: editForm.value.limitMode,
      limitQuantity: editForm.value.limitMode === 'none' ? null : editForm.value.limitQuantity,
    })
    showSnackbar('Order updated successfully')
    editDialog.value = false
    await loadOrders()
  } catch (error) {
    console.error('Failed to update order', error)
    const message = error instanceof Error ? error.message : 'Failed to update order'
    showSnackbar(message, 'error')
  } finally {
    saving.value = false
  }
}

const confirmDelete = (order: SellOrderResponse) => {
  deletingOrder.value = order
  deleteDialog.value = true
}

const deleteOrder = async () => {
  if (!deletingOrder.value) return

  try {
    deleting.value = true
    await api.sellOrders.delete(deletingOrder.value.id)
    showSnackbar('Order deleted successfully')
    deleteDialog.value = false
    await loadOrders()
  } catch (error) {
    console.error('Failed to delete order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete order'
    showSnackbar(message, 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  loadOrders()
})
</script>
