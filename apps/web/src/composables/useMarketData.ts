import { ref } from 'vue'
import type { Currency, OrderType, PricingMode } from '@kawakawa/types'
import { api } from '../services/api'

/**
 * Type of market item: sell listing or buy request
 */
export type MarketItemType = 'sell' | 'buy'

/**
 * Unified market item interface that normalizes sell listings and buy requests
 * into a common format for display in the market view.
 */
export interface MarketItem {
  id: number
  itemType: MarketItemType
  commodityTicker: string
  locationId: string
  userName: string // sellerName or buyerName
  price: number
  currency: Currency
  orderType: OrderType
  quantity: number // availableQuantity or quantity
  remainingQuantity: number
  reservedQuantity: number
  activeReservationCount: number
  isOwn: boolean
  fioUploadedAt: string | null // When seller's FIO inventory was last synced
  pricingMode: PricingMode
  effectivePrice: number | null
  priceListCode: string | null
}

/**
 * Get display price for an item.
 * Returns the effective price for dynamic pricing, or the regular price for fixed pricing.
 */
export function getDisplayPrice(item: MarketItem): number | null {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price
}

/**
 * Composable for loading and managing market data (sell listings and buy requests).
 *
 * @param options.onError - Optional callback for handling errors
 */
export function useMarketData(options?: { onError?: (error: unknown) => void }) {
  const marketItems = ref<MarketItem[]>([])
  const loading = ref(false)

  /**
   * Load market items from the API.
   * Fetches both sell listings and buy requests in parallel,
   * transforms them to a unified format, and sorts by commodity, location, then price.
   */
  const loadMarketItems = async () => {
    try {
      loading.value = true
      // Fetch both sell listings and buy requests in parallel
      const [sellListings, buyRequests] = await Promise.all([
        api.market.getListings(),
        api.market.getBuyRequests(),
      ])

      // Transform sell listings to unified format
      const sellItems: MarketItem[] = sellListings.map(listing => ({
        id: listing.id,
        itemType: 'sell' as MarketItemType,
        commodityTicker: listing.commodityTicker,
        locationId: listing.locationId,
        userName: listing.sellerName,
        price: listing.price,
        currency: listing.currency,
        orderType: listing.orderType,
        quantity: listing.availableQuantity,
        remainingQuantity: listing.remainingQuantity,
        reservedQuantity: listing.reservedQuantity,
        activeReservationCount: listing.activeReservationCount,
        isOwn: listing.isOwn,
        fioUploadedAt: listing.fioUploadedAt,
        pricingMode: listing.pricingMode,
        effectivePrice: listing.effectivePrice,
        priceListCode: listing.priceListCode,
      }))

      // Transform buy requests to unified format
      const buyItems: MarketItem[] = buyRequests.map(request => ({
        id: request.id,
        itemType: 'buy' as MarketItemType,
        commodityTicker: request.commodityTicker,
        locationId: request.locationId,
        userName: request.buyerName,
        price: request.price,
        currency: request.currency,
        orderType: request.orderType,
        quantity: request.quantity,
        remainingQuantity: request.remainingQuantity,
        reservedQuantity: request.reservedQuantity,
        activeReservationCount: request.activeReservationCount,
        isOwn: request.isOwn,
        fioUploadedAt: request.fioUploadedAt,
        pricingMode: request.pricingMode,
        effectivePrice: request.effectivePrice,
        priceListCode: request.priceListCode,
      }))

      // Combine and sort by commodity, then location, then price (using effective price for dynamic)
      marketItems.value = [...sellItems, ...buyItems].sort((a, b) => {
        if (a.commodityTicker !== b.commodityTicker) {
          return a.commodityTicker.localeCompare(b.commodityTicker)
        }
        if (a.locationId !== b.locationId) {
          return a.locationId.localeCompare(b.locationId)
        }
        // Use display price for sorting (effective for dynamic, regular for fixed)
        const priceA = getDisplayPrice(a) ?? Infinity
        const priceB = getDisplayPrice(b) ?? Infinity
        return priceA - priceB
      })
    } catch (error) {
      console.error('Failed to load market items', error)
      options?.onError?.(error)
    } finally {
      loading.value = false
    }
  }

  return {
    marketItems,
    loading,
    loadMarketItems,
  }
}
