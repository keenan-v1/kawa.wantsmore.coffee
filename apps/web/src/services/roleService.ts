// Role service - fetches from backend API with caching

import type { Role } from '../types'

// Cache for roles to avoid repeated API calls
let cachedRoles: Role[] | null = null

// Fetch roles from backend API
const fetchRoles = async (): Promise<Role[]> => {
  if (cachedRoles) {
    return cachedRoles
  }

  try {
    const response = await fetch('/api/roles')
    if (!response.ok) {
      throw new Error(`Failed to fetch roles: ${response.statusText}`)
    }
    const data = await response.json()
    cachedRoles = data
    return data
  } catch (error) {
    console.error('Error fetching roles:', error)
    return []
  }
}

export const roleService = {
  // Get all available roles
  getAllRoles: async (): Promise<Role[]> => {
    const roles = await fetchRoles()
    return [...roles].sort((a, b) => a.name.localeCompare(b.name))
  },

  // Get role by ID (async)
  getRoleById: async (id: string): Promise<Role | undefined> => {
    const roles = await fetchRoles()
    return roles.find(r => r.id === id)
  },

  // Get role by ID synchronously (from cache only)
  getRoleByIdSync: (id: string | null): Role | null => {
    if (!id || !cachedRoles) return null
    return cachedRoles.find(r => r.id === id) || null
  },

  // Get role names for display
  getRoleNames: (roles: Role[]): string => {
    return roles.map(r => r.name).join(', ')
  },

  // Check if user has specific role
  hasRole: (userRoles: Role[], roleId: string): boolean => {
    return userRoles.some(r => r.id === roleId)
  },

  // Check if user has any of the specified roles
  hasAnyRole: (userRoles: Role[], roleIds: string[]): boolean => {
    return userRoles.some(r => roleIds.includes(r.id))
  },

  // Get roles for dropdown (returns array of { title, value, color })
  getRoleOptions: async () => {
    const roles = await fetchRoles()
    return roles
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => ({
        title: r.name,
        value: r.id,
        color: r.color,
      }))
  },

  // Prefetch roles (call this on app startup)
  prefetch: async (): Promise<void> => {
    await fetchRoles()
  },

  // Clear cache (useful for refresh)
  clearCache: (): void => {
    cachedRoles = null
  },

  // Check if cache is populated
  isCached: (): boolean => {
    return cachedRoles !== null
  },
}
