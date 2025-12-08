import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateEffectivePrice, calculateEffectivePrices } from './price-calculator.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  prices: {
    priceListCode: 'priceListCode',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    source: 'source',
    sourceReference: 'sourceReference',
  },
  priceLists: {
    code: 'code',
    name: 'name',
    type: 'type',
    currency: 'currency',
    defaultLocationId: 'defaultLocationId',
  },
  priceAdjustments: {
    id: 'id',
    priceListCode: 'priceListCode',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    adjustmentType: 'adjustmentType',
    adjustmentValue: 'adjustmentValue',
    priority: 'priority',
    description: 'description',
    isActive: 'isActive',
    effectiveFrom: 'effectiveFrom',
    effectiveUntil: 'effectiveUntil',
  },
  fioCommodities: {
    ticker: 'ticker',
    name: 'name',
  },
  fioLocations: {
    naturalId: 'naturalId',
    name: 'name',
  },
}))

describe('price-calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateEffectivePrice', () => {
    it('should return null when no base price exists', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockBasePriceSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).toBeNull()
    })

    it('should return base price when no adjustments apply', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(100)
      expect(result!.adjustments).toHaveLength(0)
    })

    it('should apply percentage adjustment correctly', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: null,
            locationId: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(110) // 100 + 10% = 110
      expect(result!.adjustments).toHaveLength(1)
      expect(result!.adjustments[0].appliedAmount).toBe(10)
    })

    it('should apply fixed adjustment correctly', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            exchangeCode: 'CI1',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'fio_exchange',
            sourceReference: 'CI1',
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            exchangeCode: null,
            commodityTicker: null,
            locationId: 'BEN',
            currency: null,
            adjustmentType: 'fixed',
            adjustmentValue: '50.0000',
            priority: 0,
            description: 'BEN station fee',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('CI1', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(150) // 100 + 50 = 150
      expect(result!.adjustments).toHaveLength(1)
      expect(result!.adjustments[0].appliedAmount).toBe(50)
    })

    it('should apply multiple adjustments in priority order', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: null,
            locationId: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
          {
            id: 2,
            exchangeCode: null,
            commodityTicker: null,
            locationId: 'BEN',
            currency: null,
            adjustmentType: 'fixed',
            adjustmentValue: '25.0000',
            priority: 1,
            description: 'BEN station fee',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      // First: 100 + 10% = 110
      // Second: 110 + 25 = 135
      expect(result!.finalPrice).toBe(135)
      expect(result!.adjustments).toHaveLength(2)
      expect(result!.adjustments[0].appliedAmount).toBe(10) // 10% of 100
      expect(result!.adjustments[1].appliedAmount).toBe(25) // fixed 25
    })

    it('should apply negative percentage adjustment (discount)', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'UV-351a',
            locationName: 'Proxion',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            locationId: 'UV-351a',
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '-20.0000',
            priority: 0,
            description: 'Local production discount',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'UV-351a', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(80) // 100 - 20% = 80
      expect(result!.adjustments[0].appliedAmount).toBe(-20)
    })

    it('should handle case insensitive input', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('kawa', 'h2o', 'ben', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.exchangeCode).toBe('KAWA')
    })
  })

  describe('calculateEffectivePrices', () => {
    it('should return empty array when no base prices exist', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select).mockReturnValue(mockBasePriceSelect as any)

      const result = await calculateEffectivePrices('KAWA', 'BEN', 'CIS')

      expect(result).toEqual([])
    })

    it('should calculate effective prices for multiple commodities', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
          {
            priceListCode: 'KAWA',
            commodityTicker: 'RAT',
            commodityName: 'Rations',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '50.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: null, // Applies to all commodities
            locationId: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrices('KAWA', 'BEN', 'CIS')

      expect(result).toHaveLength(2)
      expect(result[0].commodityTicker).toBe('H2O')
      expect(result[0].basePrice).toBe(100)
      expect(result[0].finalPrice).toBe(110) // 100 + 10%
      expect(result[1].commodityTicker).toBe('RAT')
      expect(result[1].basePrice).toBe(50)
      expect(result[1].finalPrice).toBe(55) // 50 + 10%
    })

    it('should apply commodity-specific adjustments only to matching commodities', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
          {
            priceListCode: 'KAWA',
            commodityTicker: 'RAT',
            commodityName: 'Rations',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '50.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: 'H2O', // Only applies to H2O
            locationId: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '20.0000',
            priority: 0,
            description: 'H2O special markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrices('KAWA', 'BEN', 'CIS')

      expect(result).toHaveLength(2)
      // H2O should have the adjustment
      expect(result[0].commodityTicker).toBe('H2O')
      expect(result[0].finalPrice).toBe(120) // 100 + 20%
      expect(result[0].adjustments).toHaveLength(1)
      // RAT should NOT have the adjustment
      expect(result[1].commodityTicker).toBe('RAT')
      expect(result[1].finalPrice).toBe(50) // No adjustment
      expect(result[1].adjustments).toHaveLength(0)
    })
  })
})
