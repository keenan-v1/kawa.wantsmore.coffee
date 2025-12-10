import { ref, watch, computed, onMounted, type Ref, type ComputedRef } from 'vue'
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router'

/**
 * Filter field definition
 */
export type FilterFieldType = 'string' | 'array'

export interface FilterFieldDef {
  /** Field type: 'string' for single value, 'array' for multi-value */
  type: FilterFieldType
  /** URL parameter name (defaults to field key) */
  param?: string
}

export type FilterSchema<T extends string> = Record<T, FilterFieldDef>

/**
 * Infer the value type from a filter field definition
 */
type FilterValue<F extends FilterFieldDef> = F['type'] extends 'array' ? string[] : string | null

/**
 * Infer the filter state type from a schema
 */
export type FilterState<S extends FilterSchema<string>> = {
  [K in keyof S]: FilterValue<S[K]>
}

export interface UseUrlFiltersOptions<S extends FilterSchema<string>> {
  /** Filter schema defining field types */
  schema: S
  /** Debounce delay in ms (default: 150) */
  debounce?: number
  /** Auto-expand callback when URL has filters */
  onUrlFiltersDetected?: () => void
}

export interface UseUrlFiltersReturn<S extends FilterSchema<string>> {
  /** Reactive filter state */
  filters: Ref<FilterState<S>>
  /** Whether any filters are active */
  hasActiveFilters: ComputedRef<boolean>
  /** Clear all filters */
  clearFilters: () => void
  /**
   * Set a filter value. For array fields, passing a single string adds it to the array
   * (if not already present). To replace the array, pass a full array.
   */
  setFilter: <K extends keyof S>(key: K, value: FilterState<S>[K] | string) => void
}

/**
 * Parse URL value to array, supporting both formats:
 * - Array (repeated params): ['RAT', 'DW', 'H2O']
 * - String (comma-separated): 'RAT,DW,H2O'
 */
function parseUrlArray(raw: LocationQueryValue | LocationQueryValue[]): string[] {
  if (raw == null) return []

  // Handle repeated params (Vue Router returns array)
  if (Array.isArray(raw)) {
    const result: string[] = []
    for (const item of raw) {
      if (item != null && typeof item === 'string') {
        result.push(
          ...item
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        )
      }
    }
    return result
  }

  // Handle comma-separated string
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }

  return []
}

/**
 * Parse URL value to string
 */
function parseUrlString(raw: LocationQueryValue | LocationQueryValue[]): string | null {
  if (raw == null) return null
  const value = Array.isArray(raw) ? raw[0] : raw
  return value || null
}

/**
 * Check if two arrays have the same values
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((v, i) => v === sortedB[i])
}

/**
 * Syncs a filter object with URL query parameters.
 *
 * Supports both single-value and multi-value (array) filters.
 * Multi-value filters accept both comma-separated and repeated params on read,
 * and write as comma-separated for cleaner URLs.
 *
 * @example
 * const { filters, hasActiveFilters, clearFilters, setFilter } = useUrlFilters({
 *   schema: {
 *     commodity: { type: 'array' },
 *     location: { type: 'array' },
 *     category: { type: 'string' },
 *     search: { type: 'string' },
 *   },
 *   onUrlFiltersDetected: () => { filtersExpanded.value = true },
 * })
 */
