import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirstProfile, mockFindFirstUser, mockInsert, mockBcryptCompare } = vi.hoisted(
  () => ({
    mockFindFirstProfile: vi.fn(),
    mockFindFirstUser: vi.fn(),
    mockInsert: vi.fn(),
    mockBcryptCompare: vi.fn(),
  })
)

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock bcrypt
vi.mock('bcrypt', () => ({
  compare: mockBcryptCompare,
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirstProfile,
      },
      users: {
        findFirst: mockFindFirstUser,
      },
    },
    insert: mockInsert,
  },
  userDiscordProfiles: {
    discordId: 'discordId',
  },
  users: {
    username: 'username',
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Import after mocks
import { link } from './link.js'

describe('link command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct command metadata', () => {
    expect(link.data).toBeDefined()
  })

  it('returns error when Discord is already linked', async () => {
    mockFindFirstProfile.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
    })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {
        username: 'testuser',
        password: 'password123',
      },
    })

    await link.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('already linked'),
      flags: 64, // Ephemeral
    })
  })

  it('returns error when username not found', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)
    mockFindFirstUser.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {
        username: 'nonexistent',
        password: 'password123',
      },
    })

    await link.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: 'Invalid username or password.',
      flags: 64, // Ephemeral
    })
  })

  it('returns error when account already has Discord linked', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)
    mockFindFirstUser.mockResolvedValueOnce({
      id: 1,
      username: 'testuser',
      passwordHash: '$2b$10$hash',
      discordProfile: { discordId: '999999' }, // Already linked to different Discord
    })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {
        username: 'testuser',
        password: 'password123',
      },
    })

    await link.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('already linked to a different Discord'),
      flags: 64, // Ephemeral
    })
  })

  it('returns error when password is invalid', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)
    mockFindFirstUser.mockResolvedValueOnce({
      id: 1,
      username: 'testuser',
      passwordHash: '$2b$10$hash',
      discordProfile: null,
    })
    mockBcryptCompare.mockResolvedValueOnce(false)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {
        username: 'testuser',
        password: 'wrongpassword',
      },
    })

    await link.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: 'Invalid username or password.',
      flags: 64, // Ephemeral
    })
  })

  it('successfully links Discord to account', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)
    mockFindFirstUser.mockResolvedValueOnce({
      id: 1,
      username: 'testuser',
      passwordHash: '$2b$10$hash',
      discordProfile: null,
    })
    mockBcryptCompare.mockResolvedValueOnce(true)

    const mockValues = vi.fn().mockResolvedValue(undefined)
    mockInsert.mockReturnValue({ values: mockValues })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {
        username: 'testuser',
        password: 'correctpassword',
      },
    })

    await link.execute(interaction as never)

    expect(mockInsert).toHaveBeenCalled()
    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Successfully linked'),
      flags: 64, // Ephemeral
    })
  })

  it('handles database errors gracefully', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)
    mockFindFirstUser.mockResolvedValueOnce({
      id: 1,
      username: 'testuser',
      passwordHash: '$2b$10$hash',
      discordProfile: null,
    })
    mockBcryptCompare.mockResolvedValueOnce(true)

    const mockValues = vi.fn().mockRejectedValue(new Error('Database error'))
    mockInsert.mockReturnValue({ values: mockValues })

    // Spy on console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {
        username: 'testuser',
        password: 'correctpassword',
      },
    })

    await link.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('error occurred'),
      flags: 64, // Ephemeral
    })

    consoleSpy.mockRestore()
  })
})
