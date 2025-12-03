import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RolesController } from './RolesController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  roles: { id: 'id', name: 'name', color: 'color' },
}))

describe('RolesController', () => {
  let controller: RolesController
  let mockSelect: {
    from: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new RolesController()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn(),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect as never)
  })

  describe('getRoles', () => {
    it('should return all roles', async () => {
      const mockRoles = [
        { id: 'member', name: 'Member', color: 'blue' },
        { id: 'lead', name: 'Lead', color: 'green' },
        { id: 'administrator', name: 'Administrator', color: 'red' },
      ]
      mockSelect.orderBy.mockResolvedValueOnce(mockRoles)

      const result = await controller.getRoles()

      expect(result).toEqual(mockRoles)
      expect(db.select).toHaveBeenCalled()
      expect(mockSelect.from).toHaveBeenCalled()
      expect(mockSelect.orderBy).toHaveBeenCalled()
    })

    it('should return empty array when no roles exist', async () => {
      mockSelect.orderBy.mockResolvedValueOnce([])

      const result = await controller.getRoles()

      expect(result).toEqual([])
    })
  })
})
