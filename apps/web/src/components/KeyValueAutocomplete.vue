<template>
  <v-autocomplete
    ref="autocompleteRef"
    v-model="internalValue"
    v-model:search="searchText"
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
    @focus="onFocus"
    @keydown="onKeydown"
    @update:model-value="onSelect"
  >
    <template v-if="multiple" #chip="{ props: chipProps, item }">
      <v-chip v-bind="chipProps" class="chip-spacing">
        {{ item.title }}
      </v-chip>
    </template>
    <template
      v-if="showFavoriteStars || showIcons || hasLocationTypes"
      #item="{ item, props: itemProps }"
    >
      <v-list-item v-bind="itemProps" class="autocomplete-item">
        <!-- Prepend: location type emojis -->
        <template v-if="item.raw.locationType" #prepend>
          <span class="location-icons">
            <span class="location-icon">{{ getPrimaryLocationEmoji(item.raw) }}</span>
            <span class="location-icon warehouse-icon">{{
              getSecondaryLocationEmoji(item.raw)
            }}</span>
          </span>
        </template>
        <!-- Title with inline commodity icon -->
        <template #title>
          <span class="item-title">
            <CommodityIcon
              v-if="showIcons && item.raw.category"
              :commodity="{
                ticker: item.raw.key,
                name: item.raw.name || item.raw.display,
                category: item.raw.category,
              }"
              class="item-icon"
            />
            <span>{{ item.title }}</span>
          </span>
        </template>
        <!-- Append: favorite star on the right -->
        <template v-if="showFavoriteStars" #append>
          <v-icon
            size="small"
            :color="favoritesSet.has(item.value) ? 'amber' : 'grey-darken-2'"
            :class="['favorite-star', { 'favorite-star-empty': !favoritesSet.has(item.value) }]"
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
import { ref, computed, watch, nextTick } from 'vue'
import CommodityIcon from './CommodityIcon.vue'

/**
 * An item with a key (ID/ticker) and display text.
 * When searching, exact matches on the key are prioritized first.
 * Optionally includes commodity data for icon display.
 */
