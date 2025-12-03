// FIO API Client
// Handles HTTP requests to FIO REST API with proper error handling
// Official documentation: https://doc.fnar.net/

const FIO_BASE_URL = 'https://rest.fnar.net'

export class FioApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message)
    this.name = 'FioApiError'
  }
}

export class FioClient {
  private baseUrl: string
  private apiKey?: string

  constructor(apiKey?: string) {
    this.baseUrl = FIO_BASE_URL
    this.apiKey = apiKey
  }

  /**
   * Fetch CSV data from FIO API
   */
  async fetchCsv(endpoint: string, includeHeader = true): Promise<string> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    url.searchParams.set('include_header', includeHeader.toString())

    const headers: Record<string, string> = {
      'Accept': 'text/csv',
    }

    if (this.apiKey) {
      headers['Authorization'] = `FIOAPIKey ${this.apiKey}`
    }

    try {
      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.text()
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch JSON data from FIO API
   */
  async fetchJson<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `FIOAPIKey ${this.apiKey}`
    }

    try {
      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.json() as T
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  // Convenience methods for common endpoints
  async getMaterials(includeHeader = true): Promise<string> {
    return this.fetchCsv('/csv/materials', includeHeader)
  }

  async getPlanets(includeHeader = true): Promise<string> {
    return this.fetchCsv('/csv/planets', includeHeader)
  }

  async getSystems(includeHeader = true): Promise<string> {
    return this.fetchCsv('/csv/systems', includeHeader)
  }

  async getPrices(includeHeader = true): Promise<string> {
    return this.fetchCsv('/csv/prices', includeHeader)
  }

  async getOrders(includeHeader = true): Promise<string> {
    return this.fetchCsv('/csv/orders', includeHeader)
  }

  async getBuildings(includeCosts = false, includeRecipes = false): Promise<unknown> {
    const params: Record<string, string> = {}
    if (includeCosts) params.include_costs = 'true'
    if (includeRecipes) params.include_recipes = 'true'
    return this.fetchJson('/building', params)
  }

  /**
   * Fetch user inventory from FIO API
   * Uses query parameter authentication (apikey + username)
   */
  async getUserInventory(apiKey: string, username: string, includeHeader = true): Promise<string> {
    const url = new URL(`${this.baseUrl}/csv/inventory`)
    url.searchParams.set('apikey', apiKey)
    url.searchParams.set('username', username)
    url.searchParams.set('include_header', includeHeader.toString())

    const headers: Record<string, string> = {
      'Accept': 'text/csv',
    }

    try {
      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.text()
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch user inventory from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch user sites from FIO API
   * Uses query parameter authentication (apikey + username)
   */
  async getUserSites(apiKey: string, username: string, includeHeader = true): Promise<string> {
    const url = new URL(`${this.baseUrl}/csv/sites`)
    url.searchParams.set('apikey', apiKey)
    url.searchParams.set('username', username)
    url.searchParams.set('include_header', includeHeader.toString())

    const headers: Record<string, string> = {
      'Accept': 'text/csv',
    }

    try {
      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.text()
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch user sites from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch user storage data from FIO API (JSON)
   * Returns all storage locations with inventory and timestamps
   * Requires API key authentication via Authorization header
   */
  async getUserStorage<T>(apiKey: string, username: string): Promise<T> {
    const url = new URL(`${this.baseUrl}/storage/${username}`)

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': apiKey,
    }

    try {
      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.json() as T
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch user storage from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch user storage data for a specific location from FIO API (JSON)
   * StorageDescription can be: StorageId, PlanetId, PlanetNaturalId, or PlanetName
   * Returns storage data for that location, or null if not found (404)
   * Requires API key authentication via Authorization header
   */
  async getUserStorageByLocation<T>(apiKey: string, username: string, storageDescription: string): Promise<T | null> {
    const url = new URL(`${this.baseUrl}/storage/${username}/${storageDescription}`)

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': apiKey,
    }

    try {
      const response = await fetch(url.toString(), { headers })

      // Return null for 404 (user doesn't have storage at this location)
      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.json() as T
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch user storage by location from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch user data from FIO API (JSON)
   * Returns user info including planets (with ID mappings) and timestamp
   * Requires API key authentication via Authorization header
   */
  async getUserData<T>(apiKey: string, username: string): Promise<T> {
    const url = new URL(`${this.baseUrl}/user/${username}`)

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': apiKey,
    }

    try {
      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.json() as T
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch user data from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch user inventory data from FIO GroupHub endpoint (undocumented)
   * Returns comprehensive inventory data with NaturalIds and timestamps
   * - Planet bases via PlayerModels[].Locations[] with LocationIdentifier
   * - Station warehouses via CXWarehouses[] with WarehouseLocationNaturalId
   * Requires API key authentication via Authorization header
   */
  async getGroupHub<T>(apiKey: string, usernames: string[]): Promise<T> {
    const url = new URL(`${this.baseUrl}/fioweb/GroupHub`)

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(usernames),
      })

      if (!response.ok) {
        throw new FioApiError(
          `FIO API request failed: ${response.statusText}`,
          response.status,
          await response.text()
        )
      }

      return await response.json() as T
    } catch (error) {
      if (error instanceof FioApiError) {
        throw error
      }
      throw new FioApiError(
        `Failed to fetch GroupHub data from FIO API: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}

// Export singleton instance for public endpoints (commodities, locations, etc.)
export const fioClient = new FioClient(process.env.FIO_API_KEY)
