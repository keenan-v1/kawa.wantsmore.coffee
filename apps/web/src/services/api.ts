// API service that switches between mock and real backend
import { mockApi, USE_MOCK_API } from './mockApi'
import type { User, Currency, LocationDisplayMode, CommodityDisplayMode, Role } from '@kawakawa/types'

interface LoginRequest {
  profileName: string
  password: string
}

interface RegisterRequest {
  profileName: string
  password: string
}

interface UpdateProfileRequest {
  displayName?: string
  fioUsername?: string
  preferredCurrency?: Currency
  locationDisplayMode?: LocationDisplayMode
  commodityDisplayMode?: CommodityDisplayMode
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isActive: boolean
  roles: Role[]
  createdAt: string
}

interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  pageSize: number
}

interface UpdateUserRequest {
  isActive?: boolean
  roles?: string[]
}

// Helper to get JWT token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('jwt')
}

// Helper to create auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

// Check for refreshed token header and update stored token
const handleRefreshedToken = (response: Response): void => {
  const refreshedToken = response.headers.get('X-Refreshed-Token')
  if (refreshedToken) {
    localStorage.setItem('jwt', refreshedToken)
    // Dispatch event so app can update user state if needed
    window.dispatchEvent(new CustomEvent('token-refreshed', { detail: { token: refreshedToken } }))
  }
}

// Real API calls (to be used when backend is ready)
const realApi = {
  login: async (request: LoginRequest): Promise<Response> => {
    return fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: request.profileName, // Map profileName to username
        password: request.password
      })
    })
  },

  register: async (request: RegisterRequest): Promise<Response> => {
    return fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: request.profileName, // Map profileName to username
        password: request.password,
        displayName: request.profileName
      })
    })
  },

  getProfile: async (): Promise<User> => {
    const response = await fetch('/api/account', {
      method: 'GET',
      headers: getAuthHeaders()
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        // Clear auth and redirect to login
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get profile: ${response.statusText}`)
    }

    return response.json()
  },

  updateProfile: async (updates: UpdateProfileRequest): Promise<User> => {
    const response = await fetch('/api/account', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to update profile: ${response.statusText}`)
    }

    return response.json()
  },

  changePassword: async (request: ChangePasswordRequest): Promise<void> => {
    const response = await fetch('/api/account/password', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request)
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        throw new Error('Current password is incorrect')
      }
      throw new Error(`Failed to change password: ${response.statusText}`)
    }
  },

  listUsers: async (page: number = 1, pageSize: number = 20, search?: string): Promise<AdminUserListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    if (search) params.append('search', search)

    const response = await fetch(`/api/admin/users?${params}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list users: ${response.statusText}`)
    }

    return response.json()
  },

  updateUser: async (userId: number, updates: UpdateUserRequest): Promise<AdminUser> => {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        const error = await response.json()
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to update user: ${response.statusText}`)
    }

    return response.json()
  },

  listRoles: async (): Promise<Role[]> => {
    const response = await fetch('/api/admin/roles', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list roles: ${response.statusText}`)
    }

    return response.json()
  },
}

// Export the API interface that automatically uses mock or real based on configuration
export const api = {
  auth: {
    login: (request: LoginRequest) => {
      return USE_MOCK_API ? mockApi.login(request) : realApi.login(request)
    },
    register: (request: RegisterRequest) => {
      return USE_MOCK_API ? mockApi.register(request) : realApi.register(request)
    }
  },
  account: {
    getProfile: () => realApi.getProfile(),
    updateProfile: (updates: UpdateProfileRequest) => realApi.updateProfile(updates),
    changePassword: (request: ChangePasswordRequest) => realApi.changePassword(request)
  },
  admin: {
    listUsers: (page?: number, pageSize?: number, search?: string) => realApi.listUsers(page, pageSize, search),
    updateUser: (userId: number, updates: UpdateUserRequest) => realApi.updateUser(userId, updates),
    listRoles: () => realApi.listRoles(),
  }
}
