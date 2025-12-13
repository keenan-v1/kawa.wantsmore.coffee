<template>
  <div
    class="container"
    :class="[`variant-${variant}`]"
    :style="iconStyles"
    :title="localizeMaterial(commodity.name)"
  >
    <span class="label">{{ commodity.ticker.toUpperCase() }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getIconData, getRprunCategoryStyles } from '../utils/rpMaterialIcons'
import { getPrunIconStyles } from '../utils/prunMaterialIcons'
import { Commodity, CommodityIconStyle } from '@kawakawa/types'
import { localizeMaterial } from '../utils/materials'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{
  commodity: Commodity
  /** Override the global setting for this instance */
  variant?: CommodityIconStyle
}>()

const settingsStore = useSettingsStore()

const variant = computed(() => props.variant ?? settingsStore.commodityIconStyle.value)

const iconStyles = computed(() => {
  const v = variant.value

  // No styling for 'none' variant
  if (v === 'none') {
    return {}
  }

  // PRUN classic: gradient background + text color
  if (v === 'prun') {
    const prun = getPrunIconStyles(props.commodity.category)
    return {
      '--prun-bg': prun.background,
      '--prun-color': prun.color,
    }
  }

  // Refined PRUN: Font Awesome icons + custom or fallback gradient background
  const icon = getIconData(props.commodity.ticker, props.commodity.category)
  // Use RPRUN-specific styles if available, otherwise fall back to PRUN styles
  const rprun = getRprunCategoryStyles(props.commodity.category)
  const prun = rprun ?? getPrunIconStyles(props.commodity.category)
  return {
    '--prun-bg': prun.background,
    '--prun-color': prun.color,
    '--icon-content': icon.content ? `"\\${icon.content}"` : 'none',
    '--icon-font-size': icon.fontSize ?? 1,
    '--icon-font-weight': icon.regular ? 400 : 700,
    '--icon-transform': icon.flip ? 'scaleX(-1)' : 'none',
    '--detail-content': icon.detailContent ? `"\\${icon.detailContent}"` : 'none',
  }
})
</script>

<style scoped>
.container {
  container-type: size;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* PRUN and RPRUN variants: gradient background */
.variant-prun,
.variant-rprun {
  background: var(--prun-bg);
  color: var(--prun-color);
}

/* RPRUN variant: Font Awesome icon overlay */
.variant-rprun:before {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.25;

  /* Font Awesome */
  font-family: 'Font Awesome 6 Free', sans-serif;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;

  /* Dynamic */
  content: var(--icon-content);
  font-size: calc(var(--icon-font-size) * 70cqmin);
  font-weight: var(--icon-font-weight);
  transform: var(--icon-transform);

  @container (height < 24px) {
    display: none;
  }
}

.variant-prun .label {
  font-family: 'Open Sans', sans-serif;
  font-size: 32cqmin;
  font-weight: 600;
  text-shadow: none;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
}

.variant-rprun .label {
  font-family: 'Open Sans', sans-serif;
  font-size: 32cqmin;
  font-weight: 600;
  text-shadow: rgb(34, 34, 34) 1px 1px 0px;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
}

/* RPRUN variant: detail icon in corner */
.variant-rprun .label:before {
  position: absolute;
  left: 0;
  right: 2px;
  top: 2px;
  bottom: 0;
  display: flex;
  justify-content: end;
  line-height: 1;
  opacity: 0.5;
  text-shadow: none;

  /* Font Awesome */
  font-family: 'Font Awesome 6 Free', sans-serif;
  font-weight: 900;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;

  /* Dynamic */
  content: var(--detail-content);

  @container (height < 24px) {
    display: none;
  }
}

/* None variant: plain styling */
.variant-none {
  background: rgba(128, 128, 128, 0.2);
}
</style>
