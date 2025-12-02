// In-memory cache for user roles with TTL and manual invalidation
// This reduces database load while ensuring role changes propagate quickly

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  roles: string[]
  expiresAt: number
}

const cache = new Map<number, CacheEntry>()

/**
 * Get cached roles for a user
 * Returns undefined if not cached or expired
 */
export function getCachedRoles(userId: number): string[] | undefined {
  const entry = cache.get(userId)
  if (!entry) return undefined

  if (Date.now() > entry.expiresAt) {
    cache.delete(userId)
    return undefined
  }

  return entry.roles
}

/**
 * Cache roles for a user
 */
export function setCachedRoles(userId: number, roles: string[]): void {
  cache.set(userId, {
    roles,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

/**
 * Invalidate cached roles for a user
 * Call this when roles are updated
 */
export function invalidateCachedRoles(userId: number): void {
  cache.delete(userId)
}

/**
 * Clear all cached roles (useful for testing)
 */
export function clearRoleCache(): void {
  cache.clear()
}
