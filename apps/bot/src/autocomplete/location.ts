import { db, fioLocations } from '@kawakawa/db'
import { ilike, or, inArray } from 'drizzle-orm'
import { getDisplaySettings } from '../services/userSettings.js'

/**
 * Search for locations by natural ID or name.
 * If discordId is provided, user's favorites are shown first.
 */
export async function searchLocations(
  query: string,
  limit = 25,
  discordId?: string
): Promise<{ naturalId: string; name: string; type: string }[]> {
  const results: { naturalId: string; name: string; type: string }[] = []
  const seenIds = new Set<string>()

  // Get user favorites if discordId provided and query is short
  if (discordId && query.length <= 3) {
    try {
      const settings = await getDisplaySettings(discordId)
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
            results.push(fav)
            seenIds.add(fav.naturalId)
          }
        }
      }
    } catch {
      // Ignore errors fetching favorites, continue with regular search
    }
  }

  // Regular search
  let searchResults: { naturalId: string; name: string; type: string }[]

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

  // Add search results that aren't already in favorites
  for (const result of searchResults) {
    if (!seenIds.has(result.naturalId)) {
      results.push(result)
      seenIds.add(result.naturalId)
    }
  }

  return results.slice(0, limit)
}
