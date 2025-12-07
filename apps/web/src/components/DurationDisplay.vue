<template>
  <span :class="{ 'text-error': isExpired }">
    <template v-if="isExpired">Expired</template>
    <template v-else>{{ formattedDuration }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Target date/time to calculate duration until */
    targetDate: string | Date
    /** Use short format (3d 2h 1m) instead of full (3 days, 2 hours, 1 minute) */
    short?: boolean
    /** Prefix text (e.g., "Expires in") */
    prefix?: string
  }>(),
  {
    short: false,
    prefix: '',
  }
)

const isExpired = computed(() => {
  const target = new Date(props.targetDate)
  return target.getTime() <= Date.now()
})

const formattedDuration = computed(() => {
  const target = new Date(props.targetDate)
  const now = Date.now()
  const diffMs = target.getTime() - now

  if (diffMs <= 0) {
    return 'Expired'
  }

  const parts = formatDuration(diffMs, props.short)
  const duration = parts.join(props.short ? ' ' : ', ')

  return props.prefix ? `${props.prefix} ${duration}` : duration
})

/**
 * Format a duration in milliseconds to human-readable parts
 * Omits zero values except when all would be zero
 */
function formatDuration(ms: number, short: boolean): string[] {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60
  const remainingSeconds = seconds % 60

  const parts: string[] = []

  if (days > 0) {
    parts.push(short ? `${days}d` : `${days} ${days === 1 ? 'day' : 'days'}`)
  }

  if (remainingHours > 0) {
    parts.push(
      short ? `${remainingHours}h` : `${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`
    )
  }

  if (remainingMinutes > 0) {
    parts.push(
      short
        ? `${remainingMinutes}m`
        : `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`
    )
  }

  // Only show seconds if duration is less than 1 minute and we have no other parts
  // Or if explicitly showing all parts and it's non-zero
  if (parts.length === 0 && remainingSeconds >= 0) {
    parts.push(
      short
        ? `${remainingSeconds}s`
        : `${remainingSeconds} ${remainingSeconds === 1 ? 'second' : 'seconds'}`
    )
  }

  return parts
}
</script>
