import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FioClient, FioApiError } from './client.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('FioClient', () => {
  let client: FioClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new FioClient()
  })

  afterEach(() => {
    client.clearJumpCountCache()
  })

  describe('constructor', () => {
    it('should create client without API key', () => {
      const c = new FioClient()
      expect(c).toBeInstanceOf(FioClient)
    })

    it('should create client with API key', () => {
      const c = new FioClient('my-api-key')
      expect(c).toBeInstanceOf(FioClient)
    })
  })

  describe('fetchCsv', () => {
    it('should fetch CSV data successfully', async () => {
      const csvData = 'Header1,Header2\nValue1,Value2'
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(csvData),
      })

      const result = await client.fetchCsv('/test/endpoint')

      expect(result).toBe(csvData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test/endpoint'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'text/csv',
          }),
        })
      )
    })

    it('should include header parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('data'),
      })

      await client.fetchCsv('/test', false)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('include_header=false'),
        expect.anything()
      )
    })

    it('should include API key in Authorization header when set', async () => {
      const clientWithKey = new FioClient('test-key')
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('data'),
      })

      await clientWithKey.fetchCsv('/test')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'FIOAPIKey test-key',
          }),
        })
      )
    })

    it('should throw FioApiError on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Error details'),
      })

      await expect(client.fetchCsv('/test')).rejects.toThrow(FioApiError)
    })

    it('should throw FioApiError on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(client.fetchCsv('/test')).rejects.toThrow(FioApiError)
    })
  })

  describe('fetchJson', () => {
    it('should fetch JSON data successfully', async () => {
      const jsonData = { foo: 'bar' }
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(jsonData),
      })

      const result = await client.fetchJson<typeof jsonData>('/test')

      expect(result).toEqual(jsonData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      )
    })

    it('should include query parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await client.fetchJson('/test', { param1: 'value1', param2: 'value2' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/param1=value1.*param2=value2|param2=value2.*param1=value1/),
        expect.anything()
      )
    })

    it('should throw FioApiError on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      })

      await expect(client.fetchJson('/test')).rejects.toThrow(FioApiError)
    })

    it('should throw FioApiError on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'))

      await expect(client.fetchJson('/test')).rejects.toThrow(FioApiError)
    })

    it('should re-throw FioApiError without wrapping', async () => {
      const originalError = new FioApiError('Original error', 500)
      mockFetch.mockRejectedValue(originalError)

      try {
        await client.fetchJson('/test')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBe(originalError)
      }
    })
  })

  describe('convenience methods', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('csv data'),
        json: () => Promise.resolve({}),
      })
    })

    it('getMaterials should call correct endpoint', async () => {
      await client.getMaterials()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/csv/materials'),
        expect.anything()
      )
    })

    it('getPlanets should call correct endpoint', async () => {
      await client.getPlanets()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/csv/planets'),
        expect.anything()
      )
    })

    it('getSystems should call correct endpoint', async () => {
      await client.getSystems()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/csv/systems'),
        expect.anything()
      )
    })

    it('getPrices should call correct endpoint', async () => {
      await client.getPrices()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/csv/prices'),
        expect.anything()
      )
    })

    it('getOrders should call correct endpoint', async () => {
      await client.getOrders()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/csv/orders'),
        expect.anything()
      )
    })

    it('getBuildings should call correct endpoint with params', async () => {
      await client.getBuildings(true, true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/building.*include_costs=true.*include_recipes=true/),
        expect.anything()
      )
    })
  })

  describe('getUserInventory', () => {
    it('should fetch user inventory with auth params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('inventory data'),
      })

      await client.getUserInventory('api-key', 'username')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/csv\/inventory.*apikey=api-key.*username=username/),
        expect.anything()
      )
    })

    it('should throw FioApiError on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      })

      await expect(client.getUserInventory('bad-key', 'user')).rejects.toThrow(FioApiError)
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'))

      await expect(client.getUserInventory('key', 'user')).rejects.toThrow(FioApiError)
    })
  })

  describe('getUserSites', () => {
    it('should fetch user sites with auth params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('sites data'),
      })

      await client.getUserSites('api-key', 'username')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/csv\/sites.*apikey=api-key.*username=username/),
        expect.anything()
      )
    })

    it('should throw FioApiError on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      })

      await expect(client.getUserSites('bad-key', 'user')).rejects.toThrow(FioApiError)
    })
  })

  describe('getUserStorage', () => {
    it('should fetch user storage with Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ StorageId: '123' }]),
      })

      await client.getUserStorage('api-key', 'username')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/username'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'api-key',
          }),
        })
      )
    })

    it('should throw FioApiError on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied'),
      })

      await expect(client.getUserStorage('key', 'user')).rejects.toThrow(FioApiError)
    })
  })

  describe('getUserStorageByLocation', () => {
    it('should fetch storage for specific location', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ StorageId: '123' }),
      })

      await client.getUserStorageByLocation('api-key', 'username', 'BEN')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/username/BEN'),
        expect.anything()
      )
    })

    it('should return null for 404 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await client.getUserStorageByLocation('key', 'user', 'UNKNOWN')

      expect(result).toBeNull()
    })

    it('should throw FioApiError on other errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('Error'),
      })

      await expect(
        client.getUserStorageByLocation('key', 'user', 'location')
      ).rejects.toThrow(FioApiError)
    })
  })

  describe('getUserData', () => {
    it('should fetch user data with Authorization header', async () => {
      const userData = {
        UserId: '123',
        UserName: 'TestUser',
        CompanyCode: 'TEST',
      }
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(userData),
      })

      const result = await client.getUserData('api-key', 'username')

      expect(result).toEqual(userData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/user/username'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'api-key',
          }),
        })
      )
    })

    it('should throw FioApiError on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid key'),
      })

      await expect(client.getUserData('bad-key', 'user')).rejects.toThrow(FioApiError)
    })
  })

  describe('getGroupHub', () => {
    it('should POST to GroupHub endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ PlayerModels: [] }),
      })

      await client.getGroupHub('api-key', ['user1', 'user2'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/fioweb/GroupHub'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'api-key',
          }),
          body: JSON.stringify(['user1', 'user2']),
        })
      )
    })

    it('should throw FioApiError on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('Error'),
      })

      await expect(client.getGroupHub('key', ['user'])).rejects.toThrow(FioApiError)
    })
  })

  describe('getUserContracts', () => {
    it('should fetch contracts with Authorization header', async () => {
      const contracts = [{ ContractId: '123' }]
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(contracts),
      })

      const result = await client.getUserContracts('api-key')

      expect(result).toEqual(contracts)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contract/allcontracts'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'api-key',
          }),
        })
      )
    })

    it('should throw FioApiError on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid key'),
      })

      await expect(client.getUserContracts('bad-key')).rejects.toThrow(FioApiError)
    })
  })

  describe('getJumpCount', () => {
    it('should fetch jump count between locations', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(5),
      })

      const result = await client.getJumpCount('BEN', 'MOR')

      expect(result).toBe(5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/systemstars/jumpcount/BEN/MOR'),
        expect.anything()
      )
    })

    it('should cache jump count results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(3),
      })

      await client.getJumpCount('A', 'B')
      await client.getJumpCount('A', 'B')

      // Should only call fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should use same cache key regardless of direction', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(3),
      })

      await client.getJumpCount('BEN', 'MOR')
      await client.getJumpCount('MOR', 'BEN')

      // Should only call fetch once due to normalized cache key
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should return null and cache for 404 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Route not found'),
      })

      const result1 = await client.getJumpCount('UNKNOWN1', 'UNKNOWN2')
      const result2 = await client.getJumpCount('UNKNOWN1', 'UNKNOWN2')

      expect(result1).toBeNull()
      expect(result2).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(1) // Cached null result
    })

    it('should throw FioApiError on other errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('Error'),
      })

      await expect(client.getJumpCount('A', 'B')).rejects.toThrow(FioApiError)
    })
  })

  describe('cache management', () => {
    it('getJumpCountCacheSize should return cache size', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(3),
      })

      expect(client.getJumpCountCacheSize()).toBe(0)

      await client.getJumpCount('A', 'B')
      expect(client.getJumpCountCacheSize()).toBe(1)

      await client.getJumpCount('C', 'D')
      expect(client.getJumpCountCacheSize()).toBe(2)
    })

    it('clearJumpCountCache should clear cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(3),
      })

      await client.getJumpCount('A', 'B')
      expect(client.getJumpCountCacheSize()).toBe(1)

      client.clearJumpCountCache()
      expect(client.getJumpCountCacheSize()).toBe(0)
    })
  })
})

describe('FioApiError', () => {
  it('should create error with message only', () => {
    const error = new FioApiError('Test error')
    expect(error.message).toBe('Test error')
    expect(error.name).toBe('FioApiError')
    expect(error.statusCode).toBeUndefined()
    expect(error.response).toBeUndefined()
  })

  it('should create error with status code', () => {
    const error = new FioApiError('Test error', 404)
    expect(error.statusCode).toBe(404)
  })

  it('should create error with response', () => {
    const error = new FioApiError('Test error', 500, { detail: 'Server error' })
    expect(error.response).toEqual({ detail: 'Server error' })
  })
})
