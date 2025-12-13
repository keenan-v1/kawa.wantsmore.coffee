import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockDbQuery, mockDbInsert, mockDbDelete } = vi.hoisted(() => ({
  mockDbQuery: {
    userDiscordProfiles: { findFirst: vi.fn() },
    userSettings: { findFirst: vi.fn() },
    fioUserStorage: { findFirst: vi.fn() },
  },
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
}))

// Mock discord.js with additional modal builders
vi.mock('discord.js', () => {
  const baseMock = getDiscordMock()
  return {
    ...baseMock,
    ModalBuilder: class {
      setCustomId() {
        return this
      }
      setTitle() {
        return this
      }
      addComponents() {
        return this
      }
    },
    TextInputBuilder: class {
      setCustomId() {
        return this
      }
      setLabel() {
        return this
      }
      setPlaceholder() {
        return this
      }
      setStyle() {
        return this
      }
      setRequired() {
        return this
      }
      setMinLength() {
        return this
      }
      setMaxLength() {
        return this
      }
      setValue() {
        return this
      }
    },
    TextInputStyle: {
      Short: 1,
      Paragraph: 2,
    },
  }
})

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: mockDbQuery,
    insert: mockDbInsert,
    delete: mockDbDelete,
  },
  userDiscordProfiles: { discordId: 'discordId' },
  userSettings: { userId: 'userId', settingKey: 'settingKey' },
  fioUserStorage: { userId: 'userId' },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
  desc: vi.fn().mockImplementation(field => ({ desc: field })),
}))

// Import after mocks
import { sync } from './sync.js'

describe('sync command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct command metadata', () => {
    expect(sync.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns not linked message when no profile exists', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction()

      await sync.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('do not have a linked Kawakawa account'),
        flags: 64, // Ephemeral
      })
    })

    it('shows sync status for user without FIO credentials', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.userSettings.findFirst.mockResolvedValue(null) // No FIO credentials
      mockDbQuery.fioUserStorage.findFirst.mockResolvedValueOnce(null)

      const mockCollector = {
        on: vi.fn().mockReturnThis(),
      }
      const mockResponse = {
        createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      }
      const replyFn = vi.fn().mockResolvedValue(mockResponse)
      const { interaction } = createMockInteraction()
      interaction.reply = replyFn as never

      await sync.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
          flags: 64, // Ephemeral
        })
      )
    })

    it('shows sync status for user with FIO credentials', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.userSettings.findFirst
        .mockResolvedValueOnce({ value: '"testfiouser"' }) // fio.username
        .mockResolvedValueOnce({ value: '"apikey123"' }) // fio.apiKey
      mockDbQuery.fioUserStorage.findFirst.mockResolvedValueOnce({
        lastSyncedAt: new Date(),
        fioUploadedAt: new Date(),
      })

      const mockCollector = {
        on: vi.fn().mockReturnThis(),
      }
      const mockResponse = {
        createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      }
      const replyFn = vi.fn().mockResolvedValue(mockResponse)
      const { interaction } = createMockInteraction()
      interaction.reply = replyFn as never

      await sync.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
          flags: 64, // Ephemeral
        })
      )
    })

    it('shows "Never synced" when no storage exists', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.userSettings.findFirst
        .mockResolvedValueOnce({ value: '"testfiouser"' })
        .mockResolvedValueOnce({ value: '"apikey123"' })
      mockDbQuery.fioUserStorage.findFirst.mockResolvedValueOnce(null)

      const mockCollector = {
        on: vi.fn().mockReturnThis(),
      }
      const mockResponse = {
        createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      }
      const replyFn = vi.fn().mockResolvedValue(mockResponse)
      const { interaction } = createMockInteraction()
      interaction.reply = replyFn as never

      await sync.execute(interaction as never)

      expect(replyFn).toHaveBeenCalled()
    })

    it('creates message collector for button interactions', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.userSettings.findFirst.mockResolvedValue(null)
      mockDbQuery.fioUserStorage.findFirst.mockResolvedValueOnce(null)

      const mockCollector = {
        on: vi.fn().mockReturnThis(),
      }
      const mockResponse = {
        createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      }
      const replyFn = vi.fn().mockResolvedValue(mockResponse)

      const { interaction } = createMockInteraction()
      interaction.reply = replyFn as never

      await sync.execute(interaction as never)

      expect(mockResponse.createMessageComponentCollector).toHaveBeenCalled()
    })

    it('handles FIO credential button interaction', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.userSettings.findFirst.mockResolvedValue(null)
      mockDbQuery.fioUserStorage.findFirst.mockResolvedValueOnce(null)

      const collectHandlers: Record<string, (i: unknown) => Promise<void>> = {}
      const endHandlers: (() => Promise<void>)[] = []
      const mockCollector: { on: ReturnType<typeof vi.fn> } = {
        on: vi.fn(),
      }
      mockCollector.on.mockImplementation(
        (event: string, handler: (i?: unknown) => Promise<void>) => {
          if (event === 'collect') {
            collectHandlers['collect'] = handler
          } else if (event === 'end') {
            endHandlers.push(handler)
          }
          return mockCollector
        }
      )
      const mockResponse = {
        createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      }
      const replyFn = vi.fn().mockResolvedValue(mockResponse)
      const editReplyFn = vi.fn()

      const { interaction } = createMockInteraction()
      interaction.reply = replyFn as never
      interaction.editReply = editReplyFn as never

      await sync.execute(interaction as never)

      // Simulate configure button click
      const showModalFn = vi.fn()
      const awaitModalSubmitFn = vi.fn().mockRejectedValue(new Error('timeout'))
      const buttonInteraction = {
        customId: 'fio:configure',
        user: { id: '123456789' },
        showModal: showModalFn,
        awaitModalSubmit: awaitModalSubmitFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
      }

      expect(showModalFn).toHaveBeenCalled()
    })

    it('handles FIO clear button interaction', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        userId: 1,
        user: { id: 1, displayName: 'Test User' },
      })
      mockDbQuery.userSettings.findFirst
        .mockResolvedValueOnce({ value: '"testfiouser"' })
        .mockResolvedValueOnce({ value: '"apikey123"' })
      mockDbQuery.fioUserStorage.findFirst.mockResolvedValueOnce(null)

      const collectHandlers: Record<string, (i: unknown) => Promise<void>> = {}
      const mockCollector: { on: ReturnType<typeof vi.fn> } = {
        on: vi.fn(),
      }
      mockCollector.on.mockImplementation(
        (event: string, handler: (i?: unknown) => Promise<void>) => {
          if (event === 'collect') {
            collectHandlers['collect'] = handler
          }
          return mockCollector
        }
      )
      const mockResponse = {
        createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      }
      const replyFn = vi.fn().mockResolvedValue(mockResponse)

      const { interaction } = createMockInteraction()
      interaction.reply = replyFn as never

      // Mock delete chain
      const mockWhere = vi.fn().mockResolvedValue(undefined)
      mockDbDelete.mockReturnValue({ where: mockWhere })

      await sync.execute(interaction as never)

      // Simulate clear button click
      const updateFn = vi.fn()
      const clearInteraction = {
        customId: 'fio:clear',
        user: { id: '123456789' },
        update: updateFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](clearInteraction)
      }

      expect(mockDbDelete).toHaveBeenCalled()
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cleared'),
        })
      )
    })
  })
})
