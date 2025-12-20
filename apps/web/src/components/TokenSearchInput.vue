<template>
  <div ref="wrapperRef" class="token-search-wrapper">
    <div class="token-search-container" :class="{ focused: isFocused }" @click="focusInput">
      <v-icon class="search-icon" size="small">mdi-magnify</v-icon>

      <!-- Chips for parsed tokens -->
      <v-chip
        v-for="(chip, index) in chips"
        :key="`${chip.type}-${chip.value}-${index}`"
        :color="chip.color"
        size="small"
        closable
        class="token-chip"
        @click:close="removeChip(index)"
      >
        {{ chip.display }}
      </v-chip>

      <!-- Text input for current/unparsed text -->
      <input
        ref="inputRef"
        v-model="inputText"
        type="text"
        class="token-input"
        :placeholder="chips.length === 0 ? placeholder : ''"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="handleKeydown"
        @input="handleInput"
      />

      <!-- Clear button -->
      <v-btn
        v-if="chips.length > 0 || inputText"
        icon="mdi-close-circle"
        variant="text"
        size="x-small"
        class="clear-btn"
        @click.stop="clearAll"
      />
    </div>

    <!-- Autocomplete suggestions dropdown - teleported to body to escape stacking context -->
    <Teleport to="body">
      <div
        v-if="showSuggestions && suggestions.length > 0"
        class="suggestions-dropdown"
        :style="dropdownStyle"
      >
        <div
          v-for="(suggestion, index) in suggestions"
          :key="`${suggestion.type}-${suggestion.value}`"
          class="suggestion-item"
          :class="{ selected: index === selectedIndex }"
          @mousedown.prevent="selectSuggestion(suggestion)"
          @mouseenter="selectedIndex = index"
        >
          <v-chip :color="suggestion.color" size="x-small" class="suggestion-chip">
            {{ suggestion.typeLabel }}
          </v-chip>
          <span class="suggestion-text">{{ suggestion.display }}</span>
          <span v-if="suggestion.hint" class="suggestion-hint">{{ suggestion.hint }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { parseXitJson } from '@kawakawa/types/xit'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'

export interface SearchChip {
  type: 'commodity' | 'location' | 'user' | 'itemType' | 'xit'
  value: string // Actual value (ticker, location ID, username, 'sell'/'buy')
  display: string // Display text
  color: string // Chip color
  xitData?: {
    materials: Record<string, number>
    name?: string
    origin?: string // Location ID from XIT origin
  }
}

interface Suggestion {
  type: 'commodity' | 'location' | 'user' | 'itemType'
  typeLabel: string
  value: string
  display: string
  hint?: string
  color: string
}

interface Props {
  placeholder?: string
  availableUserNames?: string[]
  /** Function to format commodity display (respects user settings) */
  getCommodityDisplay?: (ticker: string) => string
  /** Function to format location display (respects user settings) */
  getLocationDisplay?: (locationId: string) => string
  /** Function to get localized commodity name (for search matching) */
  getCommodityName?: (ticker: string) => string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search market...',
  availableUserNames: () => [],
  getCommodityDisplay: (ticker: string) => ticker,
  getLocationDisplay: (locationId: string) => locationId,
  getCommodityName: (ticker: string) => ticker,
})

