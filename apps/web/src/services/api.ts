// API service that switches between mock and real backend
import { mockApi, USE_MOCK_API } from './mockApi'
import type {
  User,
  Currency,
  LocationDisplayMode,
  CommodityDisplayMode,
  Role,
  SellOrderLimitMode,
  OrderType,
} from '@kawakawa/types'

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
  fioApiKey?: string
  preferredCurrency?: Currency
  locationDisplayMode?: LocationDisplayMode
  commodityDisplayMode?: CommodityDisplayMode
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

interface FioSyncInfo {
  fioUsername: string | null
  lastSyncedAt: string | null
}

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isActive: boolean
  roles: Role[]
  fioSync: FioSyncInfo
  createdAt: string
}

interface Permission {
  id: string
  name: string
  description: string | null
}

interface RolePermissionWithDetails {
  id: number
  roleId: string
  roleName: string
  roleColor: string
  permissionId: string
  permissionName: string
  allowed: boolean
}

interface CreateRoleRequest {
  id: string
  name: string
  color: string
}

interface SetRolePermissionRequest {
  roleId: string
  permissionId: string
  allowed: boolean
}

interface RolePermission {
  id: number
  roleId: string
  permissionId: string
  allowed: boolean
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

interface PasswordResetLinkResponse {
  token: string
  expiresAt: string
  username: string
}

interface ResetPasswordRequest {
  token: string
  newPassword: string
}

interface ValidateTokenResponse {
  valid: boolean
  username?: string
  expiresAt?: string
}

interface FioSyncResponse {
  success: boolean
  inserted: number
  errors: string[]
  username: string
}

// FIO Inventory types
interface FioInventoryItem {
  id: number
  commodityTicker: string
  quantity: number
  locationId: string | null
  lastSyncedAt: string
  commodityName: string
  commodityCategory: string | null
  locationName: string | null
  locationType: string | null
  storageType: string
  fioUploadedAt: string | null
}

interface FioInventorySyncResult {
  success: boolean
  inserted: number
  storageLocations: number
  errors: string[]
  skippedUnknownLocations: number
  skippedUnknownCommodities: number
  fioLastSync: string | null
}

interface FioLastSyncResponse {
  lastSyncedAt: string | null
  fioUploadedAt: string | null
}

interface FioStatsResponse {
  totalItems: number
  totalQuantity: number
  uniqueCommodities: number
  storageLocations: number
  newestSyncTime: string | null
  oldestFioUploadTime: string | null
  oldestFioUploadLocation: {
    storageType: string
    locationNaturalId: string | null
  } | null
  newestFioUploadTime: string | null
}

interface FioClearResponse {
  success: boolean
  deletedItems: number
  deletedStorages: number
}

// Sell Order types
interface SellOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType: OrderType
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
  fioQuantity: number
  availableQuantity: number
}

interface CreateSellOrderRequest {
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
}

interface UpdateSellOrderRequest {
  price?: number
  currency?: Currency
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
}

// Buy Order types
interface BuyOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType: OrderType
}

interface CreateBuyOrderRequest {
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType?: OrderType
}

interface UpdateBuyOrderRequest {
  quantity?: number
  price?: number
  currency?: Currency
  orderType?: OrderType
}

// Market listing types
interface MarketListing {
  id: number
  sellerName: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType: OrderType
  availableQuantity: number
  isOwn: boolean
}

