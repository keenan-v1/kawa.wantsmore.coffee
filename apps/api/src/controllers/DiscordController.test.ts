import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiscordController } from './DiscordController.js'

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({
      toString: () => 'mock-state-token-abc123',
    })),
  },
}))

// Mock database
const mockSelectWhere = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockDeleteWhere = vi.fn()

// Create thenable mock for select queries that may or may not have .where()
function createThenableSelectFrom(resolvedValue: unknown) {
  return {
    where: mockSelectWhere,
    // Make it thenable so it can be awaited directly (for queries without .where())
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
      return Promise.resolve(resolvedValue).then(resolve, reject)
    },
  }
}

// Default empty result for direct from() calls
let mockSelectFromDirectResult: unknown = []

vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: vi.fn().mockImplementation(() => createThenableSelectFrom(mockSelectFromDirectResult)),
    }),
    update: () => ({
      set: mockUpdateSet.mockReturnValue({
        where: mockUpdateWhere,
      }),
    }),
    insert: () => ({
      values: mockInsertValues,
    }),
    delete: () => ({
      where: mockDeleteWhere,
    }),
  },
  userDiscordProfiles: {
    id: 'id',
    userId: 'userId',
    discordId: 'discordId',
    discordUsername: 'discordUsername',
    discordAvatar: 'discordAvatar',
    accessToken: 'accessToken',
    refreshToken: 'refreshToken',
    tokenExpiresAt: 'tokenExpiresAt',
    connectedAt: 'connectedAt',
    updatedAt: 'updatedAt',
  },
  discordRoleMappings: {},
  userRoles: { userId: 'userId', roleId: 'roleId' },
  roles: { id: 'id', name: 'name' },
}))

// Mock discord service
const mockGetAuthorizationUrl = vi.fn()
const mockExchangeCodeForTokens = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockGetDiscordSettings = vi.fn()
const mockRefreshAccessToken = vi.fn()
const mockGetUserGuildMember = vi.fn()

vi.mock('../services/discordService.js', () => ({
  discordService: {
    getAuthorizationUrl: (...args: unknown[]) => mockGetAuthorizationUrl(...args),
    exchangeCodeForTokens: (...args: unknown[]) => mockExchangeCodeForTokens(...args),
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    getDiscordSettings: () => mockGetDiscordSettings(),
    refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
    getUserGuildMember: (...args: unknown[]) => mockGetUserGuildMember(...args),
  },
}))

// Mock notification service
const mockCreateNotification = vi.fn()
vi.mock('../services/notificationService.js', () => ({
  notificationService: {
    create: (...args: unknown[]) => mockCreateNotification(...args),
  },
}))

