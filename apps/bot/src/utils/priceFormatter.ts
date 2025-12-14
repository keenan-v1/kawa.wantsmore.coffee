/**
 * Price formatting utilities for Discord bot
 */
import { getOrderDisplayPrice } from '@kawakawa/services/market'
import type { Currency } from '@kawakawa/types'

/**
 * Input for order price formatting
 */
export interface OrderPriceInput {
  price: string
  currency: string
  priceListCode: string | null
  commodityTicker: string
  locationId: string
}

/**
 * Formatted price result
 */
export interface FormattedPrice {
  /** Price formatted as string with 2 decimal places */
  displayPrice: string
  /** Currency code */
  displayCurrency: string
  /** Numeric price value for calculations */
  numericPrice: number
}

/**
 * Format an order's price, resolving from price list if needed.
 *
 * @param order - Order price input data
 * @returns Formatted price information
 *
 * @example
 * ```typescript
 * const price = await formatOrderPrice({
 *   price: order.price,
 *   currency: order.currency,
 *   priceListCode: order.priceListCode,
 *   commodityTicker: order.commodityTicker,
 *   locationId: order.locationId,
 * })
 * console.log(`${price.displayPrice} ${price.displayCurrency}`)
 * ```
 */
export async function formatOrderPrice(order: OrderPriceInput): Promise<FormattedPrice> {
  const priceInfo = await getOrderDisplayPrice({
    price: order.price,
    currency: order.currency as Currency,
    priceListCode: order.priceListCode,
    commodityTicker: order.commodityTicker,
    locationId: order.locationId,
  })

  if (priceInfo) {
    return {
      displayPrice: priceInfo.price.toFixed(2),
      displayCurrency: priceInfo.currency,
      numericPrice: priceInfo.price,
    }
  }

  return {
    displayPrice: order.price,
    displayCurrency: order.currency,
    numericPrice: parseFloat(order.price),
  }
}

/**
 * Calculate total value from formatted price and quantity.
 *
 * @param price - Formatted price result
 * @param quantity - Quantity to multiply by
 * @returns Total value as formatted string with 2 decimal places
 */
export function calculateTotal(price: FormattedPrice, quantity: number): string {
  return (price.numericPrice * quantity).toFixed(2)
}

/**
 * Format a price value to 2 decimal places.
 *
 * @param price - Price value (number or string)
 * @returns Formatted price string
 */
export function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price
  return num.toFixed(2)
}
