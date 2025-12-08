// Mock API service for testing frontend without backend
// This simulates JWT-based authentication and data storage
// NOTE: Mock API is disabled (USE_MOCK_API = false), this is for reference only

import { PERMISSIONS, type User as UserProfile, type Role } from '../types'

// Mock roles for the mock API (not using roleService to avoid async issues)
const MOCK_ROLES: Record<string, Role> = {
  applicant: { id: 'applicant', name: 'Applicant', color: 'blue-grey' },
  member: { id: 'member', name: 'Member', color: 'blue' },
  administrator: { id: 'administrator', name: 'Administrator', color: 'red' },
}

// Mock permissions by role (for mock API responses)
const MOCK_PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  member: [
    PERMISSIONS.ORDERS_VIEW_INTERNAL,
    PERMISSIONS.ORDERS_VIEW_PARTNER,
    PERMISSIONS.ORDERS_POST_INTERNAL,
  ],
  // Administrator role only has admin perms - combine with member/trade-partner for order posting
  administrator: [
    PERMISSIONS.ORDERS_VIEW_INTERNAL,
    PERMISSIONS.ORDERS_VIEW_PARTNER,
    PERMISSIONS.ADMIN_MANAGE_USERS,
    PERMISSIONS.ADMIN_MANAGE_ROLES,
  ],
  applicant: [PERMISSIONS.ORDERS_VIEW_INTERNAL, PERMISSIONS.ORDERS_VIEW_PARTNER],
  'trade-partner': [PERMISSIONS.ORDERS_VIEW_PARTNER, PERMISSIONS.ORDERS_POST_PARTNER],
}

// Helper to get permissions for a set of roles
const getPermissionsForRoles = (roles: Role[]): string[] => {
  const permSet = new Set<string>()
  for (const role of roles) {
    const perms = MOCK_PERMISSIONS_BY_ROLE[role.id] || []
    for (const perm of perms) {
      permSet.add(perm)
    }
  }
  return Array.from(permSet)
}

// Internal mock user type (includes password for mock auth)
// Note: FIO credentials are now in user settings, not on the user profile
interface MockUser {
  profileName: string
  password: string
  displayName: string
  roles: Role[]
}

interface LoginResponse {
  token: string
  user: UserProfile
}

interface RegisterRequest {
  profileName: string
  password: string
}

interface LoginRequest {
  profileName: string
  password: string
}

// Mock database - in-memory storage
// Note: Settings (preferredCurrency, FIO credentials, etc.) are now managed via user-settings API
const users: MockUser[] = [
  {
    profileName: 'demo',
    password: 'password',
    displayName: 'Demo User',
    roles: [MOCK_ROLES.member, MOCK_ROLES.administrator],
  },
]

// Helper to generate a mock JWT
const generateMockJWT = (profileName: string): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({
      profileName,
      exp: Date.now() + 3600000, // 1 hour
    })
  )
  const signature = btoa('mock-signature')
  return `${header}.${payload}.${signature}`
}

// Mock API implementation
export const mockApi = {
  // Login endpoint
  login: async (request: LoginRequest): Promise<Response> => {
    return new Promise(resolve => {
      setTimeout(() => {
        const user = users.find(u => u.profileName === request.profileName)

        if (!user) {
          // Account doesn't exist
          resolve(
            new Response(JSON.stringify({ message: 'Account not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            })
          )
          return
        }

        if (user.password !== request.password) {
          // Wrong password
          resolve(
            new Response(JSON.stringify({ message: 'Invalid credentials' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          )
          return
        }

        // Successful login
        // Note: Settings (including FIO credentials) are now managed via user-settings API
        const response: LoginResponse = {
          token: generateMockJWT(user.profileName),
          user: {
            profileName: user.profileName,
            displayName: user.displayName,
            roles: user.roles,
            permissions: getPermissionsForRoles(user.roles),
          },
        }

        resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }, 500) // Simulate network delay
    })
  },

  // Register endpoint
  register: async (request: RegisterRequest): Promise<Response> => {
    return new Promise(resolve => {
      setTimeout(() => {
        const existingUser = users.find(u => u.profileName === request.profileName)

        if (existingUser) {
          // Profile name already taken
          resolve(
            new Response(JSON.stringify({ message: 'Profile name already taken' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            })
          )
          return
        }

        if (request.profileName.length < 3) {
          // Validation error
          resolve(
            new Response(
              JSON.stringify({ message: 'Profile name must be at least 3 characters' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          )
          return
        }

        // Successful registration - new users get Applicant role by default
        // Note: Settings (including FIO credentials) are now managed via user-settings API
        const newUser: MockUser = {
          profileName: request.profileName,
          password: request.password,
          displayName: request.profileName,
          roles: [MOCK_ROLES.applicant],
        }
        users.push(newUser)

        resolve(
          new Response(JSON.stringify({ message: 'Registration successful' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }, 500) // Simulate network delay
    })
  },
}

// Check if we should use mock API (for development)
export const USE_MOCK_API = false // Backend is ready!
