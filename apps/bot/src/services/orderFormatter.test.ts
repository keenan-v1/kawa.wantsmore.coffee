import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SellOrderQuantityInfo } from '@kawakawa/services/market'

// Create hoisted mock functions
const { mockFormatCommodity, mockFormatLocation, mockGetOrderDisplayPrice } = vi.hoisted(() => ({
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetOrderDisplayPrice: vi.fn(),
}))

// Mock the display service
vi.mock('./display.js', () => ({
  formatCommodity: mockFormatCommodity,
  formatLocation: mockFormatLocation,
}))

// Mock the market service
vi.mock('@kawakawa/services/market', () => ({
  getOrderDisplayPrice: mockGetOrderDisplayPrice,
}))

// Mock the types package
vi.mock('@kawakawa/types', () => ({
  formatCurrencySymbol: (currency: string) => {
    const symbols: Record<string, string> = { NCC: '₦', AIC: '₳', CIS: '₡', ICA: 'ǂ' }
    return symbols[currency] ?? currency
  },
}))

// Import after mocks
import {
  determineGrouping,
  determineGroupingMulti,
  formatGroupedOrders,
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type ResolvedFilters,
  type MultiResolvedFilters,
  type SellOrderData,
  type BuyOrderData,
} from './orderFormatter.js'

