<template>
  <div class="commodity-display" :class="{ 'with-icon': showIcon }">
    <CommodityIcon
      v-if="showIcon && commodity"
      :commodity="commodity"
      class="commodity-icon"
      :style="{ width: iconSize + 'px', height: iconSize + 'px' }"
    />
    <span class="commodity-text">{{ displayText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { commodityService } from '../services/commodityService'
import { useSettingsStore } from '../stores/settings'
import CommodityIcon from './CommodityIcon.vue'
import type { Commodity } from '@kawakawa/types'

const props = withDefaults(
  defineProps<{
    /** Commodity ticker (e.g., 'RAT', 'DW') */
    ticker: string
    /** Override icon visibility (default: based on settings) */
    showIcon?: boolean
    /** Icon size in pixels */
    iconSize?: number
  }>(),
  {
    showIcon: undefined,
    iconSize: 48,
  }
)

const settingsStore = useSettingsStore()

// Get commodity data from cache (synchronous)
const commodity = computed((): Commodity | null => {
  const category = commodityService.getCommodityCategory(props.ticker)
  if (category === null) {
    // Not in cache yet, return minimal object
    return { ticker: props.ticker, name: props.ticker }
  }
  return {
    ticker: props.ticker,
    name: commodityService.getCommodityDisplay(props.ticker, 'name-only'),
    category,
  }
})

// Display text based on user's preference
const displayText = computed(() => {
  return commodityService.getCommodityDisplay(
    props.ticker,
    settingsStore.commodityDisplayMode.value
  )
})

// Show icon based on setting or override
const showIcon = computed(() => {
  if (props.showIcon !== undefined) {
    return props.showIcon
  }
  return settingsStore.commodityIconStyle.value !== 'none'
})
</script>

<style scoped>
.commodity-display {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.commodity-icon {
  flex-shrink: 0;
  border-radius: 4px;
  font-size: 10px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.commodity-text {
  white-space: nowrap;
}
</style>
