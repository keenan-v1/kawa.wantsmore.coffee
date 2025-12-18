import { db, fioLocations, fioUserStorage, userDiscordProfiles } from '@kawakawa/db'
import { ilike, or, inArray, eq } from 'drizzle-orm'
import { getDisplaySettings } from '../services/userSettings.js'

type LocationResult = { naturalId: string; name: string; type: string }

// Location type sort priority: Station > Planet
const locationTypePriority: Record<string, number> = {
  Station: 0,
  Planet: 1,
}

/**
 * Sort locations by type (Station > Planet), then alphabetically by name.
 */
function sortByTypeThenName(locations: LocationResult[]): LocationResult[] {
  return [...locations].sort((a, b) => {
    const aPriority = locationTypePriority[a.type] ?? 99
    const bPriority = locationTypePriority[b.type] ?? 99
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.name.localeCompare(b.name)
  })
}

/**
 * Get user's storage location IDs from their synced inventory.
 */
async function getUserStorageLocationIds(discordId: string): Promise<Set<string>> {
  try {
    // Get user ID from Discord profile
    const profile = await db
      .select({ userId: userDiscordProfiles.userId })
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.discordId, discordId))
      .limit(1)

    if (profile.length === 0) return new Set()

    // Get unique location IDs from user's storage
    const storages = await db
      .select({ locationId: fioUserStorage.locationId })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, profile[0].userId))

    return new Set(storages.map(s => s.locationId).filter((id): id is string => id !== null))
  } catch {
    return new Set()
  }
}

/**
 * Search for locations by natural ID or name.
 * If discordId is provided, user's favorites are shown first, then user's storage locations.
 * Results are sorted: Favorites > User locations > Others (Station > Planet within each group)
 */
export async function searchLocations(
  query: string,
  limit = 25,
  discordId?: string
): Promise<LocationResult[]> {
  const favoriteResults: LocationResult[] = []
  const userLocationResults: LocationResult[] = []
  const seenIds = new Set<string>()
  let userLocationIds = new Set<string>()

  // Get user favorites and storage locations if discordId provided and query is short
  if (discordId && query.length <= 3) {
    try {
      const [settings, storageIds] = await Promise.all([
        getDisplaySettings(discordId),
        getUserStorageLocationIds(discordId),
      ])
      userLocationIds = storageIds

      if (settings.favoritedLocations.length > 0) {
        const favorites = await db
          .select({
            naturalId: fioLocations.naturalId,
            name: fioLocations.name,
            type: fioLocations.type,
          })
          .from(fioLocations)
          .where(inArray(fioLocations.naturalId, settings.favoritedLocations))

        // Filter favorites that match the query
        for (const fav of favorites) {
          if (
            !query.trim() ||
            fav.naturalId.toLowerCase().includes(query.toLowerCase()) ||
            fav.name.toLowerCase().includes(query.toLowerCase())
          ) {
            favoriteResults.push(fav)
            seenIds.add(fav.naturalId)
          }
        }
      }

      // Get user storage locations that aren't already favorites
      if (userLocationIds.size > 0) {
        const userLocIds = Array.from(userLocationIds).filter(id => !seenIds.has(id))
        if (userLocIds.length > 0) {
          const userLocs = await db
            .select({
              naturalId: fioLocations.naturalId,
              name: fioLocations.name,
              type: fioLocations.type,
            })
            .from(fioLocations)
            .where(inArray(fioLocations.naturalId, userLocIds))

          // Filter user locations that match the query
          for (const loc of userLocs) {
            if (
              !query.trim() ||
              loc.naturalId.toLowerCase().includes(query.toLowerCase()) ||
              loc.name.toLowerCase().includes(query.toLowerCase())
            ) {
              userLocationResults.push(loc)
              seenIds.add(loc.naturalId)
            }
          }
        }
      }
    } catch {
      // Ignore errors fetching favorites/user locations, continue with regular search
    }
  }

  // Regular search
  let searchResults: LocationResult[]

  if (!query.trim()) {
    searchResults = await db
      .select({
        naturalId: fioLocations.naturalId,
        name: fioLocations.name,
        type: fioLocations.type,
      })
      .from(fioLocations)
      .limit(limit)
  } else {
    const searchPattern = `%${query}%`
    searchResults = await db
      .select({
        naturalId: fioLocations.naturalId,
        name: fioLocations.name,
        type: fioLocations.type,
      })
      .from(fioLocations)
      .where(
        or(ilike(fioLocations.naturalId, searchPattern), ilike(fioLocations.name, searchPattern))
      )
      .limit(limit)
  }

  // Filter out already-added results
  const otherResults: LocationResult[] = []
  for (const result of searchResults) {
    if (!seenIds.has(result.naturalId)) {
      otherResults.push(result)
      seenIds.add(result.naturalId)
    }
  }

  // Sort each group by type, then alphabetically, then combine
  // Order: Favorites > User storage locations > Others
  const sortedFavorites = sortByTypeThenName(favoriteResults)
  const sortedUserLocations = sortByTypeThenName(userLocationResults)
  const sortedOthers = sortByTypeThenName(otherResults)

  return [...sortedFavorites, ...sortedUserLocations, ...sortedOthers].slice(0, limit)
}
