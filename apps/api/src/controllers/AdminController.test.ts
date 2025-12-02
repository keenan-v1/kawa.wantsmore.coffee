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
    it('should return paginated list of users', async () => {
      const mockUsers = [
        { id: 1, username: 'user1', email: 'user1@test.com', displayName: 'User 1', isActive: true, createdAt: new Date() },
        { id: 2, username: 'user2', email: null, displayName: 'User 2', isActive: false, createdAt: new Date() },
      ]
      const mockRoles = [{ roleId: 'member', roleName: 'Member' }]

      // Setup mock chain for count query
      const countMock = { where: vi.fn().mockResolvedValue([{ count: 2 }]) }
      // Setup mock chain for users query
      const usersMock = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockUsers),
      }
      // Setup mock chain for roles queries
      const rolesMock = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockRoles),
      }

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce(countMock)
          .mockReturnValueOnce(usersMock)
          .mockReturnValue(rolesMock),
      } as any)

      const result = await controller.listUsers(1, 20)

      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.users).toHaveLength(2)
    })

    it('should support search filtering', async () => {
      const mockUsers = [
        { id: 1, username: 'searchuser', email: 'search@test.com', displayName: 'Search User', isActive: true, createdAt: new Date() },
      ]
      const mockRoles = [{ roleId: 'member', roleName: 'Member' }]

      const countMock = { where: vi.fn().mockResolvedValue([{ count: 1 }]) }
      const usersMock = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockUsers),
      }
      const rolesMock = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockRoles),
      }

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce(countMock)
          .mockReturnValueOnce(usersMock)
          .mockReturnValue(rolesMock),
      } as any)

      const result = await controller.listUsers(1, 20, 'search')

      expect(result.total).toBe(1)
      expect(result.users).toHaveLength(1)
    })
  })

  describe('getUser', () => {
    it('should return a specific user', async () => {
      const mockUser = {
        id: 5,
        username: 'testuser',
        email: 'test@test.com',
        displayName: 'Test User',
        isActive: true,
        createdAt: new Date(),
      }
      const mockRoles = [
        { roleId: 'member', roleName: 'Member' },
        { roleId: 'lead', roleName: 'Lead' },
      ]

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce(mockRoles),
      }
      vi.mocked(db.select).mockReturnValue(selectMock as any)

      const result = await controller.getUser(5)

      expect(result.id).toBe(5)
      expect(result.username).toBe('testuser')
      expect(result.roles).toHaveLength(2)
      expect(result.roles[0]).toEqual({ id: 'member', name: 'Member' })
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
      const mockRoles = [{ roleId: 'member', roleName: 'Member' }]

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([{ id: 5 }]) // existence check
          .mockResolvedValueOnce([mockUser]) // getUser
          .mockResolvedValueOnce(mockRoles), // getUser roles
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
      const mockRoles = [{ roleId: 'member', roleName: 'Member' }, { roleId: 'lead', roleName: 'Lead' }]
      const validRoles = [{ id: 'applicant' }, { id: 'member' }, { id: 'lead' }, { id: 'administrator' }]

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([{ id: 5 }]) // existence check
          .mockResolvedValueOnce([mockUser]) // getUser
          .mockResolvedValueOnce(mockRoles), // getUser roles
      }
      // First call for existence check, second for valid roles, rest for getUser
      vi.mocked(db.select)
        .mockReturnValueOnce(selectMock as any)
        .mockReturnValueOnce({ from: vi.fn().mockResolvedValue(validRoles) } as any)
        .mockReturnValue(selectMock as any)

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
    it('should return all available roles', async () => {
      const mockRoles = [
        { id: 'applicant', name: 'Applicant' },
        { id: 'member', name: 'Member' },
        { id: 'administrator', name: 'Administrator' },
      ]

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue(mockRoles),
      } as any)

      const result = await controller.listRoles()

      expect(result).toHaveLength(3)
      expect(result).toEqual(mockRoles)
    })
  })
})
