<template>
  <v-container>
    <h1 class="text-h4 mb-4">Market Listings</h1>
    <p class="text-body-1 mb-6">View available inventory from all participating members</p>

    <v-card>
      <v-card-title>
        <v-text-field
          v-model="search"
          prepend-icon="mdi-magnify"
          label="Search commodities"
          single-line
          hide-details
        />
      </v-card-title>
      <v-data-table
        :headers="headers"
        :items="listings"
        :search="search"
        item-value="id"
      >
        <template v-slot:item.commodity="{ item }">
          {{ commodityService.getCommodityDisplay(item.commodity) }}
        </template>
        <template v-slot:item.price="{ item }">
          {{ formatPrice(item) }}
        </template>
        <template v-slot:item.location="{ item }">
          {{ locationService.getLocationDisplay(item.location, locationDisplayMode) }}
        </template>
        <template v-slot:item.actions>
          <v-btn size="small" color="primary" variant="text">
            Order
          </v-btn>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MarketListing } from '../types'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'
import { marketService } from '../services/marketService'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const search = ref('')
const loading = ref(false)

// Get location display mode from user preferences
const locationDisplayMode = userStore.getLocationDisplayMode()

const headers = [
  { title: 'Commodity', key: 'commodity', sortable: true },
  { title: 'Seller', key: 'seller', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true },
  { title: 'Price Per Unit', key: 'price', sortable: true },
  { title: 'Location', key: 'location', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false }
]

const listings = ref<MarketListing[]>([])

const loadMarketListings = async () => {
  loading.value = true
  try {
    listings.value = await marketService.getMarketListings()
  } catch (error) {
    console.error('Failed to load market listings:', error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadMarketListings()
})

const formatPrice = (item: MarketListing) => {
  return `${item.price.toFixed(2)} ${item.currency}`
}
</script>
