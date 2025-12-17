import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  create,
  createForMany,
  getForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  remove,
  getById,
  notificationService,
} from './notificationService.js'

// Mock database
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()
const mockSelectWhere = vi.fn()
const mockSelectOrderBy = vi.fn()
const mockSelectLimit = vi.fn()
const mockSelectOffset = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockUpdateReturning = vi.fn()
const mockDeleteWhere = vi.fn()
const mockDeleteReturning = vi.fn()

// Create a thenable mock that can be both awaited and chained
function createThenableSelectWhere() {
  const chainable = {
    orderBy: mockSelectOrderBy.mockReturnValue({
      limit: mockSelectLimit.mockReturnValue({
        offset: mockSelectOffset,
      }),
    }),
    // Make it thenable so it can be awaited directly
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
      return mockSelectWhere().then(resolve, reject)
    },
  }
  return chainable
}

vi.mock('../db/index.js', () => ({
  db: {
    insert: () => ({
      values: mockInsertValues.mockReturnValue({
        returning: mockInsertReturning,
      }),
    }),
    select: () => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => createThenableSelectWhere()),
      }),
    }),
    update: () => ({
      set: mockUpdateSet.mockReturnValue({
        where: mockUpdateWhere.mockReturnValue({
          returning: mockUpdateReturning,
        }),
      }),
    }),
    delete: () => ({
      where: mockDeleteWhere.mockReturnValue({
        returning: mockDeleteReturning,
      }),
    }),
  },
  notifications: {
    id: 'id',
    userId: 'userId',
    type: 'type',
    title: 'title',
    message: 'message',
    data: 'data',
    isRead: 'isRead',
    createdAt: 'createdAt',
  },
}))

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a notification', async () => {
      const mockNotification = {
        id: 1,
        userId: 42,
        type: 'order_reserved',
        title: 'Order Reserved',
        message: 'Your order was reserved',
        data: { orderId: 123 },
        isRead: false,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      }
      mockInsertReturning.mockResolvedValue([mockNotification])

      const result = await create(42, 'order_reserved', 'Order Reserved', 'Your order was reserved', {
        orderId: 123,
      })

      expect(result).toEqual({
        id: 1,
        type: 'order_reserved',
        title: 'Order Reserved',
        message: 'Your order was reserved',
        data: { orderId: 123 },
        isRead: false,
        createdAt: '2024-01-15T10:00:00.000Z',
      })
    })

    it('should create notification without message', async () => {
      const mockNotification = {
        id: 1,
        userId: 42,
        type: 'system',
        title: 'System Notice',
        message: null,
        data: null,
        isRead: false,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      }
      mockInsertReturning.mockResolvedValue([mockNotification])

      const result = await create(42, 'system', 'System Notice')

      expect(result.message).toBeNull()
      expect(result.data).toBeNull()
    })
  })

  describe('createForMany', () => {
    it('should create notifications for multiple users', async () => {
      mockInsertValues.mockReturnValue({ returning: vi.fn() })

      await createForMany([1, 2, 3], 'announcement', 'New Feature', 'Check out new feature')

      expect(mockInsertValues).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 1, type: 'announcement', title: 'New Feature' }),
        expect.objectContaining({ userId: 2, type: 'announcement', title: 'New Feature' }),
        expect.objectContaining({ userId: 3, type: 'announcement', title: 'New Feature' }),
      ])
    })

    it('should do nothing for empty user list', async () => {
      await createForMany([], 'announcement', 'Test')

      expect(mockInsertValues).not.toHaveBeenCalled()
    })
  })

  describe('getForUser', () => {
    it('should get notifications for user', async () => {
      const mockRows = [
        {
          id: 1,
          type: 'order_reserved',
          title: 'Order Reserved',
          message: 'Message 1',
          data: { key: 'value' },
          isRead: false,
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 2,
          type: 'system',
          title: 'System Notice',
          message: null,
          data: null,
          isRead: true,
          createdAt: new Date('2024-01-14T10:00:00Z'),
        },
      ]
      mockSelectOffset.mockResolvedValue(mockRows)

      const result = await getForUser(42)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(2)
    })

    it('should apply limit and offset', async () => {
      mockSelectOffset.mockResolvedValue([])

      await getForUser(42, { limit: 10, offset: 5 })

      expect(mockSelectLimit).toHaveBeenCalledWith(10)
      expect(mockSelectOffset).toHaveBeenCalledWith(5)
    })

    it('should filter unread only', async () => {
      mockSelectOffset.mockResolvedValue([])

      // Just verify the function runs with unreadOnly option
      const result = await getForUser(42, { unreadOnly: true })

      expect(result).toEqual([])
    })
  })

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockSelectWhere.mockResolvedValue([{ count: 5 }])

      const result = await getUnreadCount(42)

      expect(result).toBe(5)
    })

    it('should return 0 when no result', async () => {
      mockSelectWhere.mockResolvedValue([])

      const result = await getUnreadCount(42)

      expect(result).toBe(0)
    })
  })

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockUpdateReturning.mockResolvedValue([{ id: 1 }])

      const result = await markAsRead(1, 42)

      expect(result).toBe(true)
    })

    it('should return false when notification not found', async () => {
      mockUpdateReturning.mockResolvedValue([])

      const result = await markAsRead(999, 42)

      expect(result).toBe(false)
    })
  })

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockUpdateReturning.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])

      const result = await markAllAsRead(42)

      expect(result).toBe(3)
    })

    it('should return 0 when no unread notifications', async () => {
      mockUpdateReturning.mockResolvedValue([])

      const result = await markAllAsRead(42)

      expect(result).toBe(0)
    })
  })

  describe('remove', () => {
    it('should delete notification', async () => {
      mockDeleteReturning.mockResolvedValue([{ id: 1 }])

      const result = await remove(1, 42)

      expect(result).toBe(true)
    })

    it('should return false when notification not found', async () => {
      mockDeleteReturning.mockResolvedValue([])

      const result = await remove(999, 42)

      expect(result).toBe(false)
    })
  })

  describe('getById', () => {
    it('should return notification by id', async () => {
      const mockRow = {
        id: 1,
        type: 'order_reserved',
        title: 'Order Reserved',
        message: 'Your order was reserved',
        data: { orderId: 123 },
        isRead: false,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      }
      mockSelectWhere.mockResolvedValue([mockRow])

      const result = await getById(1, 42)

      expect(result).toEqual({
        id: 1,
        type: 'order_reserved',
        title: 'Order Reserved',
        message: 'Your order was reserved',
        data: { orderId: 123 },
        isRead: false,
        createdAt: '2024-01-15T10:00:00.000Z',
      })
    })

    it('should return null when not found', async () => {
      mockSelectWhere.mockResolvedValue([])

      const result = await getById(999, 42)

      expect(result).toBeNull()
    })
  })

  describe('notificationService namespace', () => {
    it('should export all functions', () => {
      expect(notificationService.create).toBe(create)
      expect(notificationService.createForMany).toBe(createForMany)
      expect(notificationService.getForUser).toBe(getForUser)
      expect(notificationService.getUnreadCount).toBe(getUnreadCount)
      expect(notificationService.markAsRead).toBe(markAsRead)
      expect(notificationService.markAllAsRead).toBe(markAllAsRead)
      expect(notificationService.remove).toBe(remove)
      expect(notificationService.getById).toBe(getById)
    })
  })
})
