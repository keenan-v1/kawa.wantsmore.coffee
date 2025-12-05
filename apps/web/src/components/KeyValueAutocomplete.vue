<template>
  <v-autocomplete
    v-model="internalValue"
    :items="sortedFilteredItems"
    item-title="display"
    item-value="key"
    :label="label"
    :rules="rules"
    :loading="loading"
    :required="required"
    :no-filter="true"
    @update:search="onSearchUpdate"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

/**
 * An item with a key (ID/ticker) and display text.
 * When searching, exact matches on the key are prioritized first.
 */
export interface KeyValueItem {
  key: string
  display: string
}

type ValidationRule = (v: unknown) => boolean | string

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined
    items: KeyValueItem[]
    label: string
    rules?: ValidationRule[]
    loading?: boolean
    required?: boolean
  }>(),
  {
    rules: () => [],
    loading: false,
    required: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

// Internal state for search text
const searchText = ref('')

// Two-way binding for v-model
const internalValue = computed({
  get: () => props.modelValue ?? null,
  set: value => emit('update:modelValue', value),
})

// Handle search input updates
const onSearchUpdate = (value: string | null) => {
  searchText.value = value ?? ''
}

// Filter and sort items based on search text
// - Exact key matches appear first
// - Then partial key matches
// - Then display text matches
// - Items are sorted alphabetically within each group
const sortedFilteredItems = computed(() => {
  const search = searchText.value.toLowerCase().trim()

  // If no search, return items sorted by display
  if (!search) {
    return [...props.items].sort((a, b) => a.display.localeCompare(b.display))
  }

  // Filter items that match either key or display
  const filtered = props.items.filter(item => {
    const keyLower = item.key.toLowerCase()
    const displayLower = item.display.toLowerCase()
    return keyLower.includes(search) || displayLower.includes(search)
  })

  // Sort with exact key matches first, then partial key matches, then display matches
  return filtered.sort((a, b) => {
    const aKeyLower = a.key.toLowerCase()
    const bKeyLower = b.key.toLowerCase()

    // Priority 1: Exact key match
    const aExactKey = aKeyLower === search
    const bExactKey = bKeyLower === search
    if (aExactKey && !bExactKey) return -1
    if (!aExactKey && bExactKey) return 1

    // Priority 2: Key starts with search
    const aKeyStarts = aKeyLower.startsWith(search)
    const bKeyStarts = bKeyLower.startsWith(search)
    if (aKeyStarts && !bKeyStarts) return -1
    if (!aKeyStarts && bKeyStarts) return 1

    // Priority 3: Key contains search (anywhere)
    const aKeyContains = aKeyLower.includes(search)
    const bKeyContains = bKeyLower.includes(search)
    if (aKeyContains && !bKeyContains) return -1
    if (!aKeyContains && bKeyContains) return 1

    // Same priority level - sort alphabetically by display
    return a.display.localeCompare(b.display)
  })
})

// Reset search when value changes (item selected)
watch(
  () => props.modelValue,
  () => {
    searchText.value = ''
  }
)
</script>
