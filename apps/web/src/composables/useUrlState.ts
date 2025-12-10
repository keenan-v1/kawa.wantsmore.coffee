import { ref, watch, onMounted, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface UseUrlStateOptions<T> {
  /** URL query parameter name */
  param: string
  /** Default value when param is not in URL */
  defaultValue: T
  /** Transform functions for URL ↔ state conversion */
  transform?: {
    toUrl: (value: T) => string | null
    fromUrl: (value: string | null) => T
  }
  /** Debounce delay in ms (default: 0 for immediate) */
  debounce?: number
}

/**
 * Syncs a single value with a URL query parameter.
 * - Initializes from URL on mount
 * - Updates URL when state changes (using router.replace)
 * - Responds to back/forward navigation
 * - Cleans URL when value equals default
 */
export function useUrlState<T>(options: UseUrlStateOptions<T>): Ref<T> {
  const route = useRoute()
  const router = useRouter()
  const state = ref<T>(options.defaultValue) as Ref<T>

  // Track if we're currently updating from URL to avoid loops
  let isUpdatingFromUrl = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const toUrl = options.transform?.toUrl ?? ((v: T) => (v == null ? null : String(v)))
  const fromUrl =
    options.transform?.fromUrl ??
    ((v: string | null) => (v == null ? options.defaultValue : (v as T)))

  // Parse URL value
  const parseUrlValue = (): T => {
    const raw = route.query[options.param]
    if (raw == null) return options.defaultValue
    // Handle array case (repeated params) - take first value
    const value = Array.isArray(raw) ? raw[0] : raw
    return fromUrl(value ?? null)
  }

  // Update URL with current state
  const syncToUrl = () => {
    if (isUpdatingFromUrl) return

    const urlValue = toUrl(state.value)
    const currentUrlValue = route.query[options.param]

    // Check if URL needs update
    const normalizedCurrent = Array.isArray(currentUrlValue) ? currentUrlValue[0] : currentUrlValue
    if (urlValue === normalizedCurrent) return
    if (urlValue == null && normalizedCurrent == null) return

    const query = { ...route.query }
    if (urlValue == null || urlValue === '') {
      delete query[options.param]
    } else {
      query[options.param] = urlValue
    }

    router.replace({ query })
  }

  // Initialize from URL on mount
  onMounted(() => {
    const urlValue = parseUrlValue()
    if (urlValue !== options.defaultValue) {
      isUpdatingFromUrl = true
      state.value = urlValue
      isUpdatingFromUrl = false
    }
  })

  // Watch state changes and sync to URL
  watch(
    state,
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      if (options.debounce && options.debounce > 0) {
        debounceTimer = setTimeout(syncToUrl, options.debounce)
      } else {
        syncToUrl()
      }
    },
    { deep: true }
  )

  // Watch route changes (back/forward navigation)
  watch(
    () => route.query[options.param],
    () => {
      const urlValue = parseUrlValue()
      if (state.value !== urlValue) {
        isUpdatingFromUrl = true
        state.value = urlValue
        isUpdatingFromUrl = false
      }
    }
  )

  return state
}

/**
 * Helper to create transform for enum/union types with validation
 */
export function createEnumTransform<T extends string>(
  validValues: readonly T[],
  defaultValue: T
): { toUrl: (v: T | null) => string | null; fromUrl: (v: string | null) => T | null } {
  return {
    toUrl: (v: T | null) => (v === defaultValue ? null : v),
    fromUrl: (v: string | null) => {
      if (v == null) return null
      return validValues.includes(v as T) ? (v as T) : null
    },
  }
}
