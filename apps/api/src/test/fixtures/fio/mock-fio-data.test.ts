import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMockUserData,
  createMockContract,
  createMockContractCondition,
  createMockGroupHubResponse,
  createMockStorageItem,
  createMockStorage,
  createMockLocation,
  createMockPlayerModel,
  createMockCXWarehouse,
  FioTestScenarios,
  MockFioClient,
  createMockFioClientForScenario,
} from './mock-fio-data.js'

describe('FIO Mock Data Factories', () => {
  describe('createMockUserData', () => {
    it('should create default user data', () => {
      const userData = createMockUserData()

      expect(userData.UserName).toBe('MockUser')
      expect(userData.CompanyCode).toBe('MOCK')
      expect(userData.CorporationCode).toBe('KAWA')
      expect(userData.Timestamp).toBeDefined()
    })

    it('should allow customization', () => {
      const userData = createMockUserData({
        userName: 'CustomUser',
        companyCode: 'CUST',
        corporationCode: null,
      })

      expect(userData.UserName).toBe('CustomUser')
      expect(userData.CompanyCode).toBe('CUST')
      expect(userData.CorporationCode).toBeNull()
    })
  })

  describe('createMockContractCondition', () => {
    it('should create default provision condition', () => {
      const condition = createMockContractCondition()

      expect(condition.Type).toBe('PROVISION')
      expect(condition.Party).toBe('PROVIDER')
      expect(condition.Status).toBe('PENDING')
      expect(condition.MaterialTicker).toBe('H2O')
      expect(condition.MaterialAmount).toBe(1000)
    })

    it('should allow creating payment condition', () => {
      const condition = createMockContractCondition({
        type: 'PAYMENT',
        party: 'CUSTOMER',
        materialTicker: null,
        materialAmount: null,
        amount: 5000,
        currency: 'CIS',
      })

      expect(condition.Type).toBe('PAYMENT')
      expect(condition.MaterialTicker).toBeNull()
      expect(condition.Amount).toBe(5000)
      expect(condition.Currency).toBe('CIS')
    })
  })

  describe('createMockContract', () => {
    it('should create default contract with one condition', () => {
      const contract = createMockContract()

      expect(contract.Party).toBe('PROVIDER')
      expect(contract.Status).toBe('PENDING')
      expect(contract.Conditions).toHaveLength(1)
      expect(contract.ContractId).toBeDefined()
      expect(contract.ContractLocalId).toBeDefined()
    })

    it('should allow customizing contract status and conditions', () => {
      const contract = createMockContract({
        status: 'FULFILLED',
        partnerCompanyCode: 'ACME',
        conditions: [
          createMockContractCondition({ type: 'PROVISION', status: 'FULFILLED' }),
          createMockContractCondition({ type: 'PAYMENT', status: 'FULFILLED' }),
        ],
      })

      expect(contract.Status).toBe('FULFILLED')
      expect(contract.PartnerCompanyCode).toBe('ACME')
      expect(contract.Conditions).toHaveLength(2)
    })
  })

  describe('createMockStorageItem', () => {
    it('should create default storage item', () => {
      const item = createMockStorageItem()

      expect(item.MaterialTicker).toBe('H2O')
      expect(item.MaterialName).toBe('Water')
      expect(item.Units).toBe(1000)
    })
  })

  describe('createMockStorage', () => {
    it('should create storage with default items', () => {
      const storage = createMockStorage()

      expect(storage.StorageType).toBe('STORE')
      expect(storage.Items).toHaveLength(1)
      expect(storage.LastUpdated).toBeDefined()
    })
  })

  describe('createMockLocation', () => {
    it('should create location with base storage', () => {
      const location = createMockLocation()

      expect(location.LocationIdentifier).toBe('UV-351a')
      expect(location.BaseStorage).toBeDefined()
      expect(location.WarehouseStorage).toBeNull()
    })

    it('should allow location with both storage types', () => {
      const location = createMockLocation({
        locationId: 'BEN',
        baseStorage: createMockStorage({ storageType: 'STORE' }),
        warehouseStorage: createMockStorage({ storageType: 'WAREHOUSE_STORE' }),
      })

      expect(location.LocationIdentifier).toBe('BEN')
      expect(location.BaseStorage).toBeDefined()
      expect(location.WarehouseStorage).toBeDefined()
    })
  })

  describe('createMockGroupHubResponse', () => {
    it('should create response with default player model', () => {
      const response = createMockGroupHubResponse()

      expect(response.PlayerModels).toHaveLength(1)
      expect(response.CXWarehouses).toHaveLength(0)
    })

    it('should allow custom CX warehouses', () => {
      const response = createMockGroupHubResponse({
        cxWarehouses: [createMockCXWarehouse()],
        playerModels: [],
      })

      expect(response.CXWarehouses).toHaveLength(1)
      expect(response.PlayerModels).toHaveLength(0)
    })
  })
})

