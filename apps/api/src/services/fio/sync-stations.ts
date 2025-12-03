// Sync stations from FIO commodity exchanges endpoint
import { db, fioLocations } from '../../db/index.js'
import { fioClient } from './client.js'
import type { SyncResult } from './sync-types.js'

interface FioExchangeStation {
  StationId: string // UUID (not stored, we use NaturalId as key)
  NaturalId: string // Station natural ID like "HUB", "HRT", "ANT", "ARC"
  Name: string // Station name like "Hortus Station", "Hubur Station"
  SystemId: string
  SystemNaturalId: string // System code like "TD-203", "VH-331", "ZV-307", "AM-783"
  SystemName: string // System name like "Hubur", "Hortus", "Antares I", "Arclight"
  WarehouseId: string // UUID for warehouse storage (not stored)
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
          .insert(fioLocations)
          .values({
            naturalId: station.NaturalId, // e.g., "HUB", "HRT", "ANT", "ARC"
            name: station.Name, // e.g., "Hortus Station", "Hubur Station"
            type: 'Station',
            systemId: station.SystemId,
            systemNaturalId: station.SystemNaturalId, // e.g., "TD-203", "VH-331", "ZV-307"
            systemName: station.SystemName, // e.g., "Hubur", "Hortus", "Antares I"
          })
          .onConflictDoUpdate({
            target: fioLocations.naturalId,
            set: {
              name: station.Name,
              type: 'Station',
              systemId: station.SystemId,
              systemNaturalId: station.SystemNaturalId,
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
