<template>
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card>
      <v-card-title>Create Buy Order</v-card-title>
      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submit">
          <!-- Commodity -->
          <v-autocomplete
            v-model="form.commodityTicker"
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
            v-model="form.locationId"
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
            v-model.number="form.quantity"
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
              <v-select v-model="form.currency" :items="currencies" label="Currency" />
            </v-col>
          </v-row>

          <!-- Order Type -->
          <v-select
            v-model="form.orderType"
            :items="orderTypes"
            item-title="title"
            item-value="value"
            label="Order Type"
            hint="Who can see this order"
            persistent-hint
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text @click="close">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="submit"> Create Order </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Currency, OrderType } from '@kawakawa/types'
import { api } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created'): void
}>()

const userStore = useUserStore()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const formRef = ref()
const saving = ref(false)
const loadingCommodities = ref(false)
const loadingLocations = ref(false)

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

const orderTypes = [
  { title: 'Internal (members only)', value: 'internal' },
  { title: 'Partner (trade partners)', value: 'partner' },
]

const form = ref({
  commodityTicker: '',
  locationId: '',
  quantity: 1,
  price: 0,
  currency: userStore.getPreferredCurrency(),
  orderType: 'internal' as OrderType,
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
        display: commodityService.getCommodityDisplay(
          c.ticker,
          userStore.getCommodityDisplayMode()
        ),
      }))
      .sort((a, b) => a.display.localeCompare(b.display))
  } catch (error) {
    console.error('Failed to load commodities', error)
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
  } finally {
    loadingLocations.value = false
  }
}

const resetForm = () => {
  form.value = {
    commodityTicker: '',
    locationId: '',
    quantity: 1,
    price: 0,
    currency: userStore.getPreferredCurrency(),
    orderType: 'internal',
  }
}

const close = () => {
  dialog.value = false
  resetForm()
}

const submit = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    await api.buyOrders.create({
      commodityTicker: form.value.commodityTicker,
      locationId: form.value.locationId,
      quantity: form.value.quantity,
      price: form.value.price,
      currency: form.value.currency,
      orderType: form.value.orderType,
    })
    emit('created')
    close()
  } catch (error) {
    console.error('Failed to create buy order', error)
    throw error
  } finally {
    saving.value = false
  }
}

// Load data when dialog opens
watch(dialog, open => {
  if (open) {
    resetForm()
    if (commodities.value.length === 0) {
      loadCommodities()
    }
    if (locations.value.length === 0) {
      loadLocations()
    }
  }
})

onMounted(() => {
  // Pre-load data
  loadCommodities()
  loadLocations()
})
</script>
