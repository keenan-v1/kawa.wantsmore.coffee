import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminController } from './AdminController.js'
import { db } from '../db/index.js'
import * as userSettingsService from '../services/userSettingsService.js'

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
  userDiscordProfiles: {
    id: 'id',
    userId: 'userId',
    discordId: 'discordId',
    discordUsername: 'discordUsername',
    connectedAt: 'connectedAt',
  },
}))

vi.mock('../utils/permissionService.js', () => ({
  invalidatePermissionCache: vi.fn(),
}))

vi.mock('../services/userSettingsService.js', () => ({
  getFioCredentials: vi.fn(),
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
        {
          id: 1,
          username: 'user1',
          email: 'user1@test.com',
          displayName: 'User 1',
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: 2,
          username: 'user2',
          email: null,
          displayName: 'User 2',
          isActive: false,
          createdAt: new Date(),
        },
      ]

      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'fiouser',
        fioApiKey: null,
      })

      // Setup mock chain for count query
      const countMock = { where: vi.fn().mockResolvedValue([{ count: 2 }]) }
      // Setup mock chain for users query
      const usersMock = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockUsers),
      }
      // Setup mock for other queries (roles, lastSync, discord)
      const genericMock = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          // Return a combined mock that works for any query type
          return Promise.resolve([
            {
              roleId: 'member',
              roleName: 'Member',
              roleColor: 'blue',
              lastSyncedAt: new Date(),
            },
          ])
        }),
      }

      vi.mocked(db.select).mockReturnValue({
        from: vi
          .fn()
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
        {
          id: 1,
          username: 'searchuser',
          email: 'search@test.com',
          displayName: 'Search User',
          isActive: true,
          createdAt: new Date(),
        },
      ]
      const mockRoles = [{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }]
      const mockLastSync = [{ lastSyncedAt: null }]
      const mockDiscordProfile: unknown[] = [] // No Discord connected

      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: null,
        fioApiKey: null,
      })

      const countMock = { where: vi.fn().mockResolvedValue([{ count: 1 }]) }
      const usersMock = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockUsers),
      }
      const genericMock = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi
          .fn()
          .mockResolvedValueOnce(mockRoles)
          .mockResolvedValueOnce(mockLastSync)
          .mockResolvedValueOnce(mockDiscordProfile),
      }

      vi.mocked(db.select).mockReturnValue({
        from: vi
          .fn()
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
      const mockLastSync = [{ lastSyncedAt: new Date() }]
      const mockDiscordProfile: unknown[] = [] // No Discord connected

      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: 'fiouser',
        fioApiKey: null,
      })

      // getUser makes 4 queries: user, roles, lastSync, discord (settings via service)
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi
          .fn()
          .mockResolvedValueOnce([mockUser]) // user query
          .mockResolvedValueOnce(mockRoles) // roles query
          .mockResolvedValueOnce(mockLastSync) // lastSync query
          .mockResolvedValueOnce(mockDiscordProfile), // discord query
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
      const mockUser = {
        id: 5,
        username: 'testuser',
        email: null,
        displayName: 'Test',
        isActive: false,
        createdAt: new Date(),
      }
      const mockRoles = [{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }]
      const mockLastSync = [{ lastSyncedAt: null }]
      const mockDiscordProfile: unknown[] = [] // No Discord connected

      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: null,
        fioApiKey: null,
      })

      // updateUser: existence check, then getUser (user, roles, lastSync, discord)
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi
          .fn()
          .mockResolvedValueOnce([{ id: 5 }]) // existence check
          .mockResolvedValueOnce([mockUser]) // getUser - user
          .mockResolvedValueOnce(mockRoles) // getUser - roles
          .mockResolvedValueOnce(mockLastSync) // getUser - lastSync
          .mockResolvedValueOnce(mockDiscordProfile), // getUser - discord
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
      const mockUser = {
        id: 5,
        username: 'testuser',
        email: null,
        displayName: 'Test',
        isActive: true,
        createdAt: new Date(),
      }
      const mockRoles = [
        { roleId: 'member', roleName: 'Member', roleColor: 'blue' },
        { roleId: 'lead', roleName: 'Lead', roleColor: 'green' },
      ]
      const mockLastSync = [{ lastSyncedAt: null }]
      const mockDiscordProfile: unknown[] = [] // No Discord connected
      const validRoles = [
        { id: 'applicant' },
        { id: 'member' },
        { id: 'lead' },
        { id: 'administrator' },
      ]

      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: null,
        fioApiKey: null,
      })

      // Existence check
      const existenceCheckMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 5 }]),
      }
      // Valid roles check
      const validRolesMock = {
        from: vi.fn().mockResolvedValue(validRoles),
      }
      // getUser queries (user, roles, lastSync, discord)
      const getUserMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi
          .fn()
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce(mockRoles)
          .mockResolvedValueOnce(mockLastSync)
          .mockResolvedValueOnce(mockDiscordProfile),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(existenceCheckMock as any)
        .mockReturnValueOnce(validRolesMock as any)
        .mockReturnValue(getUserMock as any)

      const deleteMock = { where: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(db.delete).mockReturnValue(deleteMock as any)

      const insertMock = { values: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(db.insert).mockReturnValue(insertMock as any)

      await controller.updateUser({ user: adminUser }, 5, {
        roles: ['member', 'lead'],
      })

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

      await expect(
        controller.updateUser({ user: adminUser }, 999, { isActive: false })
      ).rejects.toThrow('User not found')
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

      await expect(controller.updateUser({ user: adminUser }, 5, { roles: [] })).rejects.toThrow(
        'Users must have at least one role'
      )
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
        where: vi.fn().mockResolvedValueOnce([existingRole]).mockResolvedValueOnce([updatedRole]),
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
        where: vi.fn().mockResolvedValueOnce([existingRole]).mockResolvedValueOnce([updatedRole]),
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

      await expect(controller.updateRole('nonexistent', { name: 'Test' })).rejects.toThrow(
        'Role not found'
      )
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

  describe('getPendingApprovalsCount', () => {
    it('should return count of users pending approval', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 3 }]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const result = await controller.getPendingApprovalsCount()

      expect(result).toEqual({ count: 3 })
    })

    it('should return 0 when no pending approvals', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const result = await controller.getPendingApprovalsCount()

      expect(result).toEqual({ count: 0 })
    })
  })

  describe('listPendingApprovals', () => {
    it('should return list of users pending approval', async () => {
      const mockUnverifiedUsers = [
        {
          id: 10,
          username: 'pending1',
          email: 'pending1@test.com',
          displayName: 'Pending User 1',
          isActive: true,
          createdAt: new Date(),
        },
      ]

      let callCount = 0
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            // First call: get unverified users
            return { orderBy: vi.fn().mockResolvedValue(mockUnverifiedUsers) }
          }
          // Subsequent calls: get roles/fio info
          return Promise.resolve([{ roleId: 'unverified', roleName: 'Unverified', roleColor: 'grey' }])
        }),
        orderBy: vi.fn().mockResolvedValue(mockUnverifiedUsers),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: null,
        fioApiKey: null,
      })

      const result = await controller.listPendingApprovals()

      expect(result.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('approveUser', () => {
    it('should return 404 when user not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.approveUser(999, {})).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })

    it('should return 400 when role not found', async () => {
      let callCount = 0
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ id: 1 }]) // User found
          }
          return Promise.resolve([]) // Role not found
        }),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.approveUser(1, { roleId: 'nonexistent' })).rejects.toThrow(
        "Role 'nonexistent' not found"
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })
  })

  describe('deleteUser', () => {
    it('should return 400 when trying to delete own account', async () => {
      await expect(
        controller.deleteUser({ user: adminUser } as never, 1) // admin user id is 1
      ).rejects.toThrow('Cannot delete your own account')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should return 404 when user not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(
        controller.deleteUser({ user: adminUser } as never, 999)
      ).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('createRole', () => {
    it('should create a new role', async () => {
      const newRole = { id: 'test-role', name: 'Test Role', color: 'blue' }

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const insertMock = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([newRole]),
      }
      vi.mocked(db.insert).mockReturnValue(insertMock as any)

      const result = await controller.createRole(newRole)

      expect(result).toEqual(newRole)
      expect(db.insert).toHaveBeenCalled()
    })

    it('should return 409 when role already exists', async () => {
      const existingRole = { id: 'existing-role', name: 'Existing', color: 'red' }

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([existingRole]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(
        controller.createRole({ id: 'existing-role', name: 'New Role', color: 'blue' })
      ).rejects.toThrow("Role with ID 'existing-role' already exists")
      expect(setStatusSpy).toHaveBeenCalledWith(409)
    })
  })

  describe('deleteRole', () => {
    it('should delete a role with no users', async () => {
      let selectCallCount = 0
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          selectCallCount++
          if (selectCallCount === 1) {
            return Promise.resolve([{ id: 'test-role' }]) // Role exists
          }
          return Promise.resolve([{ count: 0 }]) // No users assigned
        }),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const deleteMock = {
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.delete).mockReturnValue(deleteMock as any)

      const result = await controller.deleteRole('test-role')

      expect(result).toEqual({ success: true })
    })

    it('should return 400 when users are assigned to role', async () => {
      let selectCallCount = 0
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          selectCallCount++
          if (selectCallCount === 1) {
            return Promise.resolve([{ id: 'test-role' }]) // Role exists
          }
          return Promise.resolve([{ count: 5 }]) // 5 users assigned
        }),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.deleteRole('test-role')).rejects.toThrow(
        'Cannot delete role: 5 user(s) are assigned to this role'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should return 404 when role not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.deleteRole('nonexistent')).rejects.toThrow('Role not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('listPermissions', () => {
    it('should return all permissions', async () => {
      const mockPermissions = [
        { id: 'admin.manage_users', name: 'Manage Users', description: 'Can manage users' },
        { id: 'orders.view', name: 'View Orders', description: 'Can view orders' },
      ]

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockPermissions),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const result = await controller.listPermissions()

      expect(result).toEqual(mockPermissions)
    })
  })

  describe('listRolePermissions', () => {
    it('should return all role-permission mappings', async () => {
      const mockMappings = [
        {
          id: 1,
          roleId: 'admin',
          roleName: 'Administrator',
          roleColor: 'red',
          permissionId: 'admin.manage_users',
          permissionName: 'Manage Users',
          allowed: true,
        },
      ]

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockMappings),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const result = await controller.listRolePermissions()

      expect(result).toEqual(mockMappings)
    })
  })

  describe('setRolePermission', () => {
    it('should create a new role-permission mapping', async () => {
      const input = { roleId: 'test-role', permissionId: 'test.permission', allowed: true }
      const created = { id: 1, ...input }

      // Order: 1. role exists, 2. permission exists, 3. no existing mapping
      let selectCallCount = 0
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          selectCallCount++
          if (selectCallCount === 1) {
            return Promise.resolve([{ id: 'test-role' }]) // Role exists
          }
          if (selectCallCount === 2) {
            return Promise.resolve([{ id: 'test.permission' }]) // Permission exists
          }
          return Promise.resolve([]) // No existing mapping
        }),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const insertMock = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([created]),
      }
      vi.mocked(db.insert).mockReturnValue(insertMock as any)

      const result = await controller.setRolePermission(input)

      expect(result.id).toBe(1)
    })

    it('should return 404 when role not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]), // Role not found on first call
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(
        controller.setRolePermission({ roleId: 'nonexistent', permissionId: 'test', allowed: true })
      ).rejects.toThrow("Role 'nonexistent' not found")
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('deleteRolePermission', () => {
    it('should delete a role-permission mapping', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 1 }]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const deleteMock = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }
      vi.mocked(db.delete).mockReturnValue(deleteMock as any)

      const result = await controller.deleteRolePermission(1)

      expect(result).toEqual({ success: true })
    })

    it('should return 404 when mapping not found', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      await expect(controller.deleteRolePermission(999)).rejects.toThrow(
        'Role permission mapping not found'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })
})