const emit = defineEmits<{
  (e: 'update:chips', chips: SearchChip[]): void
  (e: 'update:freeText', text: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)
const isFocused = ref(false)
const inputText = ref('')
const chips = ref<SearchChip[]>([])
const selectedIndex = ref(0)
const showSuggestions = ref(false)

// Dropdown positioning (for teleported dropdown)
const dropdownPosition = ref({ top: 0, left: 0, width: 0 })

const updateDropdownPosition = () => {
  if (wrapperRef.value) {
    const rect = wrapperRef.value.getBoundingClientRect()
    dropdownPosition.value = {
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
    }
  }
}

const dropdownStyle = computed(() => ({
  position: 'absolute' as const,
  top: `${dropdownPosition.value.top}px`,
  left: `${dropdownPosition.value.left}px`,
  width: `${dropdownPosition.value.width}px`,
}))

// Focus the input when clicking the container
const focusInput = () => {
  inputRef.value?.focus()
}

const onFocus = () => {
  isFocused.value = true
  updateDropdownPosition()
  showSuggestions.value = true
}

const onBlur = () => {
  isFocused.value = false
  // Delay hiding to allow click on suggestion
  setTimeout(() => {
    showSuggestions.value = false
  }, 150)
}

// Parse XIT origin string to find location
// Strips " Warehouse" suffix and matches against known locations
const parseXitOrigin = (origin: string): string | null => {
  if (!origin) return null

  const locations = locationService.getAllLocationsSync()

  // Try exact match first
  const exactMatch = locations.find(l => l.name.toLowerCase() === origin.toLowerCase())
  if (exactMatch) return exactMatch.id

  // Strip common suffixes and try again
  const suffixes = [' Warehouse', ' Storage', ' Base']
  for (const suffix of suffixes) {
    if (origin.toLowerCase().endsWith(suffix.toLowerCase())) {
      const stripped = origin.slice(0, -suffix.length)
      const match = locations.find(l => l.name.toLowerCase() === stripped.toLowerCase())
      if (match) return match.id
    }
  }

  // Try partial match (location name is prefix of origin)
  const partialMatch = locations.find(l => origin.toLowerCase().startsWith(l.name.toLowerCase()))
  if (partialMatch) return partialMatch.id

  return null
}

// Get suggestions based on current input
const suggestions = computed((): Suggestion[] => {
  const currentWord = getCurrentWord()
  if (!currentWord || currentWord.length < 1) return []

  const results: Suggestion[] = []
  const lowerWord = currentWord.toLowerCase()
  const upperWord = currentWord.toUpperCase()

  // Check for prefixes first
  if (currentWord.toLowerCase().startsWith('commodity:')) {
    const query = currentWord.slice('commodity:'.length).toLowerCase()
    if (query) {
      const commodities = commodityService.getAllCommoditiesSync()
      for (const c of commodities) {
        const localizedName = props.getCommodityName(c.ticker).toLowerCase()
        if (
          c.ticker.toLowerCase().includes(query) ||
          c.name.toLowerCase().includes(query) ||
          localizedName.includes(query)
        ) {
          results.push({
            type: 'commodity',
            typeLabel: 'Commodity',
            value: c.ticker,
            display: c.ticker,
            hint: props.getCommodityName(c.ticker),
            color: 'primary',
          })
          if (results.length >= 8) break
        }
      }
    }
    return results
  }

  if (currentWord.toLowerCase().startsWith('location:')) {
    const query = currentWord.slice('location:'.length).toLowerCase()
    if (query) {
      const locations = locationService.getAllLocationsSync()
      for (const l of locations) {
        if (l.id.toLowerCase().includes(query) || l.name.toLowerCase().includes(query)) {
          results.push({
            type: 'location',
            typeLabel: 'Location',
            value: l.id,
            display: l.name,
            hint: l.id,
            color: 'secondary',
          })
          if (results.length >= 8) break
        }
      }
    }
    return results
  }

  if (currentWord.toLowerCase().startsWith('user:')) {
    const query = currentWord.slice('user:'.length).toLowerCase()
    if (query) {
      for (const u of props.availableUserNames) {
        if (u.toLowerCase().includes(query)) {
          results.push({
            type: 'user',
            typeLabel: 'User',
            value: u,
            display: u,
            color: 'info',
          })
          if (results.length >= 8) break
        }
      }
    }
    return results
  }

  // Buy/Sell keywords
  if ('buy'.startsWith(lowerWord)) {
    results.push({
      type: 'itemType',
      typeLabel: 'Type',
      value: 'buy',
      display: 'Buy',
      hint: 'Show buy orders',
      color: 'warning',
    })
  }
  if ('sell'.startsWith(lowerWord)) {
    results.push({
      type: 'itemType',
      typeLabel: 'Type',
      value: 'sell',
      display: 'Sell',
      hint: 'Show sell orders',
      color: 'success',
    })
  }

  // Commodities - match by ticker, internal name, or localized name
  const commodities = commodityService.getAllCommoditiesSync()
  for (const c of commodities) {
    const localizedName = props.getCommodityName(c.ticker).toLowerCase()
    if (
      c.ticker.toUpperCase() === upperWord ||
      c.ticker.toLowerCase().startsWith(lowerWord) ||
      c.name.toLowerCase().startsWith(lowerWord) ||
      c.name.toLowerCase().includes(lowerWord) ||
      localizedName.startsWith(lowerWord) ||
      localizedName.includes(lowerWord)
    ) {
      // Avoid duplicates
      if (!results.find(r => r.type === 'commodity' && r.value === c.ticker)) {
        results.push({
          type: 'commodity',
          typeLabel: 'Commodity',
          value: c.ticker,
          display: c.ticker,
          hint: props.getCommodityName(c.ticker),
          color: 'primary',
        })
      }
    }
    if (results.length >= 10) break
  }

  // Locations - match by ID or name
  const locations = locationService.getAllLocationsSync()
  for (const l of locations) {
    if (
      l.id.toLowerCase().startsWith(lowerWord) ||
      l.name.toLowerCase().startsWith(lowerWord) ||
      l.name.toLowerCase().includes(lowerWord)
    ) {
      // Avoid duplicates
      if (!results.find(r => r.type === 'location' && r.value === l.id)) {
        results.push({
          type: 'location',
          typeLabel: 'Location',
          value: l.id,
          display: l.name,
          hint: l.id,
          color: 'secondary',
        })
      }
    }
    if (results.length >= 12) break
  }

  // Users
  for (const u of props.availableUserNames) {
    if (u.toLowerCase().startsWith(lowerWord) || u.toLowerCase().includes(lowerWord)) {
      if (!results.find(r => r.type === 'user' && r.value === u)) {
        results.push({
          type: 'user',
          typeLabel: 'User',
          value: u,
          display: u,
          color: 'info',
        })
      }
    }
    if (results.length >= 15) break
  }

  // Sort: by type (Commodity > Location > User > ItemType), then by match quality
  const typeOrder: Record<string, number> = { commodity: 0, location: 1, user: 2, itemType: 3 }
  results.sort((a, b) => {
    // First sort by type
    const typeCompare = typeOrder[a.type] - typeOrder[b.type]
    if (typeCompare !== 0) return typeCompare

    // Then by match quality: exact > starts-with > contains
    // Also include hint (localized name) in matching
    const aExact =
      a.value.toLowerCase() === lowerWord ||
      a.display.toLowerCase() === lowerWord ||
      a.hint?.toLowerCase() === lowerWord
    const bExact =
      b.value.toLowerCase() === lowerWord ||
      b.display.toLowerCase() === lowerWord ||
      b.hint?.toLowerCase() === lowerWord
    if (aExact && !bExact) return -1
    if (!aExact && bExact) return 1

    const aStarts =
      a.value.toLowerCase().startsWith(lowerWord) ||
      a.display.toLowerCase().startsWith(lowerWord) ||
      a.hint?.toLowerCase().startsWith(lowerWord)
    const bStarts =
      b.value.toLowerCase().startsWith(lowerWord) ||
      b.display.toLowerCase().startsWith(lowerWord) ||
      b.hint?.toLowerCase().startsWith(lowerWord)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1

    return 0
  })

  return results.slice(0, 8)
})

// Get the current word being typed (last word in input)
const getCurrentWord = (): string => {
  const text = inputText.value
  if (!text) return ''
  const words = text.split(/\s+/)
  return words[words.length - 1] || ''
}

// Select a suggestion and create a chip
const selectSuggestion = (suggestion: Suggestion) => {
  const chip = createChipFromSuggestion(suggestion)
  if (chip) {
    // Remove existing itemType chip if adding a new one
    if (chip.type === 'itemType') {
      chips.value = chips.value.filter(c => c.type !== 'itemType')
    }

    chips.value.push(chip)

    // Keep any previous words, remove the current one
    const words = inputText.value.split(/\s+/)
    words.pop()
    inputText.value = words.length > 0 ? words.join(' ') + ' ' : ''

    emitChanges()
    selectedIndex.value = 0
    nextTick(() => focusInput())
  }
}

// Create a chip from a suggestion
const createChipFromSuggestion = (suggestion: Suggestion): SearchChip | null => {
  switch (suggestion.type) {
    case 'commodity':
      return {
        type: 'commodity',
        value: suggestion.value,
        display: props.getCommodityDisplay(suggestion.value),
        color: 'primary',
      }
    case 'location':
      return {
        type: 'location',
        value: suggestion.value,
        display: props.getLocationDisplay(suggestion.value),
        color: 'secondary',
      }
    case 'user':
      return {
        type: 'user',
        value: suggestion.value,
        display: suggestion.value,
        color: 'info',
      }
    case 'itemType':
      return {
        type: 'itemType',
        value: suggestion.value,
        display: suggestion.value === 'buy' ? 'Buy' : 'Sell',
        color: suggestion.value === 'buy' ? 'warning' : 'success',
      }
  }
  return null
}

// Extract JSON from input and return remaining text
const extractJsonToken = (input: string): { json: string; remainder: string } | null => {
  if (!input.includes('{')) return null

  const startIdx = input.indexOf('{')
  const jsonPart = input.slice(startIdx)

  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < jsonPart.length; i++) {
    const char = jsonPart[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        return {
          json: jsonPart.slice(0, i + 1),
          remainder: input.slice(0, startIdx) + jsonPart.slice(i + 1),
        }
      }
    }
  }

  return null // Incomplete JSON
}