export interface KeyValueItem {
  key: string
  display: string
  /** Optional: commodity name for icon display */
  name?: string
  /** Optional: commodity category for icon display */
  category?: string
  /** Optional: location type for sorting (Station > Planet) */
  locationType?: 'Station' | 'Planet' | 'Platform' | 'Ship'
  /** Optional: true if this is a user's location (has inventory there) */
  isUserLocation?: boolean
  /** Optional: storage types at this location (STORE, WAREHOUSE_STORE, etc.) */
  storageTypes?: string[]
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
    /** Hide the favorite stars in dropdown items (useful when selecting favorites themselves) */
    hideFavoriteStars?: boolean
    /** Show commodity icons in dropdown items (requires items to have category) */
    showIcons?: boolean
  }>(),
  {
    rules: () => [],
    loading: false,
    required: false,
    favorites: undefined,
    multiple: false,
    hideFavoriteStars: false,
    showIcons: false,
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
const favoritesSet = computed(() => new Set(props.favorites ?? []))

// Show stars if favorites prop is provided (even if empty) and not explicitly hidden
const showFavoriteStars = computed(() => !props.hideFavoriteStars && props.favorites !== undefined)

// Check if any items have storage types (for showing emoji in dropdown)
const hasLocationTypes = computed(() => props.items.some(item => item.storageTypes?.length))

// Get primary location emoji (first slot):
// - Station → 🛰️
// - Planet with base (STORE) → 🏠
// - Planet without base → 🌍
const getPrimaryLocationEmoji = (item: KeyValueItem): string => {
  const hasBase = item.storageTypes?.includes('STORE')

  if (item.locationType === 'Station') {
    return '🛰️'
  }
  if (item.locationType === 'Planet') {
    return hasBase ? '🏠' : '🌍'
  }
  // Fallback for other types
  return hasBase ? '🏠' : ''
}

// Get secondary location emoji (second slot):
// - Only shows 🏭 if user has warehouse at this location
const getSecondaryLocationEmoji = (item: KeyValueItem): string => {
  const hasWarehouse = item.storageTypes?.includes('WAREHOUSE_STORE')
  return hasWarehouse ? '🏭' : ''
}

// Toggle a favorite on/off
const toggleFavorite = (key: string) => {
  const currentFavorites = [...(props.favorites ?? [])]
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

// Blur the input after selection to close dropdown and show selected value
// (only for single-select mode, multiple mode should stay open for more selections)
const onSelect = () => {
  if (!props.multiple) {
    nextTick(() => {
      autocompleteRef.value?.blur()
    })
  }
}

// Location type sort priority: Station > Planet > Platform > Ship > undefined
const locationTypePriority: Record<string, number> = {
  Station: 0,
  Planet: 1,
  Platform: 2,
  Ship: 3,
}

// Compare two items by location type (lower priority number = first)
const compareByLocationType = (a: KeyValueItem, b: KeyValueItem): number => {
  const aPriority = a.locationType ? (locationTypePriority[a.locationType] ?? 99) : 99
  const bPriority = b.locationType ? (locationTypePriority[b.locationType] ?? 99) : 99
  return aPriority - bPriority
}

// Sort items by location type first, then alphabetically
const sortByLocationThenAlpha = (items: KeyValueItem[]): KeyValueItem[] => {
  return [...items].sort((a, b) => {
    const typeCompare = compareByLocationType(a, b)
    if (typeCompare !== 0) return typeCompare
    return a.display.localeCompare(b.display)
  })
}

// Filter and sort items based on search text
// Sorting priority:
// 1. Favorites (when no search)
// 2. User locations (where user has inventory)
// 3. Other locations
// 4. Exact key matches (when searching)
// 5. Partial key matches
// 6. Display text matches
// For locations: Station > Planet within each group
// Items are sorted alphabetically within each type group
const sortedFilteredItems = computed(() => {
  const search = searchText.value.toLowerCase().trim()
  const hasFavorites = (props.favorites?.length ?? 0) > 0
  const hasLocationTypes = props.items.some(item => item.locationType)
  const hasUserLocations = props.items.some(item => item.isUserLocation)

  // If no search, return items with favorites first, then user locations, then others
  if (!search) {
    // No favorites - check for user locations
    if (!hasFavorites) {
      if (hasUserLocations) {
        // Split into user locations and other locations
        const userLocItems: KeyValueItem[] = []
        const otherItems: KeyValueItem[] = []
        for (const item of props.items) {
          if (item.isUserLocation) {
            userLocItems.push(item)
          } else {
            otherItems.push(item)
          }
        }
        if (hasLocationTypes) {
          return [...sortByLocationThenAlpha(userLocItems), ...sortByLocationThenAlpha(otherItems)]
        }
        userLocItems.sort((a, b) => a.display.localeCompare(b.display))
        otherItems.sort((a, b) => a.display.localeCompare(b.display))
        return [...userLocItems, ...otherItems]
      }
      // Sort by location type (if present), then alphabetically
      if (hasLocationTypes) {
        return sortByLocationThenAlpha(props.items)
      }
      return [...props.items].sort((a, b) => a.display.localeCompare(b.display))
    }

    // Split into favorites, user locations, and others
    const favoriteItems: KeyValueItem[] = []
    const userLocItems: KeyValueItem[] = []
    const otherItems: KeyValueItem[] = []

    for (const item of props.items) {
      if (favoritesSet.value.has(item.key)) {
        favoriteItems.push(item)
      } else if (item.isUserLocation) {
        userLocItems.push(item)
      } else {
        otherItems.push(item)
      }
    }

    // Sort each group by location type (if present), then alphabetically
    if (hasLocationTypes) {
      return [
        ...sortByLocationThenAlpha(favoriteItems),
        ...sortByLocationThenAlpha(userLocItems),
        ...sortByLocationThenAlpha(otherItems),
      ]
    }

    // Sort each group alphabetically
    favoriteItems.sort((a, b) => a.display.localeCompare(b.display))
    userLocItems.sort((a, b) => a.display.localeCompare(b.display))
    otherItems.sort((a, b) => a.display.localeCompare(b.display))

    return [...favoriteItems, ...userLocItems, ...otherItems]
  }

  // Filter items that match either key or display
  const filtered = props.items.filter(item => {
    const keyLower = item.key.toLowerCase()
    const displayLower = item.display.toLowerCase()
    return keyLower.includes(search) || displayLower.includes(search)
  })

  // Sort with exact key matches first, then partial key matches, then display matches
  // Within same match level, favorites come first, then location type
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

    // Same match priority - favorites first
    if (hasFavorites) {
      const aIsFavorite = favoritesSet.value.has(a.key)
      const bIsFavorite = favoritesSet.value.has(b.key)
      if (aIsFavorite && !bIsFavorite) return -1
      if (!aIsFavorite && bIsFavorite) return 1
    }

    // Same favorite status - user locations next
    if (hasUserLocations) {
      if (a.isUserLocation && !b.isUserLocation) return -1
      if (!a.isUserLocation && b.isUserLocation) return 1
    }

    // Same user location status - sort by location type if present
    if (hasLocationTypes) {
      const typeCompare = compareByLocationType(a, b)
      if (typeCompare !== 0) return typeCompare
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
.item-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

:deep(.item-icon) {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 4px;
}

.location-icons {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  width: 2.5em;
}

.location-icon {
  font-size: 1rem;
  width: 1.25em;
  text-align: center;
}

.warehouse-icon:empty {
  /* Reserve space even when empty for alignment */
}

.chip-spacing {
  margin: 2px;
}
</style>

<!-- Unscoped styles for dropdown content (rendered in teleport) -->
<style>
.favorite-star {
  cursor: pointer;
  transition:
    transform 0.1s ease,
    opacity 0.15s ease;
}

.favorite-star:hover {
  transform: scale(1.2);
}

/* Hide empty stars by default, show on hover */
.favorite-star-empty {
  opacity: 0;
}

.autocomplete-item:hover .favorite-star-empty,
.v-list-item:hover .favorite-star-empty {
  opacity: 1;
}
</style>
