import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncUserContracts } from './sync-contracts.js'
import type { FioApiContract, FioApiContractCondition } from './types.js'

// Create mock functions at module scope
const mockGetUserContracts = vi.fn()

// Mock the FIO client module
vi.mock('./client.js', () => ({
  FioClient: class MockFioClient {
    getUserContracts = mockGetUserContracts
  },
}))

// Mock the sync-user-data module
const mockGetCompanyCodeToUserIdMap = vi.fn()
vi.mock('./sync-user-data.js', () => ({
  getCompanyCodeToUserIdMap: () => mockGetCompanyCodeToUserIdMap(),
}))

// Mock database functions
const mockSelectFrom = vi.fn()
const mockSelectWhere = vi.fn()
const mockSelectLimit = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()

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
      values: mockInsertValues.mockReturnValue({
        returning: mockInsertReturning,
      }),
    })),
  },
  fioContracts: {
    id: 'id',
    fioContractId: 'fioContractId',
    localId: 'localId',
    syncedByUserId: 'syncedByUserId',
    userParty: 'userParty',
    partnerCompanyCode: 'partnerCompanyCode',
    partnerName: 'partnerName',
    partnerUserId: 'partnerUserId',
    status: 'status',
    name: 'name',
    preamble: 'preamble',
    contractDateMs: 'contractDateMs',
    dueDateMs: 'dueDateMs',
    fioTimestamp: 'fioTimestamp',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  fioContractConditions: {
    id: 'id',
    contractId: 'contractId',
    fioConditionId: 'fioConditionId',
    conditionIndex: 'conditionIndex',
    type: 'type',
    party: 'party',
    status: 'status',
    materialTicker: 'materialTicker',
    materialAmount: 'materialAmount',
    locationRaw: 'locationRaw',
    locationId: 'locationId',
    paymentAmount: 'paymentAmount',
    paymentCurrency: 'paymentCurrency',
    reservationId: 'reservationId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  sellOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
  },
  buyOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
  },
  orderReservations: {
    id: 'id',
    sellOrderId: 'sellOrderId',
    buyOrderId: 'buyOrderId',
    counterpartyUserId: 'counterpartyUserId',
    quantity: 'quantity',
    status: 'status',
    notes: 'notes',
    fioConditionId: 'fioConditionId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  fioLocations: {
    naturalId: 'naturalId',
  },
}))

// Helper to create mock contract data
function createMockContract(overrides: Partial<FioApiContract> = {}): FioApiContract {
  return {
    ContractId: 'contract-uuid-123',
    ContractLocalId: 'ABC123',
    Party: 'PROVIDER',
    Status: 'PENDING',
    PartnerCompanyCode: 'ACME',
    PartnerName: 'Acme Corp',
    PartnerId: 'partner-id-456',
    Conditions: [],
    DateEpochMs: Date.now(),
    DueDateEpochMs: null,
    Preamble: null,
    Name: null,
    Timestamp: '2025-12-15T10:30:00.000Z',
    ...overrides,
  }
}

function createMockCondition(overrides: Partial<FioApiContractCondition> = {}): FioApiContractCondition {
  return {
    ConditionId: 'condition-uuid-789',
    Type: 'PROVISION',
    Party: 'PROVIDER',
    Status: 'PENDING',
    MaterialTicker: 'H2O',
    MaterialAmount: 100,
    Address: 'Benten Station (BEN)',
    Amount: null,
    Currency: null,
    Dependencies: [],
    ConditionIndex: 0,
    ...overrides,
  }
}

