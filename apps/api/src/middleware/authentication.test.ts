import { describe, it, expect, vi, beforeEach } from 'vitest'
import { expressAuthentication } from './authentication.js'
import * as jwtUtils from '../utils/jwt.js'
import * as roleCache from '../utils/roleCache.js'
import * as requestContext from '../utils/requestContext.js'
import type { Request } from 'express'

vi.mock('../utils/jwt.js', () => ({
  verifyToken: vi.fn(),
  generateToken: vi.fn(),
}))

vi.mock('../utils/roleCache.js', () => ({
  getCachedRoles: vi.fn(),
  setCachedRoles: vi.fn(),
}))

vi.mock('../utils/requestContext.js', () => ({
  setContextValue: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  userRoles: {
    userId: 'userId',
    roleId: 'roleId',
  },
}))

describe('expressAuthentication', () => {
  let mockRequest: Partial<Request>

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequest = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    }
  })

  describe('jwt authentication', () => {
    it('should reject when no token is provided', async () => {
      mockRequest.headers = {}

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'No token provided'
      )
    })

    it('should reject when token is invalid', async () => {
      vi.mocked(jwtUtils.verifyToken).mockImplementation(() => {
        throw new Error('Invalid token')
      })

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Invalid or expired token'
      )
    })

    it('should authenticate valid token without scopes', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])

      const result = await expressAuthentication(mockRequest as Request, 'jwt')

      expect(result).toEqual(payload)
    })

    it('should pass when user has required scope', async () => {
      const payload = { userId: 1, username: 'admin', roles: ['administrator'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['administrator'])

      const result = await expressAuthentication(mockRequest as Request, 'jwt', ['administrator'])

      expect(result).toEqual(payload)
    })

    it('should pass when user has all required scopes', async () => {
      const payload = { userId: 1, username: 'admin', roles: ['administrator', 'member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['administrator', 'member'])

      const result = await expressAuthentication(mockRequest as Request, 'jwt', [
        'administrator',
        'member',
      ])

      expect(result).toEqual(payload)
    })

    it('should reject when user lacks required scope', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['administrator'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should reject when user has only some required scopes', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['member', 'administrator'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should use current roles from cache/db for scope check when roles changed', async () => {
      const tokenPayload = { userId: 1, username: 'user', roles: ['member'] }
      const currentRoles = ['member', 'administrator']

      vi.mocked(jwtUtils.verifyToken).mockReturnValue(tokenPayload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(currentRoles)
      vi.mocked(jwtUtils.generateToken).mockReturnValue('new-token')

      // Should pass because current roles (not token roles) include administrator
      const result = await expressAuthentication(mockRequest as Request, 'jwt', ['administrator'])

      expect(result).toEqual({
        userId: 1,
        username: 'user',
        roles: currentRoles,
      })
      expect(requestContext.setContextValue).toHaveBeenCalledWith('refreshedToken', 'new-token')
    })
  })

  describe('unknown security type', () => {
    it('should reject unknown security types', async () => {
      await expect(expressAuthentication(mockRequest as Request, 'unknown')).rejects.toThrow(
        'Unknown security type'
      )
    })
  })
})
