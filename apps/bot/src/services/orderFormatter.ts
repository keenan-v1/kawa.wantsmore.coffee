import { formatCommodity, formatLocation } from './display.js'
import { getOrderDisplayPrice, type SellOrderQuantityInfo } from '@kawakawa/services/market'
import type { PaginatedItem } from '../components/pagination.js'
import { formatCurrencySymbol, type Currency } from '@kawakawa/types'
import type { XitMaterials } from '@kawakawa/types/xit'

/**
 * Filters that were resolved from user input (single values)
 */
export interface ResolvedFilters {
  commodity: { ticker: string; name: string } | null
  location: { naturalId: string; name: string; type: string } | null
  userId: number | null
  displayName: string | null
}

/**
 * Filters that were resolved from user input (multiple values for /query)
 */
export interface MultiResolvedFilters {
  commodities: { ticker: string; name: string }[]
  locations: { naturalId: string; name: string; type: string }[]
  userIds: number[]
  displayNames: string[]
}

/**
 * Sell order data with relations
 */
export interface SellOrderData {
  id: number
  userId: number
  commodityTicker: string
  locationId: string
  price: string
  currency: Currency
  priceListCode: string | null
  orderType: string
  user: { displayName: string; fioUsername?: string }
  commodity: { ticker: string }
  location: { naturalId: string; name: string }
}

/**
 * Buy order data with relations
 */
export interface BuyOrderData {
  id: number
  userId: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: string
  currency: Currency
  priceListCode: string | null
  orderType: string
  user: { displayName: string; fioUsername?: string }
  commodity: { ticker: string }
  location: { naturalId: string; name: string }
}

type GroupBy = 'location' | 'user'

/**
 * Determine how to group results based on which filters were provided.
 *
 * Rules:
 * - Commodity only → group by location
 * - Location only → group by user
 * - User only → group by location
 * - Commodity + Location → group by user
 * - User + Location → group by user
 * - Commodity + User → group by location
 * - All three or none → group by location (default)
 */
export function determineGrouping(filters: ResolvedFilters): GroupBy {
  const hasCommodity = filters.commodity !== null
  const hasLocation = filters.location !== null
  const hasUser = filters.userId !== null

  if (hasCommodity && !hasLocation && !hasUser) return 'location'
  if (!hasCommodity && hasLocation && !hasUser) return 'user'
  if (!hasCommodity && !hasLocation && hasUser) return 'location'
  if (hasCommodity && hasLocation && !hasUser) return 'user'
  if (!hasCommodity && hasLocation && hasUser) return 'user'
  if (hasCommodity && !hasLocation && hasUser) return 'location'

  // Default: group by location
  return 'location'
}

/**
 * Determine grouping for multi-filter queries.
 * Uses same logic as single filters but checks array lengths.
 */
export function determineGroupingMulti(filters: MultiResolvedFilters): GroupBy {
  const hasCommodity = filters.commodities.length > 0
  const hasLocation = filters.locations.length > 0
  const hasUser = filters.userIds.length > 0

  if (hasCommodity && !hasLocation && !hasUser) return 'location'
  if (!hasCommodity && hasLocation && !hasUser) return 'user'
  if (!hasCommodity && !hasLocation && hasUser) return 'location'
  if (hasCommodity && hasLocation && !hasUser) return 'user'
  if (!hasCommodity && hasLocation && hasUser) return 'user'
  if (hasCommodity && !hasLocation && hasUser) return 'location'

  // Default: group by location
  return 'location'
}

/**
 * Options for building filter description
 */
export interface FilterDescriptionOptions {
  visibilityEnforced?: boolean
}

