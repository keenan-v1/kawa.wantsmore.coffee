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

// Mock database to return proper permission results
const mockDbSelect = vi.fn()
const mockDbFrom = vi.fn()
const mockDbWhere = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockDbWhere,
      }),
    }),
  },
  userRoles: {
    userId: 'userId',
    roleId: 'roleId',
  },
  rolePermissions: {
    roleId: 'roleId',
    permissionId: 'permissionId',
    allowed: 'allowed',
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
    // Default: return empty permissions (no permissions granted)
    mockDbWhere.mockResolvedValue([])
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

    it('should pass when user has required permission', async () => {
      const payload = { userId: 1, username: 'admin', roles: ['admin'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['admin'])
      // Mock: admin role has 'prices.manage' permission
      mockDbWhere.mockResolvedValue([{ permissionId: 'prices.manage' }])

      const result = await expressAuthentication(mockRequest as Request, 'jwt', ['prices.manage'])

      expect(result).toEqual(payload)
    })

    it('should pass when user has all required permissions', async () => {
      const payload = { userId: 1, username: 'admin', roles: ['admin'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['admin'])
      // Mock: admin role has both permissions
      mockDbWhere.mockResolvedValue([
        { permissionId: 'prices.manage' },
        { permissionId: 'prices.view' },
      ])

      const result = await expressAuthentication(mockRequest as Request, 'jwt', [
        'prices.manage',
        'prices.view',
      ])

      expect(result).toEqual(payload)
    })

    it('should reject when user lacks required permission', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      // Mock: member role doesn't have 'admin.manage_users' permission
      mockDbWhere.mockResolvedValue([])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['admin.manage_users'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should reject when user has only some required permissions', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      // Mock: member role only has prices.view, not prices.manage
      mockDbWhere.mockResolvedValue([{ permissionId: 'prices.view' }])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['prices.view', 'prices.manage'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should use current roles from cache/db for permission check when roles changed', async () => {
      const tokenPayload = { userId: 1, username: 'user', roles: ['member'] }
      const currentRoles = ['member', 'admin']

      vi.mocked(jwtUtils.verifyToken).mockReturnValue(tokenPayload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(currentRoles)
      vi.mocked(jwtUtils.generateToken).mockReturnValue('new-token')
      // Mock: admin role has 'admin.manage_users' permission
      mockDbWhere.mockResolvedValue([{ permissionId: 'admin.manage_users' }])

      // Should pass because current roles (not token roles) include admin which has the permission
      const result = await expressAuthentication(mockRequest as Request, 'jwt', [
        'admin.manage_users',
      ])

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
