/**
 * FIO API Client
 * Handles HTTP requests to FIO REST API for user inventory sync
 */

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

  constructor() {
    this.baseUrl = FIO_BASE_URL
  }

  /**
   * Fetch user inventory data from FIO GroupHub endpoint
   * Returns comprehensive inventory data with NaturalIds and timestamps
   * - Planet bases via PlayerModels[].Locations[] with LocationIdentifier
   * - Station warehouses via CXWarehouses[] with WarehouseLocationNaturalId
   * Requires API key authentication via Authorization header
   */
  async getGroupHub<T>(apiKey: string, usernames: string[]): Promise<T> {
    const url = new URL(`${this.baseUrl}/fioweb/GroupHub`)

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: apiKey,
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

      return (await response.json()) as T
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
