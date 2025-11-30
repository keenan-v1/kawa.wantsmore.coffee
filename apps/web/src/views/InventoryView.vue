<template>
  <v-container>
    <h1 class="text-h4 mb-4">My Inventory</h1>
    <p class="text-body-1 mb-6">Manage your available inventory for the market</p>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            <span>Available Inventory</span>
            <v-spacer />
            <v-btn color="primary" prepend-icon="mdi-plus" @click="showAddDialog = true">
              Add Inventory
            </v-btn>
          </v-card-title>
          <v-data-table
            :headers="headers"
            :items="inventory"
            item-value="id"
          >
            <template v-slot:item.commodity="{ item }">
              {{ commodityService.getCommodityDisplay(item.commodity, commodityDisplayMode) }}
            </template>
            <template v-slot:item.price="{ item }">
              {{ formatPrice(item) }}
            </template>
            <template v-slot:item.location="{ item }">
              {{ locationService.getLocationDisplay(item.location, locationDisplayMode) }}
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
        <v-card-title>Add Inventory Item</v-card-title>
        <v-card-text>
          <v-form>
            <v-autocomplete
              v-model="newItem.commodity"
              :items="commodityOptions"
              label="Commodity"
              prepend-icon="mdi-package-variant"
              clearable
            />
            <v-text-field
              v-model.number="newItem.quantity"
              label="Quantity"
              type="number"
              prepend-icon="mdi-counter"
            />
            <v-text-field
              v-model.number="newItem.price"
              label="Price per unit"
              type="number"
              step="0.01"
              prepend-icon="mdi-currency-usd"
            />
            <v-select
              v-model="newItem.currency"
              :items="currencies"
              label="Currency"
              prepend-icon="mdi-cash"
            />
            <v-autocomplete
              v-model="newItem.location"
              :items="locationOptions"
              label="Location"
              prepend-icon="mdi-map-marker"
              clearable
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showAddDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="addItem">Add</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" max-width="500">
      <v-card>
        <v-card-title>Edit Inventory Item</v-card-title>
        <v-card-text>
          <v-form>
            <v-autocomplete
              v-model="editingItem.commodity"
              :items="commodityOptions"
              label="Commodity"
              prepend-icon="mdi-package-variant"
              clearable
            />
            <v-text-field
              v-model.number="editingItem.quantity"
              label="Quantity"
              type="number"
              prepend-icon="mdi-counter"
            />
            <v-text-field
              v-model.number="editingItem.price"
              label="Price per unit"
              type="number"
              step="0.01"
              prepend-icon="mdi-currency-usd"
            />
            <v-select
              v-model="editingItem.currency"
              :items="currencies"
              label="Currency"
              prepend-icon="mdi-cash"
            />
            <v-autocomplete
              v-model="editingItem.location"
              :items="locationOptions"
              label="Location"
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
import { CURRENCIES, type InventoryItem, type Currency } from '../types'
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
const commodityDisplayMode = userStore.getCommodityDisplayMode()
const locationOptions = ref<Array<{ title: string; value: string }>>([])

const headers = [
  { title: 'Commodity', key: 'commodity', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true },
  { title: 'Price Per Unit', key: 'price', sortable: true },
  { title: 'Location', key: 'location', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false }
]

const inventory = ref<InventoryItem[]>([])

const newItem = ref({
  commodity: '',
  quantity: 0,
  price: 0,
  currency: 'CIS' as Currency,
  location: ''
})

const editingItem = ref({
  id: 0,
  commodity: '',
  quantity: 0,
  price: 0,
  currency: 'CIS' as Currency,
  location: ''
})

const loadInventory = async () => {
  loading.value = true
  try {
    inventory.value = await marketService.getInventory()
  } catch (error) {
    console.error('Failed to load inventory:', error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Set default currency from user preference
  newItem.value.currency = userStore.getPreferredCurrency()
  // Load dropdown options from API
  commodityOptions.value = await commodityService.getCommodityOptions(commodityDisplayMode)
  locationOptions.value = await locationService.getLocationOptions(locationDisplayMode)
  // Load inventory from backend
  await loadInventory()
})

const formatPrice = (item: InventoryItem) => {
  return `${item.price.toFixed(2)} ${item.currency}`
}

const addItem = async () => {
  loading.value = true
  try {
    await marketService.addInventoryItem(newItem.value)
    await loadInventory()
    const preferredCurrency = userStore.getPreferredCurrency()
    newItem.value = { commodity: '', quantity: 0, price: 0, currency: preferredCurrency, location: '' }
    showAddDialog.value = false
  } catch (error) {
    console.error('Failed to add inventory item:', error)
  } finally {
    loading.value = false
  }
}

const editItem = (item: InventoryItem) => {
  editingItem.value = { ...item }
  showEditDialog.value = true
}

const saveEdit = async () => {
  loading.value = true
  try {
    await marketService.updateInventoryItem(editingItem.value as InventoryItem)
    await loadInventory()
    showEditDialog.value = false
  } catch (error) {
    console.error('Failed to update inventory item:', error)
  } finally {
    loading.value = false
  }
}

const deleteItem = async (item: InventoryItem) => {
  loading.value = true
  try {
    await marketService.deleteInventoryItem(item.id)
    await loadInventory()
  } catch (error) {
    console.error('Failed to delete inventory item:', error)
  } finally {
    loading.value = false
  }
}
</script>
