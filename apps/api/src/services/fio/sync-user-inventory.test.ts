import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { syncUserInventory } from './sync-user-inventory.js'
import type { FioGroupHubResponse } from './types.js'

// Create mock functions at module scope
const mockGetGroupHub = vi.fn()

// Mock the FIO client module
vi.mock('./client.js', () => ({
  FioClient: class MockFioClient {
    getGroupHub = mockGetGroupHub
  },
}))

// Mock the database module
const mockSelectFrom = vi.fn()
const mockDeleteWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: mockSelectFrom,
    })),
    insert: vi.fn(() => ({
      values: mockInsertValues.mockReturnValue({
        returning: mockInsertReturning,
      }),
    })),
    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),
  },
  fioInventory: {
    id: 'id',
    userId: 'userId',
    userStorageId: 'userStorageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
    lastSyncedAt: 'lastSyncedAt',
  },
  fioUserStorage: {
    id: 'id',
    userId: 'userId',
    storageId: 'storageId',
    addressableId: 'addressableId',
    locationId: 'locationId',
    type: 'type',
    weightLoad: 'weightLoad',
    weightCapacity: 'weightCapacity',
    volumeLoad: 'volumeLoad',
    volumeCapacity: 'volumeCapacity',
    fioTimestamp: 'fioTimestamp',
    lastSyncedAt: 'lastSyncedAt',
  },
  fioLocations: {
    naturalId: 'naturalId',
  },
  fioCommodities: {
    ticker: 'ticker',
  },
}))

