/**
 * Tests for /reservations command
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockGetDisplaySettings,
  mockFormatLocation,
  mockGetReservationsForUser,
  mockUpdateReservationStatus,
  mockGetStatusEmoji,
  mockDbQuery,
  mockGetOrderDisplayPrice,
} = vi.hoisted(() => ({
  mockGetDisplaySettings: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetReservationsForUser: vi.fn(),
  mockUpdateReservationStatus: vi.fn(),
  mockGetStatusEmoji: vi.fn(),
  mockDbQuery: {
    userDiscordProfiles: { findFirst: vi.fn() },
  },
  mockGetOrderDisplayPrice: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: { query: mockDbQuery },
  userDiscordProfiles: {},
}))

// Mock services
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
}))

vi.mock('../../services/display.js', () => ({
  formatLocation: mockFormatLocation,
}))

vi.mock('../../services/reservationService.js', () => ({
  getReservationsForUser: mockGetReservationsForUser,
  updateReservationStatus: mockUpdateReservationStatus,
  getStatusEmoji: mockGetStatusEmoji,
}))

vi.mock('@kawakawa/services/market', () => ({
  getOrderDisplayPrice: mockGetOrderDisplayPrice,
}))

import { reservations } from './reservations.js'

describe('/reservations command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'natural-ids-only',
      commodityDisplayMode: 'ticker-only',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockFormatLocation.mockResolvedValue('Test Location')
    mockGetReservationsForUser.mockResolvedValue([])
    mockUpdateReservationStatus.mockResolvedValue({ success: true })
    mockGetOrderDisplayPrice.mockResolvedValue(null)
    mockGetStatusEmoji.mockImplementation((status: string) => {
      switch (status) {
        case 'pending': return '⏳'
        case 'confirmed': return '✅'
        case 'rejected': return '❌'
        case 'fulfilled': return '🎉'
        case 'cancelled': return '🚫'
        default: return '❓'
      }
    })
  })

  describe('execute', () => {
    it('requires a linked account', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue(undefined)

      const { interaction, replyFn } = createMockInteraction()

      await reservations.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('You do not have a linked Kawakawa account'),
        })
      )
    })

    it('shows message when no reservations found', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([])

      const { interaction, replyFn } = createMockInteraction()

      await reservations.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No reservations found'),
        })
      )
    })

    it('shows message with status filter when no reservations found', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          status: 'pending',
        },
      })

      await reservations.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/No reservations found.*pending/),
        })
      )
    })

    it('displays reservations when found', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([
        {
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
          expiresAt: new Date(),
          createdAt: new Date(),
          ownerId: 2,
          ownerUsername: 'seller',
          ownerDisplayName: 'Seller',
          ownerFioUsername: null,
          counterpartyId: 1,
          counterpartyUsername: 'test',
          counterpartyDisplayName: 'Test',
          counterpartyFioUsername: null,
        },
      ])

      const { interaction, replyFn } = createMockInteraction()

      await reservations.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        })
      )
    })

    it('calls getReservationsForUser with status filter', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([])

      const { interaction } = createMockInteraction({
        stringOptions: {
          status: 'confirmed',
        },
      })

      await reservations.execute(interaction as never)

      expect(mockGetReservationsForUser).toHaveBeenCalledWith(1, 'confirmed')
    })

    it('calls getReservationsForUser with all status when not specified', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([])

      const { interaction } = createMockInteraction()

      await reservations.execute(interaction as never)

      expect(mockGetReservationsForUser).toHaveBeenCalledWith(1, 'all')
    })

    it('displays buy reservations correctly', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([
        {
          id: 1,
          type: 'buy',
          orderId: 10,
          commodityTicker: 'COF',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          quantity: 50,
          status: 'pending',
          notes: 'Test notes',
          expiresAt: new Date(),
          createdAt: new Date(),
          ownerId: 2,
          ownerUsername: 'buyer',
          ownerDisplayName: 'Buyer',
          ownerFioUsername: null,
          counterpartyId: 1,
          counterpartyUsername: 'test',
          counterpartyDisplayName: 'Test',
          counterpartyFioUsername: null,
        },
      ])

      const { interaction, replyFn } = createMockInteraction()

      await reservations.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('resolves price from price list when priceListCode is set', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({
        userId: 1,
        discordId: '123',
        user: { id: 1, username: 'test' },
      })
      mockGetReservationsForUser.mockResolvedValue([
        {
          id: 1,
          type: 'sell',
          orderId: 10,
          commodityTicker: 'COF',
          locationId: 'BEN',
          price: '0.00',
          currency: 'CIS',
          priceListCode: 'KAWA',
          quantity: 50,
          status: 'pending',
          notes: null,
          expiresAt: new Date(),
          createdAt: new Date(),
          ownerId: 2,
          ownerUsername: 'seller',
          ownerDisplayName: 'Seller',
          ownerFioUsername: null,
          counterpartyId: 1,
          counterpartyUsername: 'test',
          counterpartyDisplayName: 'Test',
          counterpartyFioUsername: null,
        },
      ])
      mockGetOrderDisplayPrice.mockResolvedValue({ price: 150.00, currency: 'CIS' })

      const { interaction, replyFn } = createMockInteraction()

      await reservations.execute(interaction as never)

      expect(mockGetOrderDisplayPrice).toHaveBeenCalledWith({
        price: '0.00',
        currency: 'CIS',
        priceListCode: 'KAWA',
        commodityTicker: 'COF',
        locationId: 'BEN',
      })
      expect(replyFn).toHaveBeenCalled()
    })
  })

})
