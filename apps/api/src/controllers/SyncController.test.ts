import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncController } from './SyncController.js'
import { syncService } from '../services/syncService.js'
import type { SyncState } from '@kawakawa/types'

vi.mock('../services/syncService.js', () => ({
  syncService: {
    getSyncState: vi.fn(),
  },
}))

describe('SyncController', () => {
  let controller: SyncController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SyncController()
  })

  describe('getSyncState', () => {
    const mockSyncState: SyncState = {
      unreadCount: 5,
      appVersion: 'abc123',
      dataVersions: {
        locations: 1704844800000,
        commodities: 1704844800000,
      },
    }

    it('should return sync state with unread count and data versions', async () => {
      vi.mocked(syncService.getSyncState).mockResolvedValue(mockSyncState)

      const result = await controller.getSyncState(mockRequest)

      expect(syncService.getSyncState).toHaveBeenCalledWith(1)
      expect(result).toEqual(mockSyncState)
    })

    it('should return zero unread count when no notifications', async () => {
      const emptyState: SyncState = {
        unreadCount: 0,
        appVersion: 'abc123',
        dataVersions: {},
      }
      vi.mocked(syncService.getSyncState).mockResolvedValue(emptyState)

      const result = await controller.getSyncState(mockRequest)

      expect(result.unreadCount).toBe(0)
    })
  })
})