describe('FioTestScenarios', () => {
  describe('basicUser', () => {
    it('should create a basic user scenario', () => {
      const scenario = FioTestScenarios.basicUser()

      expect(scenario.userData.UserName).toBe('BasicUser')
      expect(scenario.userData.CompanyCode).toBe('BASIC')
      expect(scenario.groupHub.PlayerModels).toHaveLength(1)
      expect(scenario.contracts).toHaveLength(0)
    })
  })

  describe('multiBaseUser', () => {
    it('should create user with multiple bases and CX warehouse', () => {
      const scenario = FioTestScenarios.multiBaseUser()

      expect(scenario.userData.CompanyCode).toBe('MULTI')
      expect(scenario.groupHub.PlayerModels[0].Locations).toHaveLength(2)
      expect(scenario.groupHub.CXWarehouses).toHaveLength(1)
    })
  })

  describe('internalTrade', () => {
    it('should create two KAWA members with contract', () => {
      const scenario = FioTestScenarios.internalTrade()

      expect(scenario.seller.CorporationCode).toBe('KAWA')
      expect(scenario.buyer.CorporationCode).toBe('KAWA')
      expect(scenario.contract.Conditions).toHaveLength(2)
      expect(scenario.contract.PartnerCompanyCode).toBe('BUYR')
    })
  })

  describe('externalTrade', () => {
    it('should create trade with external partner', () => {
      const scenario = FioTestScenarios.externalTrade()

      expect(scenario.user.CorporationCode).toBe('KAWA')
      expect(scenario.contract.PartnerCompanyCode).toBe('EXTL')
    })
  })

  describe('fulfilledContract', () => {
    it('should create fully fulfilled contract', () => {
      const contract = FioTestScenarios.fulfilledContract()

      expect(contract.Status).toBe('FULFILLED')
      expect(contract.Conditions.every(c => c.Status === 'FULFILLED')).toBe(true)
    })
  })
})

describe('MockFioClient', () => {
  let client: MockFioClient

  beforeEach(() => {
    client = new MockFioClient()
  })

  it('should return configured user data', async () => {
    const userData = createMockUserData({ userName: 'TestUser' })
    client.setUserData(userData)

    const result = await client.getUserData('key', 'TestUser')

    expect(result).toEqual(userData)
  })

  it('should return configured GroupHub data', async () => {
    const groupHub = createMockGroupHubResponse()
    client.setGroupHubData(groupHub)

    const result = await client.getGroupHub('key', ['user'])

    expect(result).toEqual(groupHub)
  })

  it('should return default GroupHub when not configured', async () => {
    const result = await client.getGroupHub('key', ['user'])

    expect(result.PlayerModels).toBeDefined()
  })

  it('should return configured contracts', async () => {
    const contracts = [createMockContract(), createMockContract()]
    client.setContractsData(contracts)

    const result = await client.getUserContracts('key')

    expect(result).toEqual(contracts)
  })

  it('should throw when configured to fail', async () => {
    const error = new Error('API Error')
    client.setFailure(error)

    await expect(client.getUserData('key', 'user')).rejects.toThrow('API Error')
    await expect(client.getGroupHub('key', ['user'])).rejects.toThrow('API Error')
    await expect(client.getUserContracts('key')).rejects.toThrow('API Error')
  })

  it('should reset all configuration', async () => {
    client
      .setUserData(createMockUserData())
      .setFailure(new Error('test'))
      .reset()

    // After reset, getUserData should throw because data is not configured
    await expect(client.getUserData('key', 'user')).rejects.toThrow('Mock user data not configured')
  })

  it('should support chaining', () => {
    const result = client
      .setUserData(createMockUserData())
      .setGroupHubData(createMockGroupHubResponse())
      .setContractsData([])

    expect(result).toBe(client)
  })
})

describe('createMockFioClientForScenario', () => {
  it('should create client for basicUser scenario', async () => {
    const client = createMockFioClientForScenario('basicUser')

    const userData = await client.getUserData('key', 'user')
    const groupHub = await client.getGroupHub('key', ['user'])
    const contracts = await client.getUserContracts('key')

    expect(userData).toBeDefined()
    expect(groupHub.PlayerModels).toHaveLength(1)
    expect(contracts).toHaveLength(0)
  })

  it('should create client for internalTrade scenario', async () => {
    const client = createMockFioClientForScenario('internalTrade')

    const contracts = await client.getUserContracts('key')

    expect(contracts).toHaveLength(1)
  })
})
