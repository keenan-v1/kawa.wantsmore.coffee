import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminController } from './AdminController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
  users: {
    id: 'id',
    username: 'username',
    email: 'email',
    displayName: 'displayName',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  userSettings: {
    userId: 'userId',
    fioUsername: 'fioUsername',
  },
  userRoles: {
    userId: 'userId',
    roleId: 'roleId',
  },
  roles: {
    id: 'id',
    name: 'name',
    color: 'color',
  },
  passwordResetTokens: {
    id: 'id',
    userId: 'userId',
    token: 'token',
    expiresAt: 'expiresAt',
    used: 'used',
  },
  fioInventory: {
    userId: 'userId',
    lastSyncedAt: 'lastSyncedAt',
  },
  fioUserStorage: {
    userId: 'userId',
    lastSyncedAt: 'lastSyncedAt',
  },
  permissions: {
    id: 'id',
    name: 'name',
    description: 'description',
  },
  rolePermissions: {
    id: 'id',
    roleId: 'roleId',
    permissionId: 'permissionId',
    allowed: 'allowed',
  },
}))

vi.mock('../utils/permissionService.js', () => ({
  invalidatePermissionCache: vi.fn(),
}))

// Note: Authorization (admin role check) is handled by TSOA's @Security decorator
// via expressAuthentication middleware, not by the controller methods themselves.

