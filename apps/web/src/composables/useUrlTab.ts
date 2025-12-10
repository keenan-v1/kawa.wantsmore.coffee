import { ref, watch, onMounted, type Ref, type ComputedRef, isRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface UseUrlTabOptions {
  /** Valid tab values - can be static array or computed/ref for dynamic tabs */
  validTabs: readonly string[] | Ref<readonly string[]> | ComputedRef<readonly string[]>
  /** Default tab when URL param is missing or invalid */
  defaultTab: string | Ref<string> | ComputedRef<string>
  /** URL query parameter name (default: 'tab') */
  param?: string
}

/**
 * Syncs tab state with a URL query parameter.
 * - Validates tab values against allowed list
 * - Falls back to default for invalid values
 * - Cleans URL when tab equals default
 * - Supports dynamic tab lists (e.g., from API)
 *
 * @example
 * // Static tabs
 * const activeTab = useUrlTab({
 *   validTabs: ['users', 'roles', 'permissions'] as const,
 *   defaultTab: 'users'
 * })
 *
 * @example
 * // Dynamic tabs (e.g., from API)
 * const exchanges = ref(['KAWA', 'FIO'])
 * const activeTab = useUrlTab({
 *   validTabs: computed(() => exchanges.value),
 *   defaultTab: computed(() => exchanges.value[0] ?? 'KAWA')
 * })
 */
export function useUrlTab(options: UseUrlTabOptions): Ref<string> {
  const route = useRoute()
  const router = useRouter()
  const paramName = options.param ?? 'tab'

  // Unwrap reactive values
  const getValidTabs = (): readonly string[] => {
    return isRef(options.validTabs) ? options.validTabs.value : options.validTabs
  }

  const getDefaultTab = (): string => {
    return isRef(options.defaultTab) ? options.defaultTab.value : options.defaultTab
  }

  // Validate and get tab value
  const getValidTab = (value: string | null | undefined): string => {
    const validTabs = getValidTabs()
    const defaultTab = getDefaultTab()
    if (value && validTabs.includes(value)) return value
    return defaultTab
  }

  // Initialize state
  const state = ref<string>(getDefaultTab())
  let isUpdatingFromUrl = false

  // Parse URL value
  const parseUrlValue = (): string => {
    const raw = route.query[paramName]
    if (raw == null) return getDefaultTab()
    const value = Array.isArray(raw) ? raw[0] : raw
    return getValidTab(value)
  }

  // Update URL with current state
  const syncToUrl = () => {
    if (isUpdatingFromUrl) return

    const defaultTab = getDefaultTab()
    const currentUrlValue = route.query[paramName]
    const normalizedCurrent = Array.isArray(currentUrlValue) ? currentUrlValue[0] : currentUrlValue

    // Don't update if already correct
    if (state.value === normalizedCurrent) return
    if (state.value === defaultTab && normalizedCurrent == null) return

    const query = { ...route.query }
    if (state.value === defaultTab) {
      // Clean URL for default tab
      delete query[paramName]
    } else {
      query[paramName] = state.value
    }

    router.replace({ query })
  }

  // Initialize from URL on mount
  onMounted(() => {
    const urlValue = parseUrlValue()
    if (urlValue !== state.value) {
      isUpdatingFromUrl = true
      state.value = urlValue
      isUpdatingFromUrl = false
    }
  })

  // Watch state changes and sync to URL
  watch(state, syncToUrl)

  // Watch route changes (back/forward navigation)
  watch(
    () => route.query[paramName],
    () => {
      const urlValue = parseUrlValue()
      if (state.value !== urlValue) {
        isUpdatingFromUrl = true
        state.value = urlValue
        isUpdatingFromUrl = false
      }
    }
  )

  // Watch for changes in validTabs (for dynamic tabs)
  // If current tab becomes invalid, reset to default
  if (isRef(options.validTabs)) {
    watch(options.validTabs, () => {
      const validTabs = getValidTabs()
      if (!validTabs.includes(state.value)) {
        state.value = getDefaultTab()
      }
    })
  }

  return state
}
