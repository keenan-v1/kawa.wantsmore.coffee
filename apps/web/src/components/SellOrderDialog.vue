<template>
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card>
      <v-card-title>Create Sell Order</v-card-title>
      <v-card-text>
        <!-- Item Info -->
        <v-alert type="info" variant="tonal" class="mb-4" density="compact">
          <div>
            <strong>{{ inventoryItem ? getCommodityDisplay(inventoryItem.commodityTicker) : '' }}</strong>
          </div>
          <div class="text-caption">
            {{ inventoryItem ? getLocationDisplay(inventoryItem.locationId) : '' }}
            &bull; {{ inventoryItem?.quantity?.toLocaleString() }} available
          </div>
        </v-alert>

        <v-form ref="formRef" @submit.prevent="submit">
          <!-- Price -->
          <v-row>
            <v-col cols="8">
              <v-text-field
                v-model.number="form.price"
                label="Price"
                type="number"
                min="0"
                step="0.01"
                :rules="[v => v > 0 || 'Price must be positive']"
                required
              />
            </v-col>
            <v-col cols="4">
              <v-select
                v-model="form.currency"
                :items="currencies"
                label="Currency"
              />
            </v-col>
          </v-row>

          <!-- Limit Mode -->
          <v-select
            v-model="form.limitMode"
            :items="limitModes"
            item-title="title"
            item-value="value"
            label="Quantity Limit"
            hint="Control how much of your inventory is available for sale"
            persistent-hint
          />

          <!-- Limit Quantity (shown when not 'none') -->
          <v-text-field
            v-if="form.limitMode !== 'none'"
            v-model.number="form.limitQuantity"
            :label="form.limitMode === 'max_sell' ? 'Maximum to sell' : 'Reserve quantity'"
            type="number"
            min="0"
            :rules="[v => v >= 0 || 'Quantity must be non-negative']"
            :hint="limitQuantityHint"
            persistent-hint
            class="mt-2"
          />

          <!-- Order Type -->
          <v-select
            v-model="form.orderType"
            :items="orderTypes"
            item-title="title"
            item-value="value"
            label="Order Type"
            hint="Who can see this order"
            persistent-hint
            class="mt-4"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text @click="close">Cancel</v-btn>
        <v-btn color="success" :loading="saving" @click="submit">
          Create Order
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Currency, SellOrderLimitMode, OrderType } from '@kawakawa/types'
import { api, type FioInventoryItem } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'

const props = defineProps<{
  modelValue: boolean
  inventoryItem: FioInventoryItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created'): void
}>()

const userStore = useUserStore()

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string | null): string => {
  if (!locationId) return 'Unknown'
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const dialog = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const formRef = ref()
const saving = ref(false)

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

const form = ref({
  price: 0,
  currency: userStore.getPreferredCurrency(),
  limitMode: 'none' as SellOrderLimitMode,
  limitQuantity: 0,
  orderType: 'internal' as OrderType,
})

const limitQuantityHint = computed(() => {
  if (form.value.limitMode === 'max_sell') {
    return `Will sell up to ${form.value.limitQuantity} units`
  }
  if (form.value.limitMode === 'reserve') {
    return `Will keep at least ${form.value.limitQuantity} units in reserve`
  }
  return ''
})

const resetForm = () => {
  form.value = {
    price: 0,
    currency: userStore.getPreferredCurrency(),
    limitMode: 'none',
    limitQuantity: 0,
    orderType: 'internal',
  }
}

const close = () => {
  dialog.value = false
  resetForm()
}

const submit = async () => {
  if (!props.inventoryItem) return

  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    await api.sellOrders.create({
      commodityTicker: props.inventoryItem.commodityTicker,
      locationId: props.inventoryItem.locationId!,
      price: form.value.price,
      currency: form.value.currency,
      orderType: form.value.orderType,
      limitMode: form.value.limitMode,
      limitQuantity: form.value.limitMode === 'none' ? null : form.value.limitQuantity,
    })
    emit('created')
    close()
  } catch (error) {
    console.error('Failed to create sell order', error)
    // Error handling is done by the parent component
    throw error
  } finally {
    saving.value = false
  }
}

// Reset form when dialog opens
watch(dialog, (open) => {
  if (open) {
    resetForm()
  }
})
</script>
