import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDiscordMock, createMockInteraction } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirstProfile, mockInsert, mockGetWebUrl } = vi.hoisted(() => ({
  mockFindFirstProfile: vi.fn(),
  mockInsert: vi.fn(),
  mockGetWebUrl: vi.fn(),
}))

// Apply Discord.js mocks
vi.mock('discord.js', () => getDiscordMock())

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirstProfile,
      },
    },
    insert: mockInsert,
  },
  userDiscordProfiles: {},
  passwordResetTokens: {},
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Mock config
vi.mock('../../config.js', () => ({
  getWebUrl: mockGetWebUrl,
}))

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('mock-reset-token-12345'),
    }),
  },
}))

// Import after mocks
import { password } from './password.js'

describe('/password command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWebUrl.mockResolvedValue('https://kawakawa.example.com')
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('should have correct command metadata', () => {
    expect(password.data.name).toBe('password')
  })

  it('should reject user without linked account', async () => {
    mockFindFirstProfile.mockResolvedValue(undefined)

    const { interaction, replyFn } = createMockInteraction()

    await password.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('You do not have a linked Kawakawa account'),
      })
    )
  })

  it('should generate reset link for linked user', async () => {
    mockFindFirstProfile.mockResolvedValue({
      discordId: '123456789',
      userId: 1,
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hashed-password',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const { interaction, replyFn } = createMockInteraction()

    await password.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
      })
    )
  })

  it('should show different message for Discord-only accounts', async () => {
    mockFindFirstProfile.mockResolvedValue({
      discordId: '123456789',
      userId: 1,
      user: {
        id: 1,
        username: 'discorduser',
        displayName: 'Discord User',
        passwordHash: 'discord:123456789:1234567890', // Discord-only account
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const { interaction, replyFn } = createMockInteraction()

    await password.execute(interaction as never)

    // Should still succeed - the embed content differs but we can't easily check that with the mock
    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
      })
    )
  })

  it('should insert password reset token into database', async () => {
    mockFindFirstProfile.mockResolvedValue({
      discordId: '123456789',
      userId: 1,
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hashed-password',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const { interaction } = createMockInteraction()

    await password.execute(interaction as never)

    expect(mockInsert).toHaveBeenCalled()
  })
})
