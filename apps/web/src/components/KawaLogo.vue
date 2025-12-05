<template>
  <div class="kawa-logo-container" :style="sizeStyle">
    <img
      v-if="!loadError"
      :src="logoSrc"
      :alt="alt"
      class="kawa-logo"
      @error="handleError"
    />
    <span v-else class="kawa-logo-fallback" :style="fallbackStyle">{{ fallbackText }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number | string
    alt?: string
    fallbackText?: string
  }>(),
  {
    size: 32,
    alt: 'Kawakawa CX',
    fallbackText: 'Kawakawa CX',
  }
)

const logoSrc = '/logo.svg'
const loadError = ref(false)

const handleError = () => {
  loadError.value = true
}

const sizeStyle = computed(() => {
  const sizeValue = typeof props.size === 'number' ? `${props.size}px` : props.size
  return {
    width: sizeValue,
    height: sizeValue,
  }
})

const fallbackStyle = computed(() => {
  const sizeNum = typeof props.size === 'number' ? props.size : parseInt(props.size, 10) || 32
  return {
    fontSize: `${Math.max(12, sizeNum * 0.25)}px`,
  }
})
</script>

<style scoped>
.kawa-logo-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.kawa-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.kawa-logo-fallback {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  text-align: center;
  white-space: nowrap;
}
</style>
