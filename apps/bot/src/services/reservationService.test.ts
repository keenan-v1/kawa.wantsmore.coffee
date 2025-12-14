/**
 * Comprehensive tests for Reservation Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create hoisted mock functions for fine-grained control
const {
  mockSellOrdersFindMany,
  mockSellOrdersFindFirst,
  mockBuyOrdersFindMany,
  mockBuyOrdersFindFirst,
  mockReservationsFindMany,
  mockReservationsFindFirst,
  mockUsersFindMany,
  mockDbInsert,
  mockDbUpdate,
  mockDbSelect,
  mockEnrichSellOrders,
  mockGetOrderDisplayPrice,
  mockFormatLocation,
  mockGetFioUsernames,
} = vi.hoisted(() => ({
  mockSellOrdersFindMany: vi.fn(),
  mockSellOrdersFindFirst: vi.fn(),
  mockBuyOrdersFindMany: vi.fn(),
  mockBuyOrdersFindFirst: vi.fn(),
  mockReservationsFindMany: vi.fn(),
  mockReservationsFindFirst: vi.fn(),
  mockUsersFindMany: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockEnrichSellOrders: vi.fn(),
  mockGetOrderDisplayPrice: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetFioUsernames: vi.fn(),
}))

// Mock the database
vi.mock('@kawakawa/db', () => {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
  }
  mockDbInsert.mockReturnValue(chainable)
  mockDbUpdate.mockReturnValue(chainable)
  mockDbSelect.mockReturnValue(chainable)

  return {
    db: {
      query: {
        sellOrders: { findMany: mockSellOrdersFindMany, findFirst: mockSellOrdersFindFirst },
        buyOrders: { findMany: mockBuyOrdersFindMany, findFirst: mockBuyOrdersFindFirst },
        orderReservations: { findMany: mockReservationsFindMany, findFirst: mockReservationsFindFirst },
        users: { findMany: mockUsersFindMany },
      },
      insert: mockDbInsert,
      update: mockDbUpdate,
      select: mockDbSelect,
    },
    sellOrders: { id: 'id', userId: 'userId', commodityTicker: 'commodityTicker', locationId: 'locationId' },
    buyOrders: { id: 'id', userId: 'userId', commodityTicker: 'commodityTicker', locationId: 'locationId' },
    orderReservations: {
      id: 'id',
      sellOrderId: 'sellOrderId',
      buyOrderId: 'buyOrderId',
      counterpartyUserId: 'counterpartyUserId',
      status: 'status',
      quantity: 'quantity',
    },
    users: { id: 'id' },
  }
})

vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: mockEnrichSellOrders,
  getOrderDisplayPrice: mockGetOrderDisplayPrice,
}))

vi.mock('./locationService.js', () => ({
  formatLocation: mockFormatLocation,
}))

vi.mock('./userSettings.js', () => ({
  getFioUsernames: mockGetFioUsernames,
}))

import {
  getStatusEmoji,
  getAvailableSellOrders,
  getAvailableBuyOrders,
  formatOrderForSelect,
  createReservation,
  getReservationsForUser,
  updateReservationStatus,
  formatReservationForEmbed,
  type ReservationStatus,
  type SelectableOrder,
  type ReservationWithDetails,
} from './reservationService.js'

describe('reservationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSellOrdersFindMany.mockResolvedValue([])
    mockBuyOrdersFindMany.mockResolvedValue([])
    mockReservationsFindMany.mockResolvedValue([])
    mockUsersFindMany.mockResolvedValue([])
    mockEnrichSellOrders.mockResolvedValue(new Map())
    mockGetOrderDisplayPrice.mockResolvedValue(null)
    mockFormatLocation.mockResolvedValue('Test Location')
    mockGetFioUsernames.mockResolvedValue(new Map())
  })

  describe('getStatusEmoji', () => {
    it('returns correct emoji for pending status', () => {
      expect(getStatusEmoji('pending')).toBe('⏳')
    })

    it('returns correct emoji for confirmed status', () => {
      expect(getStatusEmoji('confirmed')).toBe('✅')
    })

    it('returns correct emoji for rejected status', () => {
      expect(getStatusEmoji('rejected')).toBe('❌')
    })

    it('returns correct emoji for fulfilled status', () => {
      expect(getStatusEmoji('fulfilled')).toBe('🎉')
    })

    it('returns correct emoji for expired status', () => {
      expect(getStatusEmoji('expired')).toBe('⏰')
    })

    it('returns correct emoji for cancelled status', () => {
      expect(getStatusEmoji('cancelled')).toBe('🚫')
    })

    it('returns question mark for unknown status', () => {
      expect(getStatusEmoji('unknown' as ReservationStatus)).toBe('❓')
    })
  })

  describe('getAvailableSellOrders', () => {
    it('returns empty array when no orders exist', async () => {
      mockSellOrdersFindMany.mockResolvedValue([])

      const result = await getAvailableSellOrders('COF', null, 1)

      expect(result).toEqual([])
    })

    it('returns orders with remaining quantity', async () => {
      const mockOrder = {
        id: 1,
        userId: 2,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        priceListCode: null,
        orderType: 'available',
        limitMode: 'none',
        limitQuantity: null,
        user: { username: 'seller', displayName: 'Seller User' },
      }
      mockSellOrdersFindMany.mockResolvedValue([mockOrder])
      mockEnrichSellOrders.mockResolvedValue(new Map([[1, { remainingQuantity: 50 }]]))
      mockGetFioUsernames.mockResolvedValue(new Map([[2, 'FioSeller']]))

      const result = await getAvailableSellOrders('COF', null, 1)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 1,
        type: 'sell',
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        quantity: 50,
        ownerUsername: 'seller',
        ownerFioUsername: 'FioSeller',
      })
    })

    it('filters out orders with zero remaining quantity', async () => {
      const mockOrder = {
        id: 1,
        userId: 2,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        priceListCode: null,
        orderType: 'available',
        limitMode: 'none',
        limitQuantity: null,
        user: { username: 'seller', displayName: null },
      }
      mockSellOrdersFindMany.mockResolvedValue([mockOrder])
      mockEnrichSellOrders.mockResolvedValue(new Map([[1, { remainingQuantity: 0 }]]))

      const result = await getAvailableSellOrders('COF', null, 1)

      expect(result).toEqual([])
    })

    it('filters by location when provided', async () => {
      const mockOrder = {
        id: 1,
        userId: 2,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        priceListCode: null,
        orderType: 'available',
        limitMode: 'none',
        limitQuantity: null,
        user: { username: 'seller', displayName: null },
      }
      mockSellOrdersFindMany.mockResolvedValue([mockOrder])
      mockEnrichSellOrders.mockResolvedValue(new Map([[1, { remainingQuantity: 50 }]]))

      await getAvailableSellOrders('COF', 'BEN', 1)

      expect(mockSellOrdersFindMany).toHaveBeenCalled()
    })
  })

  describe('getAvailableBuyOrders', () => {
    it('returns empty array when no orders exist', async () => {
      mockBuyOrdersFindMany.mockResolvedValue([])

      const result = await getAvailableBuyOrders('COF', null, 1)

      expect(result).toEqual([])
    })

    it('returns orders with remaining quantity', async () => {
      const mockOrder = {
        id: 1,
        userId: 2,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        priceListCode: null,
        orderType: 'wanted',
        quantity: 100,
        user: { username: 'buyer', displayName: 'Buyer User' },
      }
      mockBuyOrdersFindMany.mockResolvedValue([mockOrder])
      // Mock the reservation stats query (returns empty = no reservations)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      mockGetFioUsernames.mockResolvedValue(new Map([[2, 'FioBuyer']]))

      const result = await getAvailableBuyOrders('COF', null, 1)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 1,
        type: 'buy',
        commodityTicker: 'COF',
        locationId: 'BEN',
        quantity: 100,
        ownerUsername: 'buyer',
        ownerFioUsername: 'FioBuyer',
      })
    })

    it('returns full quantity when no reservations exist', async () => {
      const mockOrder = {
        id: 1,
        userId: 2,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        priceListCode: null,
        orderType: 'wanted',
        quantity: 100,
        user: { username: 'buyer', displayName: null },
      }
      mockBuyOrdersFindMany.mockResolvedValue([mockOrder])
      // Mock empty reservation stats (no reservations)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      const result = await getAvailableBuyOrders('COF', null, 1)

      expect(result).toHaveLength(1)
      // Full quantity when no reservations exist
      expect(result[0].quantity).toBe(100)
    })
  })

  describe('formatOrderForSelect', () => {
    const baseSellOrder: SelectableOrder = {
      id: 1,
      type: 'sell',
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100.00',
      currency: 'CIS',
      priceListCode: null,
      orderType: 'available',
      ownerId: 2,
      ownerUsername: 'seller',
      ownerDisplayName: 'Seller Display',
      ownerFioUsername: 'FioSeller',
      quantity: 50,
    }

    const baseBuyOrder: SelectableOrder = {
      id: 2,
      type: 'buy',
      commodityTicker: 'RAT',
      locationId: 'MOR',
      price: '75.50',
      currency: 'ICA',
      priceListCode: null,
      orderType: 'wanted',
      ownerId: 3,
      ownerUsername: 'buyer',
      ownerDisplayName: null,
      ownerFioUsername: null,
      quantity: 200,
    }

    it('formats sell order correctly', async () => {
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatOrderForSelect(baseSellOrder, 'name')

      expect(result).toEqual({
        label: 'COF @ Benten (50 avail)',
        value: 'sell:1',
        description: '100.00 CIS from FioSeller',
      })
    })

    it('formats buy order correctly', async () => {
      mockFormatLocation.mockResolvedValue('Moria')

      const result = await formatOrderForSelect(baseBuyOrder, 'name')

      expect(result).toEqual({
        label: 'RAT @ Moria (200 wanted)',
        value: 'buy:2',
        description: '75.50 ICA by buyer',
      })
    })

    it('uses resolved price from price list', async () => {
      mockFormatLocation.mockResolvedValue('Benten')
      mockGetOrderDisplayPrice.mockResolvedValue({ price: 125.00, currency: 'CIS' })

      const orderWithPriceList = { ...baseSellOrder, priceListCode: 'kawa', price: '0.00' }
      const result = await formatOrderForSelect(orderWithPriceList, 'name')

      expect(result.description).toBe('125.00 CIS from FioSeller')
    })

    it('prefers FIO username over display name', async () => {
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatOrderForSelect(baseSellOrder, 'name')

      expect(result.description).toContain('FioSeller')
    })

    it('falls back to display name when no FIO username', async () => {
      mockFormatLocation.mockResolvedValue('Benten')
      const orderNoFio = { ...baseSellOrder, ownerFioUsername: null }

      const result = await formatOrderForSelect(orderNoFio, 'name')

      expect(result.description).toContain('Seller Display')
    })

    it('falls back to username when no display name', async () => {
      mockFormatLocation.mockResolvedValue('Moria')

      const result = await formatOrderForSelect(baseBuyOrder, 'name')

      expect(result.description).toContain('buyer')
    })
  })

  describe('createReservation', () => {
    it('creates a sell order reservation', async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 42 }])
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      })

      const result = await createReservation('sell', 1, 2, 50, 'Please deliver ASAP')

      expect(result).toEqual({ id: 42 })
      expect(mockDbInsert).toHaveBeenCalled()
    })

    it('creates a buy order reservation', async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 43 }])
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      })

      const result = await createReservation('buy', 5, 3, 100)

      expect(result).toEqual({ id: 43 })
    })

    it('handles reservation without notes', async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 44 }])
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      })

      const result = await createReservation('sell', 1, 2, 25)

      expect(result).toEqual({ id: 44 })
    })
  })

  describe('getReservationsForUser', () => {
    it('returns empty array when no reservations exist', async () => {
      mockReservationsFindMany.mockResolvedValue([])

      const result = await getReservationsForUser(1)

      expect(result).toEqual([])
    })

    it('returns reservations where user is order owner', async () => {
      mockReservationsFindMany.mockResolvedValue([
        {
          id: 1,
          sellOrderId: 10,
          buyOrderId: null,
          counterpartyUserId: 3,
          quantity: 50,
          status: 'pending',
          notes: null,
          expiresAt: null,
          createdAt: new Date('2024-01-01'),
        },
      ])
      mockSellOrdersFindMany.mockResolvedValue([
        {
          id: 10,
          userId: 1, // User is owner
          commodityTicker: 'COF',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          user: { username: 'owner', displayName: 'Owner' },
        },
      ])
      mockUsersFindMany.mockResolvedValue([{ id: 3, username: 'buyer', displayName: 'Buyer' }])

      const result = await getReservationsForUser(1)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 1,
        type: 'sell',
        orderId: 10,
        commodityTicker: 'COF',
        status: 'pending',
        ownerId: 1,
        counterpartyId: 3,
      })
    })

    it('returns reservations where user is counterparty', async () => {
      mockReservationsFindMany.mockResolvedValue([
        {
          id: 2,
          sellOrderId: null,
          buyOrderId: 20,
          counterpartyUserId: 1, // User is counterparty
          quantity: 75,
          status: 'confirmed',
          notes: 'Will deliver tomorrow',
          expiresAt: new Date('2024-02-01'),
          createdAt: new Date('2024-01-15'),
        },
      ])
      mockBuyOrdersFindMany.mockResolvedValue([
        {
          id: 20,
          userId: 5,
          commodityTicker: 'RAT',
          locationId: 'MOR',
          price: '50.00',
          currency: 'ICA',
          priceListCode: null,
          user: { username: 'buyer', displayName: 'Buyer' },
        },
      ])
      mockUsersFindMany.mockResolvedValue([{ id: 1, username: 'seller', displayName: 'Seller' }])

      const result = await getReservationsForUser(1)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 2,
        type: 'buy',
        orderId: 20,
        status: 'confirmed',
        notes: 'Will deliver tomorrow',
        counterpartyId: 1,
      })
    })

    it('filters by status when provided', async () => {
      mockReservationsFindMany.mockResolvedValue([])

      await getReservationsForUser(1, 'pending')

      expect(mockReservationsFindMany).toHaveBeenCalled()
    })

    it('includes all statuses when filter is "all"', async () => {
      mockReservationsFindMany.mockResolvedValue([])

      await getReservationsForUser(1, 'all')

      expect(mockReservationsFindMany).toHaveBeenCalled()
    })
  })

  describe('updateReservationStatus', () => {
    it('returns error when reservation not found', async () => {
      mockReservationsFindFirst.mockResolvedValue(null)

      const result = await updateReservationStatus(999, 1, 'confirmed', true)

      expect(result).toEqual({ success: false, error: 'Reservation not found.' })
    })

    it('returns error for invalid status transition', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'fulfilled', // Already fulfilled
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })

      const result = await updateReservationStatus(1, 1, 'confirmed', true)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot change status')
    })

    it('allows owner to confirm pending reservation', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'pending',
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })

      const result = await updateReservationStatus(1, 1, 'confirmed', true)

      expect(result).toEqual({ success: true })
    })

    it('allows owner to reject pending reservation', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'pending',
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })

      const result = await updateReservationStatus(1, 1, 'rejected', true)

      expect(result).toEqual({ success: true })
    })

    it('allows counterparty to cancel pending reservation', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'pending',
      })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })

      const result = await updateReservationStatus(1, 2, 'cancelled', false)

      expect(result).toEqual({ success: true })
    })

    it('allows owner to fulfill pending reservation directly', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'pending',
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })

      const result = await updateReservationStatus(1, 1, 'fulfilled', true)

      expect(result).toEqual({ success: true })
    })

    it('allows counterparty to fulfill pending reservation directly', async () => {
      // This enables trades to complete even if owner hasn't confirmed yet
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'pending',
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })

      const result = await updateReservationStatus(1, 2, 'fulfilled', false)

      expect(result).toEqual({ success: true })
    })

    it('allows either party to fulfill confirmed reservation', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'confirmed',
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })

      const result = await updateReservationStatus(1, 1, 'fulfilled', true)

      expect(result).toEqual({ success: true })
    })

    it('prevents counterparty from confirming', async () => {
      mockReservationsFindFirst.mockResolvedValue({
        id: 1,
        sellOrderId: 10,
        buyOrderId: null,
        counterpartyUserId: 2,
        status: 'pending',
      })
      mockSellOrdersFindFirst.mockResolvedValue({ id: 10, userId: 1 })

      const result = await updateReservationStatus(1, 2, 'confirmed', false)

      expect(result.success).toBe(false)
      // Counterparty can't confirm - will fail the transition check
      expect(result.error).toContain('Cannot change status')
    })
  })

  describe('formatReservationForEmbed', () => {
    const baseReservation: ReservationWithDetails = {
      id: 1,
      type: 'sell',
      orderId: 10,
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100.00',
      currency: 'CIS',
      priceListCode: null,
      quantity: 50,
      status: 'pending',
      notes: null,
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
      ownerId: 1,
      ownerUsername: 'seller',
      ownerDisplayName: 'Seller Display',
      ownerFioUsername: 'FioSeller',
      counterpartyId: 2,
      counterpartyUsername: 'buyer',
      counterpartyDisplayName: 'Buyer Display',
      counterpartyFioUsername: 'FioBuyer',
    }

    it('formats sell reservation correctly', async () => {
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatReservationForEmbed(baseReservation, 1, 'name')

      expect(result.name).toBe('#1')
      expect(result.value).toContain('📤 SELL')
      expect(result.value).toContain('50x COF')
      expect(result.value).toContain('Benten')
      expect(result.value).toContain('100.00 CIS')
      expect(result.value).toContain('Pending')
    })

    it('formats buy reservation correctly', async () => {
      const buyReservation = { ...baseReservation, type: 'buy' as const }
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatReservationForEmbed(buyReservation, 1, 'name')

      expect(result.value).toContain('📥 BUY')
    })

    it('shows owner name when viewer is counterparty', async () => {
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatReservationForEmbed(baseReservation, 2, 'name')

      expect(result.value).toContain('FioSeller')
    })

    it('shows counterparty name when viewer is owner', async () => {
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatReservationForEmbed(baseReservation, 1, 'name')

      expect(result.value).toContain('FioBuyer')
    })

    it('includes notes when present', async () => {
      const withNotes = { ...baseReservation, notes: 'Please deliver ASAP' }
      mockFormatLocation.mockResolvedValue('Benten')

      const result = await formatReservationForEmbed(withNotes, 1, 'name')

      expect(result.value).toContain('Please deliver ASAP')
    })

    it('uses resolved price from price list', async () => {
      mockFormatLocation.mockResolvedValue('Benten')
      mockGetOrderDisplayPrice.mockResolvedValue({ price: 125.00, currency: 'CIS' })

      const withPriceList = { ...baseReservation, priceListCode: 'kawa', price: '0.00' }
      const result = await formatReservationForEmbed(withPriceList, 1, 'name')

      expect(result.value).toContain('125.00')
    })
  })
})
