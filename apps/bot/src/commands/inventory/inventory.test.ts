import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockResolveCommodity,
  mockResolveLocation,
  mockFormatCommodity,
  mockFormatLocation,
  mockGetDisplaySettings,
  mockSearchCommodities,
  mockSearchLocations,
  mockDbQuery,
  mockDbInsert,
} = vi.hoisted(() => ({
  mockResolveCommodity: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockSearchCommodities: vi.fn(),
  mockSearchLocations: vi.fn(),
  mockDbQuery: {
    userDiscordProfiles: { findFirst: vi.fn() },
    fioUserStorage: { findMany: vi.fn() },
  },
  mockDbInsert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue({}),
    }),
  }),
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

// Mock autocomplete
vi.mock('../../autocomplete/index.js', () => ({
  searchCommodities: mockSearchCommodities,
  searchLocations: mockSearchLocations,
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: mockDbQuery,
    insert: mockDbInsert,
  },
  userDiscordProfiles: { discordId: 'discordId' },
  fioUserStorage: { userId: 'userId' },
  sellOrders: {
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    orderType: 'orderType',
    currency: 'currency',
  },
  buyOrders: {
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    orderType: 'orderType',
    currency: 'currency',
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  desc: vi.fn().mockImplementation(field => ({ desc: field })),
}))

// Import after mocks
import { inventory } from './inventory.js'

describe('inventory command', () => {
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
  })

  it('has correct command metadata', () => {
    expect(inventory.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns not linked message when no profile exists', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction()

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('do not have a linked Kawakawa account'),
        flags: 64, // Ephemeral
      })
    })

    it('returns no inventory message when no storage found', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.fioUserStorage.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction()

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('No inventory data found'),
        flags: 64, // Ephemeral
      })
    })

    it('returns error when commodity filter is invalid', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockResolveCommodity.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'INVALID' },
      })

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('not found'),
        flags: 64, // Ephemeral
      })
    })

    it('returns error when location filter is invalid', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockResolveLocation.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { location: 'INVALID' },
      })

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('not found'),
        flags: 64, // Ephemeral
      })
    })

    it('displays inventory with action buttons', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.fioUserStorage.findMany.mockResolvedValueOnce([
        {
          locationId: 'BEN',
          storageId: 'storage-1',
          type: 'STORE',
          lastSyncedAt: new Date(),
          location: { naturalId: 'BEN', name: 'Benten' },
          fioInventory: [
            {
              commodityTicker: 'COF',
              quantity: 100,
              commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
            },
            { commodityTicker: 'RAT', quantity: 50, commodity: { ticker: 'RAT', name: 'Rations' } },
          ],
        },
      ])

      const { interaction, replyFn } = createMockInteraction()

      await inventory.execute(interaction as never)

      // Should reply with embeds and components (action buttons)
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
          flags: 64, // Ephemeral
        })
      )
    })

    it('filters by commodity', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockDbQuery.fioUserStorage.findMany.mockResolvedValueOnce([
        {
          locationId: 'BEN',
          storageId: 'storage-1',
          type: 'STORE',
          lastSyncedAt: new Date(),
          location: { naturalId: 'BEN', name: 'Benten' },
          fioInventory: [
            {
              commodityTicker: 'COF',
              quantity: 100,
              commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
            },
            { commodityTicker: 'RAT', quantity: 50, commodity: { ticker: 'RAT', name: 'Rations' } },
          ],
        },
      ])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'COF' },
      })

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        })
      )
    })

    it('filters by location', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.fioUserStorage.findMany.mockResolvedValueOnce([
        {
          locationId: 'BEN',
          storageId: 'storage-1',
          type: 'STORE',
          lastSyncedAt: new Date(),
          location: { naturalId: 'BEN', name: 'Benten' },
          fioInventory: [
            {
              commodityTicker: 'COF',
              quantity: 100,
              commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
            },
          ],
        },
        {
          locationId: 'MOR',
          storageId: 'storage-2',
          type: 'STORE',
          lastSyncedAt: new Date(),
          location: { naturalId: 'MOR', name: 'Moria' },
          fioInventory: [
            { commodityTicker: 'RAT', quantity: 50, commodity: { ticker: 'RAT', name: 'Rations' } },
          ],
        },
      ])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { location: 'BEN' },
      })

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        })
      )
    })

    it('returns no matches message when filters exclude all items', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'XYZ', name: 'NonExistent' })
      mockDbQuery.fioUserStorage.findMany.mockResolvedValueOnce([
        {
          locationId: 'BEN',
          storageId: 'storage-1',
          type: 'STORE',
          lastSyncedAt: new Date(),
          location: { naturalId: 'BEN', name: 'Benten' },
          fioInventory: [
            {
              commodityTicker: 'COF',
              quantity: 100,
              commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
            },
          ],
        },
      ])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'XYZ' },
      })

      await inventory.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('No inventory items match'),
        flags: 64, // Ephemeral
      })
    })

    it('shows pagination buttons when multiple pages exist', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      // Create enough storage locations to require pagination (more than pageSize of 6)
      const manyStorages = Array.from({ length: 8 }, (_, i) => ({
        locationId: `LOC${i}`,
        storageId: `storage-${i}`,
        type: 'STORE',
        lastSyncedAt: new Date(),
        location: { naturalId: `LOC${i}`, name: `Location ${i}` },
        fioInventory: [
          {
            commodityTicker: 'COF',
            quantity: 100,
            commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          },
        ],
      }))
      mockDbQuery.fioUserStorage.findMany.mockResolvedValueOnce(manyStorages)

      const { interaction, replyFn } = createMockInteraction()

      await inventory.execute(interaction as never)

      // Should have 2 component rows (action buttons + pagination)
      const call = replyFn.mock.calls[0][0]
      expect(call.components).toHaveLength(2)
    })
  })

  describe('autocomplete', () => {
    it('returns commodities for commodity option', async () => {
      mockSearchCommodities.mockResolvedValueOnce([
        { ticker: 'COF', name: 'Caffeinated Beans' },
        { ticker: 'RAT', name: 'Rations' },
      ])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: 'co' }),
        },
        respond: mockRespond,
      }

      await inventory.autocomplete?.(interaction as never)

      expect(mockSearchCommodities).toHaveBeenCalledWith('co', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ value: 'COF' })])
      )
    })

    it('returns locations for location option', async () => {
      mockSearchLocations.mockResolvedValueOnce([
        { naturalId: 'BEN', name: 'Benten' },
        { naturalId: 'MOR', name: 'Moria' },
      ])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'location', value: 'be' }),
        },
        respond: mockRespond,
      }

      await inventory.autocomplete?.(interaction as never)

      expect(mockSearchLocations).toHaveBeenCalledWith('be', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ value: 'BEN' })])
      )
    })

    it('returns empty for unknown option', async () => {
      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'unknown', value: 'test' }),
        },
        respond: mockRespond,
      }

      await inventory.autocomplete?.(interaction as never)

      expect(mockRespond).toHaveBeenCalledWith([])
    })
  })
})
