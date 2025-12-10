<template>
  <v-autocomplete
    ref="autocompleteRef"
    v-model="internalValue"
    v-bind="$attrs"
    :items="sortedFilteredItems"
    item-title="display"
    item-value="key"
    :label="label"
    :rules="rules"
    :loading="loading"
    :required="required"
    :no-filter="true"
    :multiple="multiple"
    :chips="multiple"
    :closable-chips="multiple"
    @update:search="onSearchUpdate"
    @focus="onFocus"
    @keydown="onKeydown"
  >
    <template v-if="showFavoriteStars" #item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps">
        <template #prepend>
          <v-icon
            size="small"
            :color="favoritesSet.has(item.value) ? 'amber' : 'grey-darken-1'"
            class="mr-2 favorite-star"
            @click.stop="toggleFavorite(item.value)"
          >
            {{ favoritesSet.has(item.value) ? 'mdi-star' : 'mdi-star-outline' }}
          </v-icon>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
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

/** Model value type - single string or array of strings */
type ModelValue = string | null | undefined | string[]

const props = withDefaults(
  defineProps<{
    modelValue: ModelValue
    items: KeyValueItem[]
    label: string
    rules?: ValidationRule[]
    loading?: boolean
    required?: boolean
    favorites?: string[]
    /** Enable multi-select mode with chips */
    multiple?: boolean
  }>(),
  {
    rules: () => [],
    loading: false,
    required: false,
    favorites: () => [],
    multiple: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null | string[]): void
  (e: 'update:favorites', value: string[]): void
}>()

// Ref to the autocomplete component
const autocompleteRef = ref<InstanceType<typeof import('vuetify/components').VAutocomplete> | null>(
  null
)

// Internal state for search text
const searchText = ref('')

// Create a Set for efficient favorite lookups
const favoritesSet = computed(() => new Set(props.favorites))

// Show stars if favorites prop is provided (even if empty array)
const showFavoriteStars = computed(() => props.favorites !== undefined)

// Toggle a favorite on/off
const toggleFavorite = (key: string) => {
  const currentFavorites = [...props.favorites]
  const index = currentFavorites.indexOf(key)
  if (index >= 0) {
    currentFavorites.splice(index, 1)
  } else {
    currentFavorites.push(key)
  }
  emit('update:favorites', currentFavorites)
}

// Two-way binding for v-model - handles both single and multiple modes
const internalValue = computed({
  get: () => {
    if (props.multiple) {
      // Multiple mode: always return array
      if (Array.isArray(props.modelValue)) return props.modelValue
      if (props.modelValue) return [props.modelValue]
      return []
    }
    // Single mode: return string or null
    if (Array.isArray(props.modelValue)) return props.modelValue[0] ?? null
    return props.modelValue ?? null
  },
  set: value => {
    if (props.multiple) {
      emit('update:modelValue', Array.isArray(value) ? value : value ? [value] : [])
    } else {
      emit('update:modelValue', Array.isArray(value) ? (value[0] ?? null) : value)
    }
  },
})

// Handle search input updates
const onSearchUpdate = (value: string | null) => {
  searchText.value = value ?? ''
}

// Clear search when component is focused (but keep the current value)
const onFocus = () => {
  // Clear the search text so the user sees all options
  // The selected value remains bound to internalValue
  searchText.value = ''
}

// Handle Tab key to auto-fill selection or exact match
const onKeydown = (event: Event) => {
  const keyEvent = event as globalThis.KeyboardEvent
  if (keyEvent.key !== 'Tab') return

  const search = searchText.value.toLowerCase().trim()
  if (!search) return // No search text, let Tab work normally

  // Find exact match first (case-insensitive)
  const exactMatch = props.items.find(item => item.key.toLowerCase() === search)
  if (exactMatch) {
    // In multiple mode, add to selection; in single mode, replace
    if (props.multiple) {
      const current = Array.isArray(internalValue.value) ? internalValue.value : []
      if (!current.includes(exactMatch.key)) {
        internalValue.value = [...current, exactMatch.key]
      }
    } else {
      internalValue.value = exactMatch.key
    }
    searchText.value = ''
    return
  }

  // Check if there's only one filtered result
  if (sortedFilteredItems.value.length === 1) {
    const matchKey = sortedFilteredItems.value[0].key
    if (props.multiple) {
      const current = Array.isArray(internalValue.value) ? internalValue.value : []
      if (!current.includes(matchKey)) {
        internalValue.value = [...current, matchKey]
      }
    } else {
      internalValue.value = matchKey
    }
    searchText.value = ''
    return
  }

  // No exact match and multiple options - clear search and let Tab proceed
  searchText.value = ''
}

// Filter and sort items based on search text
// Sorting priority:
// 1. Favorites (when no search)
// 2. Exact key matches (when searching)
// 3. Partial key matches
// 4. Display text matches
// Items are sorted alphabetically within each group
const sortedFilteredItems = computed(() => {
  const search = searchText.value.toLowerCase().trim()
  const hasFavorites = props.favorites.length > 0

  // If no search, return items with favorites first, then sorted by display
  if (!search) {
    if (!hasFavorites) {
      return [...props.items].sort((a, b) => a.display.localeCompare(b.display))
    }

    // Split into favorites and non-favorites
    const favoriteItems: KeyValueItem[] = []
    const nonFavoriteItems: KeyValueItem[] = []

    for (const item of props.items) {
      if (favoritesSet.value.has(item.key)) {
        favoriteItems.push(item)
      } else {
        nonFavoriteItems.push(item)
      }
    }

    // Sort each group alphabetically
    favoriteItems.sort((a, b) => a.display.localeCompare(b.display))
    nonFavoriteItems.sort((a, b) => a.display.localeCompare(b.display))

    return [...favoriteItems, ...nonFavoriteItems]
  }

  // Filter items that match either key or display
  const filtered = props.items.filter(item => {
    const keyLower = item.key.toLowerCase()
    const displayLower = item.display.toLowerCase()
    return keyLower.includes(search) || displayLower.includes(search)
  })

  // Sort with exact key matches first, then partial key matches, then display matches
  // Within same match level, favorites come first
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

    // Same match priority - favorites first if no search
    if (hasFavorites) {
      const aIsFavorite = favoritesSet.value.has(a.key)
      const bIsFavorite = favoritesSet.value.has(b.key)
      if (aIsFavorite && !bIsFavorite) return -1
      if (!aIsFavorite && bIsFavorite) return 1
    }

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

// Expose focus method for parent components
const focus = () => {
  autocompleteRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
.favorite-star {
  cursor: pointer;
  transition: transform 0.1s ease;
}

.favorite-star:hover {
  transform: scale(1.2);
}
</style>