/**
 * Build a formatted filter description with emojis.
 *
 * Format: Mode line first (order type + visibility), then filter details.
 *
 * Examples:
 * - 📤 Sell | 👤 Internal
 * - 📤 Sell | 👤 Internal | 🏷️ COF, DW
 * - 📤 Sell | 🔒 👤 Internal
 *   🏷️ COF | 📍 Benten, Moria | 🧑 Alice
 *
 * @param commodities - Array of commodity tickers (formatted)
 * @param locations - Array of location display strings
 * @param displayNames - Array of user display names
 * @param orderType - 'all' | 'sell' | 'buy'
 * @param visibility - 'all' | 'internal' | 'partner'
 * @param options - Optional settings (e.g., visibilityEnforced)
 */
export function buildFilterDescription(
  commodities: string[],
  locations: string[],
  displayNames: string[],
  orderType: 'all' | 'sell' | 'buy',
  visibility: 'all' | 'internal' | 'partner',
  options?: FilterDescriptionOptions
): string {
  // Build mode line (order type + visibility) - always first
  const modeParts: string[] = []

  // Order type
  if (orderType === 'all') {
    modeParts.push('📥 Buy & 📤 Sell')
  } else if (orderType === 'buy') {
    modeParts.push('📥 Buy')
  } else {
    modeParts.push('📤 Sell')
  }

  // Visibility (with optional lock icon when enforced by channel)
  const lockIcon = options?.visibilityEnforced ? '🔒 ' : ''
  if (visibility === 'all') {
    modeParts.push(`${lockIcon}👤 Internal & 👥 Partner`)
  } else if (visibility === 'partner') {
    modeParts.push(`${lockIcon}👥 Partner`)
  } else {
    modeParts.push(`${lockIcon}👤 Internal`)
  }

  const modeLine = modeParts.join(' | ')

  // Build filter parts (commodities, locations, users)
  const filterParts: string[] = []

  if (commodities.length > 0) {
    filterParts.push(`🏷️ ${commodities.join(', ')}`)
  }

  if (locations.length > 0) {
    filterParts.push(`📍 ${locations.join(', ')}`)
  }

  if (displayNames.length > 0) {
    filterParts.push(`🧑 ${displayNames.join(', ')}`)
  }

  // If no filters, just return mode line
  if (filterParts.length === 0) {
    return modeLine
  }

  // Try to fit everything on one line
  const filterLine = filterParts.join(' | ')
  const singleLine = `${modeLine} | ${filterLine}`

  if (singleLine.length <= 72) {
    return singleLine
  }

  // Otherwise, mode line first, then filters on second line
  return `${modeLine}\n${filterLine}`
}

/**
 * Format a price for display, removing unnecessary decimal places
 */
