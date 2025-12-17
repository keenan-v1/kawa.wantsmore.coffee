import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiscordAuthController } from './DiscordAuthController.js'
import { discordService } from '../services/discordService.js'
import * as permissionService from '../utils/permissionService.js'
import * as jwtUtils from '../utils/jwt.js'
import { db } from '../db/index.js'

vi.mock('../utils/permissionService.js', () => ({
  getPermissions: vi.fn(),
}))

vi.mock('../utils/jwt.js', () => ({
  generateToken: vi.fn(),
}))

vi.mock('../services/discordService.js', () => ({
  discordService: {
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    getCurrentUser: vi.fn(),
    getDiscordSettings: vi.fn(),
    getUserGuildMember: vi.fn(),
  },
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  users: {
    id: 'id',
    username: 'username',
    displayName: 'displayName',
    email: 'email',
    passwordHash: 'passwordHash',
    isActive: 'isActive',
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
  },
  userRoles: {
    userId: 'userId',
    roleId: 'roleId',
  },
  userSettings: {
    userId: 'userId',
  },
  roles: {
    id: 'id',
    name: 'name',
    color: 'color',
  },
  discordRoleMappings: {
    discordRoleId: 'discordRoleId',
    appRoleId: 'appRoleId',
    priority: 'priority',
  },
}))

describe('DiscordAuthController', () => {
  let controller: DiscordAuthController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new DiscordAuthController()

    // Default mock for permissions
    vi.mocked(permissionService.getPermissions).mockResolvedValue(
      new Map([
        ['orders.view_internal', true],
        ['orders.post_internal', true],
      ])
    )

    // Default mock for JWT generation
    vi.mocked(jwtUtils.generateToken).mockReturnValue('mock-jwt-token')

    // Default mock for discord settings
    vi.mocked(discordService.getDiscordSettings).mockResolvedValue({
      guildId: null,
      autoApprovalEnabled: false,
    })
  })

  describe('getAuthUrl', () => {
    it('should return authorization URL with state', async () => {
      vi.mocked(discordService.getAuthorizationUrl).mockResolvedValue(
        'https://discord.com/oauth2/authorize?state=abc123'
      )

      const result = await controller.getAuthUrl()

      expect(result).toHaveProperty('url')
      expect(result).toHaveProperty('state')
      expect(result.url).toContain('discord.com')
      expect(result.state).toBeTruthy()
      expect(discordService.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String), undefined)
    })

    it('should pass prompt=none to service', async () => {
      vi.mocked(discordService.getAuthorizationUrl).mockResolvedValue(
        'https://discord.com/oauth2/authorize?state=abc123&prompt=none'
      )

      const result = await controller.getAuthUrl('none')

      expect(result).toHaveProperty('url')
      expect(result.url).toContain('prompt=none')
      expect(discordService.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String), 'none')
    })

    it('should pass prompt=consent to service', async () => {
      vi.mocked(discordService.getAuthorizationUrl).mockResolvedValue(
        'https://discord.com/oauth2/authorize?state=abc123&prompt=consent'
      )

      const result = await controller.getAuthUrl('consent')

      expect(result).toHaveProperty('url')
      expect(result.url).toContain('prompt=consent')
      expect(discordService.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String), 'consent')
    })
  })

  describe('handleCallback', () => {
    const mockDiscordTokens = {
      accessToken: 'discord-access-token',
      refreshToken: 'discord-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    }

    const mockDiscordUser = {
      id: '123456789012345678',
      username: 'testuser',
      avatar: 'avatar_hash',
    }

    beforeEach(() => {
      vi.mocked(discordService.exchangeCodeForTokens).mockResolvedValue(mockDiscordTokens)
      vi.mocked(discordService.getCurrentUser).mockResolvedValue(mockDiscordUser)
    })

    it('should return error for missing parameters', async () => {
      const result = await controller.handleCallback('', 'state-token')

      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.message).toContain('Missing')
      }
    })

    it('should return error for missing code', async () => {
      const result = await controller.handleCallback(undefined, 'state-token')

      expect(result.type).toBe('error')
    })

    it('should return consent_required on consent_required error', async () => {
      const result = await controller.handleCallback(undefined, undefined, 'consent_required')

      expect(result.type).toBe('consent_required')
    })

    it('should return consent_required on interaction_required error', async () => {
      const result = await controller.handleCallback(undefined, undefined, 'interaction_required')

      expect(result.type).toBe('consent_required')
    })

    it('should return error on access_denied', async () => {
      const result = await controller.handleCallback(undefined, undefined, 'access_denied')

      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.message).toContain('denied')
      }
    })

    it('should return generic OAuth error', async () => {
      const result = await controller.handleCallback(
        undefined,
        undefined,
        'server_error',
        'Something went wrong'
      )

      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.message).toBe('Something went wrong')
      }
    })

    it('should handle Discord API errors gracefully', async () => {
      vi.mocked(discordService.exchangeCodeForTokens).mockRejectedValue(
        new Error('Discord API error')
      )

      const result = await controller.handleCallback('auth-code', 'state-token')

      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.message).toContain('Discord API error')
      }
    })

    it('should handle non-Error exceptions', async () => {
      vi.mocked(discordService.exchangeCodeForTokens).mockRejectedValue('Unknown error')

      const result = await controller.handleCallback('auth-code', 'state-token')

      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.message).toContain('Failed to authenticate')
      }
    })
  })

  describe('completeRegistration', () => {
    it('should throw error for invalid state', async () => {
      await expect(
        controller.completeRegistration({
          state: 'invalid-state',
          displayName: 'Test User',
        })
      ).rejects.toThrow('Invalid or expired registration state')
    })
  })

})