describe('AdminController', () => {
  let controller: AdminController
  let setStatusSpy: ReturnType<typeof vi.spyOn>

  const adminUser = { userId: 1, username: 'admin', roles: ['administrator'] }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AdminController()
    setStatusSpy = vi.spyOn(controller, 'setStatus')
  })

  describe('listUsers', () => {
    it('should return paginated list of users with FIO sync info', async () => {
      const mockUsers = [
        { id: 1, username: 'user1', email: 'user1@test.com', displayName: 'User 1', isActive: true, createdAt: new Date() },
        { id: 2, username: 'user2', email: null, displayName: 'User 2', isActive: false, createdAt: new Date() },
      ]
      const mockRoles = [{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }]
      const mockSettings = [{ fioUsername: 'fiouser' }]
      const mockLastSync = [{ lastSyncedAt: new Date() }]

      // Setup mock chain for count query
      const countMock = { where: vi.fn().mockResolvedValue([{ count: 2 }]) }
      // Setup mock chain for users query
      const usersMock = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockUsers),
      }
      // Setup mock for other queries (roles, settings, lastSync)
      // Use mockResolvedValue instead of mockResolvedValueOnce to handle Promise.all non-deterministic ordering
      // Each query type gets its own mock to avoid ordering issues
      let queryCount = 0
      const genericMock = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          queryCount++
          // Every 3rd query is roles (after innerJoin), then settings, then lastSync per user
          // But with Promise.all, order is non-deterministic, so return a combined mock
          // that works for any query type (controller only reads fields it needs)
          return Promise.resolve([{
            roleId: 'member', roleName: 'Member', roleColor: 'blue',
            fioUsername: 'fiouser',
            lastSyncedAt: new Date(),
          }])
        }),
      }

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce(countMock)
          .mockReturnValueOnce(usersMock)
          .mockReturnValue(genericMock),
      } as any)

      const result = await controller.listUsers(1, 20)

      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.users).toHaveLength(2)
      expect(result.users[0].fioSync.fioUsername).toBe('fiouser')
    })

    it('should support search filtering', async () => {
      const mockUsers = [
        { id: 1, username: 'searchuser', email: 'search@test.com', displayName: 'Search User', isActive: true, createdAt: new Date() },
      ]
      const mockRoles = [{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }]
      const mockSettings = [{ fioUsername: null }]
      const mockLastSync = [{ lastSyncedAt: null }]

      const countMock = { where: vi.fn().mockResolvedValue([{ count: 1 }]) }
      const usersMock = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockUsers),
      }
      const genericMock = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce(mockRoles)
          .mockResolvedValueOnce(mockSettings)
          .mockResolvedValueOnce(mockLastSync),
      }

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce(countMock)
          .mockReturnValueOnce(usersMock)
          .mockReturnValue(genericMock),
      } as any)

      const result = await controller.listUsers(1, 20, 'search')

      expect(result.total).toBe(1)
      expect(result.users).toHaveLength(1)
    })
  })

  describe('getUser', () => {
    it('should return a specific user with FIO sync info', async () => {
      const mockUser = {
        id: 5,
        username: 'testuser',
        email: 'test@test.com',
        displayName: 'Test User',
        isActive: true,
        createdAt: new Date(),
      }
      const mockRoles = [
        { roleId: 'member', roleName: 'Member', roleColor: 'blue' },
        { roleId: 'lead', roleName: 'Lead', roleColor: 'green' },
      ]
      const mockSettings = [{ fioUsername: 'fiouser' }]
      const mockLastSync = [{ lastSyncedAt: new Date() }]

      // getUser makes 4 queries: user, roles, settings, lastSync
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([mockUser])    // user query
          .mockResolvedValueOnce(mockRoles)     // roles query
          .mockResolvedValueOnce(mockSettings)  // settings query
          .mockResolvedValueOnce(mockLastSync), // lastSync query
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const result = await controller.getUser(5)

      expect(result.id).toBe(5)
      expect(result.username).toBe('testuser')
      expect(result.roles).toHaveLength(2)
      expect(result.roles[0]).toEqual({ id: 'member', name: 'Member', color: 'blue' })
      expect(result.fioSync.fioUsername).toBe('fiouser')
    })

    it('should return 404 when user not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.getUser(999)).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('updateUser', () => {
    it('should update user isActive status', async () => {
      const mockUser = { id: 5, username: 'testuser', email: null, displayName: 'Test', isActive: false, createdAt: new Date() }
      const mockRoles = [{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }]
      const mockSettings = [{ fioUsername: null }]
      const mockLastSync = [{ lastSyncedAt: null }]

      // updateUser: existence check, then getUser (user, roles, settings, lastSync)
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([{ id: 5 }])   // existence check
          .mockResolvedValueOnce([mockUser])    // getUser - user
          .mockResolvedValueOnce(mockRoles)     // getUser - roles
          .mockResolvedValueOnce(mockSettings)  // getUser - settings
          .mockResolvedValueOnce(mockLastSync), // getUser - lastSync
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(updateMock as any)

      const result = await controller.updateUser({ user: adminUser }, 5, { isActive: false })

      expect(db.update).toHaveBeenCalled()
      expect(updateMock.set).toHaveBeenCalledWith({
        isActive: false,
        updatedAt: expect.any(Date),
      })
      expect(result.id).toBe(5)
    })

    it('should update user roles', async () => {
      const mockUser = { id: 5, username: 'testuser', email: null, displayName: 'Test', isActive: true, createdAt: new Date() }
      const mockRoles = [{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }, { roleId: 'lead', roleName: 'Lead', roleColor: 'green' }]
      const mockSettings = [{ fioUsername: null }]
      const mockLastSync = [{ lastSyncedAt: null }]
      const validRoles = [{ id: 'applicant' }, { id: 'member' }, { id: 'lead' }, { id: 'administrator' }]

      // Existence check
      const existenceCheckMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 5 }]),
      }
      // Valid roles check
      const validRolesMock = {
        from: vi.fn().mockResolvedValue(validRoles),
      }
      // getUser queries (user, roles, settings, lastSync)
      const getUserMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce(mockRoles)
          .mockResolvedValueOnce(mockSettings)
          .mockResolvedValueOnce(mockLastSync),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(existenceCheckMock as any)
        .mockReturnValueOnce(validRolesMock as any)
        .mockReturnValue(getUserMock as any)

      const deleteMock = { where: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(db.delete).mockReturnValue(deleteMock as any)

      const insertMock = { values: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(db.insert).mockReturnValue(insertMock as any)

      const result = await controller.updateUser({ user: adminUser }, 5, { roles: ['member', 'lead'] })

      expect(db.delete).toHaveBeenCalled()
      expect(db.insert).toHaveBeenCalled()
      expect(insertMock.values).toHaveBeenCalledWith([
        { userId: 5, roleId: 'member' },
        { userId: 5, roleId: 'lead' },
      ])
    })

    it('should return 400 when updating own account', async () => {
      await expect(
        controller.updateUser({ user: adminUser }, 1, { isActive: false })
      ).rejects.toThrow('Cannot modify your own account through admin panel')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should return 404 when user not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.updateUser({ user: adminUser }, 999, { isActive: false })).rejects.toThrow(
        'User not found'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })

    it('should return 400 for invalid role IDs', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([{ id: 5 }]), // existence check
      }
      vi.mocked(db.select)
        .mockReturnValueOnce(selectMock as any)
        .mockReturnValueOnce({ from: vi.fn().mockResolvedValue([{ id: 'member' }]) } as any)

      await expect(
        controller.updateUser({ user: adminUser }, 5, { roles: ['member', 'fake-role'] })
      ).rejects.toThrow('Invalid role IDs: fake-role')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should return 400 when setting empty roles array', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([{ id: 5 }]), // existence check
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(
        controller.updateUser({ user: adminUser }, 5, { roles: [] })
      ).rejects.toThrow('Users must have at least one role')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })
  })

  describe('listRoles', () => {
    it('should return all available roles with color', async () => {
      const mockRoles = [
        { id: 'applicant', name: 'Applicant', color: 'blue-grey' },
        { id: 'member', name: 'Member', color: 'blue' },
        { id: 'administrator', name: 'Administrator', color: 'red' },
      ]

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue(mockRoles),
      } as any)

      const result = await controller.listRoles()

      expect(result).toHaveLength(3)
      expect(result).toEqual(mockRoles)
      expect(result[0].color).toBe('blue-grey')
    })
  })

  describe('updateRole', () => {
    it('should update a role name and color', async () => {
      const existingRole = { id: 'member', name: 'Member', color: 'blue' }
      const updatedRole = { id: 'member', name: 'Full Member', color: 'green' }

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([existingRole])
          .mockResolvedValueOnce([updatedRole]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(updateMock as any)

      const result = await controller.updateRole('member', { name: 'Full Member', color: 'green' })

      expect(db.update).toHaveBeenCalled()
      expect(updateMock.set).toHaveBeenCalledWith({
        name: 'Full Member',
        color: 'green',
        updatedAt: expect.any(Date),
      })
      expect(result).toEqual(updatedRole)
    })

    it('should update only color when name not provided', async () => {
      const existingRole = { id: 'member', name: 'Member', color: 'blue' }
      const updatedRole = { id: 'member', name: 'Member', color: 'purple' }

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([existingRole])
          .mockResolvedValueOnce([updatedRole]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(updateMock as any)

      const result = await controller.updateRole('member', { color: 'purple' })

      expect(updateMock.set).toHaveBeenCalledWith({
        color: 'purple',
        updatedAt: expect.any(Date),
      })
      expect(result.color).toBe('purple')
    })

    it('should return 404 when role not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.updateRole('nonexistent', { name: 'Test' })).rejects.toThrow('Role not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('generatePasswordResetLink', () => {
    it('should generate a password reset token for a user', async () => {
      const mockUser = { id: 5, username: 'testuser' }

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockUser]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const insertMock = { values: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(db.insert).mockReturnValue(insertMock as any)

      const result = await controller.generatePasswordResetLink(5)

      expect(result.username).toBe('testuser')
      expect(result.token).toBeDefined()
      expect(result.token.length).toBe(64) // 32 bytes hex encoded
      expect(result.expiresAt).toBeInstanceOf(Date)
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())

      expect(db.insert).toHaveBeenCalled()
      expect(insertMock.values).toHaveBeenCalledWith({
        userId: 5,
        token: expect.any(String),
        expiresAt: expect.any(Date),
        used: false,
      })
    })

    it('should return 404 when user not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.generatePasswordResetLink(999)).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })
})
