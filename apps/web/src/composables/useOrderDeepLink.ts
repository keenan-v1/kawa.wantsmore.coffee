import { ref, watch, onMounted, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface UseOrderDeepLinkOptions {
  /** URL query parameter name (default: 'order') */
  param?: string
}

export interface OrderDeepLinkState {
  /** Whether the order detail dialog is open */
  dialogOpen: Ref<boolean>
  /** Type of the order being viewed */
  orderType: Ref<'sell' | 'buy'>
  /** ID of the order being viewed */
  orderId: Ref<number>
  /** Open an order detail dialog and update URL */
  openOrder: (type: 'sell' | 'buy', id: number) => void
  /** Close the order detail dialog and remove URL param */
  closeOrder: () => void
}

/**
 * Manages order detail dialog state synchronized with URL.
 *
 * URL format: ?order={type}:{id} (e.g., ?order=sell:123)
 *
 * @example
 * const { dialogOpen, orderType, orderId, openOrder, closeOrder } = useOrderDeepLink()
 *
 * // In template
 * <OrderDetailDialog
 *   v-model="dialogOpen"
 *   :order-type="orderType"
 *   :order-id="orderId"
 *   @update:model-value="if (!$event) closeOrder()"
 * />
 *
 * // Open programmatically
 * openOrder('sell', 123)
 */
export function useOrderDeepLink(options: UseOrderDeepLinkOptions = {}): OrderDeepLinkState {
  const route = useRoute()
  const router = useRouter()
  const paramName = options.param ?? 'order'

  const dialogOpen = ref(false)
  const orderType = ref<'sell' | 'buy'>('sell')
  const orderId = ref<number>(0)

  let isUpdatingFromUrl = false

  /**
   * Parse order param: "sell:123" -> { type: 'sell', id: 123 }
   * Returns null for invalid format
   */
  const parseOrderParam = (
    value: string | null | undefined
  ): { type: 'sell' | 'buy'; id: number } | null => {
    if (!value) return null
    const match = value.match(/^(sell|buy):(\d+)$/)
    if (!match) return null
    return { type: match[1] as 'sell' | 'buy', id: parseInt(match[2], 10) }
  }

  /**
   * Get current order param from URL
   */
  const getUrlOrder = (): { type: 'sell' | 'buy'; id: number } | null => {
    const raw = route.query[paramName]
    const value = Array.isArray(raw) ? raw[0] : raw
    return parseOrderParam(value ?? null)
  }

  /**
   * Open order dialog and update URL
   */
  const openOrder = (type: 'sell' | 'buy', id: number) => {
    orderType.value = type
    orderId.value = id
    dialogOpen.value = true

    // Update URL
    if (!isUpdatingFromUrl) {
      const query = { ...route.query, [paramName]: `${type}:${id}` }
      router.replace({ query })
    }
  }

  /**
   * Close order dialog and remove URL param
   */
  const closeOrder = () => {
    dialogOpen.value = false

    // Remove from URL
    if (!isUpdatingFromUrl) {
      const query = { ...route.query }
      delete query[paramName]
      router.replace({ query })
    }
  }

  // Initialize from URL on mount
  onMounted(() => {
    const urlOrder = getUrlOrder()
    if (urlOrder) {
      isUpdatingFromUrl = true
      openOrder(urlOrder.type, urlOrder.id)
      isUpdatingFromUrl = false
    }
  })

  // Watch for dialog close (from user interaction)
  watch(dialogOpen, isOpen => {
    if (!isOpen && !isUpdatingFromUrl) {
      // Dialog was closed, update URL
      const query = { ...route.query }
      delete query[paramName]
      router.replace({ query })
    }
  })

  // Watch route changes (back/forward navigation)
  watch(
    () => route.query[paramName],
    () => {
      const urlOrder = getUrlOrder()
      if (urlOrder) {
        // URL has order param, open dialog if not already showing this order
        if (
          !dialogOpen.value ||
          orderType.value !== urlOrder.type ||
          orderId.value !== urlOrder.id
        ) {
          isUpdatingFromUrl = true
          openOrder(urlOrder.type, urlOrder.id)
          isUpdatingFromUrl = false
        }
      } else if (dialogOpen.value) {
        // URL no longer has order param, close dialog
        isUpdatingFromUrl = true
        dialogOpen.value = false
        isUpdatingFromUrl = false
      }
    }
  )

  return {
    dialogOpen,
    orderType,
    orderId,
    openOrder,
    closeOrder,
  }
}
