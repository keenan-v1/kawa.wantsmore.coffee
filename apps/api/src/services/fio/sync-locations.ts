// Sync locations from FIO planets API to database
import { db, fioLocations } from '../../db/index.js'
import { fioClient } from './client.js'
import type { SyncResult } from './sync-types.js'

interface FioPlanetFull {
  PlanetId: string // UUID (not stored, we use NaturalId as key)
  PlanetNaturalId: string // Natural ID like "KW-688c"
  PlanetName: string
  SystemId: string
  // Many other fields we don't need to store
}

interface FioSystemJson {
  SystemId: string
  NaturalId: string // e.g., "KW-688"
  Name: string // e.g., "Etherwind"
}

/**
 * Sync planet locations from FIO /planet/allplanets/full endpoint (JSON)
 * Stations are synced separately via syncStations
 */
export async function syncLocations(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
  }

  try {
    // Fetch systems first to map system IDs to names/codes
    console.log('🌟 Fetching systems from FIO API...')
    const systems = await fioClient.fetchJson<FioSystemJson[]>('/systemstars')

    // Create system lookup map
    const systemMap = new Map<string, FioSystemJson>()
    systems.forEach(system => {
      systemMap.set(system.SystemId, system)
    })

    console.log(`📊 Found ${systems.length} systems`)

    // Fetch full planet data
    console.log('🪐 Fetching planets from FIO API...')
    const planets = await fioClient.fetchJson<FioPlanetFull[]>('/planet/allplanets/full')

    console.log(`📊 Found ${planets.length} planets`)

    // Process planets in batches
    const batchSize = 100
    for (let i = 0; i < planets.length; i += batchSize) {
      const batch = planets.slice(i, i + batchSize)

      for (const planet of batch) {
        try {
          const system = systemMap.get(planet.SystemId)

          if (!system) {
            result.errors.push(`System not found for planet ${planet.PlanetNaturalId}`)
            continue
          }

          // Insert or update planet location
          await db
            .insert(fioLocations)
            .values({
              naturalId: planet.PlanetNaturalId,
              name: planet.PlanetName,
              type: 'Planet',
              systemId: planet.SystemId,
              systemNaturalId: system.NaturalId,
              systemName: system.Name,
            })
            .onConflictDoUpdate({
              target: fioLocations.naturalId,
              set: {
                name: planet.PlanetName,
                systemId: planet.SystemId,
                systemNaturalId: system.NaturalId,
                systemName: system.Name,
                updatedAt: new Date(),
              },
            })

          result.inserted++
        } catch (error) {
          const errorMsg = `Failed to sync ${planet.PlanetNaturalId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          console.error(errorMsg)
        }
      }
    }

    result.success = result.errors.length === 0
    console.log(`✅ Synced ${result.inserted} locations`)

    if (result.errors.length > 0) {
      console.log(`⚠️  ${result.errors.length} errors occurred`)
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync locations: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    console.error(errorMsg)
    return result
  }
}
