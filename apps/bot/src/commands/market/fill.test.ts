/**
 * Tests for /fill command
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockResolveCommodity,
  mockResolveLocation,
  mockFormatCommodity,
  mockGetDisplaySettings,
  mockGetAvailableBuyOrders,
  mockFormatOrderForSelect,
  mockCreateReservation,
  mockDbQuery,
  mockSearchCommodities,
  mockSearchLocations,
} = vi.hoisted(() => ({
  mockResolveCommodity: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetAvailableBuyOrders: vi.fn(),
  mockFormatOrderForSelect: vi.fn(),
  mockCreateReservation: vi.fn(),
  mockDbQuery: {
    userDiscordProfiles: { findFirst: vi.fn() },
  },
  mockSearchCommodities: vi.fn(),
  mockSearchLocations: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: { query: mockDbQuery },
  userDiscordProfiles: {},
  channelDefaults: {},
}))

// Mock services
vi.mock('../../autocomplete/index.js', () => ({
  searchCommodities: mockSearchCommodities,
  searchLocations: mockSearchLocations,
}))

vi.mock('../../services/display.js', () => ({
  resolveCommodity: mockResolveCommodity,
  resolveLocation: mockResolveLocation,
  formatCommodity: mockFormatCommodity,
}))

vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
}))

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
}))

vi.mock('../../services/reservationService.js', () => ({
  getAvailableBuyOrders: mockGetAvailableBuyOrders,
  formatOrderForSelect: mockFormatOrderForSelect,
  createReservation: mockCreateReservation,
}))

import { fill } from './fill.js'

describe('/fill command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatCommodity.mockImplementation((ticker: string) => ticker)
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'natural-ids-only',
      commodityDisplayMode: 'ticker-only',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockSearchCommodities.mockResolvedValue([])
    mockSearchLocations.mockResolvedValue([])
    mockGetAvailableBuyOrders.mockResolvedValue([])
    mockCreateReservation.mockResolvedValue({ id: 1 })
  })

  describe('execute', () => {
    it('requires a linked account', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue(undefined)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
        },
      })

      await fill.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('You do not have a linked Kawakawa account'),
        })
      )
    })

    it('validates commodity exists', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockResolveCommodity.mockResolvedValue(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'INVALID',
        },
      })

      await fill.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Commodity ticker "INVALID" not found'),
        })
      )
    })

    it('validates location if provided', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })
      mockResolveLocation.mockResolvedValue(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
          location: 'INVALID',
        },
      })

      await fill.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Location "INVALID" not found'),
        })
      )
    })

    it('shows message when no orders found', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })
      mockGetAvailableBuyOrders.mockResolvedValue([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
        },
      })

      await fill.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No buy orders found'),
        })
      )
    })

    it('shows message with location when no orders found at location', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })
      mockResolveLocation.mockResolvedValue({ naturalId: 'BEN', name: 'Benten' })
      mockGetAvailableBuyOrders.mockResolvedValue([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
          location: 'BEN',
        },
      })

      await fill.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/No buy orders found.*COF.*BEN/),
        })
      )
    })

    it('shows select menu when orders are available', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })
      mockGetAvailableBuyOrders.mockResolvedValue([
        {
          id: 10,
          type: 'buy',
          commodityTicker: 'COF',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'wanted',
          ownerId: 2,
          ownerUsername: 'buyer',
          ownerDisplayName: null,
          ownerFioUsername: null,
          quantity: 50,
        },
      ])
      mockFormatOrderForSelect.mockResolvedValue({
        label: 'COF @ Benten (50 wanted)',
        value: 'buy:10',
        description: '100.00 CIS from buyer',
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
        },
      })

      await fill.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Select a buy order'),
          components: expect.any(Array),
        })
      )
    })

    it('calls getAvailableBuyOrders with correct parameters', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })
      mockResolveLocation.mockResolvedValue({ naturalId: 'BEN', name: 'Benten' })
      mockGetAvailableBuyOrders.mockResolvedValue([])

      const { interaction } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
          location: 'BEN',
        },
      })

      await fill.execute(interaction as never)

      expect(mockGetAvailableBuyOrders).toHaveBeenCalledWith('COF', 'BEN', 1, 'all')
    })
  })

  describe('autocomplete', () => {
    it('returns commodity suggestions', async () => {
      mockSearchCommodities.mockResolvedValue([
        { ticker: 'COF', name: 'Coffee' },
        { ticker: 'CAB', name: 'Caffeinated Beans' },
      ])

      const respondFn = vi.fn()
      const interaction = {
        options: {
          getFocused: vi.fn((returnName?: boolean) => {
            if (returnName) return { name: 'commodity', value: 'cof' }
            return 'cof'
          }),
          getString: vi.fn(),
        },
        user: { id: '123' },
        respond: respondFn,
      }

      await fill.autocomplete?.(interaction as never)

      expect(respondFn).toHaveBeenCalled()
    })

    it('returns location suggestions', async () => {
      mockSearchLocations.mockResolvedValue([
        { naturalId: 'BEN', name: 'Benten' },
        { naturalId: 'MOR', name: 'Moria' },
      ])

      const respondFn = vi.fn()
      const interaction = {
        options: {
          getFocused: vi.fn((returnName?: boolean) => {
            if (returnName) return { name: 'location', value: 'ben' }
            return 'ben'
          }),
          getString: vi.fn(),
        },
        user: { id: '123' },
        respond: respondFn,
      }

      await fill.autocomplete?.(interaction as never)

      expect(respondFn).toHaveBeenCalled()
    })
  })
})
