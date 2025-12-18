<template>
  <v-dialog
    v-model="dialogOpen"
    max-width="500"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card v-if="order">
      <v-card-title>Edit Buy Order</v-card-title>
      <v-card-text>
        <v-alert type="info" variant="tonal" class="mb-4" density="compact">
          <div>
            <strong>{{ getCommodityDisplay(order.commodityTicker) }}</strong>
            at {{ getLocationDisplay(order.locationId) }}
          </div>
        </v-alert>

        <v-form ref="formRef">
          <v-text-field
            v-model.number="form.quantity"
            label="Quantity"
            type="number"
            min="1"
            :rules="[v => v > 0 || 'Quantity must be positive']"
            required
          />

          <!-- Automatic Pricing Status -->
          <div class="d-flex align-center mb-3 text-body-2">
            <span class="text-medium-emphasis">Automatic Pricing:</span>
            <a
              v-if="form.usePriceList"
              href="#"
              tabindex="-1"
              class="ml-2 font-weight-medium text-primary"
              @click.prevent="toggleAutomaticPricing(false)"
            >
              ON
            </a>
            <a
              v-else-if="canUseDynamicPricing"
              href="#"
              tabindex="-1"
              class="ml-2 font-weight-medium text-primary"
              @click.prevent="toggleAutomaticPricing(true)"
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
              v-if="form.usePriceList"
              size="x-small"
              color="info"
              variant="tonal"
              class="ml-2"
            >
              {{ settingsStore.defaultPriceList.value }}
            </v-chip>
          </div>

          <!-- Dynamic Pricing Display (when using price list) -->
          <PriceListDisplay
            v-if="form.usePriceList"
            :loading="loadingSuggestedPrice"
            :price="suggestedPrice"
            :price-list-code="settingsStore.defaultPriceList.value ?? ''"
            :requested-currency="form.currency"
            :fallback-location-display="
              suggestedPrice?.locationId ? getLocationDisplay(suggestedPrice.locationId) : ''
            "
            :requested-location-display="
              suggestedPrice?.requestedLocationId
                ? getLocationDisplay(suggestedPrice.requestedLocationId)
                : ''
            "
            class="mb-3"
          />

          <!-- Custom Price (when not using price list) -->
          <v-row v-if="!form.usePriceList">
            <v-col cols="8">
              <v-text-field
                v-model.number="form.price"
                label="Unit Price"
                type="number"
                min="0"
                step="0.01"
                :rules="[v => v > 0 || 'Price must be positive']"
                required
              />
            </v-col>
            <v-col cols="4">
              <v-select v-model="form.currency" :items="currencies" label="Currency" />
            </v-col>
          </v-row>

          <v-select
            v-model="form.orderType"
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
        <v-btn text @click="dialogOpen = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save"> Save Changes </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDialogBehavior } from '../composables'
import { PERMISSIONS, type Currency, type OrderType } from '@kawakawa/types'
import { api, type BuyOrderResponse, type EffectivePrice } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import PriceListDisplay from './PriceListDisplay.vue'

const props = defineProps<{
  modelValue: boolean
  order: BuyOrderResponse | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const userStore = useUserStore()
const settingsStore = useSettingsStore()

// Dialog open state
const dialogOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialogOpen })

// Form state
const formRef = ref()
const saving = ref(false)
const loadingSuggestedPrice = ref(false)
const suggestedPrice = ref<EffectivePrice | null>(null)

const form = ref({
  quantity: 1,
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
  usePriceList: false,
  priceListCode: null as string | null,
})

// Constants
const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Check if user can use dynamic pricing (has a default price list configured)
const canUseDynamicPricing = computed(() => {
  return !!settingsStore.defaultPriceList.value
})

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)

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

// Display helpers
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

// Load suggested price
const loadSuggestedPrice = async () => {
  if (!props.order) return
  const commodity = props.order.commodityTicker
  const location = props.order.locationId
  const currency = form.value.currency
  const priceList = settingsStore.defaultPriceList.value

  if (!commodity || !location || !currency || !priceList) {
    suggestedPrice.value = null
    return
  }

  try {
    loadingSuggestedPrice.value = true
    const prices = await api.prices.getEffective(priceList, location, currency)
    const price = prices.find((p: EffectivePrice) => p.commodityTicker === commodity)
    suggestedPrice.value = price ?? null
  } catch {
    suggestedPrice.value = null
  } finally {
    loadingSuggestedPrice.value = false
  }
}

// Toggle automatic pricing
const toggleAutomaticPricing = async (enable: boolean) => {
  const priceListCode = enable ? settingsStore.defaultPriceList.value : null
  form.value.usePriceList = enable
  form.value.priceListCode = priceListCode
  if (enable) {
    form.value.price = 0
    if (suggestedPrice.value) {
      form.value.currency = suggestedPrice.value.currency
    }
  }
}

// Save changes
const save = async () => {
  if (!props.order) return

  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    await api.buyOrders.update(props.order.id, {
      quantity: form.value.quantity,
      price: form.value.usePriceList ? 0 : form.value.price,
      currency: form.value.currency,
      priceListCode: form.value.priceListCode,
      orderType: form.value.orderType,
    })
    emit('saved')
    dialogOpen.value = false
  } catch (error) {
    console.error('Failed to update buy order', error)
  } finally {
    saving.value = false
  }
}

// Initialize form when order changes
watch(
  () => props.order,
  order => {
    if (order) {
      const usePriceList = !!order.priceListCode
      form.value = {
        quantity: order.quantity,
        price: order.price,
        currency: order.currency,
        orderType: order.orderType,
        usePriceList,
        priceListCode: order.priceListCode ?? null,
      }
      suggestedPrice.value = null
      // Load suggested price if user has a default price list
      if (settingsStore.defaultPriceList.value) {
        loadSuggestedPrice()
      }
    }
  },
  { immediate: true }
)
</script>
