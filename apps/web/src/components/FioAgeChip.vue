<template>
  <v-chip v-if="fioUploadedAt" :color="chipColor" :size="size" :variant="variant">
    {{ displayText }}
  </v-chip>
  <span v-else class="text-medium-emphasis text-caption">{{ emptyText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFormatters } from '../composables'

const props = withDefaults(
  defineProps<{
    fioUploadedAt: string | null | undefined
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
    emptyText?: string
    /**
     * Color mode for the chip:
     * - 'fioAge': Uses getFioAgeColor (1h/24h/72h thresholds - for data freshness)
     * - 'syncStatus': Uses getSyncStatusColor (24h/48h/72h thresholds - for sync status)
     */
    colorMode?: 'fioAge' | 'syncStatus'
  }>(),
  {
    size: 'small',
    variant: 'tonal',
    emptyText: '—',
    colorMode: 'fioAge',
  }
)

const { formatRelativeTime, getFioAgeColor, getSyncStatusColor } = useFormatters()

const chipColor = computed(() => {
  if (!props.fioUploadedAt) return 'grey'
  return props.colorMode === 'syncStatus'
    ? getSyncStatusColor(props.fioUploadedAt)
    : getFioAgeColor(props.fioUploadedAt)
})

const displayText = computed(() => formatRelativeTime(props.fioUploadedAt))
</script>
