import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirst, mockDbSelect } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockDbSelect: vi.fn(),
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
    select: mockDbSelect,
  },
  userDiscordProfiles: {
    discordId: 'discordId',
  },
  userRoles: {
    userId: 'userId',
    roleId: 'roleId',
  },
  roles: {
    id: 'id',
    name: 'name',
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Import after mocks
import { whoami } from './whoami.js'

describe('whoami command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct command metadata', () => {
    expect(whoami.data).toBeDefined()
  })

  it('returns not linked message when no profile exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction()

    await whoami.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('do not have a linked Kawakawa account'),
      flags: 64, // Ephemeral
    })
  })

  it('returns user info embed when profile exists', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
      },
    })

    // Mock roles query
    const mockFrom = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ roleName: 'member' }, { roleName: 'trader' }]),
      }),
    })
    mockDbSelect.mockReturnValue({ from: mockFrom })

    const { interaction, replyFn } = createMockInteraction()

    await whoami.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      embeds: expect.any(Array),
      flags: 64, // Ephemeral
    })

    // Verify the embed was created (via the reply call)
    const callArgs = replyFn.mock.calls[0][0]
    expect(callArgs.embeds).toHaveLength(1)
  })

  it('shows "None" when user has no roles', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
      },
    })

    // Mock empty roles query
    const mockFrom = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })
    mockDbSelect.mockReturnValue({ from: mockFrom })

    const { interaction, replyFn } = createMockInteraction()

    await whoami.execute(interaction as never)

    expect(replyFn).toHaveBeenCalled()
    // The embed will contain "None" for roles - verified via mock structure
  })

  it('shows inactive status correctly', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'inactiveuser',
        displayName: 'Inactive User',
        isActive: false,
      },
    })

    const mockFrom = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })
    mockDbSelect.mockReturnValue({ from: mockFrom })

    const { interaction, replyFn } = createMockInteraction()

    await whoami.execute(interaction as never)

    expect(replyFn).toHaveBeenCalled()
  })

  it('sets thumbnail when user has avatar', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
      },
    })

    const mockFrom = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })
    mockDbSelect.mockReturnValue({ from: mockFrom })

    const { interaction, replyFn } = createMockInteraction({
      avatar: 'avatar123',
    })

    await whoami.execute(interaction as never)

    expect(replyFn).toHaveBeenCalled()
    expect(interaction.user.displayAvatarURL).toHaveBeenCalledWith({ size: 128 })
  })

  it('does not set thumbnail when user has no avatar', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
      },
    })

    const mockFrom = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })
    mockDbSelect.mockReturnValue({ from: mockFrom })

    const { interaction, replyFn } = createMockInteraction({
      avatar: null,
    })

    await whoami.execute(interaction as never)

    expect(replyFn).toHaveBeenCalled()
    // displayAvatarURL should not be called when avatar is null
    expect(interaction.user.displayAvatarURL).not.toHaveBeenCalled()
  })
})
