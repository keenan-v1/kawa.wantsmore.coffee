<template>
  <v-chip
    v-if="pricingMode === 'dynamic'"
    :size="size"
    color="info"
    variant="tonal"
    :class="{ 'clickable-chip': clickable }"
    @click="handleDynamicClick"
  >
    {{ priceListCode }}
  </v-chip>
  <v-chip
    v-else
    :size="size"
    color="default"
    variant="outlined"
    :class="{ 'clickable-chip': clickable }"
    @click="handleCustomClick"
  >
    Custom
  </v-chip>
</template>

<script setup lang="ts">
import type { PricingMode } from '@kawakawa/types'

const props = withDefaults(
  defineProps<{
    pricingMode: PricingMode
    priceListCode: string | null
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    clickable?: boolean
  }>(),
  {
    size: 'small',
    clickable: false,
  }
)

const emit = defineEmits<{
  (e: 'click:dynamic', priceListCode: string | null): void
  (e: 'click:custom'): void
}>()

const handleDynamicClick = (event: Event) => {
  if (props.clickable) {
    event.stopPropagation()
    emit('click:dynamic', props.priceListCode)
  }
}

const handleCustomClick = (event: Event) => {
  if (props.clickable) {
    event.stopPropagation()
    emit('click:custom')
  }
}
</script>
