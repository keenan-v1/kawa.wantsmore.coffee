<template>
  <span class="commodity-price">
    <v-progress-circular v-if="loading" indeterminate size="12" width="2" />
    <template v-else-if="price !== null"> {{ formattedPrice }} {{ displayCurrency }} </template>
    <span v-else class="text-medium-emphasis">--</span>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Currency } from '@kawakawa/types'
import { api, type EffectivePrice } from '../services/api'
import { useSettingsStore } from '../stores/settings'
import { useFormatters } from '../composables'

const props = withDefaults(
  defineProps<{
    /** Commodity ticker (required) */
    ticker: string
    /** Price list code to fetch from (defaults to user's defaultPriceList) */
    priceListCode?: string | null
    /** Specific location (optional, uses price list default if not provided) */
    locationId?: string | null
    /** Currency filter (optional) */
    currency?: Currency | null
  }>(),
  {
    priceListCode: undefined,
    locationId: undefined,
    currency: undefined,
  }
)

const settingsStore = useSettingsStore()
const { formatPrice } = useFormatters()

const loading = ref(false)
const price = ref<EffectivePrice | null>(null)

// Determine which price list to use
const effectivePriceListCode = computed(() => {
  if (props.priceListCode !== undefined) {
    return props.priceListCode
  }
  return settingsStore.defaultPriceList.value
})

// Determine currency to use
const effectiveCurrency = computed(() => {
  if (props.currency) {
    return props.currency
  }
  return settingsStore.preferredCurrency.value
})

// Format the price for display
const formattedPrice = computed(() => {
  if (price.value === null) return '--'
  return formatPrice(price.value.finalPrice)
})

// Display currency
const displayCurrency = computed(() => {
  return price.value?.currency ?? effectiveCurrency.value
})

// Load price from API
const loadPrice = async () => {
  const priceListCode = effectivePriceListCode.value
  const locationId = props.locationId
  const currency = effectiveCurrency.value
  const ticker = props.ticker

  // If no price list is configured, show --
  if (!priceListCode || !ticker) {
    price.value = null
    return
  }

  // If no location provided, we can't fetch a price
  if (!locationId) {
    price.value = null
    return
  }

  try {
    loading.value = true
    const prices = await api.prices.getEffective(priceListCode, locationId, currency)
    const found = prices.find((p: EffectivePrice) => p.commodityTicker === ticker)
    price.value = found ?? null
  } catch {
    // Silently fail - price display is informational
    price.value = null
  } finally {
    loading.value = false
  }
}

// Watch for prop changes and reload
watch(
  [() => props.ticker, () => props.priceListCode, () => props.locationId, () => props.currency],
  () => {
    loadPrice()
  },
  { immediate: false }
)

// Also watch for settings changes
watch(
  [() => settingsStore.defaultPriceList.value, () => settingsStore.preferredCurrency.value],
  () => {
    loadPrice()
  }
)

// Load on mount
onMounted(() => {
  loadPrice()
})
</script>

<style scoped>
.commodity-price {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
