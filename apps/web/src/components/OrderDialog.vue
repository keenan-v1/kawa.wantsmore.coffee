<template>
  <v-dialog v-model="dialog" max-width="550" persistent>
    <v-card>
      <v-card-title class="pb-0">
        <v-tabs v-model="activeTab" color="primary" grow>
          <v-tab value="buy" :disabled="!canShowBuyTab">
            <v-icon start>mdi-cart-plus</v-icon>
            Buy Order
          </v-tab>
          <v-tab value="sell" :disabled="!canShowSellTab">
            <v-icon start>mdi-tag</v-icon>
            Sell Order
          </v-tab>
        </v-tabs>
      </v-card-title>

      <v-card-text class="pt-4">
        <!-- Error Alert -->
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mb-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <v-tabs-window v-model="activeTab">
          <!-- Buy Order Tab -->
          <v-tabs-window-item value="buy">
            <v-form ref="buyFormRef" @submit.prevent="submitBuyOrder">
              <!-- Commodity -->
              <v-autocomplete
                v-model="buyForm.commodityTicker"
                :items="commodities"
                item-title="display"
                item-value="ticker"
                label="Commodity"
                :rules="[v => !!v || 'Commodity is required']"
                :loading="loadingCommodities"
                required
              />

              <!-- Location -->
              <v-autocomplete
                v-model="buyForm.locationId"
                :items="locations"
                item-title="display"
                item-value="id"
                label="Location"
                :rules="[v => !!v || 'Location is required']"
                :loading="loadingLocations"
                required
              />

              <!-- Quantity -->
              <v-text-field
                v-model.number="buyForm.quantity"
                label="Quantity"
                type="number"
                min="1"
                :rules="[v => v > 0 || 'Quantity must be positive']"
                required
              />

              <!-- Price -->
              <v-row>
                <v-col cols="8">
                  <v-text-field
                    v-model.number="buyForm.price"
                    label="Price"
                    type="number"
                    min="0"
                    step="0.01"
                    :rules="[v => v > 0 || 'Price must be positive']"
                    required
                  />
                </v-col>
                <v-col cols="4">
                  <v-select v-model="buyForm.currency" :items="currencies" label="Currency" />
                </v-col>
              </v-row>

              <!-- Order Type -->
              <v-select
                v-model="buyForm.orderType"
                :items="orderTypes"
                item-title="title"
                item-value="value"
                label="Visibility"
                hint="Who can see this order"
                persistent-hint
                :disabled="orderTypes.length === 1"
              />
            </v-form>
          </v-tabs-window-item>

          <!-- Sell Order Tab -->
          <v-tabs-window-item value="sell">
            <v-form ref="sellFormRef" @submit.prevent="submitSellOrder">
              <!-- Item Info (when inventoryItem provided) -->
              <v-alert
                v-if="inventoryItem"
                type="info"
                variant="tonal"
                class="mb-4"
                density="compact"
              >
                <div>
                  <strong>{{ getCommodityDisplay(inventoryItem.commodityTicker) }}</strong>
                </div>
                <div class="text-caption">
                  {{ getLocationDisplay(inventoryItem.locationId) }}
                  &bull; {{ inventoryItem.quantity?.toLocaleString() }} available
                </div>
              </v-alert>

              <!-- Commodity/Location (when no inventoryItem) -->
              <template v-if="!inventoryItem">
                <v-autocomplete
                  v-model="sellForm.commodityTicker"
                  :items="commodities"
                  item-title="display"
                  item-value="ticker"
                  label="Commodity"
                  :rules="[v => !!v || 'Commodity is required']"
                  :loading="loadingCommodities"
                  required
                />

                <v-autocomplete
                  v-model="sellForm.locationId"
                  :items="locations"
                  item-title="display"
                  item-value="id"
                  label="Location"
                  :rules="[v => !!v || 'Location is required']"
                  :loading="loadingLocations"
                  required
                />
              </template>

              <!-- Price -->
              <v-row>
                <v-col cols="8">
                  <v-text-field
                    v-model.number="sellForm.price"
                    label="Price"
                    type="number"
                    min="0"
                    step="0.01"
                    :rules="[v => v > 0 || 'Price must be positive']"
                    required
                  />
                </v-col>
                <v-col cols="4">
                  <v-select v-model="sellForm.currency" :items="currencies" label="Currency" />
                </v-col>
              </v-row>

              <!-- Limit Mode -->
              <v-select
                v-model="sellForm.limitMode"
                :items="limitModes"
                item-title="title"
                item-value="value"
                label="Quantity Limit"
                hint="Control how much of your inventory is available for sale"
                persistent-hint
              />

              <!-- Limit Quantity (shown when not 'none') -->
              <v-text-field
                v-if="sellForm.limitMode !== 'none'"
                v-model.number="sellForm.limitQuantity"
                :label="sellForm.limitMode === 'max_sell' ? 'Maximum to sell' : 'Reserve quantity'"
                type="number"
                min="0"
                :rules="[v => v >= 0 || 'Quantity must be non-negative']"
                :hint="limitQuantityHint"
                persistent-hint
                class="mt-2"
              />

              <!-- Order Type -->
              <v-select
                v-model="sellForm.orderType"
                :items="orderTypes"
                item-title="title"
                item-value="value"
                label="Visibility"
                hint="Who can see this order"
                persistent-hint
                :disabled="orderTypes.length === 1"
                class="mt-4"
              />
            </v-form>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          v-if="activeTab === 'buy'"
          color="warning"
          :loading="saving"
          @click="submitBuyOrder"
        >
          Create Buy Order
        </v-btn>
        <v-btn
          v-else
          color="success"
          :loading="saving"
          @click="submitSellOrder"
        >
          Create Sell Order
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { PERMISSIONS, type Currency, type SellOrderLimitMode, type OrderType } from '@kawakawa/types'
import { api, type FioInventoryItem } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'

