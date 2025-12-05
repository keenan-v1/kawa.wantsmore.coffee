import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getCurrentUser,
  getUserGuildMember,
  getGuild,
  getGuildRoles,
  testConnection,
  getGuildIconUrl,
  getUserAvatarUrl,
} from './discordService.js'

// Mock the settings service
vi.mock('./settingsService.js', () => ({
  settingsService: {
    getAll: vi.fn(),
  },
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

import { settingsService } from './settingsService.js'

describe('discordService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  const mockSettings = {
    'discord.clientId': 'test-client-id',
    'discord.clientSecret': 'test-client-secret',
    'discord.botToken': 'test-bot-token',
    'discord.guildId': 'test-guild-id',
    'discord.redirectUri': 'http://localhost:5173/discord/callback', // Must match Discord app config
  }

  describe('getAuthorizationUrl', () => {
    it('should generate correct OAuth2 URL', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)

      const url = await getAuthorizationUrl('test-state')

      expect(url).toContain('https://discord.com/oauth2/authorize')
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('response_type=code')
      expect(url).toContain('state=test-state')
      expect(url).toContain('scope=identify+guilds.members.read')
    })

    it('should include prompt=none when specified', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)

      const url = await getAuthorizationUrl('test-state', 'none')

      expect(url).toContain('prompt=none')
    })

    it('should include prompt=consent when specified', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)

      const url = await getAuthorizationUrl('test-state', 'consent')

      expect(url).toContain('prompt=consent')
    })

    it('should not include prompt parameter when not specified', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)

      const url = await getAuthorizationUrl('test-state')

      expect(url).not.toContain('prompt=')
    })

    it('should throw if client ID not configured', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})

      await expect(getAuthorizationUrl('test-state')).rejects.toThrow(
        'Discord client ID not configured'
      )
    })

    it('should throw if redirect URI not configured', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'discord.clientId': 'test-id',
      })

      await expect(getAuthorizationUrl('test-state')).rejects.toThrow(
        'Discord redirect URI not configured'
      )
    })
  })

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-123',
            refresh_token: 'refresh-456',
            expires_in: 604800,
            token_type: 'Bearer',
          }),
      })

      const result = await exchangeCodeForTokens('auth-code')

      expect(result.accessToken).toBe('access-123')
      expect(result.refreshToken).toBe('refresh-456')
      expect(result.expiresAt).toBeInstanceOf(Date)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      )
    })

    it('should throw on failed token exchange', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid code'),
      })

      await expect(exchangeCodeForTokens('bad-code')).rejects.toThrow(
        'Discord token exchange failed'
      )
    })
  })

  describe('getCurrentUser', () => {
    it('should fetch user info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: '123456789',
            username: 'testuser',
            global_name: 'Test User',
            avatar: 'abc123',
          }),
      })

      const result = await getCurrentUser('access-token')

      expect(result.id).toBe('123456789')
      expect(result.username).toBe('testuser') // Returns actual username, not global_name
      expect(result.avatar).toBe('abc123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/users/@me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer access-token' },
        })
      )
    })

    it('should fall back to username if no global_name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: '123',
            username: 'fallback',
            global_name: null,
            avatar: null,
          }),
      })

      const result = await getCurrentUser('token')

      expect(result.username).toBe('fallback')
    })
  })

  describe('getUserGuildMember', () => {
    it('should return member info when user is in guild', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            roles: ['role1', 'role2'],
            joined_at: '2024-01-01T00:00:00Z',
          }),
      })

      const result = await getUserGuildMember('token', 'guild-123')

      expect(result).toEqual({
        roles: ['role1', 'role2'],
        joinedAt: '2024-01-01T00:00:00Z',
      })
    })

    it('should return null when user is not in guild', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await getUserGuildMember('token', 'guild-123')

      expect(result).toBeNull()
    })
  })

  describe('getGuild', () => {
    it('should fetch guild info', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'guild-123',
            name: 'Test Guild',
            icon: 'icon-hash',
            approximate_member_count: 100,
          }),
      })

      const result = await getGuild('guild-123')

      expect(result).toEqual({
        id: 'guild-123',
        name: 'Test Guild',
        icon: 'icon-hash',
        memberCount: 100,
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/guilds/guild-123?with_counts=true',
        expect.objectContaining({
          headers: { Authorization: 'Bot test-bot-token' },
        })
      )
    })

    it('should return null when bot not in guild', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await getGuild('unknown-guild')

      expect(result).toBeNull()
    })

    it('should throw if bot token not configured', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})

      await expect(getGuild('guild-123')).rejects.toThrow('Discord bot token not configured')
    })
  })

  describe('getGuildRoles', () => {
    it('should fetch guild roles', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: '1', name: 'Admin', color: 0xff0000, position: 10, managed: false },
            { id: '2', name: 'Member', color: 0x00ff00, position: 5, managed: false },
          ]),
      })

      const result = await getGuildRoles('guild-123')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: '1',
        name: 'Admin',
        color: 0xff0000,
        position: 10,
        managed: false,
      })
    })
  })

  describe('testConnection', () => {
    it('should return success when connected', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'guild-123',
            name: 'Test Guild',
            icon: 'icon-hash',
            approximate_member_count: 50,
          }),
      })

      const result = await testConnection()

      expect(result.success).toBe(true)
      expect(result.guild).toEqual({
        id: 'guild-123',
        name: 'Test Guild',
        icon: 'icon-hash',
        memberCount: 50,
      })
    })

    it('should return error when bot token not configured', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})

      const result = await testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Bot token not configured')
    })

    it('should return error when guild ID not configured', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'discord.botToken': 'token',
      })

      const result = await testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Guild ID not configured')
    })

    it('should return error when bot not in guild', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue(mockSettings)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Bot is not a member of the specified guild')
    })
  })

  describe('getGuildIconUrl', () => {
    it('should return PNG URL for static icon', () => {
      const url = getGuildIconUrl('guild-123', 'icon-hash')

      expect(url).toBe('https://cdn.discordapp.com/icons/guild-123/icon-hash.png?size=128')
    })

    it('should return GIF URL for animated icon', () => {
      const url = getGuildIconUrl('guild-123', 'a_animated-hash')

      expect(url).toBe('https://cdn.discordapp.com/icons/guild-123/a_animated-hash.gif?size=128')
    })

    it('should return null for no icon', () => {
      const url = getGuildIconUrl('guild-123', null)

      expect(url).toBeNull()
    })

    it('should support custom size', () => {
      const url = getGuildIconUrl('guild-123', 'icon-hash', 256)

      expect(url).toContain('size=256')
    })
  })

  describe('getUserAvatarUrl', () => {
    it('should return PNG URL for static avatar', () => {
      const url = getUserAvatarUrl('user-123', 'avatar-hash')

      expect(url).toBe('https://cdn.discordapp.com/avatars/user-123/avatar-hash.png?size=128')
    })

    it('should return GIF URL for animated avatar', () => {
      const url = getUserAvatarUrl('user-123', 'a_animated-avatar')

      expect(url).toBe('https://cdn.discordapp.com/avatars/user-123/a_animated-avatar.gif?size=128')
    })

    it('should return null for no avatar', () => {
      const url = getUserAvatarUrl('user-123', null)

      expect(url).toBeNull()
    })
  })
})
