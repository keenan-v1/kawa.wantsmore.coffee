import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocationsController } from './LocationsController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
  locations: {
    id: 'id',
    name: 'name',
    type: 'type',
    systemCode: 'systemCode',
    systemName: 'systemName',
  },
}))

describe('LocationsController', () => {
  let controller: LocationsController
  let mockSelect: any
  let mockSelectDistinct: any

  beforeEach(() => {
    controller = new LocationsController()
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockSelectDistinct = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.selectDistinct).mockReturnValue(mockSelectDistinct)
  })

  describe('getLocations', () => {
    it('should return all locations when no filters provided', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
        { id: 'UV-351a', name: 'Promitor', type: 'Planet', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getLocations()

      expect(result).toEqual([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
        { id: 'UV-351a', name: 'Promitor', type: 'Planet', systemCode: 'UV-351', systemName: 'Umbra' },
      ])
      expect(db.select).toHaveBeenCalled()
      expect(mockSelect.from).toHaveBeenCalled()
      expect(mockSelect.orderBy).toHaveBeenCalled()
    })

    it('should filter by search term', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getLocations('benten')

      expect(result).toEqual([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by location type', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getLocations(undefined, 'Station')

      expect(result).toEqual([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by system code', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getLocations(undefined, undefined, 'UV-351')

      expect(result).toEqual([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by multiple parameters', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getLocations('benten', 'Station', 'UV-351')

      expect(result).toEqual([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getStations', () => {
    it('should return only stations', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
        { id: 'MOR', name: 'Moria', type: 'Station', systemCode: 'XH-568', systemName: 'Hortus' },
      ])

      const result = await controller.getStations()

      expect(result).toEqual([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
        { id: 'MOR', name: 'Moria', type: 'Station', systemCode: 'XH-568', systemName: 'Hortus' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
      expect(mockSelect.orderBy).toHaveBeenCalled()
    })
  })

  describe('getPlanets', () => {
    it('should return all planets when no system filter provided', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'UV-351a', name: 'Promitor', type: 'Planet', systemCode: 'UV-351', systemName: 'Umbra' },
        { id: 'XH-568c', name: 'Vallis', type: 'Planet', systemCode: 'XH-568', systemName: 'Hortus' },
      ])

      const result = await controller.getPlanets()

      expect(result).toEqual([
        { id: 'UV-351a', name: 'Promitor', type: 'Planet', systemCode: 'UV-351', systemName: 'Umbra' },
        { id: 'XH-568c', name: 'Vallis', type: 'Planet', systemCode: 'XH-568', systemName: 'Hortus' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
      expect(mockSelect.orderBy).toHaveBeenCalled()
    })

    it('should filter planets by system code', async () => {
      mockSelect.orderBy.mockResolvedValue([
        { id: 'UV-351a', name: 'Promitor', type: 'Planet', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getPlanets('UV-351')

      expect(result).toEqual([
        { id: 'UV-351a', name: 'Promitor', type: 'Planet', systemCode: 'UV-351', systemName: 'Umbra' },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
      expect(mockSelect.orderBy).toHaveBeenCalled()
    })
  })

  describe('getLocation', () => {
    it('should return a location by ID', async () => {
      mockSelect.limit.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      const result = await controller.getLocation('ben')

      expect(result).toEqual({
        id: 'BEN',
        name: 'Benten',
        type: 'Station',
        systemCode: 'UV-351',
        systemName: 'Umbra',
      })
      expect(mockSelect.where).toHaveBeenCalled()
      expect(mockSelect.limit).toHaveBeenCalledWith(1)
    })

    it('should return null and set 404 status when location not found', async () => {
      mockSelect.limit.mockResolvedValue([])
      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.getLocation('INVALID')

      expect(result).toBeNull()
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })

    it('should convert ID to uppercase', async () => {
      mockSelect.limit.mockResolvedValue([
        { id: 'BEN', name: 'Benten', type: 'Station', systemCode: 'UV-351', systemName: 'Umbra' },
      ])

      await controller.getLocation('ben')

      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getSystems', () => {
    it('should return unique systems', async () => {
      mockSelectDistinct.orderBy.mockResolvedValue([
        { code: 'UV-351', name: 'Umbra' },
        { code: 'XH-568', name: 'Hortus' },
        { code: 'ZV-194', name: 'Katoa' },
      ])

      const result = await controller.getSystems()

      expect(result).toEqual([
        { code: 'UV-351', name: 'Umbra' },
        { code: 'XH-568', name: 'Hortus' },
        { code: 'ZV-194', name: 'Katoa' },
      ])
      expect(db.selectDistinct).toHaveBeenCalled()
      expect(mockSelectDistinct.orderBy).toHaveBeenCalled()
    })
  })
})
