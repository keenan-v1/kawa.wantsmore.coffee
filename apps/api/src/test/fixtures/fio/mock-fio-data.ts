/**
 * FIO Mock Data Module
 *
 * Provides realistic mock data for FIO API integration testing.
 * This module enables safe testing without requiring real FIO credentials.
 *
 * Design Principles:
 * 1. Type-safe: All mock data strictly follows FIO API types
 * 2. Realistic: Data reflects actual FIO API responses
 * 3. Configurable: Factories allow customization for various test scenarios
 * 4. Isolated: No external API calls - all data is local
 *
 * Usage in tests:
 * ```typescript
 * import { createMockUserData, createMockContract, MockFioClient } from '../test/fixtures/fio/mock-fio-data.js'
 *
 * const userData = createMockUserData({ companyCode: 'ACME' })
 * const contract = createMockContract({ status: 'FULFILLED' })
 * ```
 */

import type {
  FioApiUserData,
  FioApiContract,
  FioApiContractCondition,
  FioGroupHubResponse,
  FioGroupHubPlayerModel,
  FioGroupHubCXWarehouse,
  FioGroupHubStorage,
  FioGroupHubItem,
  FioGroupHubLocation,
} from '../../../services/fio/types.js'

// ==================== User Data Factories ====================

export interface MockUserDataOptions {
  userId?: string
  userName?: string
  companyId?: string
  companyName?: string
  companyCode?: string
  corporationId?: string | null
  corporationName?: string | null
  corporationCode?: string | null
  countryId?: string | null
  countryCode?: string | null
  countryName?: string | null
  timestamp?: string
}

/**
 * Create mock FIO user data
 */
export function createMockUserData(options: MockUserDataOptions = {}): FioApiUserData {
  const now = new Date().toISOString()
  return {
    UserDataId: `user-data-${options.userId || 'mock-001'}`,
    UserId: options.userId || 'mock-user-id-001',
    UserName: options.userName || 'MockUser',
    CompanyId: options.companyId || 'mock-company-id-001',
    CompanyName: options.companyName || 'Mock Company Inc',
    CompanyCode: options.companyCode || 'MOCK',
    CorporationId: 'corporationId' in options ? options.corporationId ?? null : 'mock-corp-id-001',
    CorporationName: 'corporationName' in options ? options.corporationName ?? null : 'Kawakawa Corporation',
    CorporationCode: 'corporationCode' in options ? options.corporationCode ?? null : 'KAWA',
    CountryId: 'countryId' in options ? options.countryId ?? null : 'mock-country-id',
    CountryCode: 'countryCode' in options ? options.countryCode ?? null : 'NC',
    CountryName: 'countryName' in options ? options.countryName ?? null : 'Neo Chadonia',
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
    Timestamp: options.timestamp || now,
  }
}

// ==================== Contract Factories ====================

export interface MockContractConditionOptions {
  conditionId?: string
  type?: FioApiContractCondition['Type']
  party?: 'CUSTOMER' | 'PROVIDER'
  status?: 'PENDING' | 'FULFILLED'
  materialTicker?: string | null
  materialAmount?: number | null
  address?: string | null
  amount?: number | null
  currency?: string | null
  conditionIndex?: number
}

/**
 * Create mock FIO contract condition
 */
export function createMockContractCondition(
  options: MockContractConditionOptions = {}
): FioApiContractCondition {
  return {
    ConditionId: options.conditionId || `cond-${Math.random().toString(36).substr(2, 9)}`,
    Type: options.type || 'PROVISION',
    Party: options.party || 'PROVIDER',
    Status: options.status || 'PENDING',
    MaterialTicker: 'materialTicker' in options ? options.materialTicker ?? null : 'H2O',
    MaterialAmount: 'materialAmount' in options ? options.materialAmount ?? null : 1000,
    Address: 'address' in options ? options.address ?? null : 'Benten Station (BEN)',
    Amount: 'amount' in options ? options.amount ?? null : null,
    Currency: 'currency' in options ? options.currency ?? null : null,
    Dependencies: [],
    ConditionIndex: options.conditionIndex ?? 0,
  }
}

