<template>
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card>
      <v-card-title>
        {{ isBuying ? 'Reserve from Sell Order' : 'Fill Buy Order' }}
      </v-card-title>

      <v-card-text>
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

        <!-- Order Info -->
        <v-alert type="info" variant="tonal" class="mb-4" density="compact">
          <div class="d-flex justify-space-between align-center">
            <div>
              <strong>{{ getCommodityDisplay(order?.commodityTicker ?? '') }}</strong>
            </div>
            <v-chip size="small" :color="order?.orderType === 'partner' ? 'primary' : 'default'">
              {{ order?.orderType === 'partner' ? 'Partner' : 'Internal' }}
            </v-chip>
          </div>
          <div class="text-caption mt-1">
            {{ getLocationDisplay(order?.locationId ?? '') }}
          </div>
          <div class="mt-2">
            <span class="text-medium-emphasis">{{ isBuying ? 'Seller' : 'Buyer' }}:</span>
            {{ order?.userName }}
          </div>
          <div>
            <span class="text-medium-emphasis">Price:</span>
            {{
              order?.price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}
            {{ order?.currency }}
          </div>
          <div>
            <span class="text-medium-emphasis">Available:</span>
            {{ order?.remainingQuantity.toLocaleString() }} units
          </div>
        </v-alert>

        <v-form ref="formRef">
          <!-- Quantity -->
          <v-text-field
            ref="quantityInputRef"
            v-model.number="quantity"
            label="Quantity"
            type="number"
            :min="1"
            :max="order?.remainingQuantity"
            :rules="quantityRules"
            required
            :hint="`Maximum: ${order?.remainingQuantity?.toLocaleString() ?? 0}`"
            persistent-hint
          />

          <!-- Total Value -->
          <div v-if="quantity" class="text-body-2 mt-2 mb-4">
            <span class="text-medium-emphasis">Total value:</span>
            <strong>
              {{
                totalValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }}
              {{ order?.currency }}
            </strong>
          </div>

          <!-- Expiration Date -->
          <v-text-field
            v-model="expiresAt"
            label="Expiration Date"
            type="datetime-local"
            :min="minExpirationDate"
            :hint="expiresAtHint"
            persistent-hint
            class="mt-2"
          />

          <!-- Notes -->
          <v-textarea v-model="notes" label="Notes (optional)" rows="2" hide-details class="mt-2" />
        </v-form>

        <!-- Info about what will happen -->
        <v-alert v-if="quantity" type="warning" variant="tonal" class="mt-4" density="compact">
          <template v-if="isBuying">
            This will create a reservation to buy {{ quantity }} units. The seller will be notified
            and can confirm or reject the reservation.
          </template>
          <template v-else>
            This will create a reservation to sell {{ quantity }} units. The buyer will be notified
            and can confirm or reject the reservation.
          </template>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="close">Cancel</v-btn>
        <v-btn
          :color="isBuying ? 'warning' : 'success'"
          :loading="saving"
          :disabled="!isValid"
          @click="submit"
        >
          {{ isBuying ? 'Reserve' : 'Fill' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { Currency, OrderType } from '@kawakawa/types'
import { api } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'

// MarketItem type matching what MarketView uses
interface MarketItem {
  id: number
  itemType: 'sell' | 'buy'
  commodityTicker: string
  locationId: string
  userName: string
  price: number
  currency: Currency
  orderType: OrderType
  quantity: number
  remainingQuantity: number
  reservedQuantity: number
  activeReservationCount: number
  isOwn: boolean
}

const props = defineProps<{
  modelValue: boolean
  order: MarketItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'reserved'): void
}>()

const userStore = useUserStore()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// Whether user is buying (reserving from a sell order) or selling (filling a buy order)
const isBuying = computed(() => props.order?.itemType === 'sell')

const formRef = ref()
const quantityInputRef = ref()
const quantity = ref<number | null>(null)
const notes = ref('')
const expiresAt = ref('')
const saving = ref(false)
const errorMessage = ref('')

// Get default expiration date (3 days from now)
const getDefaultExpiration = (): string => {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  return date.toISOString().slice(0, 16)
}

// Minimum expiration date (now)
const minExpirationDate = computed(() => {
  return new Date().toISOString().slice(0, 16)
})

// Format expiration hint (e.g., "Expires in 3 days, 2 hours")
const expiresAtHint = computed(() => {
  if (!expiresAt.value) return ''

  const target = new Date(expiresAt.value)
  const now = Date.now()
  const diffMs = target.getTime() - now

  if (diffMs <= 0) return 'Expired'

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (remainingHours > 0) parts.push(`${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`)
  if (remainingMinutes > 0 && days === 0)
    parts.push(`${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`)

  if (parts.length === 0) return 'Less than a minute'
  return `Expires in ${parts.join(', ')}`
})

// Display helpers
const getLocationDisplay = (locationId: string): string => {
  if (!locationId) return 'Unknown'
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  if (!ticker) return 'Unknown'
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const totalValue = computed(() => {
  return (props.order?.price ?? 0) * (quantity.value ?? 0)
})

const quantityRules = computed(() => [
  (v: number) => !!v || 'Quantity is required',
  (v: number) => v >= 1 || 'Minimum quantity is 1',
  (v: number) =>
    v <= (props.order?.remainingQuantity ?? 0) ||
    `Maximum quantity is ${props.order?.remainingQuantity}`,
])

const isValid = computed(() => {
  const qty = quantity.value ?? 0
  return qty >= 1 && qty <= (props.order?.remainingQuantity ?? 0) && !saving.value
})

const close = () => {
  dialog.value = false
  errorMessage.value = ''
  quantity.value = null
  notes.value = ''
  expiresAt.value = ''
}

const submit = async () => {
  if (!props.order) return

  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    errorMessage.value = ''

    if (isBuying.value) {
      // User is buying from a sell order - create reservation against the sell order
      await api.reservations.createForSellOrder({
        sellOrderId: props.order.id,
        quantity: quantity.value ?? 0,
        notes: notes.value || undefined,
        expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : undefined,
      })
    } else {
      // User is filling a buy order - create reservation against the buy order
      await api.reservations.createForBuyOrder({
        buyOrderId: props.order.id,
        quantity: quantity.value ?? 0,
        notes: notes.value || undefined,
        expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : undefined,
      })
    }

    emit('reserved')
    close()
  } catch (error) {
    console.error('Failed to create reservation:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create reservation'
  } finally {
    saving.value = false
  }
}

// Reset form when order changes or dialog opens
watch(
  () => [props.modelValue, props.order],
  async ([isOpen]) => {
    if (isOpen && props.order) {
      quantity.value = null
      notes.value = ''
      expiresAt.value = getDefaultExpiration()
      errorMessage.value = ''

      // Focus the quantity input after dialog renders
      await nextTick()
      quantityInputRef.value?.focus()
    }
  }
)
</script>