// Try to parse XIT JSON and create chips (XIT + optional location from origin)
const tryParseXitJson = (json: string): SearchChip[] => {
  const result = parseXitJson(json)
  if (!result.success) return []

  const newChips: SearchChip[] = []

  // Parse the raw JSON to extract origin from actions
  let originLocationId: string | undefined
  try {
    const parsed = JSON.parse(json)
    if (parsed.actions && Array.isArray(parsed.actions)) {
      for (const action of parsed.actions) {
        if (action.origin && typeof action.origin === 'string') {
          const locationId = parseXitOrigin(action.origin)
          if (locationId) {
            originLocationId = locationId
            break
          }
        }
      }
    }
  } catch {
    // Ignore JSON parse errors for origin extraction
  }

  // Create XIT chip
  newChips.push({
    type: 'xit',
    value: 'xit',
    display: result.name ? `XIT: ${result.name}` : 'XIT',
    color: 'purple',
    xitData: {
      materials: result.materials,
      name: result.name,
      origin: originLocationId,
    },
  })

  // Create location chip from origin if found
  if (originLocationId) {
    newChips.push({
      type: 'location',
      value: originLocationId,
      display: props.getLocationDisplay(originLocationId),
      color: 'secondary',
    })
  }

  return newChips
}

// Handle input changes - check for JSON
const handleInput = () => {
  selectedIndex.value = 0

  // Check for XIT JSON
  const extracted = extractJsonToken(inputText.value)
  if (extracted) {
    const xitChips = tryParseXitJson(extracted.json)
    if (xitChips.length > 0) {
      // Remove any existing XIT and location chips that will be replaced
      chips.value = chips.value.filter(c => {
        if (c.type === 'xit') return false
        // Remove location chip if XIT has origin
        if (c.type === 'location' && xitChips.some(xc => xc.type === 'location')) return false
        return true
      })
      chips.value.push(...xitChips)
      inputText.value = extracted.remainder.trim()
      emitChanges()
      return
    }
  }
}

