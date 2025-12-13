// Permission service for checking user permissions based on roles
// Uses caching to reduce database load

import { db, rolePermissions } from '@kawakawa/db'
import { inArray } from 'drizzle-orm'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface PermissionCacheEntry {
  permissions: Map<string, boolean> // permissionId -> allowed
  expiresAt: number
}

// Cache by a sorted role string (e.g., "admin,member,lead")
const permissionCache = new Map<string, PermissionCacheEntry>()

/**
 * Create a cache key from a list of roles
 */
function getCacheKey(roleIds: string[]): string {
  return [...roleIds].sort().join(',')
}

/**
 * Get cached permissions for a set of roles
 */
function getCachedPermissions(roleIds: string[]): Map<string, boolean> | undefined {
  const key = getCacheKey(roleIds)
  const entry = permissionCache.get(key)
  if (!entry) return undefined

  if (Date.now() > entry.expiresAt) {
    permissionCache.delete(key)
    return undefined
  }

  return entry.permissions
}

/**
 * Cache permissions for a set of roles
 */
function setCachedPermissions(roleIds: string[], permissions: Map<string, boolean>): void {
  const key = getCacheKey(roleIds)
  permissionCache.set(key, {
    permissions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

/**
 * Invalidate all permission caches (call when role permissions are modified)
 */
export function invalidatePermissionCache(): void {
  permissionCache.clear()
}

/**
 * Fetch permissions for a set of roles from the database
 */
async function fetchPermissions(roleIds: string[]): Promise<Map<string, boolean>> {
  if (roleIds.length === 0) {
    return new Map()
  }

  const results = await db
    .select({
      permissionId: rolePermissions.permissionId,
      allowed: rolePermissions.allowed,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds))

  // Aggregate permissions across roles
  // If any role grants a permission (allowed=true), it's granted
  // unless another role explicitly denies it (allowed=false)
  const permissions = new Map<string, boolean>()

  for (const row of results) {
    const current = permissions.get(row.permissionId)
    if (current === undefined) {
      // First entry for this permission
      permissions.set(row.permissionId, row.allowed)
    } else if (row.allowed === false) {
      // Explicit deny takes precedence
      permissions.set(row.permissionId, false)
    }
    // If current is true and row.allowed is true, no change needed
  }

  return permissions
}

/**
 * Get all permissions for a set of roles (with caching)
 */
export async function getPermissions(roleIds: string[]): Promise<Map<string, boolean>> {
  // Check cache first
  const cached = getCachedPermissions(roleIds)
  if (cached) {
    return cached
  }

  // Fetch from database
  const permissions = await fetchPermissions(roleIds)

  // Cache the result
  setCachedPermissions(roleIds, permissions)

  return permissions
}

/**
 * Check if a user with given roles has a specific permission
 */
export async function hasPermission(roleIds: string[], permissionId: string): Promise<boolean> {
  const permissions = await getPermissions(roleIds)
  return permissions.get(permissionId) === true
}

/**
 * Check if a user with given roles has all of the specified permissions
 */
export async function hasAllPermissions(
  roleIds: string[],
  permissionIds: string[]
): Promise<boolean> {
  const permissions = await getPermissions(roleIds)
  return permissionIds.every(id => permissions.get(id) === true)
}

/**
 * Check if a user with given roles has any of the specified permissions
 */
export async function hasAnyPermission(
  roleIds: string[],
  permissionIds: string[]
): Promise<boolean> {
  const permissions = await getPermissions(roleIds)
  return permissionIds.some(id => permissions.get(id) === true)
}

/**
 * Clear permission cache (useful for testing)
 */
export function clearPermissionCache(): void {
  permissionCache.clear()
}

// Export as namespace for cleaner imports
export const permissionService = {
  getPermissions,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  invalidatePermissionCache,
  clearPermissionCache,
}

export default permissionService