describe('syncUserInventory', () => {
  const userId = 1
  const fioApiKey = 'test-api-key'
  const fioUsername = 'TestUser'

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset all mock implementations
    mockSelectFrom.mockReset()
    mockDeleteWhere.mockReset()
    mockInsertValues.mockReset()
    mockInsertReturning.mockReset()
    mockGetGroupHub.mockReset()

    mockDeleteWhere.mockResolvedValue(undefined)
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
  })

  it('should sync inventory from GroupHub endpoint successfully', async () => {
    // Mock existing locations
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }, { naturalId: 'UV-351a' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }, { ticker: 'RAT' }])

    // Mock GroupHub response
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [
        {
          WarehouseLocationName: 'Benten Station',
          WarehouseLocationNaturalId: 'BEN',
          PlayerCXWarehouses: [
            {
              PlayerName: 'TestUser',
              StorageType: 'WAREHOUSE_STORE',
              Items: [
                { MaterialTicker: 'H2O', MaterialName: 'Water', MaterialCategoryName: 'consumables', Units: 100 },
              ],
            },
          ],
        },
      ],
      PlayerModels: [
        {
          UserName: 'TestUser',
          Currencies: [],
          Locations: [
            {
              LocationIdentifier: 'UV-351a',
              LocationName: 'UV-351a',
              Buildings: [],
              ProductionLines: [],
              BaseStorage: {
                PlayerName: 'TestUser',
                StorageType: 'STORE',
                Items: [
                  { MaterialTicker: 'RAT', MaterialName: 'Rations', MaterialCategoryName: 'consumables', Units: 50 },
                ],
                LastUpdated: '2025-12-03T00:00:00.000Z',
              },
              WarehouseStorage: null,
              StationaryPlayerShips: [],
            },
          ],
        },
      ],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    // Mock storage inserts - return IDs sequentially
    mockInsertReturning
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }])

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.storageLocations).toBe(2)
    expect(result.inserted).toBe(2) // 1 H2O + 1 RAT
    expect(result.skippedUnknownLocations).toBe(0)
    expect(result.skippedUnknownCommodities).toBe(0)
    expect(result.errors).toEqual([])
    expect(result.fioLastSync).toBe('2025-12-03T00:00:00.000Z')
  })

  it('should skip unknown locations', async () => {
    // Mock existing locations - only BEN exists
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock GroupHub response with unknown location
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [],
      PlayerModels: [
        {
          UserName: 'TestUser',
          Currencies: [],
          Locations: [
            {
              LocationIdentifier: 'UNKNOWN-123',
              LocationName: 'Unknown Planet',
              Buildings: [],
              ProductionLines: [],
              BaseStorage: {
                PlayerName: 'TestUser',
                StorageType: 'STORE',
                Items: [
                  { MaterialTicker: 'H2O', MaterialName: 'Water', MaterialCategoryName: 'consumables', Units: 100 },
                ],
                LastUpdated: '2025-12-03T00:00:00.000Z',
              },
              WarehouseStorage: null,
              StationaryPlayerShips: [],
            },
          ],
        },
      ],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.storageLocations).toBe(0)
    expect(result.inserted).toBe(0)
    expect(result.skippedUnknownLocations).toBe(1) // 1 item skipped
  })

  it('should skip unknown commodities', async () => {
    // Mock existing locations and commodities - H2O doesn't exist
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'RAT' }])

    // Mock GroupHub response
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [
        {
          WarehouseLocationName: 'Benten Station',
          WarehouseLocationNaturalId: 'BEN',
          PlayerCXWarehouses: [
            {
              PlayerName: 'TestUser',
              StorageType: 'WAREHOUSE_STORE',
              Items: [
                { MaterialTicker: 'H2O', MaterialName: 'Water', MaterialCategoryName: 'consumables', Units: 100 },
              ],
            },
          ],
        },
      ],
      PlayerModels: [],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    // Mock storage insert
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.storageLocations).toBe(1) // Storage created
    expect(result.inserted).toBe(0) // No items inserted
    expect(result.skippedUnknownCommodities).toBe(1) // 1 commodity skipped
  })

  it('should skip null/empty items', async () => {
    // Mock existing locations and commodities
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock GroupHub response with null items
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [
        {
          WarehouseLocationName: 'Benten Station',
          WarehouseLocationNaturalId: 'BEN',
          PlayerCXWarehouses: [
            {
              PlayerName: 'TestUser',
              StorageType: 'WAREHOUSE_STORE',
              Items: [
                { MaterialTicker: null, MaterialName: null, MaterialCategoryName: null, Units: 0 },
                { MaterialTicker: 'H2O', MaterialName: 'Water', MaterialCategoryName: 'consumables', Units: 100 },
                { MaterialTicker: null, MaterialName: null, MaterialCategoryName: null, Units: 0 },
              ],
            },
          ],
        },
      ],
      PlayerModels: [],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    // Mock storage insert
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.inserted).toBe(1) // Only H2O inserted
  })

  it('should handle empty inventory', async () => {
    // Mock existing locations and commodities
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock empty GroupHub response
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [],
      PlayerModels: [],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.storageLocations).toBe(0)
    expect(result.inserted).toBe(0)
    expect(result.fioLastSync).toBeNull()
  })

  it('should handle API errors gracefully', async () => {
    // Mock existing locations and commodities
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock API error
    mockGetGroupHub.mockRejectedValue(new Error('API connection failed'))

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('API connection failed')
  })

  it('should process both base storage and warehouse storage at planets', async () => {
    // Mock existing locations and commodities
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'UV-351a' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }, { ticker: 'RAT' }])

    // Mock GroupHub response with both storage types
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [],
      PlayerModels: [
        {
          UserName: 'TestUser',
          Currencies: [],
          Locations: [
            {
              LocationIdentifier: 'UV-351a',
              LocationName: 'UV-351a',
              Buildings: [],
              ProductionLines: [],
              BaseStorage: {
                PlayerName: 'TestUser',
                StorageType: 'STORE',
                Items: [
                  { MaterialTicker: 'H2O', MaterialName: 'Water', MaterialCategoryName: 'consumables', Units: 100 },
                ],
                LastUpdated: '2025-12-03T00:00:00.000Z',
              },
              WarehouseStorage: {
                PlayerName: 'TestUser',
                StorageType: 'WAREHOUSE_STORE',
                Items: [
                  { MaterialTicker: 'RAT', MaterialName: 'Rations', MaterialCategoryName: 'consumables', Units: 50 },
                ],
                LastUpdated: '2025-12-02T00:00:00.000Z',
              },
              StationaryPlayerShips: [],
            },
          ],
        },
      ],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    // Mock storage inserts
    mockInsertReturning
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }])

    const result = await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.storageLocations).toBe(2) // Both STORE and WAREHOUSE_STORE
    expect(result.inserted).toBe(2) // H2O + RAT
    expect(result.fioLastSync).toBe('2025-12-03T00:00:00.000Z') // Most recent
  })

  it('should match username case-insensitively', async () => {
    // Mock existing locations and commodities
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock GroupHub response with different case username
    const groupHubResponse: FioGroupHubResponse = {
      GroupName: null,
      CXWarehouses: [
        {
          WarehouseLocationName: 'Benten Station',
          WarehouseLocationNaturalId: 'BEN',
          PlayerCXWarehouses: [
            {
              PlayerName: 'TESTUSER', // Uppercase
              StorageType: 'WAREHOUSE_STORE',
              Items: [
                { MaterialTicker: 'H2O', MaterialName: 'Water', MaterialCategoryName: 'consumables', Units: 100 },
              ],
            },
          ],
        },
      ],
      PlayerModels: [
        {
          UserName: 'testuser', // Lowercase
          Currencies: [],
          Locations: [],
        },
      ],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    }
    mockGetGroupHub.mockResolvedValue(groupHubResponse)

    // Mock storage insert
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    // Call with mixed case
    const result = await syncUserInventory(userId, fioApiKey, 'TestUser')

    expect(result.success).toBe(true)
    expect(result.storageLocations).toBe(1)
    expect(result.inserted).toBe(1)
  })

  it('should call getGroupHub with correct parameters', async () => {
    mockSelectFrom
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    mockGetGroupHub.mockResolvedValue({
      GroupName: null,
      CXWarehouses: [],
      PlayerModels: [],
      PlayerShipsInFlight: [],
      PlayerStationaryShips: [],
      Failures: [],
    })

    await syncUserInventory(userId, fioApiKey, fioUsername)

    expect(mockGetGroupHub).toHaveBeenCalledWith(fioApiKey, [fioUsername])
  })
})
