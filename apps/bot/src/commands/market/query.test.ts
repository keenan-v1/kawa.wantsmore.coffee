import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockResolveCommodity,
  mockResolveLocation,
  mockFormatCommodity,
  mockFormatLocation,
  mockGetDisplaySettings,
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
}))

// Mock autocomplete (only searchUsers is used for user fallback in parseToken)
vi.mock('../../autocomplete/index.js', () => ({
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

// Mock channel defaults service
vi.mock('../../services/channelDefaults.js', () => ({
  getChannelDefaults: vi.fn().mockResolvedValue(null),
  resolveEffectiveValue: vi.fn(
    (
      commandOption: unknown,
      _channelDefault: unknown,
      _channelEnforced: boolean,
      _userDefault: unknown,
      systemDefault: unknown
    ) => commandOption ?? systemDefault
  ),
  resolveMessageVisibility: vi.fn(() => ({ visibility: 'ephemeral', isEphemeral: true })),
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
  channelDefaults: {},
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
  desc: vi.fn().mockImplementation(field => ({ desc: field })),
  inArray: vi.fn().mockImplementation((field, values) => ({ field, values, op: 'inArray' })),
}))

// Import after mocks
import { query } from './query.js'

describe('query command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'both',
      commodityDisplayMode: 'ticker-only',
      messageVisibility: 'ephemeral',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockFormatCommodity.mockImplementation(ticker => ticker)
    mockFormatLocation.mockResolvedValue('Benten (BEN)')
    // Default mock for enrichSellOrdersWithQuantities - returns empty map
    mockEnrichSellOrdersWithQuantities.mockResolvedValue(new Map())
    // Default mock for formatGroupedOrdersMulti - returns empty array
    mockFormatGroupedOrdersMulti.mockResolvedValue([])
    // Default mock for buildFilterDescription - returns a simple description
    mockBuildFilterDescription.mockReturnValue('📤Sell | 👤 Internal')
  })

  it('has correct command metadata', () => {
    expect(query.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns no orders message when no orders found', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction()

      await query.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('No orders found'),
        flags: 64, // Ephemeral
      })
    })

    it('queries sell orders with commodity filter using prefix', async () => {
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
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction } = createMockInteraction({
        stringOptions: { query: 'commodity:COF' },
      })

      await query.execute(interaction as never)

      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('parses multiple tokens and applies all filters', async () => {
      // First token: COF (commodity)
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      // Second token: BEN (location) - COF already resolved, so resolveCommodity returns null
      mockResolveCommodity.mockResolvedValueOnce(null)
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
        stringOptions: { query: 'COF BEN' },
      })

      await query.execute(interaction as never)

      // Both commodity and location should be resolved
      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('parses comma-separated tokens', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockResolveCommodity.mockResolvedValueOnce(null)
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })

      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { query: 'COF,BEN' },
      })

      await query.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(replyFn).toHaveBeenCalled()
    })

    it('queries orders with location filter using prefix', async () => {
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
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction } = createMockInteraction({
        stringOptions: { query: 'location:BEN' },
      })

      await query.execute(interaction as never)

      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })

    it('auto-detects commodity ticker from plain query', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { query: 'COF' },
      })

      await query.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      // No orders found
      expect(replyFn).toHaveBeenCalled()
    })

    it('auto-detects location from plain query when not a commodity', async () => {
      mockResolveCommodity.mockResolvedValueOnce(null)
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { query: 'BEN' },
      })

      await query.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('BEN')
      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(replyFn).toHaveBeenCalled()
    })

    it('falls back to user search when neither commodity nor location matches', async () => {
      mockResolveCommodity.mockResolvedValueOnce(null)
      mockResolveLocation.mockResolvedValueOnce(null)
      mockSearchUsers.mockResolvedValueOnce([{ username: 'testuser', displayName: 'Test User' }])
      mockDbQuery.users.findFirst.mockResolvedValueOnce({ id: 1, username: 'testuser' })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { query: 'testuser' },
      })

      await query.execute(interaction as never)

      expect(mockSearchUsers).toHaveBeenCalledWith('testuser', 1)
      expect(replyFn).toHaveBeenCalled()
    })

    it('returns error when query matches nothing', async () => {
      mockResolveCommodity.mockResolvedValueOnce(null)
      mockResolveLocation.mockResolvedValueOnce(null)
      mockSearchUsers.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { query: 'unknownquery' },
      })

      await query.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Could not resolve'),
        flags: 64, // Ephemeral
      })
    })

    it('shows sell orders by default (type defaults to sell)', async () => {
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
      // Mock formatGroupedOrdersMulti to return a single grouped item
      mockFormatGroupedOrdersMulti.mockResolvedValueOnce([
        { name: 'Benten (BEN)', value: '📤 0x COF from TestUser @ **100** CIS', inline: false },
      ])

      const { interaction } = createMockInteraction({
        stringOptions: { query: 'commodity:COF' },
      })

      await query.execute(interaction as never)

      expect(mockSendPaginatedResponse).toHaveBeenCalled()
      // Verify formatGroupedOrdersMulti was called with sell orders only
      expect(mockFormatGroupedOrdersMulti).toHaveBeenCalledWith(
        expect.any(Array), // sellOrders
        [], // buyOrders should be empty since type defaults to 'sell'
        expect.any(Map),
        expect.any(Object),
        expect.any(String),
        'sell', // orderType defaults to 'sell'
        'internal' // visibility defaults to 'internal'
      )
      // buyOrders should not have been queried
      expect(mockDbQuery.buyOrders.findMany).not.toHaveBeenCalled()
    })
  })
})
