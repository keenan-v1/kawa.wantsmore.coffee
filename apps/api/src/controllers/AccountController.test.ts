import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccountController } from './AccountController.js'
import { db } from '../db/index.js'
import * as passwordUtils from '../utils/password.js'
import * as permissionService from '../utils/permissionService.js'

vi.mock('../utils/permissionService.js', () => ({
  getPermissions: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  users: {
    id: 'id',
    username: 'username',
    displayName: 'displayName',
    email: 'email',
    passwordHash: 'passwordHash',
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
}))

vi.mock('../utils/password.js', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))

// Mock the userSettingsService (now used for FIO credentials)
vi.mock('../services/userSettingsService.js', () => ({
  getFioCredentials: vi.fn(),
  hasFioCredentials: vi.fn(),
}))

describe('AccountController', () => {
  let controller: AccountController
  let mockSelect: any
  let mockUpdate: any

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AccountController()
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    }
    mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.update).mockReturnValue(mockUpdate)
    // Default mock for permissions
    vi.mocked(permissionService.getPermissions).mockResolvedValue(
      new Map([
        ['orders.view_internal', true],
        ['orders.post_internal', true],
      ])
    )
  })

  describe('getProfile', () => {
    it('should return user profile with roles and permissions', async () => {
      const mockUser = {
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
      }
      const mockRoles = [
        { roleId: 'member', roleName: 'Member', roleColor: 'blue' },
        { roleId: 'lead', roleName: 'Lead', roleColor: 'green' },
      ]

      // Mock first query (user)
      mockSelect.where
        .mockResolvedValueOnce([mockUser])
        // Mock second query (roles)
        .mockResolvedValueOnce(mockRoles)

      const request = { user: { userId: 1, username: 'testuser', roles: [] } }
      const result = await controller.getProfile(request)

      // FIO credentials are now in user settings, not in profile response
      expect(result).toEqual({
        profileName: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: [
          { id: 'member', name: 'Member', color: 'blue' },
          { id: 'lead', name: 'Lead', color: 'green' },
        ],
        permissions: ['orders.view_internal', 'orders.post_internal'],
      })
      expect(db.select).toHaveBeenCalledTimes(2)
      expect(permissionService.getPermissions).toHaveBeenCalledWith(['member', 'lead'])
    })

    it('should handle user with no roles', async () => {
      const mockUser = {
        username: 'newuser',
        displayName: 'New User',
        email: null,
      }

      mockSelect.where.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([])
      // No roles means empty permissions
      vi.mocked(permissionService.getPermissions).mockResolvedValueOnce(new Map())

      const request = { user: { userId: 2, username: 'newuser', roles: [] } }
      const result = await controller.getProfile(request)

      expect(result).toEqual({
        profileName: 'newuser',
        displayName: 'New User',
        email: null,
        roles: [],
        permissions: [],
      })
    })

    it('should throw 404 when user not found', async () => {
      mockSelect.where.mockResolvedValueOnce([])
      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const request = { user: { userId: 999, username: 'ghost', roles: [] } }

      await expect(controller.getProfile(request)).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('updateProfile', () => {
    const mockProfileData = {
      username: 'testuser',
      displayName: 'Updated Name',
      email: 'test@example.com',
    }

    beforeEach(() => {
      // Mock getProfile call that happens at the end
      mockSelect.where
        .mockResolvedValueOnce([mockProfileData])
        .mockResolvedValueOnce([{ roleId: 'member', roleName: 'Member', roleColor: 'blue' }])
    })

    it('should update displayName in users table', async () => {
      const request = { user: { userId: 1, username: 'testuser', roles: [] } }
      const body = { displayName: 'Updated Name' }

      await controller.updateProfile(body, request)

      expect(db.update).toHaveBeenCalled()
      expect(mockUpdate.set).toHaveBeenCalledWith({
        displayName: 'Updated Name',
        updatedAt: expect.any(Date),
      })
      expect(mockUpdate.where).toHaveBeenCalled()
    })

    it('should handle empty update request', async () => {
      const request = { user: { userId: 1, username: 'testuser', roles: [] } }
      const body = {}

      const result = await controller.updateProfile(body, request)

      // Should not call update at all, just return current profile
      expect(db.update).not.toHaveBeenCalled()
      expect(result.displayName).toBe('Updated Name')
    })

    it('should return updated profile', async () => {
      const request = { user: { userId: 1, username: 'testuser', roles: [] } }
      const body = { displayName: 'Updated Name' }

      const result = await controller.updateProfile(body, request)

      expect(result.profileName).toBe('testuser')
      expect(result.displayName).toBe('Updated Name')
    })
  })

  describe('changePassword', () => {
    it('should change password when current password is correct', async () => {
      mockSelect.where.mockResolvedValueOnce([{ passwordHash: 'old-hash' }])
      vi.mocked(passwordUtils.verifyPassword).mockResolvedValue(true)
      vi.mocked(passwordUtils.hashPassword).mockResolvedValue('new-hash')

      const request = { user: { userId: 1, username: 'testuser', roles: [] } }
      const body = {
        currentPassword: 'oldpass123',
        newPassword: 'newpass456',
      }

      const result = await controller.changePassword(body, request)

      expect(result).toEqual({ success: true })
      expect(passwordUtils.verifyPassword).toHaveBeenCalledWith('oldpass123', 'old-hash')
      expect(passwordUtils.hashPassword).toHaveBeenCalledWith('newpass456')
      expect(mockUpdate.set).toHaveBeenCalledWith({
        passwordHash: 'new-hash',
        updatedAt: expect.any(Date),
      })
    })

    it('should throw 400 when current password is incorrect', async () => {
      vi.clearAllMocks() // Clear previous test mocks
      mockSelect.where.mockResolvedValueOnce([{ passwordHash: 'old-hash' }])
      vi.mocked(passwordUtils.verifyPassword).mockResolvedValueOnce(false)
      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const request = { user: { userId: 1, username: 'testuser', roles: [] } }
      const body = {
        currentPassword: 'wrongpass',
        newPassword: 'newpass456',
      }

      await expect(controller.changePassword(body, request)).rejects.toThrow(
        'Current password is incorrect'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
      expect(passwordUtils.hashPassword).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })

    it('should throw 404 when user not found', async () => {
      vi.clearAllMocks() // Clear previous test mocks
      mockSelect.where.mockResolvedValueOnce([])
      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const request = { user: { userId: 999, username: 'ghost', roles: [] } }
      const body = {
        currentPassword: 'pass123',
        newPassword: 'newpass456',
      }

      await expect(controller.changePassword(body, request)).rejects.toThrow('User not found')
      expect(setStatusSpy).toHaveBeenCalledWith(404)
      expect(passwordUtils.verifyPassword).not.toHaveBeenCalled()
    })
  })
})