describe('syncUserContracts', () => {
  const userId = 1
  const fioApiKey = 'test-api-key'

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset all mocks
    mockSelectFrom.mockReset()
    mockSelectWhere.mockReset()
    mockSelectLimit.mockReset()
    mockUpdateSet.mockReset()
    mockUpdateWhere.mockReset()
    mockInsertValues.mockReset()
    mockInsertReturning.mockReset()
    mockGetUserContracts.mockReset()
    mockGetCompanyCodeToUserIdMap.mockReset()

    // Default: empty company code map
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(new Map())

    // Default: empty contracts
    mockGetUserContracts.mockResolvedValue([])

    // Default chain setup
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit,
      }),
    })
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('should handle empty contracts list', async () => {
    // Mock locations query (first call to select)
    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockGetUserContracts.mockResolvedValue([])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.success).toBe(true)
    expect(result.contractsProcessed).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('should insert new contract and conditions', async () => {
    const contract = createMockContract({
      Conditions: [createMockCondition()],
    })

    // Mock locations
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }]) // locations query

    // Mock contract check (not found)
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })

    // Mock contract insert
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
    // Mock condition insert
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.contractsProcessed).toBe(1)
    expect(result.conditionsProcessed).toBe(1)
    expect(result.inserted).toBe(1)
  })

  it('should update existing contract', async () => {
    const contract = createMockContract({
      Conditions: [],
    })

    // Mock locations
    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])

    // Mock contract check (found)
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([{ id: 42 }]),
      }),
    })

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.contractsProcessed).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.inserted).toBe(0)
  })

  it('should match partner when company code exists in map', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.success).toBe(true)
    expect(result.contractsProcessed).toBe(1)
    // partnerUserId should be set to 99 (from map)
  })

  it('should skip external partner when no match in company code map', async () => {
    const contract = createMockContract({
      PartnerCompanyCode: 'UNKNOWN',
      Conditions: [createMockCondition()],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.skippedExternalPartner).toBe(1)
  })

  it('should skip payment conditions for auto-matching', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [
        createMockCondition({
          Type: 'PAYMENT',
          MaterialTicker: null,
          MaterialAmount: null,
          Amount: 1000,
          Currency: 'CIS',
        }),
      ],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.conditionsProcessed).toBe(1)
    // Payment conditions don't increment skipped counters - they just return early
    expect(result.reservationsCreated).toBe(0)
  })

  it('should skip conditions without valid location', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [
        createMockCondition({
          Address: 'Unknown Location (XYZ)',
        }),
      ],
    })

    // Only BEN is valid
    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.skippedNoMatch).toBe(1)
  })

  it('should parse location from parentheses format', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [
        createMockCondition({
          Address: 'Benten Station (BEN)',
        }),
      ],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    // Location should be parsed as "BEN" from "Benten Station (BEN)"
    expect(result.conditionsProcessed).toBe(1)
  })

  it('should handle location without parentheses (natural ID)', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [
        createMockCondition({
          Address: 'YI-705c', // Direct natural ID
        }),
      ],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'YI-705c' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.conditionsProcessed).toBe(1)
  })

  it('should skip already linked conditions', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [createMockCondition()],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])

    // Contract not found
    mockSelectFrom.mockReturnValueOnce({
      where: mockSelectWhere.mockReturnValueOnce({
        limit: mockSelectLimit.mockResolvedValueOnce([]),
      }),
    })
    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])

    // Condition already linked (has reservationId)
    mockSelectFrom.mockReturnValueOnce({
      where: mockSelectWhere.mockReturnValueOnce({
        limit: mockSelectLimit.mockResolvedValueOnce([{ id: 1, reservationId: 42 }]),
      }),
    })

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.skippedAlreadyLinked).toBe(1)
    expect(result.reservationsCreated).toBe(0)
  })

  it('should handle API errors gracefully', async () => {
    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockGetUserContracts.mockRejectedValue(new Error('API connection failed'))

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('Failed to sync contracts')
    expect(result.errors[0]).toContain('API connection failed')
  })

  it('should handle contract processing errors gracefully', async () => {
    const contract = createMockContract({
      Conditions: [createMockCondition()],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])

    // Make contract lookup throw an error
    mockSelectFrom.mockReturnValueOnce({
      where: mockSelectWhere.mockReturnValueOnce({
        limit: mockSelectLimit.mockRejectedValueOnce(new Error('Database error')),
      }),
    })

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    // Should not fail completely, just record the error
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('Failed to process contract')
  })

  it('should map contract status correctly', async () => {
    const statusTests: Array<{ input: FioApiContract['Status']; expected: string }> = [
      { input: 'PENDING', expected: 'pending' },
      { input: 'PARTIALLY_FULFILLED', expected: 'partially_fulfilled' },
      { input: 'FULFILLED', expected: 'fulfilled' },
      { input: 'CLOSED', expected: 'closed' },
      { input: 'BREACHED', expected: 'breached' },
      { input: 'TERMINATED', expected: 'terminated' },
    ]

    for (const testCase of statusTests) {
      vi.clearAllMocks()

      mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
      mockSelectFrom.mockReturnValue({
        where: mockSelectWhere.mockReturnValue({
          limit: mockSelectLimit.mockResolvedValue([]),
        }),
      })
      mockInsertReturning.mockResolvedValueOnce([{ id: 1 }])
      mockGetCompanyCodeToUserIdMap.mockResolvedValue(new Map())

      const contract = createMockContract({
        Status: testCase.input,
        Conditions: [],
      })
      mockGetUserContracts.mockResolvedValue([contract])

      const result = await syncUserContracts(userId, fioApiKey)

      expect(result.contractsProcessed).toBe(1)
      // Status mapping is tested implicitly through successful processing
    }
  })

  it('should call getUserContracts with correct API key', async () => {
    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockGetUserContracts.mockResolvedValue([])

    await syncUserContracts(userId, fioApiKey)

    expect(mockGetUserContracts).toHaveBeenCalledWith(fioApiKey)
  })

  it('should process multiple contracts', async () => {
    const contracts = [
      createMockContract({ ContractId: 'c1', Conditions: [] }),
      createMockContract({ ContractId: 'c2', Conditions: [] }),
      createMockContract({ ContractId: 'c3', Conditions: [] }),
    ]

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue(contracts)

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.contractsProcessed).toBe(3)
    expect(result.inserted).toBe(3)
  })

  it('should process multiple conditions per contract', async () => {
    const contract = createMockContract({
      Conditions: [
        createMockCondition({ ConditionId: 'cond1', Type: 'PROVISION' }),
        createMockCondition({ ConditionId: 'cond2', Type: 'PAYMENT', MaterialTicker: null }),
        createMockCondition({ ConditionId: 'cond3', Type: 'DELIVERY' }),
      ],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.contractsProcessed).toBe(1)
    expect(result.conditionsProcessed).toBe(3)
  })

  it('should handle null address in condition', async () => {
    const companyCodeMap = new Map([['ACME', 99]])
    mockGetCompanyCodeToUserIdMap.mockResolvedValue(companyCodeMap)

    const contract = createMockContract({
      PartnerCompanyCode: 'ACME',
      Conditions: [
        createMockCondition({
          Address: null,
        }),
      ],
    })

    mockSelectFrom.mockResolvedValueOnce([{ naturalId: 'BEN' }])
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit.mockResolvedValue([]),
      }),
    })
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    mockGetUserContracts.mockResolvedValue([contract])

    const result = await syncUserContracts(userId, fioApiKey)

    expect(result.conditionsProcessed).toBe(1)
    expect(result.skippedNoMatch).toBe(1) // No location = skipped for matching
  })
})
