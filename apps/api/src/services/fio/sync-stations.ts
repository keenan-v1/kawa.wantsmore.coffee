// Sync stations from FIO commodity exchanges endpoint
import { db, locations } from '../../db/index.js'
import { fioClient } from './client.js'
import type { SyncResult } from './sync-types.js'

interface FioExchangeStation {
  StationId: string
  NaturalId: string // Station natural ID like "HUB", "HRT", "ANT", "ARC"
  Name: string // Station name like "Hortus Station", "Hubur Station"
  SystemId: string
  SystemNaturalId: string // System code like "TD-203", "VH-331", "ZV-307", "AM-783"
  SystemName: string // System name like "Hubur", "Hortus", "Antares I", "Arclight"
  CommisionTimeEpochMs: number
  ComexId: string
  ComexName: string // Exchange name like "Hubur Commodity Exchange"
  ComexCode: string // Exchange code like "NC2", "IC1", "AI1", "CI2"
  WarehouseId: string
  CountryId: string
  CountryCode: string // e.g., "CI", "NC", "AI", "IC"
  CountryName: string // e.g., "Castillo-Ito Mercantile"
  CurrencyNumericCode: number
  CurrencyCode: string // e.g., "ICA", "NCC", "CIS", "AIC"
  CurrencyName: string // e.g., "Austral", "NCE Coupons", "Sol"
  CurrencyDecimals: number
  UserNameSubmitted: string
  Timestamp: string
}

/**
 * Sync stations from FIO exchange station endpoint
 * These are the major trading hubs/stations in the game
 * Each exchange is located at a station
 *
 * Uses /exchange/station which provides complete station info including system details
 */
export async function syncStations(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
  }

  try {
    console.log('🏛️  Fetching commodity exchanges from FIO API...')
    const stations = await fioClient.fetchJson<FioExchangeStation[]>('/exchange/station')

    console.log(`📊 Found ${stations.length} commodity exchanges`)

    for (const station of stations) {
      try {
        // Upsert station with complete system information
        await db
          .insert(locations)
          .values({
            id: station.NaturalId, // e.g., "HUB", "HRT", "ANT", "ARC"
            name: station.Name, // e.g., "Hortus Station", "Hubur Station"
            type: 'Station',
            systemCode: station.SystemNaturalId, // e.g., "TD-203", "VH-331", "ZV-307"
            systemName: station.SystemName, // e.g., "Hubur", "Hortus", "Antares I"
          })
          .onConflictDoUpdate({
            target: locations.id,
            set: {
              name: station.Name,
              type: 'Station',
              systemCode: station.SystemNaturalId,
              systemName: station.SystemName,
              updatedAt: new Date(),
            },
          })

        result.inserted++
      } catch (error) {
        const errorMsg = `Failed to sync station ${station.NaturalId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }

    result.success = result.errors.length === 0
    console.log(`✅ Synced ${result.inserted} stations`)

    if (result.errors.length > 0) {
      console.log(`⚠️  ${result.errors.length} errors occurred`)
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync stations: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    console.error(errorMsg)
    return result
  }
}
