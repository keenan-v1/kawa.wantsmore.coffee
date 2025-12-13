import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockResolveCommodity,
  mockResolveLocation,
  mockFormatCommodity,
  mockFormatLocation,
  mockGetDisplaySettings,
  mockGetFioUsernames,
  mockSearchCommodities,
  mockSearchLocations,
  mockSearchUsers,
  mockDbQuery,
  mockSendPaginatedResponse,
  mockEnrichSellOrdersWithQuantities,
  mockFormatGroupedOrdersMulti,
  mockBuildFilterDescription,
} = vi.hoisted(() => ({
  mockResolveCommodity: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetFioUsernames: vi.fn(),
  mockSearchCommodities: vi.fn(),
  mockSearchLocations: vi.fn(),
  mockSearchUsers: vi.fn(),
  mockDbQuery: {
    sellOrders: { findMany: vi.fn() },
    buyOrders: { findMany: vi.fn() },
    users: { findFirst: vi.fn() },
  },
  mockSendPaginatedResponse: vi.fn(),
  mockEnrichSellOrdersWithQuantities: vi.fn(),
  mockFormatGroupedOrdersMulti: vi.fn(),
  mockBuildFilterDescription: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the display service
vi.mock('../../services/display.js', () => ({
  resolveCommodity: mockResolveCommodity,
  resolveLocation: mockResolveLocation,
  formatCommodity: mockFormatCommodity,
  formatLocation: mockFormatLocation,
}))

// Mock user settings service
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
  getFioUsernames: mockGetFioUsernames,
}))

// Mock autocomplete
vi.mock('../../autocomplete/index.js', () => ({
  searchCommodities: mockSearchCommodities,
  searchLocations: mockSearchLocations,
  searchUsers: mockSearchUsers,
}))

// Mock pagination component
vi.mock('../../components/pagination.js', () => ({
  sendPaginatedResponse: mockSendPaginatedResponse,
}))

// Mock market service
vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: mockEnrichSellOrdersWithQuantities,
}))

// Mock order formatter
vi.mock('../../services/orderFormatter.js', () => ({
  formatGroupedOrdersMulti: mockFormatGroupedOrdersMulti,
  buildFilterDescription: mockBuildFilterDescription,
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: mockDbQuery,
  },
  sellOrders: {
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
  },
  buyOrders: {
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
  },
  users: { username: 'username' },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
  desc: vi.fn().mockImplementation(field => ({ desc: field })),
}))

// Import after mocks
import { orders } from './orders.js'

describe('orders command (strict)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'both',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockFormatCommodity.mockImplementation(ticker => ticker)
    mockFormatLocation.mockResolvedValue('Benten (BEN)')
    // Default mock for getFioUsernames - returns empty map
    mockGetFioUsernames.mockResolvedValue(new Map())
    // Default mock for enrichSellOrdersWithQuantities - returns empty map
    mockEnrichSellOrdersWithQuantities.mockResolvedValue(new Map())
    // Default mock for formatGroupedOrdersMulti - returns empty array
    mockFormatGroupedOrdersMulti.mockResolvedValue([])
    // Default mock for buildFilterDescription - returns a simple description
    mockBuildFilterDescription.mockReturnValue('📤Sell | 👤 Internal')
  })

  it('has correct command metadata', () => {
    expect(orders.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns no orders message when no filters provided and no orders exist', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('No orders found'),
        flags: 64,
      })
    })

    it('queries sell orders with commodity filter', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])

      const { interaction } = createMockInteraction({
        stringOptions: { commodity: 'COF' },
      })

      await orders.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('returns error for invalid commodity', async () => {
      mockResolveCommodity.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'INVALID' },
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Commodity "INVALID" not found'),
        flags: 64,
      })
    })

    it('queries orders with location filter', async () => {
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])

      const { interaction } = createMockInteraction({
        stringOptions: { location: 'BEN' },
      })

      await orders.execute(interaction as never)

      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('returns error for invalid location', async () => {
      mockResolveLocation.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { location: 'INVALID' },
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Location "INVALID" not found'),
        flags: 64,
      })
    })

    it('queries orders with user filter', async () => {
      mockSearchUsers.mockResolvedValueOnce([{ username: 'testuser', displayName: 'Test User' }])
      mockDbQuery.users.findFirst.mockResolvedValueOnce({ id: 1, username: 'testuser' })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])

      const { interaction } = createMockInteraction({
        stringOptions: { user: 'testuser' },
      })

      await orders.execute(interaction as never)

      expect(mockSearchUsers).toHaveBeenCalledWith('testuser', 1)
      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('returns error for invalid user', async () => {
      mockSearchUsers.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { user: 'unknownuser' },
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('User "unknownuser" not found'),
        flags: 64,
      })
    })

    it('combines commodity and location filters', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])

      const { interaction } = createMockInteraction({
        stringOptions: { commodity: 'COF', location: 'BEN' },
      })

      await orders.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('shows sell orders by default (type defaults to sell)', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])

      const { interaction } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      expect(mockSendPaginatedResponse).toHaveBeenCalled()
      // buyOrders should not have been queried
      expect(mockDbQuery.buyOrders.findMany).not.toHaveBeenCalled()
    })
  })

  describe('autocomplete', () => {
    it('returns empty when query is empty', async () => {
      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: '' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockRespond).toHaveBeenCalledWith([])
    })

    it('returns commodity results for commodity field', async () => {
      mockSearchCommodities.mockResolvedValueOnce([{ ticker: 'COF', name: 'Caffeinated Beans' }])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: 'CO' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockSearchCommodities).toHaveBeenCalledWith('CO', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'COF - Caffeinated Beans', value: 'COF' }),
      ])
    })

    it('returns location results for location field', async () => {
      mockSearchLocations.mockResolvedValueOnce([{ naturalId: 'BEN', name: 'Benten' }])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'location', value: 'BE' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockSearchLocations).toHaveBeenCalledWith('BE', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'BEN - Benten', value: 'BEN' }),
      ])
    })

    it('returns user results for user field', async () => {
      mockSearchUsers.mockResolvedValueOnce([{ username: 'testuser', displayName: 'Test User' }])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'user', value: 'test' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockSearchUsers).toHaveBeenCalledWith('test', 25)
      expect(mockRespond).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Test User (testuser)', value: 'testuser' }),
      ])
    })

    it('limits results to 25', async () => {
      mockSearchCommodities.mockResolvedValueOnce(
        Array.from({ length: 30 }, (_, i) => ({ ticker: `C${i}`, name: `Commodity ${i}` }))
      )

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: 'C' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockRespond).toHaveBeenCalled()
      const choices = mockRespond.mock.calls[0][0]
      expect(choices.length).toBeLessThanOrEqual(25)
    })
  })
})
