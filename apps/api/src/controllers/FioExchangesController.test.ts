import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FioExchangesController } from './FioExchangesController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  fioExchanges: {
    code: 'code',
    name: 'name',
    locationId: 'locationId',
    currency: 'currency',
    createdAt: 'createdAt',
  },
  fioLocations: {
    naturalId: 'naturalId',
    name: 'name',
  },
}))

describe('FioExchangesController', () => {
  let controller: FioExchangesController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new FioExchangesController()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }

    mockInsert = {
      values: vi.fn().mockReturnThis(),
    }

    mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }

    mockDelete = {
      where: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.insert).mockReturnValue(mockInsert)
    vi.mocked(db.update).mockReturnValue(mockUpdate)
    vi.mocked(db.delete).mockReturnValue(mockDelete)
  })

  describe('getFioExchanges', () => {
    it('should return all exchanges with location names', async () => {
      const mockExchanges = [
        {
          code: 'CI1',
          name: 'Commodity Exchange - Benton',
          locationId: 'BEN',
          locationName: 'Benton Station',
          currency: 'CIS',
          createdAt: new Date('2024-01-01'),
        },
        {
          code: 'KAWA',
          name: 'KAWA Internal Exchange',
          locationId: null,
          locationName: null,
          currency: 'CIS',
          createdAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockExchanges)

      const result = await controller.getFioExchanges()

      expect(result).toEqual(mockExchanges)
      expect(db.select).toHaveBeenCalled()
      expect(mockSelect.leftJoin).toHaveBeenCalled()
      expect(mockSelect.orderBy).toHaveBeenCalled()
    })
  })

  describe('getFioExchange', () => {
    it('should return a single exchange by code', async () => {
      const mockExchange = {
        code: 'CI1',
        name: 'Commodity Exchange - Benton',
        locationId: 'BEN',
        locationName: 'Benton Station',
        currency: 'CIS',
        createdAt: new Date('2024-01-01'),
      }
      mockSelect.limit.mockResolvedValue([mockExchange])

      const result = await controller.getFioExchange('ci1')

      expect(result).toEqual(mockExchange)
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should throw NotFound when exchange does not exist', async () => {
      mockSelect.limit.mockResolvedValue([])

      await expect(controller.getFioExchange('INVALID')).rejects.toThrow(
        "Exchange 'INVALID' not found"
      )
    })

    it('should convert code to uppercase', async () => {
      const mockExchange = {
        code: 'NC1',
        name: 'Commodity Exchange - Moria',
        locationId: 'MOR',
        locationName: 'Moria Station',
        currency: 'NCC',
        createdAt: new Date('2024-01-01'),
      }
      mockSelect.limit.mockResolvedValue([mockExchange])

      await controller.getFioExchange('nc1')

      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('createFioExchange', () => {
    it('should create a new exchange', async () => {
      // First select for checking existence
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      // For validating location
      const mockSelectForLocation = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }

      // For returning the created exchange
      const mockSelectForReturn = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            code: 'TEST',
            name: 'Test Exchange',
            locationId: 'BEN',
            locationName: 'Benton Station',
            currency: 'CIS',
            createdAt: new Date('2024-01-01'),
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockSelectForExistence as any)
        .mockReturnValueOnce(mockSelectForLocation as any)
        .mockReturnValueOnce(mockSelectForReturn as any)

      mockInsert.values.mockResolvedValue([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.createFioExchange({
        code: 'test',
        name: 'Test Exchange',
        locationId: 'BEN',
        currency: 'CIS',
      })

      expect(result.code).toBe('TEST')
      expect(db.insert).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(201)
    })

    it('should throw Conflict when exchange already exists', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'CI1' }]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockSelectForExistence as any)

      await expect(
        controller.createFioExchange({
          code: 'CI1',
          name: 'Duplicate Exchange',
          currency: 'CIS',
        })
      ).rejects.toThrow("Exchange 'CI1' already exists")
    })

    it('should throw BadRequest when location does not exist', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      const mockSelectForLocation = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockSelectForExistence as any)
        .mockReturnValueOnce(mockSelectForLocation as any)

      await expect(
        controller.createFioExchange({
          code: 'NEW',
          name: 'New Exchange',
          locationId: 'INVALID',
          currency: 'CIS',
        })
      ).rejects.toThrow("Location 'INVALID' not found")
    })
  })

  describe('updateFioExchange', () => {
    it('should update an existing exchange', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'CI1' }]),
      }

      const mockSelectForReturn = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            code: 'CI1',
            name: 'Updated Name',
            locationId: 'BEN',
            locationName: 'Benton Station',
            currency: 'CIS',
            createdAt: new Date('2024-01-01'),
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockSelectForExistence as any)
        .mockReturnValueOnce(mockSelectForReturn as any)

      const result = await controller.updateFioExchange('CI1', { name: 'Updated Name' })

      expect(result.name).toBe('Updated Name')
      expect(db.update).toHaveBeenCalled()
    })

    it('should throw NotFound when exchange does not exist', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockSelectForExistence as any)

      await expect(controller.updateFioExchange('INVALID', { name: 'Test' })).rejects.toThrow(
        "Exchange 'INVALID' not found"
      )
    })
  })

  describe('deleteFioExchange', () => {
    it('should delete a custom exchange', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'CUSTOM' }]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockSelectForExistence as any)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await controller.deleteFioExchange('CUSTOM')

      expect(db.delete).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(204)
    })

    it('should throw NotFound when exchange does not exist', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockSelectForExistence as any)

      await expect(controller.deleteFioExchange('INVALID')).rejects.toThrow(
        "Exchange 'INVALID' not found"
      )
    })

    it('should throw BadRequest when trying to delete built-in exchange', async () => {
      const mockSelectForExistence = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'CI1' }]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockSelectForExistence as any)

      await expect(controller.deleteFioExchange('CI1')).rejects.toThrow(
        "Cannot delete built-in exchange 'CI1'"
      )
    })

    it('should throw BadRequest for all built-in exchanges', async () => {
      const builtInExchanges = ['CI1', 'NC1', 'IC1', 'AI1', 'KAWA']

      for (const code of builtInExchanges) {
        const mockSelectForExistence = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ code }]),
        }
        vi.mocked(db.select).mockReturnValueOnce(mockSelectForExistence as any)

        await expect(controller.deleteFioExchange(code)).rejects.toThrow(
          `Cannot delete built-in exchange '${code}'`
        )
      }
    })
  })
})