// Handle keydown events
const handleKeydown = (event: globalThis.KeyboardEvent) => {
  // Arrow keys for suggestion navigation
  if (showSuggestions.value && suggestions.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex.value =
        (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length
      return
    }

    // Tab or Enter to select suggestion
    if (event.key === 'Tab' || event.key === 'Enter') {
      if (suggestions.value.length > 0) {
        event.preventDefault()
        selectSuggestion(suggestions.value[selectedIndex.value])
        return
      }
    }
  }

  // Space - try to parse current token (if no suggestions or explicit space)
  if (event.key === ' ') {
    const currentText = inputText.value.trim()

    // Don't process if we're in the middle of JSON
    if (currentText.includes('{') && !currentText.includes('}')) {
      return // Let JSON continue
    }

    // If there's a selected suggestion and input matches, use it
    if (suggestions.value.length > 0) {
      const suggestion = suggestions.value[selectedIndex.value]
      const currentWord = getCurrentWord().toLowerCase()
      // Only auto-select if the word is a decent match
      if (
        suggestion.value.toLowerCase() === currentWord ||
        suggestion.display.toLowerCase() === currentWord ||
        suggestion.value.toLowerCase().startsWith(currentWord)
      ) {
        event.preventDefault()
        selectSuggestion(suggestion)
        return
      }
    }
  }

  // Enter without suggestions - just prevent newline
  if (event.key === 'Enter') {
    event.preventDefault()
  }

  // Escape - blur input (Shift+Escape clears everything)
  if (event.key === 'Escape') {
    event.preventDefault()
    if (event.shiftKey) {
      // Shift+Escape: clear everything and blur
      clearAll()
    }
    // Always blur on Escape
    inputRef.value?.blur()
  }

  // Backspace at start of input - delete last chip
  if (event.key === 'Backspace' && inputText.value === '' && chips.value.length > 0) {
    event.preventDefault()
    chips.value.pop()
    emitChanges()
  }
}