describe('DiscordController', () => {
  let controller: DiscordController
  const mockRequest = { user: { userId: 42, username: 'testuser', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new DiscordController()
    mockGetDiscordSettings.mockResolvedValue({ guildId: null })
    mockSelectFromDirectResult = [] // Reset direct from() result
  })

  describe('getAuthUrl', () => {
    it('should return authorization URL with state', async () => {
      mockGetAuthorizationUrl.mockResolvedValue('https://discord.com/oauth2/authorize?...')

      const result = await controller.getAuthUrl(mockRequest)

      expect(result.url).toBe('https://discord.com/oauth2/authorize?...')
      expect(result.state).toBe('mock-state-token-abc123')
      expect(mockGetAuthorizationUrl).toHaveBeenCalledWith('mock-state-token-abc123')
    })
  })

  describe('handleCallback', () => {
    const mockBody = {
      code: 'auth-code-123',
      state: 'mock-state-token-abc123',
    }

    beforeEach(() => {
      // First get an auth URL to create the state token
      mockGetAuthorizationUrl.mockResolvedValue('https://discord.com/oauth2/authorize?...')
    })

    it('should link Discord account for new user', async () => {
      // Setup state token first
      await controller.getAuthUrl(mockRequest)

      mockExchangeCodeForTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date('2024-12-31'),
      })
      mockGetCurrentUser.mockResolvedValue({
        id: 'discord-123',
        username: 'DiscordUser',
        avatar: 'avatar-hash',
      })
      // No existing link
      mockSelectWhere.mockResolvedValueOnce([])
      // No existing profile
      mockSelectWhere.mockResolvedValueOnce([])

      const result = await controller.handleCallback(mockBody, mockRequest)

      expect(result.success).toBe(true)
      expect(result.profile.discordId).toBe('discord-123')
      expect(result.profile.discordUsername).toBe('DiscordUser')
      expect(mockInsertValues).toHaveBeenCalled()
    })

    it('should update existing Discord profile', async () => {
      await controller.getAuthUrl(mockRequest)

      mockExchangeCodeForTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date('2024-12-31'),
      })
      mockGetCurrentUser.mockResolvedValue({
        id: 'discord-123',
        username: 'DiscordUser',
        avatar: 'new-avatar',
      })
      // No existing link to different user
      mockSelectWhere.mockResolvedValueOnce([])
      // Existing profile for this user
      mockSelectWhere.mockResolvedValueOnce([
        {
          id: 1,
          userId: 42,
          discordId: 'discord-123',
          connectedAt: new Date('2024-01-01'),
        },
      ])

      const result = await controller.handleCallback(mockBody, mockRequest)

      expect(result.success).toBe(true)
      expect(mockUpdateSet).toHaveBeenCalled()
    })

    it('should throw error for invalid state', async () => {
      const invalidBody = { code: 'code', state: 'invalid-state' }

      await expect(controller.handleCallback(invalidBody, mockRequest)).rejects.toThrow(
        'Invalid or expired state token'
      )
    })

    it('should throw error when Discord is linked to another user', async () => {
      await controller.getAuthUrl(mockRequest)

      mockExchangeCodeForTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date('2024-12-31'),
      })
      mockGetCurrentUser.mockResolvedValue({
        id: 'discord-123',
        username: 'DiscordUser',
        avatar: 'avatar',
      })
      // Discord linked to different user
      mockSelectWhere.mockResolvedValueOnce([{ id: 1, userId: 999 }])

      await expect(controller.handleCallback(mockBody, mockRequest)).rejects.toThrow(
        'This Discord account is already linked to another user'
      )
    })
  })

  describe('getConnectionStatus', () => {
    it('should return not connected when no profile exists', async () => {
      mockSelectWhere.mockResolvedValue([])

      const result = await controller.getConnectionStatus(mockRequest)

      expect(result.connected).toBe(false)
      expect(result.profile).toBeNull()
    })

    it('should return connected status with profile', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          discordId: 'discord-123',
          discordUsername: 'DiscordUser',
          discordAvatar: 'avatar-hash',
          accessToken: 'token',
          connectedAt: new Date('2024-01-01'),
          tokenExpiresAt: new Date('2025-01-01'),
        },
      ])

      const result = await controller.getConnectionStatus(mockRequest)

      expect(result.connected).toBe(true)
      expect(result.profile?.discordId).toBe('discord-123')
    })

    it('should check guild membership when configured', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          discordId: 'discord-123',
          discordUsername: 'DiscordUser',
          discordAvatar: null,
          accessToken: 'valid-token',
          connectedAt: new Date('2024-01-01'),
          tokenExpiresAt: new Date('2025-01-01'),
        },
      ])
      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })
      mockGetUserGuildMember.mockResolvedValue({ roles: ['role-1', 'role-2'] })

      const result = await controller.getConnectionStatus(mockRequest)

      expect(result.isMemberOfGuild).toBe(true)
      expect(result.guildRoles).toEqual(['role-1', 'role-2'])
    })

    it('should refresh expired token when checking guild membership', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          discordId: 'discord-123',
          discordUsername: 'DiscordUser',
          discordAvatar: null,
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          connectedAt: new Date('2024-01-01'),
          tokenExpiresAt: new Date('2020-01-01'), // Expired
        },
      ])
      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: new Date('2025-01-01'),
      })
      mockGetUserGuildMember.mockResolvedValue({ roles: [] })

      await controller.getConnectionStatus(mockRequest)

      expect(mockRefreshAccessToken).toHaveBeenCalledWith('refresh-token')
      expect(mockUpdateSet).toHaveBeenCalled()
    })

    it('should handle guild check errors gracefully', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          discordId: 'discord-123',
          discordUsername: 'DiscordUser',
          discordAvatar: null,
          accessToken: 'token',
          connectedAt: new Date('2024-01-01'),
          tokenExpiresAt: new Date('2025-01-01'),
        },
      ])
      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })
      mockGetUserGuildMember.mockRejectedValue(new Error('API Error'))

      const result = await controller.getConnectionStatus(mockRequest)

      expect(result.connected).toBe(true)
      expect(result.isMemberOfGuild).toBeNull()
    })
  })

  describe('disconnect', () => {
    it('should disconnect Discord account', async () => {
      mockSelectWhere.mockResolvedValue([{ id: 1, userId: 42 }])
      mockDeleteWhere.mockResolvedValue(undefined)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await controller.disconnect(mockRequest)

      expect(mockDeleteWhere).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(204)
    })

    it('should throw error when not connected', async () => {
      mockSelectWhere.mockResolvedValue([])

      await expect(controller.disconnect(mockRequest)).rejects.toThrow(
        'Discord is not connected to this account'
      )
    })
  })

  describe('syncRoles', () => {
    it('should sync roles from Discord', async () => {
      // First call: get profile, Second call: get current roles
      mockSelectWhere
        .mockResolvedValueOnce([
          {
            userId: 42,
            accessToken: 'valid-token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date('2025-01-01'),
          },
        ])
        .mockResolvedValueOnce([{ roleId: 'existing-role' }]) // Current roles

      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })
      mockGetUserGuildMember.mockResolvedValue({ roles: ['discord-role-1'] })

      // Role mappings query (no .where()) returns empty array
      mockSelectFromDirectResult = []

      const result = await controller.syncRoles(mockRequest)

      expect(result.synced).toBe(true)
    })

    it('should throw error when not connected', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      await expect(controller.syncRoles(mockRequest)).rejects.toThrow(
        'Discord is not connected to this account'
      )
    })

    it('should throw error when guild not configured', async () => {
      mockSelectWhere.mockResolvedValueOnce([
        { accessToken: 'token', tokenExpiresAt: new Date('2025-01-01') },
      ])
      mockGetDiscordSettings.mockResolvedValue({ guildId: null })

      await expect(controller.syncRoles(mockRequest)).rejects.toThrow(
        'Discord guild is not configured'
      )
    })

    it('should throw error when not a guild member', async () => {
      mockSelectWhere.mockResolvedValueOnce([
        { accessToken: 'token', tokenExpiresAt: new Date('2030-01-01') }, // Future date
      ])
      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })
      mockGetUserGuildMember.mockResolvedValue(null)

      await expect(controller.syncRoles(mockRequest)).rejects.toThrow(
        'You are not a member of the Discord server'
      )
    })

    it('should throw error when token expired without refresh token', async () => {
      mockSelectWhere.mockResolvedValueOnce([
        {
          accessToken: 'expired-token',
          refreshToken: null,
          tokenExpiresAt: new Date('2020-01-01'),
        },
      ])
      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })

      await expect(controller.syncRoles(mockRequest)).rejects.toThrow(
        'Discord token expired. Please reconnect your Discord account.'
      )
    })

    it('should refresh expired token during sync', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([
          {
            accessToken: 'expired-token',
            refreshToken: 'refresh-token',
            tokenExpiresAt: new Date('2020-01-01'),
          },
        ])
        .mockResolvedValueOnce([]) // Current roles

      mockGetDiscordSettings.mockResolvedValue({ guildId: 'guild-123' })
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: new Date('2025-01-01'),
      })
      mockGetUserGuildMember.mockResolvedValue({ roles: [] })
      mockSelectFromDirectResult = [] // Role mappings

      await controller.syncRoles(mockRequest)

      expect(mockRefreshAccessToken).toHaveBeenCalled()
      expect(mockUpdateSet).toHaveBeenCalled()
    })
  })
})
