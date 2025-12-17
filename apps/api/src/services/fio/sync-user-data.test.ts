import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncFioUserData, getUserFioData, getCompanyCodeToUserIdMap } from './sync-user-data.js'
import type { FioApiUserData } from './types.js'

// Create mock functions at module scope
const mockGetUserData = vi.fn()

// Mock the FIO client module
vi.mock('./client.js', () => ({
  FioClient: class MockFioClient {
    getUserData = mockGetUserData
  },
}))

// Mock the database module
const mockSelectFrom = vi.fn()
const mockSelectWhere = vi.fn()
const mockSelectLimit = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockInsertValues = vi.fn()

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: mockSelectFrom,
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet.mockReturnValue({
        where: mockUpdateWhere,
      }),
    })),
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  },
  fioUserData: {
    id: 'id',
    userId: 'userId',
    fioUserId: 'fioUserId',
    fioUserName: 'fioUserName',
    companyId: 'companyId',
    companyName: 'companyName',
    companyCode: 'companyCode',
    corporationId: 'corporationId',
    corporationName: 'corporationName',
    corporationCode: 'corporationCode',
    countryId: 'countryId',
    countryCode: 'countryCode',
    countryName: 'countryName',
    fioTimestamp: 'fioTimestamp',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}))

describe('syncFioUserData', () => {
  const userId = 1
  const fioApiKey = 'test-api-key'
  const fioUsername = 'TestUser'

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset all mock implementations
    mockSelectFrom.mockReset()
    mockSelectWhere.mockReset()
    mockSelectLimit.mockReset()
    mockUpdateSet.mockReset()
    mockUpdateWhere.mockReset()
    mockInsertValues.mockReset()
    mockGetUserData.mockReset()

    // Setup default chain for select queries
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit,
      }),
    })
    mockUpdateWhere.mockResolvedValue(undefined)
    mockInsertValues.mockResolvedValue(undefined)
  })

  const mockUserData: FioApiUserData = {
    UserDataId: 'user-data-id-123',
    UserId: 'fio-user-id-456',
    UserName: 'TestUser',
    CompanyId: 'company-id-789',
    CompanyName: 'Test Company',
    CompanyCode: 'TEST',
    CorporationId: 'corp-id-abc',
    CorporationName: 'Kawakawa Corp',
    CorporationCode: 'KAWA',
    CountryId: 'country-id-def',
    CountryCode: 'NC',
    CountryName: 'Neo Chadonia',
    Planets: [],
    Balances: [],
    Offices: [],
    OverallRating: null,
    ActivityRating: null,
    ReliabilityRating: null,
    StabilityRating: null,
    HeadquartersNaturalId: null,
    HeadquartersLevel: 0,
    HeadquartersBasePermits: 0,
    HeadquartersUsedBasePermits: 0,
    AdditionalBasePermits: 0,
    AdditionalProductionQueueSlots: 0,
    RelocationLocked: false,
    NextRelocationTimeEpochMs: 0,
    UserNameSubmitted: 'system',
    Timestamp: '2025-12-15T10:30:00.000Z',
  }

  it('should sync user data and insert new record', async () => {
    mockGetUserData.mockResolvedValue(mockUserData)
    // No existing record
    mockSelectLimit.mockResolvedValue([])

    const result = await syncFioUserData(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.inserted).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.companyCode).toBe('TEST')
    expect(result.corporationCode).toBe('KAWA')
    expect(result.fioTimestamp).toBe('2025-12-15T10:30:00.000Z')
    expect(result.errors).toEqual([])
    expect(mockInsertValues).toHaveBeenCalled()
  })

  it('should sync user data and update existing record', async () => {
    mockGetUserData.mockResolvedValue(mockUserData)
    // Existing record found
    mockSelectLimit.mockResolvedValue([{ id: 42 }])

    const result = await syncFioUserData(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.inserted).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.companyCode).toBe('TEST')
    expect(result.corporationCode).toBe('KAWA')
    expect(result.errors).toEqual([])
    expect(mockUpdateSet).toHaveBeenCalled()
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('should handle null company and corporation codes', async () => {
    const userDataNoCompany: FioApiUserData = {
      ...mockUserData,
      CompanyCode: '',
      CorporationId: null,
      CorporationName: null,
      CorporationCode: null,
    }
    mockGetUserData.mockResolvedValue(userDataNoCompany)
    mockSelectLimit.mockResolvedValue([])

    const result = await syncFioUserData(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.companyCode).toBeNull()
    expect(result.corporationCode).toBeNull()
  })

  it('should handle API errors gracefully', async () => {
    mockGetUserData.mockRejectedValue(new Error('API connection failed'))

    const result = await syncFioUserData(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('Failed to sync FIO user data')
    expect(result.errors[0]).toContain('API connection failed')
  })

  it('should call getUserData with correct parameters', async () => {
    mockGetUserData.mockResolvedValue(mockUserData)
    mockSelectLimit.mockResolvedValue([])

    await syncFioUserData(userId, fioApiKey, fioUsername)

    expect(mockGetUserData).toHaveBeenCalledWith(fioApiKey, fioUsername)
  })
})

describe('getUserFioData', () => {
  const mockSelectResults = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReset()
    mockSelectWhere.mockReset()
    mockSelectLimit.mockReset()

    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit,
      }),
    })
  })

  it('should return user FIO data when found', async () => {
    const expectedData = {
      id: 1,
      userId: 42,
      companyCode: 'TEST',
      corporationCode: 'KAWA',
    }
    mockSelectLimit.mockResolvedValue([expectedData])

    const result = await getUserFioData(42)

    expect(result).toEqual(expectedData)
  })

  it('should return null when no data found', async () => {
    mockSelectLimit.mockResolvedValue([])

    const result = await getUserFioData(999)

    expect(result).toBeNull()
  })
})

describe('getCompanyCodeToUserIdMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReset()
  })

  it('should build map of company codes to user IDs', async () => {
    mockSelectFrom.mockResolvedValue([
      { userId: 1, companyCode: 'TEST' },
      { userId: 2, companyCode: 'ACME' },
      { userId: 3, companyCode: 'KAWA' },
    ])

    const result = await getCompanyCodeToUserIdMap()

    expect(result.size).toBe(3)
    expect(result.get('TEST')).toBe(1)
    expect(result.get('ACME')).toBe(2)
    expect(result.get('KAWA')).toBe(3)
  })

  it('should skip users without company codes', async () => {
    mockSelectFrom.mockResolvedValue([
      { userId: 1, companyCode: 'TEST' },
      { userId: 2, companyCode: null },
      { userId: 3, companyCode: '' },
    ])

    const result = await getCompanyCodeToUserIdMap()

    expect(result.size).toBe(1)
    expect(result.get('TEST')).toBe(1)
  })

  it('should return empty map when no users have FIO data', async () => {
    mockSelectFrom.mockResolvedValue([])

    const result = await getCompanyCodeToUserIdMap()

    expect(result.size).toBe(0)
  })
})