export function useUrlFilters<S extends FilterSchema<string>>(
  options: UseUrlFiltersOptions<S>
): UseUrlFiltersReturn<S> {
  const route = useRoute()
  const router = useRouter()
  const debounceMs = options.debounce ?? 150

  // Build initial state from schema
  const buildInitialState = (): FilterState<S> => {
    const state = {} as FilterState<S>
    for (const [key, def] of Object.entries(options.schema) as [keyof S, FilterFieldDef][]) {
      if (def.type === 'array') {
        ;(state as Record<string, unknown>)[key as string] = []
      } else {
        ;(state as Record<string, unknown>)[key as string] = null
      }
    }
    return state
  }

  const filters = ref<FilterState<S>>(buildInitialState()) as Ref<FilterState<S>>
  let isUpdatingFromUrl = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Get URL param name for a field
   */
  const getParamName = (key: keyof S): string => {
    const def = options.schema[key]
    return def.param ?? (key as string)
  }

  /**
   * Parse all filter values from URL
   */
  const parseUrlFilters = (): { state: FilterState<S>; hasFilters: boolean } => {
    const state = buildInitialState()
    let hasFilters = false

    for (const [key, def] of Object.entries(options.schema) as [keyof S, FilterFieldDef][]) {
      const param = getParamName(key)
      const raw = route.query[param]

      if (def.type === 'array') {
        const values = parseUrlArray(raw)
        if (values.length > 0) {
          ;(state as Record<string, unknown>)[key as string] = values
          hasFilters = true
        }
      } else {
        const value = parseUrlString(raw)
        if (value != null) {
          ;(state as Record<string, unknown>)[key as string] = value
          hasFilters = true
        }
      }
    }

    return { state, hasFilters }
  }

  /**
   * Sync current filter state to URL
   */
  const syncToUrl = () => {
    if (isUpdatingFromUrl) return

    const query = { ...route.query }
    let changed = false

    for (const [key, def] of Object.entries(options.schema) as [keyof S, FilterFieldDef][]) {
      const param = getParamName(key)
      const value = filters.value[key]

      if (def.type === 'array') {
        const arr = value as string[]
        const currentRaw = route.query[param]
        const currentArr = parseUrlArray(currentRaw)

        if (arr.length === 0) {
          if (currentRaw != null) {
            delete query[param]
            changed = true
          }
        } else if (!arraysEqual(arr, currentArr)) {
          query[param] = arr.join(',')
          changed = true
        }
      } else {
        const str = value as string | null
        const currentStr = parseUrlString(route.query[param])

        if (str == null || str === '') {
          if (currentStr != null) {
            delete query[param]
            changed = true
          }
        } else if (str !== currentStr) {
          query[param] = str
          changed = true
        }
      }
    }

    if (changed) {
      router.replace({ query })
    }
  }

  /**
   * Check if a filter value is "active" (non-empty)
   */
  const isFilterActive = (key: keyof S): boolean => {
    const def = options.schema[key]
    const value = filters.value[key]

    if (def.type === 'array') {
      return (value as string[]).length > 0
    }
    return value != null && value !== ''
  }

  const hasActiveFilters = computed(() => {
    return (Object.keys(options.schema) as (keyof S)[]).some(isFilterActive)
  })

  const clearFilters = () => {
    filters.value = buildInitialState()
    // Sync to URL immediately
    if (debounceTimer) clearTimeout(debounceTimer)
    syncToUrl()
  }

  const setFilter = <K extends keyof S>(key: K, value: FilterState<S>[K] | string) => {
    const def = options.schema[key]

    if (def.type === 'array') {
      // For array fields, if a single string is passed, add it to the array
      if (typeof value === 'string') {
        const currentArr = (filters.value[key] as string[]) ?? []
        if (!currentArr.includes(value)) {
          ;(filters.value as Record<string, unknown>)[key as string] = [...currentArr, value]
        }
      } else {
        // Full array replacement
        ;(filters.value as Record<string, unknown>)[key as string] = value
      }
    } else {
      // String fields accept single values
      ;(filters.value as Record<string, unknown>)[key as string] = value
    }
  }

  // Initialize from URL on mount
  onMounted(() => {
    const { state, hasFilters } = parseUrlFilters()
    if (hasFilters) {
      isUpdatingFromUrl = true
      filters.value = state
      isUpdatingFromUrl = false
      // Notify that filters were detected in URL
      options.onUrlFiltersDetected?.()
    }
  })

  // Watch filter changes and sync to URL (debounced)
  watch(
    filters,
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(syncToUrl, debounceMs)
    },
    { deep: true }
  )

  // Watch route changes (back/forward navigation)
  watch(
    () => route.query,
    () => {
      const { state } = parseUrlFilters()

      // Check if any values changed
      let changed = false
      for (const key of Object.keys(options.schema) as (keyof S)[]) {
        const def = options.schema[key]
        const newValue = state[key]
        const currentValue = filters.value[key]

        if (def.type === 'array') {
          if (!arraysEqual(newValue as string[], currentValue as string[])) {
            changed = true
            break
          }
        } else {
          if (newValue !== currentValue) {
            changed = true
            break
          }
        }
      }

      if (changed) {
        isUpdatingFromUrl = true
        filters.value = state
        isUpdatingFromUrl = false
      }
    },
    { deep: true }
  )

  return {
    filters,
    hasActiveFilters,
    clearFilters,
    setFilter,
  }
}
