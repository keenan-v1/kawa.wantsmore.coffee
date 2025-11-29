// Role service - mock role data
// Will be replaced with actual backend API integration

import type { Role } from '../types'

// Mock roles - configurable from backend in the future
const MOCK_ROLES: Role[] = [
  { id: 'applicant', name: 'Applicant' },
  { id: 'member', name: 'Member' },
  { id: 'lead', name: 'Lead' },
  { id: 'trade-partner', name: 'Trade Partner' },
  { id: 'administrator', name: 'Administrator' }
]

export const roleService = {
  // Get all available roles
  getAllRoles: (): Role[] => {
    return [...MOCK_ROLES]
  },

  // Get role by ID
  getRoleById: (id: string): Role | undefined => {
    return MOCK_ROLES.find(r => r.id === id)
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
  }
}
