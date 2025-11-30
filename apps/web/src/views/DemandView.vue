<template>
  <v-container>
    <h1 class="text-h4 mb-4">Demand Management</h1>
    <p class="text-body-1 mb-6">Post your commodity demands and buying offers</p>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            <span>My Demands</span>
            <v-spacer />
            <v-btn color="primary" prepend-icon="mdi-plus" @click="showAddDialog = true">
              Add Demand
            </v-btn>
          </v-card-title>
          <v-data-table
            :headers="headers"
            :items="demands"
            item-value="id"
          >
            <template v-slot:item.commodity="{ item }">
              {{ commodityService.getCommodityDisplay(item.commodity) }}
            </template>
            <template v-slot:item.maxPrice="{ item }">
              {{ formatPrice(item) }}
            </template>
            <template v-slot:item.deliveryLocation="{ item }">
              {{ locationService.getLocationDisplay(item.deliveryLocation, locationDisplayMode) }}
            </template>
            <template v-slot:item.actions="{ item }">
              <v-btn size="small" color="primary" variant="text" icon="mdi-pencil" @click="editItem(item)" />
              <v-btn size="small" color="error" variant="text" icon="mdi-delete" @click="deleteItem(item)" />
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="showAddDialog" max-width="500">
      <v-card>
        <v-card-title>Add Demand</v-card-title>
        <v-card-text>
          <v-form>
            <v-autocomplete
              v-model="newDemand.commodity"
              :items="commodityOptions"
              label="Commodity"
              prepend-icon="mdi-package-variant"
              clearable
            />
            <v-text-field
              v-model.number="newDemand.quantity"
              label="Quantity Needed"
              type="number"
              prepend-icon="mdi-counter"
            />
            <v-text-field
              v-model.number="newDemand.maxPrice"
              label="Max Price per unit"
              type="number"
              step="0.01"
              prepend-icon="mdi-currency-usd"
            />
            <v-select
              v-model="newDemand.currency"
              :items="currencies"
              label="Currency"
              prepend-icon="mdi-cash"
            />
            <v-autocomplete
              v-model="newDemand.deliveryLocation"
              :items="locationOptions"
              label="Delivery Location"
              prepend-icon="mdi-map-marker"
              clearable
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showAddDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="addDemand">Add</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" max-width="500">
      <v-card>
        <v-card-title>Edit Demand</v-card-title>
        <v-card-text>
          <v-form>
            <v-autocomplete
              v-model="editingDemand.commodity"
              :items="commodityOptions"
              label="Commodity"
              prepend-icon="mdi-package-variant"
              clearable
            />
            <v-text-field
              v-model.number="editingDemand.quantity"
              label="Quantity Needed"
              type="number"
              prepend-icon="mdi-counter"
            />
            <v-text-field
              v-model.number="editingDemand.maxPrice"
              label="Max Price per unit"
              type="number"
              step="0.01"
              prepend-icon="mdi-currency-usd"
            />
            <v-select
              v-model="editingDemand.currency"
              :items="currencies"
              label="Currency"
              prepend-icon="mdi-cash"
            />
            <v-autocomplete
              v-model="editingDemand.deliveryLocation"
              :items="locationOptions"
              label="Delivery Location"
              prepend-icon="mdi-map-marker"
              clearable
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showEditDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="saveEdit">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { CURRENCIES, type Demand, type Currency } from '../types'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'
import { marketService } from '../services/marketService'

const userStore = useUserStore()
const currencies = CURRENCIES
const commodityOptions = ref<Array<{ title: string; value: string }>>([])
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const loading = ref(false)

// Get location options based on user's display preference
const locationDisplayMode = userStore.getLocationDisplayMode()
const locationOptions = ref<Array<{ title: string; value: string }>>([])

const headers = [
  { title: 'Commodity', key: 'commodity', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true },
  { title: 'Max Price Per Unit', key: 'maxPrice', sortable: true },
  { title: 'Delivery Location', key: 'deliveryLocation', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false }
]

const demands = ref<Demand[]>([])

const newDemand = ref({
  commodity: '',
  quantity: 0,
  maxPrice: 0,
  currency: 'CIS' as Currency,
  deliveryLocation: ''
})

const editingDemand = ref({
  id: 0,
  commodity: '',
  quantity: 0,
  maxPrice: 0,
  currency: 'CIS' as Currency,
  deliveryLocation: ''
})

const loadDemands = async () => {
  loading.value = true
  try {
    demands.value = await marketService.getDemands()
  } catch (error) {
    console.error('Failed to load demands:', error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Set default currency from user preference
  newDemand.value.currency = userStore.getPreferredCurrency()
  // Load commodity and location options
  commodityOptions.value = await commodityService.getCommodityOptions()
  locationOptions.value = await locationService.getLocationOptions(locationDisplayMode)
  // Load demands from backend
  await loadDemands()
})

const formatPrice = (item: Demand) => {
  return `${item.maxPrice.toFixed(2)} ${item.currency}`
}

const addDemand = async () => {
  loading.value = true
  try {
    await marketService.addDemand(newDemand.value)
    await loadDemands()
    const preferredCurrency = userStore.getPreferredCurrency()
    newDemand.value = { commodity: '', quantity: 0, maxPrice: 0, currency: preferredCurrency, deliveryLocation: '' }
    showAddDialog.value = false
  } catch (error) {
    console.error('Failed to add demand:', error)
  } finally {
    loading.value = false
  }
}

const editItem = (item: Demand) => {
  editingDemand.value = { ...item }
  showEditDialog.value = true
}

const saveEdit = async () => {
  loading.value = true
  try {
    await marketService.updateDemand(editingDemand.value as Demand)
    await loadDemands()
    showEditDialog.value = false
  } catch (error) {
    console.error('Failed to update demand:', error)
  } finally {
    loading.value = false
  }
}

const deleteItem = async (item: Demand) => {
  loading.value = true
  try {
    await marketService.deleteDemand(item.id)
    await loadDemands()
  } catch (error) {
    console.error('Failed to delete demand:', error)
  } finally {
    loading.value = false
  }
}
</script>