export interface MockContractOptions {
  contractId?: string
  localId?: string
  party?: 'CUSTOMER' | 'PROVIDER'
  status?: FioApiContract['Status']
  partnerCompanyCode?: string | null
  partnerName?: string
  partnerId?: string | null
  conditions?: FioApiContractCondition[]
  dateEpochMs?: number
  dueDateEpochMs?: number | null
  preamble?: string | null
  name?: string | null
  timestamp?: string
}

/**
 * Create mock FIO contract
 */
export function createMockContract(options: MockContractOptions = {}): FioApiContract {
  const now = Date.now()
  return {
    ContractId: options.contractId || `contract-${Math.random().toString(36).substr(2, 9)}`,
    ContractLocalId: options.localId || `L${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    Party: options.party || 'PROVIDER',
    Status: options.status || 'PENDING',
    PartnerCompanyCode: options.partnerCompanyCode ?? 'PART',
    PartnerName: options.partnerName || 'Partner Corp',
    PartnerId: options.partnerId ?? 'partner-id-001',
    Conditions: options.conditions || [createMockContractCondition()],
    DateEpochMs: options.dateEpochMs || now,
    DueDateEpochMs: options.dueDateEpochMs ?? now + 7 * 24 * 60 * 60 * 1000,
    Preamble: options.preamble ?? null,
    Name: options.name ?? null,
    Timestamp: options.timestamp || new Date().toISOString(),
  }
}

// ==================== GroupHub/Inventory Factories ====================

export interface MockStorageItemOptions {
  ticker?: string
  name?: string
  category?: string
  units?: number
}

/**
 * Create mock GroupHub storage item
 */
export function createMockStorageItem(options: MockStorageItemOptions = {}): FioGroupHubItem {
  return {
    MaterialTicker: options.ticker || 'H2O',
    MaterialName: options.name || 'Water',
    MaterialCategoryName: options.category || 'consumables',
    Units: options.units ?? 1000,
  }
}

export interface MockStorageOptions {
  playerName?: string
  storageType?: string
  items?: FioGroupHubItem[]
  lastUpdated?: string
}

/**
 * Create mock GroupHub storage
 */
export function createMockStorage(options: MockStorageOptions = {}): FioGroupHubStorage {
  return {
    PlayerName: options.playerName || 'MockUser',
    StorageType: options.storageType || 'STORE',
    Items: options.items || [createMockStorageItem()],
    LastUpdated: options.lastUpdated || new Date().toISOString(),
  }
}

export interface MockLocationOptions {
  locationId?: string
  locationName?: string
  baseStorage?: FioGroupHubStorage | null
  warehouseStorage?: FioGroupHubStorage | null
}

/**
 * Create mock GroupHub location (planet base)
 */
export function createMockLocation(options: MockLocationOptions = {}): FioGroupHubLocation {
  return {
    LocationIdentifier: options.locationId || 'UV-351a',
    LocationName: options.locationName || 'Katoa',
    Buildings: [],
    ProductionLines: [],
    BaseStorage: options.baseStorage ?? createMockStorage(),
    WarehouseStorage: options.warehouseStorage ?? null,
    StationaryPlayerShips: [],
  }
}

export interface MockPlayerModelOptions {
  userName?: string
  locations?: FioGroupHubLocation[]
}

/**
 * Create mock GroupHub player model
 */
export function createMockPlayerModel(options: MockPlayerModelOptions = {}): FioGroupHubPlayerModel {
  return {
    UserName: options.userName || 'MockUser',
    Currencies: [],
    Locations: options.locations || [createMockLocation()],
  }
}

export interface MockCXWarehouseOptions {
  locationName?: string
  locationNaturalId?: string
  playerWarehouses?: FioGroupHubStorage[]
}

/**
 * Create mock CX warehouse
 */
export function createMockCXWarehouse(options: MockCXWarehouseOptions = {}): FioGroupHubCXWarehouse {
  return {
    WarehouseLocationName: options.locationName || 'Benten Station',
    WarehouseLocationNaturalId: options.locationNaturalId || 'BEN',
    PlayerCXWarehouses: options.playerWarehouses || [
      createMockStorage({ storageType: 'WAREHOUSE_STORE' }),
    ],
  }
}

export interface MockGroupHubResponseOptions {
  groupName?: string | null
  cxWarehouses?: FioGroupHubCXWarehouse[]
  playerModels?: FioGroupHubPlayerModel[]
}

/**
 * Create mock GroupHub response
 */
export function createMockGroupHubResponse(
  options: MockGroupHubResponseOptions = {}
): FioGroupHubResponse {
  return {
    GroupName: options.groupName ?? null,
    CXWarehouses: options.cxWarehouses || [],
    PlayerModels: options.playerModels || [createMockPlayerModel()],
    PlayerShipsInFlight: [],
    PlayerStationaryShips: [],
    Failures: [],
  }
}

// ==================== Scenario Fixtures ====================

/**
 * Pre-configured test scenarios for common use cases
 */
export const FioTestScenarios = {
  /**
   * Basic user with single base and inventory
   */
  basicUser: () => ({
    userData: createMockUserData({
      userName: 'BasicUser',
      companyCode: 'BASIC',
    }),
    groupHub: createMockGroupHubResponse({
      playerModels: [
        createMockPlayerModel({
          userName: 'BasicUser',
          locations: [
            createMockLocation({
              locationId: 'UV-351a',
              baseStorage: createMockStorage({
                items: [
                  createMockStorageItem({ ticker: 'H2O', units: 500 }),
                  createMockStorageItem({ ticker: 'RAT', name: 'Rations', units: 200 }),
                ],
              }),
            }),
          ],
        }),
      ],
    }),
    contracts: [] as FioApiContract[],
  }),

  /**
   * User with multiple bases and CX warehouse
   */
  multiBaseUser: () => ({
    userData: createMockUserData({
      userName: 'MultiBaseUser',
      companyCode: 'MULTI',
    }),
    groupHub: createMockGroupHubResponse({
      playerModels: [
        createMockPlayerModel({
          userName: 'MultiBaseUser',
          locations: [
            createMockLocation({
              locationId: 'UV-351a',
              baseStorage: createMockStorage({
                items: [
                  createMockStorageItem({ ticker: 'FE', name: 'Iron Ore', units: 1000 }),
                ],
              }),
            }),
            createMockLocation({
              locationId: 'KW-688c',
              locationName: 'Verdant',
              baseStorage: createMockStorage({
                items: [
                  createMockStorageItem({ ticker: 'H2O', units: 2000 }),
                  createMockStorageItem({ ticker: 'OVE', name: 'Vegetables', category: 'agricultural products', units: 500 }),
                ],
              }),
            }),
          ],
        }),
      ],
      cxWarehouses: [
        createMockCXWarehouse({
          locationName: 'Moria Station',
          locationNaturalId: 'MOR',
          playerWarehouses: [
            createMockStorage({
              playerName: 'MultiBaseUser',
              storageType: 'WAREHOUSE_STORE',
              items: [
                createMockStorageItem({ ticker: 'PE', name: 'Polyethylene', category: 'plastics', units: 300 }),
              ],
            }),
          ],
        }),
      ],
    }),
    contracts: [] as FioApiContract[],
  }),

  /**
   * Two KAWA members with a contract between them
   */
  internalTrade: () => {
    const seller = createMockUserData({
      userName: 'Seller',
      companyCode: 'SELL',
      corporationCode: 'KAWA',
    })
    const buyer = createMockUserData({
      userName: 'Buyer',
      companyCode: 'BUYR',
      corporationCode: 'KAWA',
    })

    const contract = createMockContract({
      party: 'PROVIDER',
      status: 'PENDING',
      partnerCompanyCode: 'BUYR',
      partnerName: 'Buyer Corp',
      conditions: [
        createMockContractCondition({
          type: 'PROVISION',
          party: 'PROVIDER',
          status: 'PENDING',
          materialTicker: 'DW',
          materialAmount: 500,
          address: 'Benten Station (BEN)',
        }),
        createMockContractCondition({
          type: 'PAYMENT',
          party: 'CUSTOMER',
          status: 'PENDING',
          materialTicker: null,
          materialAmount: null,
          amount: 5000,
          currency: 'CIS',
          conditionIndex: 1,
        }),
      ],
    })

    return { seller, buyer, contract }
  },

  /**
   * Contract with external (non-KAWA) partner
   */
  externalTrade: () => {
    const user = createMockUserData({
      userName: 'KawaUser',
      companyCode: 'KAWA',
      corporationCode: 'KAWA',
    })

    const contract = createMockContract({
      party: 'CUSTOMER',
      status: 'PENDING',
      partnerCompanyCode: 'EXTL', // External company not in our system
      partnerName: 'External Trading Co',
      conditions: [
        createMockContractCondition({
          type: 'DELIVERY',
          party: 'PROVIDER',
          status: 'PENDING',
          materialTicker: 'RAT',
          materialAmount: 1000,
          address: 'Moria Station (MOR)',
        }),
      ],
    })

    return { user, contract }
  },

  /**
   * Fulfilled contract scenario
   */
  fulfilledContract: () => {
    return createMockContract({
      status: 'FULFILLED',
      conditions: [
        createMockContractCondition({
          type: 'PROVISION',
          party: 'PROVIDER',
          status: 'FULFILLED',
          materialTicker: 'H2O',
          materialAmount: 1000,
          address: 'Benten Station (BEN)',
        }),
        createMockContractCondition({
          type: 'DELIVERY',
          party: 'PROVIDER',
          status: 'FULFILLED',
          materialTicker: 'H2O',
          materialAmount: 1000,
          address: 'Benten Station (BEN)',
          conditionIndex: 1,
        }),
        createMockContractCondition({
          type: 'PAYMENT',
          party: 'CUSTOMER',
          status: 'FULFILLED',
          materialTicker: null,
          materialAmount: null,
          amount: 10000,
          currency: 'CIS',
          conditionIndex: 2,
        }),
      ],
    })
  },
}

// ==================== Mock FIO Client ====================

/**
 * Mock FIO Client for integration testing
 *
 * Provides a drop-in replacement for the real FioClient
 * that returns configurable mock data.
 */
export class MockFioClient {
  private userData: FioApiUserData | null = null
  private groupHubData: FioGroupHubResponse | null = null
  private contractsData: FioApiContract[] = []
  private shouldFail = false
  private failureError: Error | null = null

  /**
   * Configure mock user data response
   */
  setUserData(data: FioApiUserData): this {
    this.userData = data
    return this
  }

  /**
   * Configure mock GroupHub response
   */
  setGroupHubData(data: FioGroupHubResponse): this {
    this.groupHubData = data
    return this
  }

  /**
   * Configure mock contracts response
   */
  setContractsData(data: FioApiContract[]): this {
    this.contractsData = data
    return this
  }

  /**
   * Configure the client to fail with an error
   */
  setFailure(error: Error): this {
    this.shouldFail = true
    this.failureError = error
    return this
  }

  /**
   * Reset all mock data
   */
  reset(): this {
    this.userData = null
    this.groupHubData = null
    this.contractsData = []
    this.shouldFail = false
    this.failureError = null
    return this
  }

  // FioClient interface methods

  async getUserData<T>(_apiKey: string, _username: string): Promise<T> {
    if (this.shouldFail) throw this.failureError
    if (!this.userData) throw new Error('Mock user data not configured')
    return this.userData as T
  }

  async getGroupHub<T>(_apiKey: string, _usernames: string[]): Promise<T> {
    if (this.shouldFail) throw this.failureError
    if (!this.groupHubData) {
      return createMockGroupHubResponse() as T
    }
    return this.groupHubData as T
  }

  async getUserContracts<T>(_apiKey: string): Promise<T> {
    if (this.shouldFail) throw this.failureError
    return this.contractsData as T
  }

  // Additional mock methods that may be needed
  async fetchJson<T>(_endpoint: string): Promise<T> {
    if (this.shouldFail) throw this.failureError
    return {} as T
  }

  async fetchCsv(_endpoint: string): Promise<string> {
    if (this.shouldFail) throw this.failureError
    return ''
  }
}

/**
 * Create a pre-configured mock client for a test scenario
 */
export function createMockFioClientForScenario(
  scenario: keyof typeof FioTestScenarios
): MockFioClient {
  const client = new MockFioClient()
  const data = FioTestScenarios[scenario]()

  if ('userData' in data) {
    client.setUserData(data.userData)
  }
  if ('groupHub' in data) {
    client.setGroupHubData(data.groupHub)
  }
  if ('contracts' in data && Array.isArray(data.contracts)) {
    client.setContractsData(data.contracts)
  }
  if ('contract' in data) {
    client.setContractsData([data.contract])
  }

  return client
}