type OrderTab = 'buy' | 'sell'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    initialTab?: OrderTab
    inventoryItem?: FioInventoryItem | null
  }>(),
  {
    initialTab: 'buy',
    inventoryItem: null,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', type: OrderTab): void
}>()

const userStore = useUserStore()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const activeTab = ref<OrderTab>(props.initialTab)

// Form refs
const buyFormRef = ref()
const sellFormRef = ref()
const saving = ref(false)
const errorMessage = ref('')

// Loading states
const loadingCommodities = ref(false)
const loadingLocations = ref(false)

// Constants
const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

const limitModes = [
  { title: 'No limit (sell all available)', value: 'none' },
  { title: 'Maximum to sell', value: 'max_sell' },
  { title: 'Reserve quantity (keep minimum)', value: 'reserve' },
]

// Tab visibility
const canShowBuyTab = computed(() => !props.inventoryItem)
const canShowSellTab = computed(() => true)

// Display helpers
const getLocationDisplay = (locationId: string | null): string => {
  if (!locationId) return 'Unknown'
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

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

// Default order type based on available options
const defaultOrderType = computed((): OrderType => {
  if (orderTypes.value.length === 0) return 'internal'
  return orderTypes.value[0].value
})

// Buy form
const buyForm = ref({
  commodityTicker: '',
  locationId: '',
  quantity: 1,
  price: 0,
  currency: userStore.getPreferredCurrency(),
  orderType: 'internal' as OrderType,
})

// Sell form
const sellForm = ref({
  commodityTicker: '',
  locationId: '',
  price: 0,
  currency: userStore.getPreferredCurrency(),
  limitMode: 'none' as SellOrderLimitMode,
  limitQuantity: 0,
  orderType: 'internal' as OrderType,
})

const limitQuantityHint = computed(() => {
  if (sellForm.value.limitMode === 'max_sell') {
    return `Will sell up to ${sellForm.value.limitQuantity} units`
  }
  if (sellForm.value.limitMode === 'reserve') {
    return `Will keep at least ${sellForm.value.limitQuantity} units in reserve`
  }
  return ''
})

// Commodity and location options
const commodities = ref<{ ticker: string; display: string }[]>([])
const locations = ref<{ id: string; display: string }[]>([])

const loadCommodities = async () => {
  try {
    loadingCommodities.value = true
    const data = await commodityService.getAllCommodities()
    commodities.value = data
      .map(c => ({
        ticker: c.ticker,
        display: commodityService.getCommodityDisplay(c.ticker, userStore.getCommodityDisplayMode()),
      }))
      .sort((a, b) => a.display.localeCompare(b.display))
  } catch (error) {
    console.error('Failed to load commodities', error)
    errorMessage.value = 'Failed to load commodities'
  } finally {
    loadingCommodities.value = false
  }
}

const loadLocations = async () => {
  try {
    loadingLocations.value = true
    const data = await locationService.getAllLocations()
    locations.value = data
      .map(l => ({
        id: l.id,
        display: locationService.getLocationDisplay(l.id, userStore.getLocationDisplayMode()),
      }))
      .sort((a, b) => a.display.localeCompare(b.display))
  } catch (error) {
    console.error('Failed to load locations', error)
    errorMessage.value = 'Failed to load locations'
  } finally {
    loadingLocations.value = false
  }
}

const resetBuyForm = () => {
  buyForm.value = {
    commodityTicker: '',
    locationId: '',
    quantity: 1,
    price: 0,
    currency: userStore.getPreferredCurrency(),
    orderType: defaultOrderType.value,
  }
}

const resetSellForm = () => {
  sellForm.value = {
    commodityTicker: props.inventoryItem?.commodityTicker ?? '',
    locationId: props.inventoryItem?.locationId ?? '',
    price: 0,
    currency: userStore.getPreferredCurrency(),
    limitMode: 'none',
    limitQuantity: 0,
    orderType: defaultOrderType.value,
  }
}

const close = () => {
  dialog.value = false
  errorMessage.value = ''
  resetBuyForm()
  resetSellForm()
}

const submitBuyOrder = async () => {
  errorMessage.value = ''

  const { valid } = await buyFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    await api.buyOrders.create({
      commodityTicker: buyForm.value.commodityTicker,
      locationId: buyForm.value.locationId,
      quantity: buyForm.value.quantity,
      price: buyForm.value.price,
      currency: buyForm.value.currency,
      orderType: buyForm.value.orderType,
    })
    emit('created', 'buy')
    close()
  } catch (error) {
    console.error('Failed to create buy order', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create buy order'
  } finally {
    saving.value = false
  }
}

const submitSellOrder = async () => {
  errorMessage.value = ''

  const { valid } = await sellFormRef.value.validate()
  if (!valid) return

  const commodityTicker = props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
  const locationId = props.inventoryItem?.locationId ?? sellForm.value.locationId

  if (!commodityTicker || !locationId) {
    errorMessage.value = 'Commodity and location are required'
    return
  }

  try {
    saving.value = true
    await api.sellOrders.create({
      commodityTicker,
      locationId,
      price: sellForm.value.price,
      currency: sellForm.value.currency,
      orderType: sellForm.value.orderType,
      limitMode: sellForm.value.limitMode,
      limitQuantity: sellForm.value.limitMode === 'none' ? null : sellForm.value.limitQuantity,
    })
    emit('created', 'sell')
    close()
  } catch (error) {
    console.error('Failed to create sell order', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create sell order'
  } finally {
    saving.value = false
  }
}

// Load data when dialog opens
watch(dialog, open => {
  if (open) {
    errorMessage.value = ''
    activeTab.value = props.inventoryItem ? 'sell' : props.initialTab
    resetBuyForm()
    resetSellForm()
    if (commodities.value.length === 0) {
      loadCommodities()
    }
    if (locations.value.length === 0) {
      loadLocations()
    }
  }
})

// Update sell form when inventory item changes
watch(
  () => props.inventoryItem,
  item => {
    if (item) {
      sellForm.value.commodityTicker = item.commodityTicker
      sellForm.value.locationId = item.locationId ?? ''
    }
  }
)

onMounted(() => {
  // Pre-load data
  loadCommodities()
  loadLocations()
})
</script>
