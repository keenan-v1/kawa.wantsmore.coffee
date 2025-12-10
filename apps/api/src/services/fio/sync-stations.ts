// Sync stations from FIO commodity exchanges endpoint
import { db, fioLocations } from '../../db/index.js'
import { fioClient } from './client.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../../utils/logger.js'
import { syncService } from '../syncService.js'

const log = createLogger({ service: 'fio-sync', entity: 'stations' })

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
    log.info('Fetching commodity exchanges from FIO API')
    const stations = await fioClient.fetchJson<FioExchangeStation[]>('/exchange/station')

    log.info({ count: stations.length }, 'Found commodity exchanges')

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
        log.error({ stationId: station.NaturalId, err: error }, 'Failed to sync station')
      }
    }

    result.success = result.errors.length === 0
    log.info({ inserted: result.inserted }, 'Synced stations')

    if (result.errors.length > 0) {
      log.warn({ errorCount: result.errors.length }, 'Errors occurred during sync')
    }

    // Bump locations data version if any stations were synced (stations are locations)
    if (result.inserted > 0) {
      await syncService.bumpDataVersion('locations')
      log.info('Bumped locations data version')
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync stations: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ err: error }, 'Failed to sync stations')
    return result
  }
}