// Remove a chip by index
const removeChip = (index: number) => {
  chips.value.splice(index, 1)
  emitChanges()
  nextTick(() => focusInput())
}

// Clear all chips and text
const clearAll = () => {
  chips.value = []
  inputText.value = ''
  emitChanges()
  nextTick(() => focusInput())
}

// Emit changes to parent
const emitChanges = () => {
  emit('update:chips', [...chips.value])
  emit('update:freeText', inputText.value.trim())
}

// Watch for inputText changes to emit free text
watch(inputText, () => {
  emit('update:freeText', inputText.value.trim())
})

// Expose methods for parent component
defineExpose({
  clear: clearAll,
  focus: focusInput,
  setChips: (newChips: SearchChip[]) => {
    chips.value = newChips
    emitChanges()
  },
})
</script>

<style scoped>
.token-search-wrapper {
  position: relative;
}

.token-search-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 4px 8px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  cursor: text;
  transition: border-color 0.2s;
}

.token-search-container.focused {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
}

.search-icon {
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-right: 4px;
  flex-shrink: 0;
}

.token-chip {
  flex-shrink: 0;
}

.token-input {
  flex: 1 1 100px;
  min-width: 100px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
  padding: 4px 0;
}

.token-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.clear-btn {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.6;
}

.clear-btn:hover {
  opacity: 1;
}
</style>

<!-- Unscoped styles for teleported dropdown -->
<style>
.suggestions-dropdown {
  z-index: 9999;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  max-height: 300px;
  overflow-y: auto;
}

.suggestions-dropdown .suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.suggestions-dropdown .suggestion-item:hover,
.suggestions-dropdown .suggestion-item.selected {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.suggestions-dropdown .suggestion-chip {
  flex-shrink: 0;
  font-size: 10px;
  min-width: 70px;
  justify-content: center;
}

.suggestions-dropdown .suggestion-text {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}

.suggestions-dropdown .suggestion-hint {
  margin-left: auto;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
</style>