function formatPrice(price: number): string {
  // If it's a whole number, don't show decimals
  if (Number.isInteger(price)) {
    return price.toString()
  }
  // Otherwise show up to 2 decimal places
  return price.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Format FIO age as a human-readable string
 */
function formatFioAge(fioUploadedAt: Date | null): string {
  if (!fioUploadedAt) return ''

  const now = new Date()
  const diffMs = now.getTime() - fioUploadedAt.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'just now'
}

interface FormattedGroup {
  name: string
  lines: string[]
}

/**
 * Discord embed field value has a 1024 character limit.
 * This helper converts groups to paginated items, splitting large groups
 * into multiple fields when necessary.
 */
const MAX_FIELD_LENGTH = 1024

function convertGroupsToPaginatedItems(groups: Map<string, FormattedGroup>): PaginatedItem[] {
  const items: PaginatedItem[] = []

  for (const group of groups.values()) {
    const fullValue = group.lines.join('\n')

    if (fullValue.length <= MAX_FIELD_LENGTH) {
      // Fits in one field
      items.push({
        name: group.name,
        value: fullValue,
        inline: false,
      })
    } else {
      // Need to split into multiple fields
      let currentLines: string[] = []
      let currentLength = 0
      let isFirst = true

      for (const line of group.lines) {
        const lineWithNewline = currentLines.length > 0 ? '\n' + line : line
        const addedLength = lineWithNewline.length

        if (currentLength + addedLength > MAX_FIELD_LENGTH && currentLines.length > 0) {
          // Push current batch and start new one
          items.push({
            name: isFirst ? group.name : `↳ ${group.name}`,
            value: currentLines.join('\n'),
            inline: false,
          })
          isFirst = false
          currentLines = [line]
          currentLength = line.length
        } else {
          currentLines.push(line)
          currentLength += addedLength
        }
      }

      // Push remaining lines
      if (currentLines.length > 0) {
        items.push({
          name: isFirst ? group.name : `↳ ${group.name}`,
          value: currentLines.join('\n'),
          inline: false,
        })
      }
    }
  }

  return items
}

// Intermediate type for preprocessed order data (used by formatGroupedOrders)
interface PreprocessedOrderSimple {
  type: 'sell' | 'buy'
  groupKey: string
  groupName: string
  qty: string
  ticker: string
  nameOrLocation: string
  currencySymbol: string
  displayPrice: string
  fioAge: string
  typeIcon: string
  visIcon: string
}

/**
 * Format orders into grouped paginated items.
 * Uses two-pass approach for aligned/padded output.
 *
 * @param sellOrders - Array of sell orders
 * @param buyOrders - Array of buy orders
 * @param sellQuantities - Map of sell order ID to quantity info
 * @param filters - Resolved filters to determine grouping
 * @param locationDisplayMode - User's location display preference
 * @param orderType - Filter type to hide redundant icons
 * @param visibility - Filter visibility to hide redundant icons
 * @returns Array of PaginatedItem for display
 */
export async function formatGroupedOrders(
  sellOrders: SellOrderData[],
  buyOrders: BuyOrderData[],
  sellQuantities: Map<number, SellOrderQuantityInfo>,
  filters: ResolvedFilters,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both',
  orderType: 'all' | 'sell' | 'buy' = 'all',
  visibility: 'all' | 'internal' | 'partner' = 'all'
): Promise<PaginatedItem[]> {
  const groupBy = determineGrouping(filters)

  // Only show type icon if viewing mixed types
  const showTypeIcon = orderType === 'all'
  // Only show visibility icon if viewing mixed visibility
  const showVisIcon = visibility === 'all'

  // === PASS 1: Preprocess all orders and collect values ===
  const preprocessed: PreprocessedOrderSimple[] = []

  // Track max widths for padding
  let maxQtyLen = 0
  let maxTickerLen = 3 // Minimum 3 for standard tickers
  let maxNameLen = 0
  let maxPriceLen = 0

  // Process sell orders
  for (const order of sellOrders) {
    const quantityInfo = sellQuantities.get(order.id)
    const qty = String(quantityInfo?.remainingQuantity ?? 0)
    const fioAge = formatFioAge(quantityInfo?.fioUploadedAt ?? null)
    const ticker = formatCommodity(order.commodity.ticker)
    const locationDisplay = await formatLocation(order.location.naturalId, locationDisplayMode)

    const priceInfo = await getOrderDisplayPrice({
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
    })
    const displayPrice = priceInfo ? formatPrice(priceInfo.price) : '??'
    const currencySymbol = formatCurrencySymbol(priceInfo?.currency ?? order.currency)

    const userName = order.user.fioUsername ?? order.user.displayName
    const nameOrLocation = groupBy === 'location' ? userName : locationDisplay
    const groupKey = groupBy === 'location' ? order.locationId : `user:${order.userId}`
    const groupName = groupBy === 'location' ? locationDisplay : userName

    // Update max widths
    maxQtyLen = Math.max(maxQtyLen, qty.length)
    maxTickerLen = Math.max(maxTickerLen, ticker.length)
    maxNameLen = Math.max(maxNameLen, nameOrLocation.length)
    maxPriceLen = Math.max(maxPriceLen, displayPrice.length)

    preprocessed.push({
      type: 'sell',
      groupKey,
      groupName,
      qty,
      ticker,
      nameOrLocation,
      currencySymbol,
      displayPrice,
      fioAge,
      typeIcon: showTypeIcon ? '📤 ' : '',
      visIcon: showVisIcon ? ` ${order.orderType === 'internal' ? '👤' : '👥'}` : '',
    })
  }

  // Process buy orders
  for (const order of buyOrders) {
    const qty = String(order.quantity)
    const ticker = formatCommodity(order.commodity.ticker)
    const locationDisplay = await formatLocation(order.location.naturalId, locationDisplayMode)

    const priceInfo = await getOrderDisplayPrice({
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
    })
    const displayPrice = priceInfo ? formatPrice(priceInfo.price) : '??'
    const currencySymbol = formatCurrencySymbol(priceInfo?.currency ?? order.currency)

    const userName = order.user.fioUsername ?? order.user.displayName
    const nameOrLocation = groupBy === 'location' ? userName : locationDisplay
    const groupKey = groupBy === 'location' ? order.locationId : `user:${order.userId}`
    const groupName = groupBy === 'location' ? locationDisplay : userName

    // Update max widths
    maxQtyLen = Math.max(maxQtyLen, qty.length)
    maxTickerLen = Math.max(maxTickerLen, ticker.length)
    maxNameLen = Math.max(maxNameLen, nameOrLocation.length)
    maxPriceLen = Math.max(maxPriceLen, displayPrice.length)

    preprocessed.push({
      type: 'buy',
      groupKey,
      groupName,
      qty,
      ticker,
      nameOrLocation,
      currencySymbol,
      displayPrice,
      fioAge: '', // Buy orders don't have FIO age
      typeIcon: showTypeIcon ? '📥 ' : '',
      visIcon: showVisIcon ? ` ${order.orderType === 'internal' ? '👤' : '👥'}` : '',
    })
  }

  // === PASS 2: Format lines with padding ===
  const groups = new Map<string, FormattedGroup>()
  const fromOrOn = groupBy === 'location' ? 'from' : 'on'

  for (const p of preprocessed) {
    const qtyPad = p.qty.padStart(maxQtyLen)
    const tickerPad = p.ticker.padEnd(maxTickerLen)
    const namePad = p.nameOrLocation.padEnd(maxNameLen)
    const pricePad = p.displayPrice.padStart(maxPriceLen)

    let line = `${p.typeIcon}\`${qtyPad} ${tickerPad} ${fromOrOn} ${namePad}\` @ **${p.currencySymbol}${pricePad}**`
    line += p.visIcon
    if (p.fioAge) line += ` - *${p.fioAge}*`

    if (!groups.has(p.groupKey)) {
      groups.set(p.groupKey, { name: p.groupName, lines: [] })
    }
    groups.get(p.groupKey)!.lines.push(line)
  }

  return convertGroupsToPaginatedItems(groups)
}

// Intermediate type for preprocessed order data (used for padding calculation)
interface PreprocessedOrder {
  type: 'sell' | 'buy'
  groupKey: string
  groupName: string
  qty: string
  qtyNum: number // Numeric quantity for XIT comparison
  ticker: string
  commodityTicker: string // Original ticker for XIT lookup
  nameOrLocation: string // displayName when groupBy=location, locationDisplay when groupBy=user
  currencySymbol: string
  displayPrice: string
  plDisplay: string
  fioAge: string
  typeIcon: string
  visIcon: string
}

/**
 * Result of formatting grouped orders with XIT context
 */
export interface FormattedOrdersResult {
  items: PaginatedItem[]
  /** XIT materials that were requested but had no matching orders */
  missingXitMaterials?: string[]
}

/**
 * Format orders into grouped paginated items (for multi-filter queries).
 * Uses two-pass approach for aligned/padded output.
 *
 * @param sellOrders - Array of sell orders
 * @param buyOrders - Array of buy orders
 * @param sellQuantities - Map of sell order ID to quantity info
 * @param filters - Multi-resolved filters to determine grouping
 * @param locationDisplayMode - User's location display preference
 * @param orderType - Filter type to hide redundant icons
 * @param visibility - Filter visibility to hide redundant icons
 * @param xitQuantities - Optional XIT materials for quantity display and tracking
 * @returns FormattedOrdersResult with items and optionally missing XIT materials
 */
export async function formatGroupedOrdersMulti(
  sellOrders: SellOrderData[],
  buyOrders: BuyOrderData[],
  sellQuantities: Map<number, SellOrderQuantityInfo>,
  filters: MultiResolvedFilters,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both',
  orderType: 'all' | 'sell' | 'buy' = 'all',
  visibility: 'all' | 'internal' | 'partner' = 'all',
  xitQuantities?: XitMaterials
): Promise<FormattedOrdersResult> {
  const groupBy = determineGroupingMulti(filters)

  // Only show type icon if viewing mixed types
  const showTypeIcon = orderType === 'all'
  // Only show visibility icon if viewing mixed visibility
  const showVisIcon = visibility === 'all'

  // Track which XIT materials have matching orders
  const foundXitMaterials = new Set<string>()

  // === PASS 1: Preprocess all orders and collect values ===
  const preprocessed: PreprocessedOrder[] = []

  // Track max widths for padding
  let maxQtyLen = 0
  let maxTickerLen = 3 // Minimum 3 for standard tickers
  let maxNameLen = 0
  let maxPriceLen = 0
  let maxPlLen = 0

  // Process sell orders
  for (const order of sellOrders) {
    const quantityInfo = sellQuantities.get(order.id)
    const availableQty = quantityInfo?.remainingQuantity ?? 0
    const fioAge = formatFioAge(quantityInfo?.fioUploadedAt ?? null)
    const ticker = formatCommodity(order.commodity.ticker)
    const locationDisplay = await formatLocation(order.location.naturalId, locationDisplayMode)

    // Track XIT material as found
    if (xitQuantities && order.commodityTicker in xitQuantities) {
      foundXitMaterials.add(order.commodityTicker)
    }

    // For XIT queries, show "requested (available)" format
    // e.g., "15 (1200)" means 15 requested, 1200 available
    let qty: string
    if (xitQuantities && order.commodityTicker in xitQuantities) {
      const requested = xitQuantities[order.commodityTicker]
      qty = `${requested} (${availableQty})`
    } else {
      qty = String(availableQty)
    }

    const priceInfo = await getOrderDisplayPrice({
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
    })
    const displayPrice = priceInfo ? formatPrice(priceInfo.price) : '??'
    const currencySymbol = formatCurrencySymbol(priceInfo?.currency ?? order.currency)
    // Only show price list code if it exists, empty for custom prices
    const plDisplay = order.priceListCode?.toUpperCase() ?? ''

    const userName = order.user.fioUsername ?? order.user.displayName
    const nameOrLocation = groupBy === 'location' ? userName : locationDisplay
    const groupKey = groupBy === 'location' ? order.locationId : `user:${order.userId}`
    const groupName = groupBy === 'location' ? locationDisplay : userName

    // Update max widths
    maxQtyLen = Math.max(maxQtyLen, qty.length)
    maxTickerLen = Math.max(maxTickerLen, ticker.length)
    maxNameLen = Math.max(maxNameLen, nameOrLocation.length)
    maxPriceLen = Math.max(maxPriceLen, displayPrice.length)
    maxPlLen = Math.max(maxPlLen, plDisplay.length)

    preprocessed.push({
      type: 'sell',
      groupKey,
      groupName,
      qty,
      qtyNum: availableQty,
      ticker,
      commodityTicker: order.commodityTicker,
      nameOrLocation,
      currencySymbol,
      displayPrice,
      plDisplay,
      fioAge,
      typeIcon: showTypeIcon ? '📤 ' : '',
      visIcon: showVisIcon ? ` ${order.orderType === 'internal' ? '👤' : '👥'}` : '',
    })
  }

  // Process buy orders
  for (const order of buyOrders) {
    const qty = String(order.quantity)
    const ticker = formatCommodity(order.commodity.ticker)
    const locationDisplay = await formatLocation(order.location.naturalId, locationDisplayMode)

    const priceInfo = await getOrderDisplayPrice({
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
    })
    const displayPrice = priceInfo ? formatPrice(priceInfo.price) : '??'
    const currencySymbol = formatCurrencySymbol(priceInfo?.currency ?? order.currency)
    // Only show price list code if it exists, empty for custom prices
    const plDisplay = order.priceListCode?.toUpperCase() ?? ''

    const userName = order.user.fioUsername ?? order.user.displayName
    const nameOrLocation = groupBy === 'location' ? userName : locationDisplay
    const groupKey = groupBy === 'location' ? order.locationId : `user:${order.userId}`
    const groupName = groupBy === 'location' ? locationDisplay : userName

    // Update max widths
    maxQtyLen = Math.max(maxQtyLen, qty.length)
    maxTickerLen = Math.max(maxTickerLen, ticker.length)
    maxNameLen = Math.max(maxNameLen, nameOrLocation.length)
    maxPriceLen = Math.max(maxPriceLen, displayPrice.length)
    maxPlLen = Math.max(maxPlLen, plDisplay.length)

    preprocessed.push({
      type: 'buy',
      groupKey,
      groupName,
      qty,
      qtyNum: order.quantity,
      ticker,
      commodityTicker: order.commodityTicker,
      nameOrLocation,
      currencySymbol,
      displayPrice,
      plDisplay,
      fioAge: '', // Buy orders don't have FIO age
      typeIcon: showTypeIcon ? '📥 ' : '',
      visIcon: showVisIcon ? ` ${order.orderType === 'internal' ? '👤' : '👥'}` : '',
    })
  }

  // === PASS 2: Format lines with padding ===
  const groups = new Map<string, FormattedGroup>()
  const fromOrOn = groupBy === 'location' ? 'from' : 'on'

  for (const p of preprocessed) {
    const qtyPad = p.qty.padStart(maxQtyLen)
    const tickerPad = p.ticker.padEnd(maxTickerLen)
    const namePad = p.nameOrLocation.padEnd(maxNameLen)
    const pricePad = p.displayPrice.padStart(maxPriceLen)
    // Only show price list in parentheses if there's a price list code
    const plPart = p.plDisplay ? ` (${p.plDisplay.padEnd(maxPlLen)})` : ''

    let line = `${p.typeIcon}\`${qtyPad} ${tickerPad} ${fromOrOn} ${namePad} @ ${p.currencySymbol}${pricePad}${plPart}\``
    line += p.visIcon
    if (p.fioAge) line += ` - *${p.fioAge}*`

    // Add XIT quantity indicator for sell orders
    if (xitQuantities && p.type === 'sell') {
      const required = xitQuantities[p.commodityTicker]
      if (required !== undefined) {
        line += p.qtyNum >= required ? ' ✅' : ' ⚠️'
      }
    }

    if (!groups.has(p.groupKey)) {
      groups.set(p.groupKey, { name: p.groupName, lines: [] })
    }
    groups.get(p.groupKey)!.lines.push(line)
  }

  const items = convertGroupsToPaginatedItems(groups)

  // Determine which XIT materials are missing (requested but no orders found)
  let missingXitMaterials: string[] | undefined
  if (xitQuantities) {
    const requestedMaterials = Object.keys(xitQuantities)
    const missing = requestedMaterials.filter(ticker => !foundXitMaterials.has(ticker))
    if (missing.length > 0) {
      missingXitMaterials = missing
    }
  }

  return { items, missingXitMaterials }
}
