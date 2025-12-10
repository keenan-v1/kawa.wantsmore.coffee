<template>
  <div class="price-list-display">
    <v-alert v-if="loading" type="info" variant="tonal" density="compact" :icon="false">
      <div class="d-flex align-center">
        <v-progress-circular indeterminate size="14" width="2" class="mr-2" />
        <span>Loading price from {{ priceListCode }}...</span>
      </div>
    </v-alert>
    <v-alert v-else-if="price" type="success" variant="tonal" density="compact" :icon="false">
      <div class="d-flex align-center flex-wrap">
        <v-icon size="small" class="mr-2">mdi-tag-check</v-icon>
        <span>Price from {{ priceListCode }}:</span>
        <span class="font-weight-bold ml-2">
          {{ price.finalPrice.toFixed(2) }} {{ price.currency }}
        </span>
        <v-tooltip v-if="price.isFallback" location="top">
          <template #activator="{ props: tooltipProps }">
            <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-2">
              mdi-map-marker-question
            </v-icon>
          </template>
          <span
            >Using price from {{ fallbackLocationDisplay }} (no price at
            {{ requestedLocationDisplay }})</span
          >
        </v-tooltip>
        <v-tooltip v-if="requestedCurrency && price.currency !== requestedCurrency" location="top">
          <template #activator="{ props: tooltipProps }">
            <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-2">
              mdi-cash-sync
            </v-icon>
          </template>
          <span>Price list currency is {{ price.currency }}, not {{ requestedCurrency }}</span>
        </v-tooltip>
      </div>
    </v-alert>
    <v-alert v-else type="warning" variant="tonal" density="compact" :icon="false">
      <div class="d-flex align-center">
        <v-icon size="small" class="mr-2">mdi-tag-off</v-icon>
        <span>No price available for this commodity/location</span>
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import type { EffectivePrice } from '../services/api'

defineProps<{
  loading: boolean
  price: EffectivePrice | null
  priceListCode: string
  requestedCurrency?: string
  fallbackLocationDisplay?: string
  requestedLocationDisplay?: string
}>()
</script>