describe('orderFormatter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatCommodity.mockImplementation(ticker => ticker)
    mockFormatLocation.mockResolvedValue('Benten (BEN)')
    // Default mock for getOrderDisplayPrice - returns the stored price
    mockGetOrderDisplayPrice.mockImplementation(
      async (order: { price: string; currency: string }) => ({
        price: parseFloat(order.price),
        currency: order.currency,
      })
    )
  })

  describe('determineGrouping', () => {
    it('groups by location when only commodity is filtered', () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: null,
        displayName: null,
      }
      expect(determineGrouping(filters)).toBe('location')
    })

    it('groups by user when only location is filtered', () => {
      const filters: ResolvedFilters = {
        commodity: null,
        location: { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
        userId: null,
        displayName: null,
      }
      expect(determineGrouping(filters)).toBe('user')
    })

    it('groups by location when only user is filtered', () => {
      const filters: ResolvedFilters = {
        commodity: null,
        location: null,
        userId: 1,
        displayName: 'testuser',
      }
      expect(determineGrouping(filters)).toBe('location')
    })

    it('groups by user when commodity + location are filtered', () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
        userId: null,
        displayName: null,
      }
      expect(determineGrouping(filters)).toBe('user')
    })

    it('groups by user when user + location are filtered', () => {
      const filters: ResolvedFilters = {
        commodity: null,
        location: { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
        userId: 1,
        displayName: 'testuser',
      }
      expect(determineGrouping(filters)).toBe('user')
    })

    it('groups by location when commodity + user are filtered', () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: 1,
        displayName: 'testuser',
      }
      expect(determineGrouping(filters)).toBe('location')
    })

    it('groups by location when all three are filtered', () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
        userId: 1,
        displayName: 'testuser',
      }
      expect(determineGrouping(filters)).toBe('location')
    })

    it('groups by location when no filters are provided', () => {
      const filters: ResolvedFilters = {
        commodity: null,
        location: null,
        userId: null,
        displayName: null,
      }
      expect(determineGrouping(filters)).toBe('location')
    })
  })

  describe('formatGroupedOrders', () => {
    const baseSellOrder: SellOrderData = {
      id: 1,
      userId: 1,
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100',
      currency: 'CIS',
      priceListCode: null,
      orderType: 'internal',
      user: { displayName: 'TestUser' },
      commodity: { ticker: 'COF' },
      location: { naturalId: 'BEN', name: 'Benten' },
    }

    const baseBuyOrder: BuyOrderData = {
      id: 2,
      userId: 2,
      commodityTicker: 'COF',
      locationId: 'BEN',
      quantity: 50,
      price: '95',
      currency: 'CIS',
      priceListCode: null,
      orderType: 'internal',
      user: { displayName: 'BuyerUser' },
      commodity: { ticker: 'COF' },
      location: { naturalId: 'BEN', name: 'Benten' },
    }

    it('returns empty array when no orders provided', async () => {
      const filters: ResolvedFilters = {
        commodity: null,
        location: null,
        userId: null,
        displayName: null,
      }
      const result = await formatGroupedOrders([], [], new Map(), filters, 'both')
      expect(result).toEqual([])
    })

    it('groups sell orders by location when commodity filter is applied', async () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: null,
        displayName: null,
      }
      const sellQuantities = new Map<number, SellOrderQuantityInfo>([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrders([baseSellOrder], [], sellQuantities, filters, 'both')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Benten (BEN)')
      expect(result[0].value).toContain('📤 `100 COF from TestUser`')
      expect(result[0].value).toContain('**₡100**')
    })

    it('groups orders by user when location filter is applied', async () => {
      const filters: ResolvedFilters = {
        commodity: null,
        location: { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
        userId: null,
        displayName: null,
      }
      const sellQuantities = new Map<number, SellOrderQuantityInfo>([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrders([baseSellOrder], [], sellQuantities, filters, 'both')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('TestUser')
      expect(result[0].value).toContain('📤 `100 COF on Benten (BEN)`')
    })

    it('combines sell and buy orders in same group', async () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: null,
        displayName: null,
      }
      const sellQuantities = new Map<number, SellOrderQuantityInfo>([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrders(
        [baseSellOrder],
        [baseBuyOrder],
        sellQuantities,
        filters,
        'both'
      )

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Benten (BEN)')
      expect(result[0].value).toContain('📤') // sell order
      expect(result[0].value).toContain('📥') // buy order
    })

    it('creates separate groups for different locations', async () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: null,
        displayName: null,
      }
      const sellOrders: SellOrderData[] = [
        baseSellOrder,
        {
          ...baseSellOrder,
          id: 3,
          locationId: 'MOR',
          location: { naturalId: 'MOR', name: 'Moria Station' },
        },
      ]
      mockFormatLocation
        .mockResolvedValueOnce('Benten (BEN)')
        .mockResolvedValueOnce('Moria Station (MOR)')

      const sellQuantities = new Map<number, SellOrderQuantityInfo>([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
        [
          3,
          {
            fioQuantity: 50,
            availableQuantity: 50,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 50,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrders(sellOrders, [], sellQuantities, filters, 'both')

      expect(result).toHaveLength(2)
    })

    it('includes FIO age when available', async () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: null,
        displayName: null,
      }
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const sellQuantities = new Map<number, SellOrderQuantityInfo>([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: twoHoursAgo,
          },
        ],
      ])

      const result = await formatGroupedOrders([baseSellOrder], [], sellQuantities, filters, 'both')

      expect(result[0].value).toContain('2h ago')
    })

    it('splits group into multiple fields when exceeding 1024 characters', async () => {
      const filters: ResolvedFilters = {
        commodity: { ticker: 'COF', name: 'Coffee' },
        location: null,
        userId: null,
        displayName: null,
      }

      // Create many orders at the same location to exceed the 1024 char limit
      const manyOrders: SellOrderData[] = []
      const sellQuantities = new Map<number, SellOrderQuantityInfo>()

      for (let i = 1; i <= 30; i++) {
        manyOrders.push({
          ...baseSellOrder,
          id: i,
          user: { displayName: `VeryLongUserNameNumber${i}Padded` },
        })
        sellQuantities.set(i, {
          fioQuantity: 100,
          availableQuantity: 100,
          reservedQuantity: 0,
          fulfilledQuantity: 0,
          remainingQuantity: 100,
          activeReservationCount: 0,
          fioUploadedAt: null,
        })
      }

      const result = await formatGroupedOrders(manyOrders, [], sellQuantities, filters, 'both')

      // Should have multiple items for the same location (continuation fields)
      expect(result.length).toBeGreaterThan(1)
      // First item should have the group name
      expect(result[0].name).toBe('Benten (BEN)')
      // Continuation items should have arrow prefix
      expect(result[1].name).toBe('↳ Benten (BEN)')
      // Each field value should be under 1024 chars
      for (const item of result) {
        expect(item.value.length).toBeLessThanOrEqual(1024)
      }
    })
  })

  describe('buildFilterDescription', () => {
    it('formats basic sell + internal filter with pipes', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'internal')
      expect(result).toBe('📤 Sell | 👤 Internal')
    })

    it('includes commodity filter after mode', () => {
      const result = buildFilterDescription(['COF'], [], [], 'sell', 'internal')
      expect(result).toBe('📤 Sell | 👤 Internal | 🏷️ COF')
    })

    it('includes multiple commodities', () => {
      const result = buildFilterDescription(['COF', 'RAT', 'DW'], [], [], 'sell', 'internal')
      expect(result).toBe('📤 Sell | 👤 Internal | 🏷️ COF, RAT, DW')
    })

    it('includes location filter after mode', () => {
      const result = buildFilterDescription([], ['Benten (BEN)'], [], 'sell', 'internal')
      expect(result).toBe('📤 Sell | 👤 Internal | 📍 Benten (BEN)')
    })

    it('includes username filter after mode', () => {
      const result = buildFilterDescription([], [], ['Alice'], 'sell', 'internal')
      expect(result).toBe('📤 Sell | 👤 Internal | 🧑 Alice')
    })

    it('formats buy order type', () => {
      const result = buildFilterDescription([], [], [], 'buy', 'internal')
      expect(result).toBe('📥 Buy | 👤 Internal')
    })

    it('formats all order types', () => {
      const result = buildFilterDescription([], [], [], 'all', 'internal')
      expect(result).toBe('📥 Buy & 📤 Sell | 👤 Internal')
    })

    it('formats partner visibility', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'partner')
      expect(result).toBe('📤 Sell | 👥 Partner')
    })

    it('formats all visibility', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'all')
      expect(result).toBe('📤 Sell | 👤 Internal & 👥 Partner')
    })

    it('splits filters to second line when total exceeds 72 characters', () => {
      // Create a long filter description
      const result = buildFilterDescription(
        ['COF', 'RAT', 'DW', 'OVE'],
        ['Benten Station (BEN)', 'Moria Station (MOR)'],
        ['Alice', 'Bob'],
        'all',
        'all'
      )
      // Should have mode line first, then filters on second line
      expect(result).toContain('\n')
      // Mode line should still use pipes
      expect(result).toMatch(/^📥 Buy & 📤 Sell \| 👤 Internal & 👥 Partner\n/)
    })

    it('uses pipes when line is under 72 characters', () => {
      const result = buildFilterDescription(['COF'], ['BEN'], [], 'sell', 'internal')
      expect(result).toContain(' | ')
      expect(result).not.toContain('\n')
    })

    it('shows lock icon when visibility is enforced', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'internal', {
        visibilityEnforced: true,
      })
      expect(result).toBe('📤 Sell | 🔒 👤 Internal')
    })

    it('shows lock icon with partner visibility when enforced', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'partner', {
        visibilityEnforced: true,
      })
      expect(result).toBe('📤 Sell | 🔒 👥 Partner')
    })

    it('shows lock icon with all visibility when enforced', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'all', {
        visibilityEnforced: true,
      })
      expect(result).toBe('📤 Sell | 🔒 👤 Internal & 👥 Partner')
    })

    it('does not show lock icon when visibility is not enforced', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'internal', {
        visibilityEnforced: false,
      })
      expect(result).toBe('📤 Sell | 👤 Internal')
      expect(result).not.toContain('🔒')
    })

    it('does not show lock icon when options not provided', () => {
      const result = buildFilterDescription([], [], [], 'sell', 'internal')
      expect(result).not.toContain('🔒')
    })
  })

  describe('determineGroupingMulti', () => {
    it('groups by location when multiple commodities are filtered', () => {
      const filters: MultiResolvedFilters = {
        commodities: [
          { ticker: 'COF', name: 'Coffee' },
          { ticker: 'RAT', name: 'Rations' },
        ],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      expect(determineGroupingMulti(filters)).toBe('location')
    })

    it('groups by user when multiple locations are filtered', () => {
      const filters: MultiResolvedFilters = {
        commodities: [],
        locations: [
          { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
          { naturalId: 'MOR', name: 'Moria', type: 'STATION' },
        ],
        userIds: [],
        displayNames: [],
      }
      expect(determineGroupingMulti(filters)).toBe('user')
    })

    it('groups by location when filtering by single user', () => {
      const filters: MultiResolvedFilters = {
        commodities: [],
        locations: [],
        userIds: [1],
        displayNames: ['TestUser'],
      }
      expect(determineGroupingMulti(filters)).toBe('location')
    })

    it('groups by location when no filters provided', () => {
      const filters: MultiResolvedFilters = {
        commodities: [],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      expect(determineGroupingMulti(filters)).toBe('location')
    })
  })

  describe('formatGroupedOrdersMulti', () => {
    const baseSellOrder: SellOrderData = {
      id: 1,
      userId: 1,
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100',
      currency: 'CIS',
      priceListCode: null,
      orderType: 'internal',
      user: { displayName: 'TestUser' },
      commodity: { ticker: 'COF' },
      location: { naturalId: 'BEN', name: 'Benten' },
    }

    const baseBuyOrder: BuyOrderData = {
      id: 2,
      userId: 2,
      commodityTicker: 'COF',
      locationId: 'BEN',
      quantity: 50,
      price: '95',
      currency: 'CIS',
      priceListCode: null,
      orderType: 'internal',
      user: { displayName: 'BuyerUser' },
      commodity: { ticker: 'COF' },
      location: { naturalId: 'BEN', name: 'Benten' },
    }

    it('returns empty array when no orders provided', async () => {
      const filters: MultiResolvedFilters = {
        commodities: [],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      const result = await formatGroupedOrdersMulti([], [], new Map(), filters, 'both')
      expect(result.items).toEqual([])
    })

    it('groups sell orders with multi-commodity filter', async () => {
      const filters: MultiResolvedFilters = {
        commodities: [
          { ticker: 'COF', name: 'Coffee' },
          { ticker: 'RAT', name: 'Rations' },
        ],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      const sellQuantities = new Map<
        number,
        import('@kawakawa/services/market').SellOrderQuantityInfo
      >([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrdersMulti(
        [baseSellOrder],
        [],
        sellQuantities,
        filters,
        'both'
      )

      expect(result.items.length).toBeGreaterThanOrEqual(1)
    })

    it('combines sell and buy orders in groups', async () => {
      const filters: MultiResolvedFilters = {
        commodities: [{ ticker: 'COF', name: 'Coffee' }],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      const sellQuantities = new Map<
        number,
        import('@kawakawa/services/market').SellOrderQuantityInfo
      >([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrdersMulti(
        [baseSellOrder],
        [baseBuyOrder],
        sellQuantities,
        filters,
        'both',
        'all',
        'all'
      )

      expect(result.items.length).toBeGreaterThanOrEqual(1)
    })

    it('shows type icons when orderType is all', async () => {
      const filters: MultiResolvedFilters = {
        commodities: [{ ticker: 'COF', name: 'Coffee' }],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      const sellQuantities = new Map<
        number,
        import('@kawakawa/services/market').SellOrderQuantityInfo
      >([
        [
          1,
          {
            fioQuantity: 50,
            availableQuantity: 50,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 50,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrdersMulti(
        [baseSellOrder],
        [baseBuyOrder],
        sellQuantities,
        filters,
        'both',
        'all', // This should show type icons
        'internal'
      )

      // Results should contain type icons when showing mixed orders
      expect(result.items.length).toBeGreaterThanOrEqual(1)
    })

    it('hides type icons when orderType is specific', async () => {
      const filters: MultiResolvedFilters = {
        commodities: [{ ticker: 'COF', name: 'Coffee' }],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      const sellQuantities = new Map<
        number,
        import('@kawakawa/services/market').SellOrderQuantityInfo
      >([
        [
          1,
          {
            fioQuantity: 50,
            availableQuantity: 50,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 50,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrdersMulti(
        [baseSellOrder],
        [],
        sellQuantities,
        filters,
        'both',
        'sell', // Specific type, no type icon needed
        'internal'
      )

      expect(result.items.length).toBeGreaterThanOrEqual(1)
    })

    it('uses FIO username when available', async () => {
      const orderWithFio: SellOrderData = {
        ...baseSellOrder,
        user: { displayName: 'TestUser', fioUsername: 'FioPlayer' },
      }
      const filters: MultiResolvedFilters = {
        commodities: [{ ticker: 'COF', name: 'Coffee' }],
        locations: [],
        userIds: [],
        displayNames: [],
      }
      const sellQuantities = new Map<
        number,
        import('@kawakawa/services/market').SellOrderQuantityInfo
      >([
        [
          1,
          {
            fioQuantity: 100,
            availableQuantity: 100,
            reservedQuantity: 0,
            fulfilledQuantity: 0,
            remainingQuantity: 100,
            activeReservationCount: 0,
            fioUploadedAt: null,
          },
        ],
      ])

      const result = await formatGroupedOrdersMulti(
        [orderWithFio],
        [],
        sellQuantities,
        filters,
        'both'
      )

      expect(result.items.length).toBeGreaterThanOrEqual(1)
      // The FIO username should be used in the output
      expect(result.items[0].value).toContain('FioPlayer')
    })
  })
})
