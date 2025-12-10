import { ref, watch, onMounted, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface UseUrlArrayOptions {
  /** URL query parameter name */
  param: string
  /** Debounce delay in ms (default: 150) */
  debounce?: number
}

/**
 * Syncs a string array with a URL query parameter.
 *
 * Supports BOTH formats on read:
 * - Comma-separated: ?commodity=RAT,DW,H2O
 * - Repeated params: ?commodity=RAT&commodity=DW&commodity=H2O
 *
 * Writes as comma-separated for cleaner URLs.
 *
 * @example
 * const commodities = useUrlArray({ param: 'commodity' })
 * // URL: /market?commodity=RAT,DW
 * // commodities.value = ['RAT', 'DW']
 */
export function useUrlArray(options: UseUrlArrayOptions): Ref<string[]> {
  const route = useRoute()
  const router = useRouter()
  const state = ref<string[]>([])

  const debounceMs = options.debounce ?? 150
  let isUpdatingFromUrl = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Parse URL value to array, supporting both formats:
   * - Array (repeated params): ['RAT', 'DW', 'H2O']
   * - String (comma-separated): 'RAT,DW,H2O'
   */
  const parseUrlValue = (): string[] => {
    const raw = route.query[options.param]
    if (raw == null) return []

    // Handle repeated params (Vue Router returns array)
    if (Array.isArray(raw)) {
      // Could be ['RAT', 'DW'] or ['RAT,DW'] - handle both
      const result: string[] = []
      for (const item of raw) {
        if (item != null) {
          // Split each item by comma in case of mixed format
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
   * Convert array to URL-friendly comma-separated string
   * Returns null for empty array (to clean URL)
   */
  const toUrlValue = (values: string[]): string | null => {
    if (values.length === 0) return null
    return values.join(',')
  }

  /**
   * Check if two arrays have the same values (order-independent)
   */
  const arraysEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false
    const sortedA = [...a].sort()
    const sortedB = [...b].sort()
    return sortedA.every((v, i) => v === sortedB[i])
  }

  // Update URL with current state
  const syncToUrl = () => {
    if (isUpdatingFromUrl) return

    const urlValue = toUrlValue(state.value)
    const currentUrlArray = parseUrlValue()

    // Check if URL needs update
    if (arraysEqual(state.value, currentUrlArray)) return

    const query = { ...route.query }
    if (urlValue == null) {
      delete query[options.param]
    } else {
      query[options.param] = urlValue
    }

    router.replace({ query })
  }

  // Initialize from URL on mount
  onMounted(() => {
    const urlValues = parseUrlValue()
    if (urlValues.length > 0) {
      isUpdatingFromUrl = true
      state.value = urlValues
      isUpdatingFromUrl = false
    }
  })

  // Watch state changes and sync to URL (debounced)
  watch(
    state,
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(syncToUrl, debounceMs)
    },
    { deep: true }
  )

  // Watch route changes (back/forward navigation)
  watch(
    () => route.query[options.param],
    () => {
      const urlValues = parseUrlValue()
      if (!arraysEqual(state.value, urlValues)) {
        isUpdatingFromUrl = true
        state.value = urlValues
        isUpdatingFromUrl = false
      }
    }
  )

  return state
}
