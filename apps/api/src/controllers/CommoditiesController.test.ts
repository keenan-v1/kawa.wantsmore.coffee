import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommoditiesController } from './CommoditiesController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
  fioCommodities: {
    ticker: 'ticker',
    name: 'name',
    categoryName: 'categoryName',
  },
}))

describe('CommoditiesController', () => {
  let controller: CommoditiesController
  let mockSelect: any
  let mockSelectDistinct: any

  beforeEach(() => {
    controller = new CommoditiesController()
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockSelectDistinct = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.selectDistinct).mockReturnValue(mockSelectDistinct)
  })

  describe('getCommodities', () => {
    it('should return all commodities when no filters provided', async () => {
      mockSelect.from.mockResolvedValue([
        { ticker: 'H2O', name: 'Water', categoryName: 'Liquids', weight: '0.1', volume: '0.1' },
        { ticker: 'FE', name: 'Iron', categoryName: 'Metals', weight: '7.8', volume: '0.5' },
      ])

      const result = await controller.getCommodities()

      expect(result).toEqual([
        { ticker: 'H2O', name: 'Water', category: 'Liquids', weight: 0.1, volume: 0.1 },
        { ticker: 'FE', name: 'Iron', category: 'Metals', weight: 7.8, volume: 0.5 },
      ])
      expect(db.select).toHaveBeenCalled()
      expect(mockSelect.from).toHaveBeenCalled()
    })

    it('should filter by search term', async () => {
      mockSelect.where.mockResolvedValue([
        { ticker: 'H2O', name: 'Water', categoryName: 'Liquids', weight: '0.1', volume: '0.1' },
      ])

      const result = await controller.getCommodities('water')

      expect(result).toEqual([
        { ticker: 'H2O', name: 'Water', category: 'Liquids', weight: 0.1, volume: 0.1 },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by category', async () => {
      mockSelect.where.mockResolvedValue([
        { ticker: 'FE', name: 'Iron', categoryName: 'Metals', weight: '7.8', volume: '0.5' },
      ])

      const result = await controller.getCommodities(undefined, 'Metals')

      expect(result).toEqual([
        { ticker: 'FE', name: 'Iron', category: 'Metals', weight: 7.8, volume: 0.5 },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by both search and category', async () => {
      mockSelect.where.mockResolvedValue([
        { ticker: 'FE', name: 'Iron', categoryName: 'Metals', weight: '7.8', volume: '0.5' },
      ])

      const result = await controller.getCommodities('iron', 'Metals')

      expect(result).toEqual([
        { ticker: 'FE', name: 'Iron', category: 'Metals', weight: 7.8, volume: 0.5 },
      ])
      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getCommodity', () => {
    it('should return a commodity by ticker', async () => {
      mockSelect.limit.mockResolvedValue([
        { ticker: 'H2O', name: 'Water', categoryName: 'Liquids', weight: '0.1', volume: '0.1' },
      ])

      const result = await controller.getCommodity('h2o')

      expect(result).toEqual({
        ticker: 'H2O',
        name: 'Water',
        category: 'Liquids',
        weight: 0.1,
        volume: 0.1,
      })
      expect(mockSelect.where).toHaveBeenCalled()
      expect(mockSelect.limit).toHaveBeenCalledWith(1)
    })

    it('should return null and set 404 status when commodity not found', async () => {
      mockSelect.limit.mockResolvedValue([])
      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.getCommodity('INVALID')

      expect(result).toBeNull()
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })

    it('should convert ticker to uppercase', async () => {
      mockSelect.limit.mockResolvedValue([
        { ticker: 'FE', name: 'Iron', categoryName: 'Metals', weight: '7.8', volume: '0.5' },
      ])

      await controller.getCommodity('fe')

      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getCategories', () => {
    it('should return unique categories', async () => {
      mockSelectDistinct.orderBy.mockResolvedValue([
        { category: 'Liquids' },
        { category: 'Metals' },
        { category: 'Gases' },
      ])

      const result = await controller.getCategories()

      expect(result).toEqual(['Liquids', 'Metals', 'Gases'])
      expect(db.selectDistinct).toHaveBeenCalled()
      expect(mockSelectDistinct.where).toHaveBeenCalled()
      expect(mockSelectDistinct.orderBy).toHaveBeenCalled()
    })

    it('should filter out null/undefined categories', async () => {
      mockSelectDistinct.orderBy.mockResolvedValue([
        { category: 'Liquids' },
        { category: null },
        { category: 'Metals' },
      ])

      const result = await controller.getCategories()

      expect(result).toEqual(['Liquids', 'Metals'])
    })
  })
})
