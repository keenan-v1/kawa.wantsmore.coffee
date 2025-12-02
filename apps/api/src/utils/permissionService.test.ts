import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissions,
  clearPermissionCache,
  invalidatePermissionCache,
} from './permissionService.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  rolePermissions: {
    roleId: 'roleId',
    permissionId: 'permissionId',
    allowed: 'allowed',
  },
}))

describe('permissionService', () => {
  let mockSelect: any

  beforeEach(() => {
    vi.clearAllMocks()
    clearPermissionCache()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
  })

  describe('hasPermission', () => {
    it('should return true when role has permission', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      const result = await hasPermission(['member'], 'orders.view_internal')

      expect(result).toBe(true)
    })

    it('should return false when role does not have permission', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      const result = await hasPermission(['member'], 'admin.manage_users')

      expect(result).toBe(false)
    })

    it('should return false when permission is explicitly denied', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { permissionId: 'orders.post_internal', allowed: false },
      ])

      const result = await hasPermission(['applicant'], 'orders.post_internal')

      expect(result).toBe(false)
    })

    it('should return false for empty role list', async () => {
      const result = await hasPermission([], 'orders.view_internal')

      expect(result).toBe(false)
      expect(db.select).not.toHaveBeenCalled()
    })
  })

  describe('hasAllPermissions', () => {
    it('should return true when role has all permissions', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { permissionId: 'orders.view_internal', allowed: true },
        { permissionId: 'orders.post_internal', allowed: true },
      ])

      const result = await hasAllPermissions(['member'], ['orders.view_internal', 'orders.post_internal'])

      expect(result).toBe(true)
    })

    it('should return false when role is missing one permission', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      const result = await hasAllPermissions(['member'], ['orders.view_internal', 'orders.post_external'])

      expect(result).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('should return true when role has at least one permission', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      const result = await hasAnyPermission(['applicant'], ['orders.view_internal', 'orders.post_internal'])

      expect(result).toBe(true)
    })

    it('should return false when role has none of the permissions', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const result = await hasAnyPermission(['applicant'], ['admin.manage_users', 'admin.manage_roles'])

      expect(result).toBe(false)
    })
  })

  describe('permission aggregation across roles', () => {
    it('should grant permission if any role has it', async () => {
      mockSelect.where.mockResolvedValueOnce([
        // member role grants view_internal
        { permissionId: 'orders.view_internal', allowed: true },
        // lead role grants post_external
        { permissionId: 'orders.post_external', allowed: true },
      ])

      const permissions = await getPermissions(['member', 'lead'])

      expect(permissions.get('orders.view_internal')).toBe(true)
      expect(permissions.get('orders.post_external')).toBe(true)
    })

    it('should deny permission if any role explicitly denies it', async () => {
      mockSelect.where.mockResolvedValueOnce([
        // One role grants the permission
        { permissionId: 'orders.post_internal', allowed: true },
        // But another explicitly denies it
        { permissionId: 'orders.post_internal', allowed: false },
      ])

      const permissions = await getPermissions(['role1', 'role2'])

      expect(permissions.get('orders.post_internal')).toBe(false)
    })
  })

  describe('caching', () => {
    it('should cache permissions and not hit database on second call', async () => {
      mockSelect.where.mockResolvedValue([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      await hasPermission(['member'], 'orders.view_internal')
      await hasPermission(['member'], 'orders.view_internal')

      expect(db.select).toHaveBeenCalledTimes(1)
    })

    it('should use different cache entries for different role combinations', async () => {
      mockSelect.where.mockResolvedValue([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      await hasPermission(['member'], 'orders.view_internal')
      await hasPermission(['lead'], 'orders.view_internal')

      expect(db.select).toHaveBeenCalledTimes(2)
    })

    it('should use same cache for same roles in different order', async () => {
      mockSelect.where.mockResolvedValue([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      await hasPermission(['member', 'lead'], 'orders.view_internal')
      await hasPermission(['lead', 'member'], 'orders.view_internal')

      expect(db.select).toHaveBeenCalledTimes(1)
    })

    it('should clear cache when invalidatePermissionCache is called', async () => {
      mockSelect.where.mockResolvedValue([
        { permissionId: 'orders.view_internal', allowed: true },
      ])

      await hasPermission(['member'], 'orders.view_internal')
      invalidatePermissionCache()
      await hasPermission(['member'], 'orders.view_internal')

      expect(db.select).toHaveBeenCalledTimes(2)
    })
  })
})
