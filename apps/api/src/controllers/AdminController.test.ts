import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminController } from './AdminController.js'
import { db } from '../db/index.js'

/**
 * Create a chainable mock that supports subquery patterns.
 * This handles complex query chains like:
 *   db.select().from().innerJoin().groupBy().as() -> subquery
 *   db.select().from().leftJoin(subquery).where().orderBy()... -> results
 */
function createSubqueryMock(aliasFields: Record<string, string>) {
  return {
    ...aliasFields,
    // Make it usable as a subquery reference
    _isSubquery: true,
  }
}

function createQueryChain(finalResult: unknown, subqueryFields?: Record<string, string>) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockImplementation(() => finalResult),
    as: vi
      .fn()
      .mockImplementation((alias: string) =>
        createSubqueryMock(subqueryFields || { [alias]: alias })
      ),
    then: vi.fn().mockImplementation(cb => Promise.resolve(finalResult).then(cb)),
  }
  // Make it thenable for await
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' })
  return chain
}

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
  userSettings: {
    userId: 'userId',
    settingKey: 'settingKey',
    value: 'value',
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
      // Results from main query with JOINs
      const mockUsersWithDetails = [
        {
          id: 1,
          username: 'user1',
          email: 'user1@test.com',
          displayName: 'User 1',
          isActive: true,
          createdAt: new Date(),
          rolesJson: JSON.stringify([{ id: 'member', name: 'Member', color: 'blue' }]),
          lastSyncedAt: new Date(),
          fioUsernameRaw: '"fiouser"',
          discordId: null,
          discordUsername: null,
          discordConnectedAt: null,
        },
        {
          id: 2,
          username: 'user2',
          email: null,
          displayName: 'User 2',
          isActive: false,
          createdAt: new Date(),
          rolesJson: JSON.stringify([{ id: 'member', name: 'Member', color: 'blue' }]),
          lastSyncedAt: null,
          fioUsernameRaw: null,
          discordId: null,
          discordUsername: null,
          discordConnectedAt: null,
        },
      ]

      // Count query mock
      const countMock = { where: vi.fn().mockResolvedValue([{ count: 2 }]) }

      // Subquery mocks (for roles, fio sync, fio username)
      const subqueryMock = createQueryChain([], { userId: 'userId', rolesJson: 'rolesJson' })

      // Main query mock with all JOINs
      const mainQueryMock = createQueryChain(mockUsersWithDetails)

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          // Count query
          return { from: vi.fn().mockReturnValue(countMock) } as any
        } else if (selectCallCount <= 4) {
          // Subqueries (roles, fio sync, fio username)
          return subqueryMock as any
        } else {
          // Main query with JOINs
          return mainQueryMock as any
        }
      })

      const result = await controller.listUsers(1, 20)

      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.users).toHaveLength(2)
      expect(result.users[0].fioSync.fioUsername).toBe('fiouser')
    })

    it('should support search filtering', async () => {
      const mockUsersWithDetails = [
        {
          id: 1,
          username: 'searchuser',
          email: 'search@test.com',
          displayName: 'Search User',
          isActive: true,
          createdAt: new Date(),
          rolesJson: JSON.stringify([{ id: 'member', name: 'Member', color: 'blue' }]),
          lastSyncedAt: null,
          fioUsernameRaw: null,
          discordId: null,
          discordUsername: null,
          discordConnectedAt: null,
        },
      ]

      const countMock = { where: vi.fn().mockResolvedValue([{ count: 1 }]) }
      const subqueryMock = createQueryChain([], { userId: 'userId' })
      const mainQueryMock = createQueryChain(mockUsersWithDetails)

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          return { from: vi.fn().mockReturnValue(countMock) } as any
        } else if (selectCallCount <= 4) {
          return subqueryMock as any
        } else {
          return mainQueryMock as any
        }
      })

      const result = await controller.listUsers(1, 20, 'search')

      expect(result.total).toBe(1)
      expect(result.users).toHaveLength(1)
    })
  })

  describe('getUser', () => {
    it('should return a specific user with FIO sync info', async () => {
      const mockUserWithDetails = {
        id: 5,
        username: 'testuser',
        email: 'test@test.com',
        displayName: 'Test User',
        isActive: true,
        createdAt: new Date(),
        rolesJson: JSON.stringify([
          { id: 'member', name: 'Member', color: 'blue' },
          { id: 'lead', name: 'Lead', color: 'green' },
        ]),
        lastSyncedAt: new Date(),
        fioUsernameRaw: '"fiouser"',
        discordId: null,
        discordUsername: null,
        discordConnectedAt: null,
      }

      // getUser uses subqueries and a single main query with JOINs
      const subqueryMock = createQueryChain([], { userId: 'userId' })
      const mainQueryMock = createQueryChain([mockUserWithDetails])

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount <= 3) {
          // Subqueries (roles, fio sync, fio username)
          return subqueryMock as any
        } else {
          // Main query with JOINs
          return mainQueryMock as any
        }
      })

      const result = await controller.getUser(5)

      expect(result.id).toBe(5)
      expect(result.username).toBe('testuser')
      expect(result.roles).toHaveLength(2)
      expect(result.roles[0]).toEqual({ id: 'member', name: 'Member', color: 'blue' })
      expect(result.fioSync.fioUsername).toBe('fiouser')
    })

    it('should return 404 when user not found', async () => {
      const subqueryMock = createQueryChain([], { userId: 'userId' })
      const mainQueryMock = createQueryChain([]) // Empty - no user found

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount <= 3) {
          return subqueryMock as any
        } else {
          return mainQueryMock as any
        }
      })

      await expect(controller.getUser(999)).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('updateUser', () => {
    it('should update user isActive status', async () => {
      const mockUserWithDetails = {
        id: 5,
        username: 'testuser',
        email: null,
        displayName: 'Test',
        isActive: false,
        createdAt: new Date(),
        rolesJson: JSON.stringify([{ id: 'member', name: 'Member', color: 'blue' }]),
        lastSyncedAt: null,
        fioUsernameRaw: null,
        discordId: null,
        discordUsername: null,
        discordConnectedAt: null,
      }

      // Existence check mock
      const existenceCheckMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 5 }]),
      }

      // Subquery and main query mocks for getUser
      const subqueryMock = createQueryChain([], { userId: 'userId' })
      const mainQueryMock = createQueryChain([mockUserWithDetails])

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          // Existence check
          return existenceCheckMock as any
        } else if (selectCallCount <= 4) {
          // Subqueries for getUser
          return subqueryMock as any
        } else {
          // Main query for getUser
          return mainQueryMock as any
        }
      })

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
      const mockUserWithDetails = {
        id: 5,
        username: 'testuser',
        email: null,
        displayName: 'Test',
        isActive: true,
        createdAt: new Date(),
        rolesJson: JSON.stringify([
          { id: 'member', name: 'Member', color: 'blue' },
          { id: 'lead', name: 'Lead', color: 'green' },
        ]),
        lastSyncedAt: null,
        fioUsernameRaw: null,
        discordId: null,
        discordUsername: null,
        discordConnectedAt: null,
      }
      const validRoles = [
        { id: 'applicant' },
        { id: 'member' },
        { id: 'lead' },
        { id: 'administrator' },
      ]

      // Existence check mock
      const existenceCheckMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 5 }]),
      }
      // Valid roles check
      const validRolesMock = {
        from: vi.fn().mockResolvedValue(validRoles),
      }
      // Subquery and main query mocks for getUser
      const subqueryMock = createQueryChain([], { userId: 'userId' })
      const mainQueryMock = createQueryChain([mockUserWithDetails])

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          // Existence check
          return existenceCheckMock as any
        } else if (selectCallCount === 2) {
          // Valid roles check
          return validRolesMock as any
        } else if (selectCallCount <= 5) {
          // Subqueries for getUser
          return subqueryMock as any
        } else {
          // Main query for getUser
          return mainQueryMock as any
        }
      })

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
})
