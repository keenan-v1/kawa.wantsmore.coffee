<template>
  <v-chip
    :color="chipColor"
    :size="size"
    :variant="variant"
    :class="{ 'clickable-chip': clickable }"
    @click="handleClick"
  >
    {{ displayText }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { OrderType } from '@kawakawa/types'

const props = withDefaults(
  defineProps<{
    orderType: OrderType
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
    clickable?: boolean
  }>(),
  {
    size: 'small',
    variant: 'tonal',
    clickable: false,
  }
)

const emit = defineEmits<{
  (e: 'click', orderType: OrderType): void
}>()

const chipColor = computed(() => (props.orderType === 'partner' ? 'primary' : 'default'))

const displayText = computed(() => (props.orderType === 'partner' ? 'Partner' : 'Internal'))

const handleClick = (event: Event) => {
  if (props.clickable) {
    event.stopPropagation()
    emit('click', props.orderType)
  }
}
</script>
