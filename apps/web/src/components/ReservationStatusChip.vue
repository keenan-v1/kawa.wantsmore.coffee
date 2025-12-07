<template>
  <v-chip :color="statusColor" :size="size" :variant="variant">
    {{ statusLabel }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReservationStatus } from '../services/api'

const props = withDefaults(
  defineProps<{
    status: ReservationStatus
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  }>(),
  {
    size: 'small',
    variant: 'tonal',
  }
)

const statusColor = computed(() => {
  switch (props.status) {
    case 'pending':
      return 'warning'
    case 'confirmed':
      return 'info'
    case 'fulfilled':
      return 'success'
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return 'error'
    default:
      return 'grey'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'pending':
      return 'Pending'
    case 'confirmed':
      return 'Confirmed'
    case 'fulfilled':
      return 'Fulfilled'
    case 'rejected':
      return 'Rejected'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
    default:
      return props.status
  }
})
</script>
