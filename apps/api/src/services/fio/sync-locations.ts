// Sync locations from FIO planets and systems APIs to database
import { db, locations } from '../../db/index.js'
import { fioClient } from './client.js'
import { parseCsvTyped } from './csv-parser.js'
import type { FioPlanet, FioSystem } from './types.js'
import type { SyncResult } from './sync-types.js'

/**
 * Sync planet locations from FIO planets and systems endpoints
 * FIO /csv/planets returns planetary bodies only (not stations)
 * Systems are joined by SystemId to get systemCode and systemName
 * Stations are synced separately via syncStations (from /global/comexexchanges)
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
    const systemsCsv = await fioClient.getSystems()
    const systems = parseCsvTyped<FioSystem>(systemsCsv)

    // Create system lookup map
    const systemMap = new Map<string, FioSystem>()
    systems.forEach(system => {
      systemMap.set(system.SystemId, system)
    })

    console.log(`📊 Found ${systems.length} systems`)

    // Fetch planets
    console.log('🪐 Fetching planets from FIO API...')
    const planetsCsv = await fioClient.getPlanets()
    const planets = parseCsvTyped<FioPlanet>(planetsCsv)

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
            .insert(locations)
            .values({
              id: planet.PlanetNaturalId, // Use natural ID like "UV-351a"
              name: planet.PlanetName,
              type: 'Planet', // FIO only provides planets
              systemCode: system.NaturalId, // e.g., "UV-351"
              systemName: system.Name, // e.g., "Benton"
            })
            .onConflictDoUpdate({
              target: locations.id,
              set: {
                name: planet.PlanetName,
                // Don't update type on conflict - preserve manually added stations
                systemCode: system.NaturalId,
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