interface MarketBuyRequest {
  id: number
  buyerName: string
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType: OrderType
  isOwn: boolean
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
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: request.profileName, // Map profileName to username
        password: request.password,
      }),
    })
  },

  register: async (request: RegisterRequest): Promise<Response> => {
    return fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: request.profileName, // Map profileName to username
        password: request.password,
        displayName: request.profileName,
      }),
    })
  },

  getProfile: async (): Promise<User> => {
    const response = await fetch('/api/account', {
      method: 'GET',
      headers: getAuthHeaders(),
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
      throw new Error(`Failed to update profile: ${response.statusText}`)
    }

    return response.json()
  },

  changePassword: async (request: ChangePasswordRequest): Promise<void> => {
    const response = await fetch('/api/account/password', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
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

  listUsers: async (
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<AdminUserListResponse> => {
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

  generatePasswordResetLink: async (userId: number): Promise<PasswordResetLinkResponse> => {
    const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
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
      if (response.status === 404) {
        throw new Error('User not found')
      }
      throw new Error(`Failed to generate reset link: ${response.statusText}`)
    }

    return response.json()
  },

  syncUserFio: async (userId: number): Promise<FioSyncResponse> => {
    const response = await fetch(`/api/admin/users/${userId}/sync-fio`, {
      method: 'POST',
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
      if (response.status === 404) {
        throw new Error('User not found')
      }
      if (response.status === 400) {
        throw new Error('User does not have FIO credentials configured')
      }
      throw new Error(`Failed to sync FIO: ${response.statusText}`)
    }

    return response.json()
  },

  // Pending approvals
  getPendingApprovalsCount: async (): Promise<{ count: number }> => {
    const response = await fetch('/api/admin/pending-approvals/count', {
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
      throw new Error(`Failed to get pending approvals count: ${response.statusText}`)
    }

    return response.json()
  },

  listPendingApprovals: async (): Promise<AdminUser[]> => {
    const response = await fetch('/api/admin/pending-approvals', {
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
      throw new Error(`Failed to list pending approvals: ${response.statusText}`)
    }

    return response.json()
  },

  approveUser: async (userId: number, roleId?: string): Promise<AdminUser> => {
    const response = await fetch(`/api/admin/users/${userId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ roleId }),
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
      if (response.status === 404) {
        throw new Error('User not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to approve user: ${response.statusText}`)
    }

    return response.json()
  },

  resetPassword: async (request: ResetPasswordRequest): Promise<void> => {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid or expired reset token')
      }
      throw new Error(`Failed to reset password: ${response.statusText}`)
    }
  },

  validateResetToken: async (token: string): Promise<ValidateTokenResponse> => {
    const response = await fetch(
      `/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
      }
    )

    if (!response.ok) {
      return { valid: false }
    }

    return response.json()
  },

  // Role management
  createRole: async (request: CreateRoleRequest): Promise<Role> => {
    const response = await fetch('/api/admin/roles', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Role with this ID already exists')
      }
      throw new Error(`Failed to create role: ${response.statusText}`)
    }

    return response.json()
  },

  updateRole: async (roleId: string, updates: { name?: string; color?: string }): Promise<Role> => {
    const response = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role not found')
      }
      throw new Error(`Failed to update role: ${response.statusText}`)
    }

    return response.json()
  },

  deleteRole: async (roleId: string): Promise<void> => {
    const response = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Cannot delete role')
      }
      throw new Error(`Failed to delete role: ${response.statusText}`)
    }
  },

  // Permission management
  listPermissions: async (): Promise<Permission[]> => {
    const response = await fetch('/api/admin/permissions', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to list permissions: ${response.statusText}`)
    }

    return response.json()
  },

  listRolePermissions: async (): Promise<RolePermissionWithDetails[]> => {
    const response = await fetch('/api/admin/role-permissions', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to list role permissions: ${response.statusText}`)
    }

    return response.json()
  },

  setRolePermission: async (request: SetRolePermissionRequest): Promise<RolePermission> => {
    const response = await fetch('/api/admin/role-permissions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Role or permission not found')
      }
      throw new Error(`Failed to set role permission: ${response.statusText}`)
    }

    return response.json()
  },

  deleteRolePermission: async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/role-permissions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role permission mapping not found')
      }
      throw new Error(`Failed to delete role permission: ${response.statusText}`)
    }
  },

  // FIO Inventory methods
  getFioInventory: async (): Promise<FioInventoryItem[]> => {
    const response = await fetch('/api/fio/inventory', {
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
      throw new Error(`Failed to get FIO inventory: ${response.statusText}`)
    }

    return response.json()
  },

  syncFioInventory: async (): Promise<FioInventorySyncResult> => {
    const response = await fetch('/api/fio/inventory/sync', {
      method: 'POST',
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
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'FIO credentials not configured')
      }
      throw new Error(`Failed to sync FIO inventory: ${response.statusText}`)
    }

    return response.json()
  },

  getFioLastSync: async (): Promise<FioLastSyncResponse> => {
    const response = await fetch('/api/fio/inventory/last-sync', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get last sync time: ${response.statusText}`)
    }

    return response.json()
  },

  getFioStats: async (): Promise<FioStatsResponse> => {
    const response = await fetch('/api/fio/inventory/stats', {
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
      throw new Error(`Failed to get FIO stats: ${response.statusText}`)
    }

    return response.json()
  },

  clearFioInventory: async (): Promise<FioClearResponse> => {
    const response = await fetch('/api/fio/inventory', {
      method: 'DELETE',
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
      throw new Error(`Failed to clear FIO inventory: ${response.statusText}`)
    }

    return response.json()
  },

  // Sell Orders methods
  getSellOrders: async (): Promise<SellOrderResponse[]> => {
    const response = await fetch('/api/sell-orders', {
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
      throw new Error(`Failed to get sell orders: ${response.statusText}`)
    }

    return response.json()
  },

  getSellOrder: async (id: number): Promise<SellOrderResponse> => {
    const response = await fetch(`/api/sell-orders/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      throw new Error(`Failed to get sell order: ${response.statusText}`)
    }

    return response.json()
  },

  createSellOrder: async (request: CreateSellOrderRequest): Promise<SellOrderResponse> => {
    const response = await fetch('/api/sell-orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to create sell order: ${response.statusText}`)
    }

    return response.json()
  },

  updateSellOrder: async (
    id: number,
    request: UpdateSellOrderRequest
  ): Promise<SellOrderResponse> => {
    const response = await fetch(`/api/sell-orders/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to update sell order: ${response.statusText}`)
    }

    return response.json()
  },

  deleteSellOrder: async (id: number): Promise<void> => {
    const response = await fetch(`/api/sell-orders/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      throw new Error(`Failed to delete sell order: ${response.statusText}`)
    }
  },

  // Public roles endpoint (for sell order targeting)
  getRoles: async (): Promise<Role[]> => {
    const response = await fetch('/api/roles', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Failed to get roles: ${response.statusText}`)
    }

    return response.json()
  },

  // Market methods
  getMarketListings: async (commodity?: string, location?: string): Promise<MarketListing[]> => {
    const params = new URLSearchParams()
    if (commodity) params.append('commodity', commodity)
    if (location) params.append('location', location)

    const url = `/api/market/listings${params.toString() ? '?' + params.toString() : ''}`
    const response = await fetch(url, {
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
      throw new Error(`Failed to get market listings: ${response.statusText}`)
    }

    return response.json()
  },

  getMarketBuyRequests: async (
    commodity?: string,
    location?: string
  ): Promise<MarketBuyRequest[]> => {
    const params = new URLSearchParams()
    if (commodity) params.append('commodity', commodity)
    if (location) params.append('location', location)

    const url = `/api/market/buy-requests${params.toString() ? '?' + params.toString() : ''}`
    const response = await fetch(url, {
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
      throw new Error(`Failed to get market buy requests: ${response.statusText}`)
    }

    return response.json()
  },

  // Buy Orders methods
  getBuyOrders: async (): Promise<BuyOrderResponse[]> => {
    const response = await fetch('/api/buy-orders', {
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
      throw new Error(`Failed to get buy orders: ${response.statusText}`)
    }

    return response.json()
  },

  getBuyOrder: async (id: number): Promise<BuyOrderResponse> => {
    const response = await fetch(`/api/buy-orders/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      throw new Error(`Failed to get buy order: ${response.statusText}`)
    }

    return response.json()
  },

  createBuyOrder: async (request: CreateBuyOrderRequest): Promise<BuyOrderResponse> => {
    const response = await fetch('/api/buy-orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to create buy order: ${response.statusText}`)
    }

    return response.json()
  },

  updateBuyOrder: async (id: number, request: UpdateBuyOrderRequest): Promise<BuyOrderResponse> => {
    const response = await fetch(`/api/buy-orders/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to update buy order: ${response.statusText}`)
    }

    return response.json()
  },

  deleteBuyOrder: async (id: number): Promise<void> => {
    const response = await fetch(`/api/buy-orders/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      throw new Error(`Failed to delete buy order: ${response.statusText}`)
    }
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
    },
    resetPassword: (request: ResetPasswordRequest) => realApi.resetPassword(request),
    validateResetToken: (token: string) => realApi.validateResetToken(token),
  },
  account: {
    getProfile: () => realApi.getProfile(),
    updateProfile: (updates: UpdateProfileRequest) => realApi.updateProfile(updates),
    changePassword: (request: ChangePasswordRequest) => realApi.changePassword(request),
  },
  admin: {
    listUsers: (page?: number, pageSize?: number, search?: string) =>
      realApi.listUsers(page, pageSize, search),
    updateUser: (userId: number, updates: UpdateUserRequest) => realApi.updateUser(userId, updates),
    listRoles: () => realApi.listRoles(),
    createRole: (request: CreateRoleRequest) => realApi.createRole(request),
    updateRole: (roleId: string, updates: { name?: string; color?: string }) =>
      realApi.updateRole(roleId, updates),
    deleteRole: (roleId: string) => realApi.deleteRole(roleId),
    generatePasswordResetLink: (userId: number) => realApi.generatePasswordResetLink(userId),
    syncUserFio: (userId: number) => realApi.syncUserFio(userId),
    listPermissions: () => realApi.listPermissions(),
    listRolePermissions: () => realApi.listRolePermissions(),
    setRolePermission: (request: SetRolePermissionRequest) => realApi.setRolePermission(request),
    deleteRolePermission: (id: number) => realApi.deleteRolePermission(id),
    getPendingApprovalsCount: () => realApi.getPendingApprovalsCount(),
    listPendingApprovals: () => realApi.listPendingApprovals(),
    approveUser: (userId: number, roleId?: string) => realApi.approveUser(userId, roleId),
  },
  fioInventory: {
    get: () => realApi.getFioInventory(),
    sync: () => realApi.syncFioInventory(),
    getLastSync: () => realApi.getFioLastSync(),
    getStats: () => realApi.getFioStats(),
    clear: () => realApi.clearFioInventory(),
  },
  sellOrders: {
    list: () => realApi.getSellOrders(),
    get: (id: number) => realApi.getSellOrder(id),
    create: (request: CreateSellOrderRequest) => realApi.createSellOrder(request),
    update: (id: number, request: UpdateSellOrderRequest) => realApi.updateSellOrder(id, request),
    delete: (id: number) => realApi.deleteSellOrder(id),
  },
  buyOrders: {
    list: () => realApi.getBuyOrders(),
    get: (id: number) => realApi.getBuyOrder(id),
    create: (request: CreateBuyOrderRequest) => realApi.createBuyOrder(request),
    update: (id: number, request: UpdateBuyOrderRequest) => realApi.updateBuyOrder(id, request),
    delete: (id: number) => realApi.deleteBuyOrder(id),
  },
  market: {
    getListings: (commodity?: string, location?: string) =>
      realApi.getMarketListings(commodity, location),
    getBuyRequests: (commodity?: string, location?: string) =>
      realApi.getMarketBuyRequests(commodity, location),
  },
  roles: {
    list: () => realApi.getRoles(),
  },
}

// Export types for use in components
export type {
  FioInventoryItem,
  SellOrderResponse,
  CreateSellOrderRequest,
  UpdateSellOrderRequest,
  BuyOrderResponse,
  CreateBuyOrderRequest,
  UpdateBuyOrderRequest,
  MarketListing,
  MarketBuyRequest,
}
