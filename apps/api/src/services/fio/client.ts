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
}

// Export singleton instance
export const fioClient = new FioClient(process.env.FIO_API_KEY)
