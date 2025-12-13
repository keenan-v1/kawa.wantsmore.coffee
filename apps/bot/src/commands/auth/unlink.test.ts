import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirst, mockDelete } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockDelete: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirst,
      },
    },
    delete: mockDelete,
  },
  userDiscordProfiles: {
    discordId: 'discordId',
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Import after mocks
import { unlink } from './unlink.js'

describe('unlink command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct command metadata', () => {
    expect(unlink.data).toBeDefined()
  })

  it('returns error when no profile exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: "You don't have a linked Kawakawa account.",
      flags: 64, // Ephemeral
    })
  })

  it('shows warning for Discord-only accounts', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
        passwordHash: 'discord:123456789:1234567890', // Discord-only account
      },
    })

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      embeds: expect.any(Array),
      ephemeral: true,
    })

    // Should not delete the profile
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('successfully unlinks for account with password', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
        passwordHash: '$2b$10$hashedpassword', // Real password hash
      },
    })

    const mockWhere = vi.fn().mockResolvedValue(undefined)
    mockDelete.mockReturnValue({ where: mockWhere })

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(mockDelete).toHaveBeenCalled()
    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Successfully unlinked'),
      flags: 64, // Ephemeral
    })
  })

  it('handles database errors gracefully', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
        passwordHash: '$2b$10$hashedpassword',
      },
    })

    const mockWhere = vi.fn().mockRejectedValue(new Error('Database error'))
    mockDelete.mockReturnValue({ where: mockWhere })

    // Spy on console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('error occurred'),
      flags: 64, // Ephemeral
    })

    consoleSpy.mockRestore()
  })
})
