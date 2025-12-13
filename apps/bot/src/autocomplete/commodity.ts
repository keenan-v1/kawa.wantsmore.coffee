import { db, fioCommodities } from '@kawakawa/db'
import { ilike, or, inArray } from 'drizzle-orm'
import { getDisplaySettings } from '../services/userSettings.js'

/**
 * Search for commodities by ticker or name.
 * If discordId is provided, user's favorites are shown first.
 */
export async function searchCommodities(
  query: string,
  limit = 25,
  discordId?: string
): Promise<{ ticker: string; name: string }[]> {
  const results: { ticker: string; name: string }[] = []
  const seenTickers = new Set<string>()

  // Get user favorites if discordId provided and query is short
  if (discordId && query.length <= 3) {
    try {
      const settings = await getDisplaySettings(discordId)
      if (settings.favoritedCommodities.length > 0) {
        const favorites = await db
          .select({
            ticker: fioCommodities.ticker,
            name: fioCommodities.name,
          })
          .from(fioCommodities)
          .where(inArray(fioCommodities.ticker, settings.favoritedCommodities))

        // Filter favorites that match the query
        for (const fav of favorites) {
          if (!query.trim() || fav.ticker.toLowerCase().includes(query.toLowerCase())) {
            results.push(fav)
            seenTickers.add(fav.ticker)
          }
        }
      }
    } catch {
      // Ignore errors fetching favorites, continue with regular search
    }
  }

  // Regular search
  let searchResults: { ticker: string; name: string }[]

  if (!query.trim()) {
    searchResults = await db
      .select({
        ticker: fioCommodities.ticker,
        name: fioCommodities.name,
      })
      .from(fioCommodities)
      .limit(limit)
  } else {
    const searchPattern = `%${query}%`
    searchResults = await db
      .select({
        ticker: fioCommodities.ticker,
        name: fioCommodities.name,
      })
      .from(fioCommodities)
      .where(
        or(ilike(fioCommodities.ticker, searchPattern), ilike(fioCommodities.name, searchPattern))
      )
      .limit(limit)
  }

  // Add search results that aren't already in favorites
  for (const result of searchResults) {
    if (!seenTickers.has(result.ticker)) {
      results.push(result)
      seenTickers.add(result.ticker)
    }
  }

  return results.slice(0, limit)
}
