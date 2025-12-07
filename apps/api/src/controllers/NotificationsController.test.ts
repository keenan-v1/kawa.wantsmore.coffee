import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationsController } from './NotificationsController.js'
import { notificationService } from '../services/notificationService.js'
import type { Notification } from '@kawakawa/types'

vi.mock('../services/notificationService.js', () => ({
  notificationService: {
    getForUser: vi.fn(),
    getUnreadCount: vi.fn(),
    getById: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    remove: vi.fn(),
  },
}))

describe('NotificationsController', () => {
  let controller: NotificationsController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new NotificationsController()
  })

  const mockNotification: Notification = {
    id: 1,
    type: 'reservation_placed',
    title: 'New reservation',
    message: 'Someone reserved from your order',
    data: { orderId: 123 },
    isRead: false,
    createdAt: '2024-01-01T00:00:00.000Z',
  }

  describe('getNotifications', () => {
    it('should return notifications for the user with default params', async () => {
      vi.mocked(notificationService.getForUser).mockResolvedValue([mockNotification])

      const result = await controller.getNotifications(mockRequest)

      expect(notificationService.getForUser).toHaveBeenCalledWith(1, {
        limit: 50,
        offset: 0,
        unreadOnly: false,
      })
      expect(result).toEqual([mockNotification])
    })

    it('should pass custom params to service', async () => {
      vi.mocked(notificationService.getForUser).mockResolvedValue([])

      await controller.getNotifications(mockRequest, 10, 5, true)

      expect(notificationService.getForUser).toHaveBeenCalledWith(1, {
        limit: 10,
        offset: 5,
        unreadOnly: true,
      })
    })

    it('should return empty array when no notifications', async () => {
      vi.mocked(notificationService.getForUser).mockResolvedValue([])

      const result = await controller.getNotifications(mockRequest)

      expect(result).toEqual([])
    })
  })

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(5)

      const result = await controller.getUnreadCount(mockRequest)

      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(1)
      expect(result).toEqual({ count: 5 })
    })

    it('should return zero when no unread notifications', async () => {
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(0)

      const result = await controller.getUnreadCount(mockRequest)

      expect(result).toEqual({ count: 0 })
    })
  })

  describe('getNotification', () => {
    it('should return a single notification by ID', async () => {
      vi.mocked(notificationService.getById).mockResolvedValue(mockNotification)

      const result = await controller.getNotification(1, mockRequest)

      expect(notificationService.getById).toHaveBeenCalledWith(1, 1)
      expect(result).toEqual(mockNotification)
    })

    it('should throw NotFound when notification does not exist', async () => {
      vi.mocked(notificationService.getById).mockResolvedValue(null)

      await expect(controller.getNotification(999, mockRequest)).rejects.toThrow(
        'Notification not found'
      )
    })
  })

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      vi.mocked(notificationService.markAsRead).mockResolvedValue(true)

      await controller.markAsRead(1, mockRequest)

      expect(notificationService.markAsRead).toHaveBeenCalledWith(1, 1)
    })

    it('should throw NotFound when notification does not exist', async () => {
      vi.mocked(notificationService.markAsRead).mockResolvedValue(false)

      await expect(controller.markAsRead(999, mockRequest)).rejects.toThrow(
        'Notification not found'
      )
    })
  })

  describe('markAllAsRead', () => {
    it('should mark all notifications as read and return count', async () => {
      vi.mocked(notificationService.markAllAsRead).mockResolvedValue(3)

      const result = await controller.markAllAsRead(mockRequest)

      expect(notificationService.markAllAsRead).toHaveBeenCalledWith(1)
      expect(result).toEqual({ count: 3 })
    })

    it('should return zero when no unread notifications', async () => {
      vi.mocked(notificationService.markAllAsRead).mockResolvedValue(0)

      const result = await controller.markAllAsRead(mockRequest)

      expect(result).toEqual({ count: 0 })
    })
  })

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      vi.mocked(notificationService.remove).mockResolvedValue(true)

      await controller.deleteNotification(1, mockRequest)

      expect(notificationService.remove).toHaveBeenCalledWith(1, 1)
    })

    it('should throw NotFound when notification does not exist', async () => {
      vi.mocked(notificationService.remove).mockResolvedValue(false)

      await expect(controller.deleteNotification(999, mockRequest)).rejects.toThrow(
        'Notification not found'
      )
    })
  })
})
