// Mock API service for testing frontend without backend
// This simulates JWT-based authentication and data storage

import type { Currency, User as UserProfile, Role } from '../types'
import { roleService } from './roleService'

interface User {
  profileName: string
  password: string
  displayName: string
  fioUsername: string
  hasFioApiKey: boolean
  preferredCurrency: Currency
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
const users: User[] = [
  {
    profileName: 'demo',
    password: 'password',
    displayName: 'Demo User',
    fioUsername: 'demo_fio',
    hasFioApiKey: true,
    preferredCurrency: 'CIS',
    roles: [
      roleService.getRoleById('member')!,
      roleService.getRoleById('administrator')!
    ]
  }
]

// Helper to generate a mock JWT
const generateMockJWT = (profileName: string): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    profileName,
    exp: Date.now() + 3600000 // 1 hour
  }))
  const signature = btoa('mock-signature')
  return `${header}.${payload}.${signature}`
}

// Mock API implementation
export const mockApi = {
  // Login endpoint
  login: async (request: LoginRequest): Promise<Response> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const user = users.find(u => u.profileName === request.profileName)

        if (!user) {
          // Account doesn't exist
          resolve(new Response(JSON.stringify({ message: 'Account not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }))
          return
        }

        if (user.password !== request.password) {
          // Wrong password
          resolve(new Response(JSON.stringify({ message: 'Invalid credentials' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }))
          return
        }

        // Successful login
        const response: LoginResponse = {
          token: generateMockJWT(user.profileName),
          user: {
            profileName: user.profileName,
            displayName: user.displayName,
            fioUsername: user.fioUsername,
            hasFioApiKey: user.hasFioApiKey,
            preferredCurrency: user.preferredCurrency,
            roles: user.roles
          }
        }

        resolve(new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      }, 500) // Simulate network delay
    })
  },

  // Register endpoint
  register: async (request: RegisterRequest): Promise<Response> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const existingUser = users.find(u => u.profileName === request.profileName)

        if (existingUser) {
          // Profile name already taken
          resolve(new Response(JSON.stringify({ message: 'Profile name already taken' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }))
          return
        }

        if (request.profileName.length < 3) {
          // Validation error
          resolve(new Response(JSON.stringify({ message: 'Profile name must be at least 3 characters' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }))
          return
        }

        // Successful registration - new users get Applicant role by default
        const newUser: User = {
          profileName: request.profileName,
          password: request.password,
          displayName: request.profileName,
          fioUsername: '',
          hasFioApiKey: false,
          preferredCurrency: 'CIS', // Default currency
          roles: [roleService.getRoleById('applicant')!]
        }
        users.push(newUser)

        resolve(new Response(JSON.stringify({ message: 'Registration successful' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      }, 500) // Simulate network delay
    })
  }
}

// Check if we should use mock API (for development)
export const USE_MOCK_API = false // Backend is ready!
