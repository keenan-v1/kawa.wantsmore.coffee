<template>
  <v-container>
    <h1 class="text-h4 mb-4">Administration</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="approvals">
        Pending Approvals
        <v-badge
          v-if="pendingApprovals.length > 0"
          :content="pendingApprovals.length"
          color="error"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="users">User Management</v-tab>
      <v-tab value="permissions">Permissions</v-tab>
      <v-tab value="roles">Roles</v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <!-- PENDING APPROVALS TAB -->
      <v-tabs-window-item value="approvals">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col>
                <span>Pending User Approvals</span>
              </v-col>
              <v-col cols="auto">
                <v-btn
                  color="primary"
                  variant="text"
                  prepend-icon="mdi-refresh"
                  :loading="loadingApprovals"
                  @click="loadPendingApprovals"
                >
                  Refresh
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>

          <v-card-text v-if="pendingApprovals.length === 0 && !loadingApprovals">
            <v-alert type="success" variant="tonal">
              No users pending approval. All registrations have been reviewed.
            </v-alert>
          </v-card-text>

          <v-list v-else lines="two">
            <v-list-item v-for="user in pendingApprovals" :key="user.id">
              <template #prepend>
                <v-avatar color="grey">
                  <v-icon>mdi-account</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title class="font-weight-medium">
                {{ user.displayName }}
              </v-list-item-title>
              <v-list-item-subtitle>
                @{{ user.username }} &bull; Registered {{ formatRelativeTime(user.createdAt) }}
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center ga-2">
                  <v-select
                    v-model="approvalRoleSelections[user.id]"
                    :items="approvalRoleOptions"
                    item-title="name"
                    item-value="id"
                    label="Approve as"
                    density="compact"
                    hide-details
                    style="min-width: 180px"
                  >
                    <template #selection="{ item }">
                      <v-chip :color="item.raw.color" size="small">{{ item.title }}</v-chip>
                    </template>
                  </v-select>
                  <v-btn
                    color="success"
                    variant="tonal"
                    :loading="approvingUsers.has(user.id)"
                    @click="approveUser(user)"
                  >
                    Approve
                  </v-btn>
                  <v-btn
                    color="error"
                    variant="text"
                    icon
                    size="small"
                    @click="openRejectDialog(user)"
                  >
                    <v-icon>mdi-close</v-icon>
                    <v-tooltip activator="parent" location="top">Reject (deactivate)</v-tooltip>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-tabs-window-item>

      <!-- USER MANAGEMENT TAB -->
      <v-tabs-window-item value="users">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="search"
                  prepend-icon="mdi-magnify"
                  label="Search users..."
                  single-line
                  hide-details
                  clearable
                  @update:model-value="debouncedSearch"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <span class="text-body-2 text-medium-emphasis"> {{ total }} user(s) found </span>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table-server
            v-model:items-per-page="pageSize"
            v-model:page="page"
            :headers="userHeaders"
            :items="userList"
            :items-length="total"
            :loading="loading"
            @update:options="loadUsers"
          >
            <template #item.isActive="{ item }">
              <v-chip :color="item.isActive ? 'success' : 'error'" size="small">
                {{ item.isActive ? 'Active' : 'Inactive' }}
              </v-chip>
            </template>

            <template #item.roles="{ item }">
              <div class="d-flex flex-wrap ga-1">
                <v-chip v-for="role in item.roles" :key="role.id" size="small" :color="role.color">
                  {{ role.name }}
                </v-chip>
              </div>
            </template>

            <template #item.fioSync="{ item }">
              <div v-if="item.fioSync.fioUsername">
                <div class="text-body-2">{{ item.fioSync.fioUsername }}</div>
                <v-chip
                  v-if="item.fioSync.lastSyncedAt"
                  size="x-small"
                  :color="getSyncStatusColor(item.fioSync.lastSyncedAt)"
                >
                  {{ formatRelativeTime(item.fioSync.lastSyncedAt) }}
                </v-chip>
                <span v-else class="text-caption text-medium-emphasis">Never synced</span>
              </div>
              <span v-else class="text-caption text-medium-emphasis">Not configured</span>
            </template>

            <template #item.createdAt="{ item }">
              {{ formatDate(item.createdAt) }}
            </template>

            <template #item.actions="{ item }">
              <!-- Desktop: show buttons -->
              <div class="d-none d-sm-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      :disabled="!item.fioSync.fioUsername"
                      :loading="syncingUsers.has(item.id)"
                      @click="syncUserFio(item)"
                    >
                      <v-icon>mdi-sync</v-icon>
                    </v-btn>
                  </template>
                  {{ item.fioSync.fioUsername ? 'Sync FIO' : 'FIO not configured' }}
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn v-bind="props" icon size="small" @click="openEditDialog(item)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit user
                </v-tooltip>
              </div>
              <!-- Mobile: show menu -->
              <v-menu>
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon size="small" class="d-sm-none">
                    <v-icon>mdi-dots-vertical</v-icon>
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item :disabled="!item.fioSync.fioUsername" @click="syncUserFio(item)">
                    <template #prepend>
                      <v-icon>mdi-sync</v-icon>
                    </template>
                    <v-list-item-title>Sync FIO</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="openEditDialog(item)">
                    <template #prepend>
                      <v-icon>mdi-pencil</v-icon>
                    </template>
                    <v-list-item-title>Edit user</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </template>
          </v-data-table-server>
        </v-card>
      </v-tabs-window-item>

      <!-- PERMISSIONS TAB -->
      <v-tabs-window-item value="permissions">
        <v-card>
          <v-card-title>Role Permission Matrix</v-card-title>
          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4" density="compact">
              This matrix shows which permissions are granted to each role. Click a cell to toggle
              the permission.
            </v-alert>

            <div v-if="loadingPermissions" class="text-center py-4">
              <v-progress-circular indeterminate />
            </div>

            <v-table v-else density="compact" class="permission-matrix">
              <thead>
                <tr>
                  <th class="text-left">Permission</th>
                  <th style="width: 28px"></th>
                  <th v-for="role in availableRoles" :key="role.id" class="text-center">
                    <v-chip :color="role.color" size="small">{{ role.name }}</v-chip>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="permission in permissionList" :key="permission.id">
                  <td>
                    <div class="font-weight-medium">{{ permission.name }}</div>
                    <div class="text-caption text-medium-emphasis">{{ permission.id }}</div>
                  </td>
                  <td class="px-0">
                    <v-tooltip v-if="permission.description" location="right">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small" class="text-medium-emphasis">
                          mdi-information-outline
                        </v-icon>
                      </template>
                      {{ permission.description }}
                    </v-tooltip>
                  </td>
                  <td v-for="role in availableRoles" :key="role.id" class="text-center">
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      :loading="isTogglingPermission(role.id, permission.id)"
                      @click="togglePermission(role.id, permission.id)"
                    >
                      <v-icon
                        :color="
                          getPermissionStatus(role.id, permission.id) === true
                            ? 'success'
                            : getPermissionStatus(role.id, permission.id) === false
                              ? 'error'
                              : 'grey'
                        "
                      >
                        {{
                          getPermissionStatus(role.id, permission.id) === true
                            ? 'mdi-check-circle'
                            : getPermissionStatus(role.id, permission.id) === false
                              ? 'mdi-close-circle'
                              : 'mdi-circle-outline'
                        }}
                      </v-icon>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <v-alert type="info" variant="tonal" class="mt-4" density="compact">
              <strong>Legend:</strong>
              <v-icon color="success" size="small" class="mx-1">mdi-check-circle</v-icon> Granted
              <v-icon color="error" size="small" class="mx-1">mdi-close-circle</v-icon> Denied
              <v-icon color="grey" size="small" class="mx-1">mdi-circle-outline</v-icon> Not set
              (inherits default: denied)
            </v-alert>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

      <!-- ROLES TAB -->
      <v-tabs-window-item value="roles">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col>Manage Roles</v-col>
              <v-col cols="auto">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateRoleDialog">
                  Add Role
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>
          <v-card-text>
            <v-table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Color</th>
                  <th>Preview</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="role in availableRoles" :key="role.id">
                  <td class="font-weight-medium">{{ role.id }}</td>
                  <td>{{ role.name }}</td>
                  <td>{{ role.color }}</td>
                  <td>
                    <v-chip :color="role.color" size="small">{{ role.name }}</v-chip>
                  </td>
                  <td class="text-right">
                    <v-btn icon size="small" variant="text" @click="openEditRoleDialog(role)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteRole(role)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Edit User Dialog -->
    <v-dialog v-model="editDialog" max-width="500">
      <v-card v-if="editingUser">
        <v-card-title>Edit User: {{ editingUser.username }}</v-card-title>
        <v-card-text>
          <v-form>
            <v-text-field
              :model-value="editingUser.displayName"
              label="Display Name"
              readonly
              disabled
            />
            <v-text-field
              :model-value="editingUser.email || '(none)'"
              label="Email"
              readonly
              disabled
            />
            <v-switch
              v-model="editForm.isActive"
              label="Account Active"
              color="success"
              hint="Inactive accounts cannot log in"
              persistent-hint
            />
            <v-select
              v-model="editForm.roles"
              :items="availableRoles"
              item-title="name"
              item-value="id"
              label="Roles"
              multiple
              chips
              closable-chips
            >
              <template #chip="{ item }">
                <v-chip :color="item.raw.color" size="small" closable>
                  {{ item.title }}
                </v-chip>
              </template>
            </v-select>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="warning"
            variant="outlined"
            :loading="generatingResetLink"
            @click="generateResetLink"
          >
            Generate Reset Link
          </v-btn>
          <v-spacer />
          <v-btn text @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveUser"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Password Reset Link Dialog -->
    <v-dialog v-model="resetLinkDialog" max-width="600">
      <v-card>
        <v-card-title>Password Reset Link Generated</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4">
            Share this link with <strong>{{ resetLinkData?.username }}</strong> to allow them to
            reset their password. The password will NOT be changed until they use this link.
          </v-alert>

          <v-text-field
            :model-value="resetLinkUrl"
            label="Reset Link"
            readonly
            variant="outlined"
            append-inner-icon="mdi-content-copy"
            @click:append-inner="copyResetLink"
          />

          <v-alert type="warning" variant="tonal" density="compact">
            This link expires on {{ formatDateTime(resetLinkData?.expiresAt) }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="resetLinkDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create/Edit Role Dialog -->
    <v-dialog v-model="roleDialog" max-width="500">
      <v-card>
        <v-card-title>{{ editingRole ? 'Edit Role' : 'Create Role' }}</v-card-title>
        <v-card-text>
          <v-form ref="roleFormRef">
            <v-text-field
              v-model="roleForm.id"
              label="Role ID"
              :disabled="!!editingRole"
              :rules="[v => !!v || 'ID is required']"
              hint="Unique identifier (e.g., 'moderator')"
              persistent-hint
            />
            <v-text-field
              v-model="roleForm.name"
              label="Display Name"
              :rules="[v => !!v || 'Name is required']"
              class="mt-4"
            />
            <v-select
              v-model="roleForm.color"
              :items="vuetifyColors"
              label="Color"
              :rules="[v => !!v || 'Color is required']"
              class="mt-4"
            >
              <template #selection="{ item }">
                <v-chip :color="item.value" size="small">{{ item.title }}</v-chip>
              </template>
              <template #item="{ item, props }">
                <v-list-item v-bind="props">
                  <template #prepend>
                    <v-chip :color="item.value" size="small" class="mr-2">{{ item.title }}</v-chip>
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="roleDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="savingRole" @click="saveRole">
            {{ editingRole ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Role Confirmation Dialog -->
    <v-dialog v-model="deleteRoleDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Role</v-card-title>
        <v-card-text>
          Are you sure you want to delete the role <strong>{{ deletingRole?.name }}</strong
          >? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteRoleDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingRoleLoading" @click="deleteRole"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reject User Dialog -->
    <v-dialog v-model="rejectDialog" max-width="400">
      <v-card>
        <v-card-title>Reject Registration</v-card-title>
        <v-card-text>
          Are you sure you want to reject <strong>{{ rejectingUser?.displayName }}</strong
          >? This will deactivate their account.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="rejectDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="rejectingLoading" @click="rejectUser"> Reject </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Role } from '../types'
import { api } from '../services/api'

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

interface PasswordResetLinkData {
  token: string
  expiresAt: string
  username: string
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

const activeTab = ref('approvals')

const userHeaders = [
  { title: 'Username', key: 'username', sortable: false },
  { title: 'Display Name', key: 'displayName', sortable: false },
  { title: 'Status', key: 'isActive', sortable: false },
  { title: 'Roles', key: 'roles', sortable: false },
  { title: 'FIO Sync', key: 'fioSync', sortable: false },
  { title: 'Created', key: 'createdAt', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

const userList = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const loading = ref(false)
const syncingUsers = ref<Set<number>>(new Set())
const availableRoles = ref<Role[]>([])

const editDialog = ref(false)
const editingUser = ref<AdminUser | null>(null)
const editForm = ref({
  isActive: true,
  roles: [] as string[],
})
const saving = ref(false)

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Password reset link state
const resetLinkDialog = ref(false)
const resetLinkData = ref<PasswordResetLinkData | null>(null)
const generatingResetLink = ref(false)

// Pending approvals state
const pendingApprovals = ref<AdminUser[]>([])
const loadingApprovals = ref(false)
const approvingUsers = ref<Set<number>>(new Set())
const approvalRoleSelections = ref<Record<number, string>>({})
const rejectDialog = ref(false)
const rejectingUser = ref<AdminUser | null>(null)
const rejectingLoading = ref(false)

// Computed: Roles available for approval (exclude unverified)
const approvalRoleOptions = computed(() => {
  return availableRoles.value.filter(r => r.id !== 'unverified')
})

// Permissions state
const permissionList = ref<Permission[]>([])
const rolePermissionsList = ref<RolePermissionWithDetails[]>([])
const loadingPermissions = ref(false)
const togglingPermissions = ref<Set<string>>(new Set())

// Roles management state
const roleDialog = ref(false)
const editingRole = ref<Role | null>(null)
const roleForm = ref({
  id: '',
  name: '',
  color: '',
})
const savingRole = ref(false)
const deleteRoleDialog = ref(false)
const deletingRole = ref<Role | null>(null)
const deletingRoleLoading = ref(false)
const roleFormRef = ref()

const vuetifyColors = [
  { title: 'Grey', value: 'grey' },
  { title: 'Blue Grey', value: 'blue-grey' },
  { title: 'Blue', value: 'blue' },
  { title: 'Light Blue', value: 'light-blue' },
  { title: 'Cyan', value: 'cyan' },
  { title: 'Teal', value: 'teal' },
  { title: 'Green', value: 'green' },
  { title: 'Light Green', value: 'light-green' },
  { title: 'Lime', value: 'lime' },
  { title: 'Yellow', value: 'yellow' },
  { title: 'Amber', value: 'amber' },
  { title: 'Orange', value: 'orange' },
  { title: 'Deep Orange', value: 'deep-orange' },
  { title: 'Red', value: 'red' },
  { title: 'Pink', value: 'pink' },
  { title: 'Purple', value: 'purple' },
  { title: 'Deep Purple', value: 'deep-purple' },
  { title: 'Indigo', value: 'indigo' },
]

const resetLinkUrl = computed(() => {
  if (!resetLinkData.value) return ''
  return `${window.location.origin}/reset-password?token=${resetLinkData.value.token}`
})

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString()
}

const formatDateTime = (dateStr: string | undefined): string => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateStr)
}

const getSyncStatusColor = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours > 48) return 'error'
  if (diffHours > 24) return 'warning'
  return 'success'
}

let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    loadUsers()
  }, 300)
}

const loadUsers = async () => {
  try {
    loading.value = true
    const response = await api.admin.listUsers(
      page.value,
      pageSize.value,
      search.value || undefined
    )
    userList.value = response.users
    total.value = response.total
  } catch (error) {
    console.error('Failed to load users', error)
    showSnackbar('Failed to load users', 'error')
  } finally {
    loading.value = false
  }
}

const syncUserFio = async (user: AdminUser) => {
  try {
    syncingUsers.value.add(user.id)
    const result = await api.admin.syncUserFio(user.id)
    if (result.success) {
      showSnackbar(`Synced ${result.inserted} items for ${result.username}`)
      // Refresh the user list to update sync timestamp
      await loadUsers()
    } else {
      showSnackbar(`Sync completed with errors: ${result.errors.join(', ')}`, 'error')
    }
  } catch (error) {
    console.error('Failed to sync FIO', error)
    const message = error instanceof Error ? error.message : 'Failed to sync FIO'
    showSnackbar(message, 'error')
  } finally {
    syncingUsers.value.delete(user.id)
  }
}

// Track if roles were modified (for refreshing user list)
const rolesModified = ref(false)

const loadRoles = async () => {
  try {
    const roles = await api.admin.listRoles()
    // Sort alphabetically by ID for stable ordering
    availableRoles.value = roles.sort((a, b) => a.id.localeCompare(b.id))
  } catch (error) {
    console.error('Failed to load roles', error)
  }
}

const loadPermissions = async () => {
  try {
    loadingPermissions.value = true
    const [perms, rolePerms] = await Promise.all([
      api.admin.listPermissions(),
      api.admin.listRolePermissions(),
    ])
    // Sort alphabetically by ID for stable ordering
    permissionList.value = perms.sort((a, b) => a.id.localeCompare(b.id))
    rolePermissionsList.value = rolePerms
  } catch (error) {
    console.error('Failed to load permissions', error)
    showSnackbar('Failed to load permissions', 'error')
  } finally {
    loadingPermissions.value = false
  }
}

const openEditDialog = (user: AdminUser) => {
  editingUser.value = user
  editForm.value = {
    isActive: user.isActive,
    roles: user.roles.map(r => r.id),
  }
  editDialog.value = true
}

const saveUser = async () => {
  if (!editingUser.value) return

  try {
    saving.value = true
    await api.admin.updateUser(editingUser.value.id, {
      isActive: editForm.value.isActive,
      roles: editForm.value.roles,
    })
    showSnackbar('User updated successfully')
    editDialog.value = false
    loadUsers()
  } catch (error) {
    console.error('Failed to update user', error)
    const message = error instanceof Error ? error.message : 'Failed to update user'
    showSnackbar(message, 'error')
  } finally {
    saving.value = false
  }
}

const generateResetLink = async () => {
  if (!editingUser.value) return

  try {
    generatingResetLink.value = true
    const response = await api.admin.generatePasswordResetLink(editingUser.value.id)
    resetLinkData.value = response
    resetLinkDialog.value = true
  } catch (error) {
    console.error('Failed to generate reset link', error)
    const message = error instanceof Error ? error.message : 'Failed to generate reset link'
    showSnackbar(message, 'error')
  } finally {
    generatingResetLink.value = false
  }
}

const copyResetLink = async () => {
  try {
    await navigator.clipboard.writeText(resetLinkUrl.value)
    showSnackbar('Reset link copied to clipboard')
  } catch {
    showSnackbar('Failed to copy link', 'error')
  }
}

// Permission matrix functions
const getPermissionStatus = (roleId: string, permissionId: string): boolean | null => {
  const mapping = rolePermissionsList.value.find(
    rp => rp.roleId === roleId && rp.permissionId === permissionId
  )
  if (!mapping) return null
  return mapping.allowed
}

const isTogglingPermission = (roleId: string, permissionId: string): boolean => {
  return togglingPermissions.value.has(`${roleId}:${permissionId}`)
}

const togglePermission = async (roleId: string, permissionId: string) => {
  const key = `${roleId}:${permissionId}`
  const currentStatus = getPermissionStatus(roleId, permissionId)
  const existingMapping = rolePermissionsList.value.find(
    rp => rp.roleId === roleId && rp.permissionId === permissionId
  )

  try {
    togglingPermissions.value.add(key)

    if (currentStatus === null) {
      // Not set -> Grant
      const result = await api.admin.setRolePermission({ roleId, permissionId, allowed: true })
      // Update local state with the real ID from the server
      const role = availableRoles.value.find(r => r.id === roleId)
      const permission = permissionList.value.find(p => p.id === permissionId)
      rolePermissionsList.value.push({
        id: result.id,
        roleId,
        roleName: role?.name || roleId,
        roleColor: role?.color || 'grey',
        permissionId,
        permissionName: permission?.name || permissionId,
        allowed: true,
      })
    } else if (currentStatus === true) {
      // Granted -> Deny
      const result = await api.admin.setRolePermission({ roleId, permissionId, allowed: false })
      // Update local state - the server returns the same record with updated allowed
      if (existingMapping) {
        existingMapping.id = result.id // In case ID changed (shouldn't, but be safe)
        existingMapping.allowed = false
      }
    } else {
      // Denied -> Remove (delete the mapping)
      if (existingMapping) {
        await api.admin.deleteRolePermission(existingMapping.id)
        // Update local state - remove from array
        const index = rolePermissionsList.value.indexOf(existingMapping)
        if (index > -1) {
          rolePermissionsList.value.splice(index, 1)
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle permission', error)
    showSnackbar('Failed to update permission', 'error')
    // On error, reload to restore correct state
    await loadPermissions()
  } finally {
    togglingPermissions.value.delete(key)
  }
}

// Role management functions
const openCreateRoleDialog = () => {
  editingRole.value = null
  roleForm.value = { id: '', name: '', color: 'grey' }
  roleDialog.value = true
}

const openEditRoleDialog = (role: Role) => {
  editingRole.value = role
  roleForm.value = { id: role.id, name: role.name, color: role.color }
  roleDialog.value = true
}

const saveRole = async () => {
  try {
    savingRole.value = true

    if (editingRole.value) {
      // Update existing role
      await api.admin.updateRole(editingRole.value.id, {
        name: roleForm.value.name,
        color: roleForm.value.color,
      })
      showSnackbar('Role updated successfully')
    } else {
      // Create new role
      await api.admin.createRole({
        id: roleForm.value.id,
        name: roleForm.value.name,
        color: roleForm.value.color,
      })
      showSnackbar('Role created successfully')
    }

    roleDialog.value = false
    rolesModified.value = true
    await loadRoles()
  } catch (error) {
    console.error('Failed to save role', error)
    const message = error instanceof Error ? error.message : 'Failed to save role'
    showSnackbar(message, 'error')
  } finally {
    savingRole.value = false
  }
}

const confirmDeleteRole = (role: Role) => {
  deletingRole.value = role
  deleteRoleDialog.value = true
}

const deleteRole = async () => {
  if (!deletingRole.value) return

  try {
    deletingRoleLoading.value = true
    await api.admin.deleteRole(deletingRole.value.id)
    showSnackbar('Role deleted successfully')
    deleteRoleDialog.value = false
    rolesModified.value = true
    await loadRoles()
  } catch (error) {
    console.error('Failed to delete role', error)
    const message = error instanceof Error ? error.message : 'Failed to delete role'
    showSnackbar(message, 'error')
  } finally {
    deletingRoleLoading.value = false
  }
}

// Pending approvals functions
const loadPendingApprovals = async () => {
  try {
    loadingApprovals.value = true
    pendingApprovals.value = await api.admin.listPendingApprovals()
    // Set default role selection for each user
    for (const user of pendingApprovals.value) {
      if (!approvalRoleSelections.value[user.id]) {
        approvalRoleSelections.value[user.id] = 'trade-partner'
      }
    }
  } catch (error) {
    console.error('Failed to load pending approvals', error)
    showSnackbar('Failed to load pending approvals', 'error')
  } finally {
    loadingApprovals.value = false
  }
}

const approveUser = async (user: AdminUser) => {
  try {
    approvingUsers.value.add(user.id)
    const selectedRole = approvalRoleSelections.value[user.id] || 'trade-partner'
    await api.admin.approveUser(user.id, selectedRole)
    showSnackbar(`${user.displayName} approved as ${selectedRole}`)
    // Remove from pending list
    pendingApprovals.value = pendingApprovals.value.filter(u => u.id !== user.id)
    delete approvalRoleSelections.value[user.id]
    // Notify App.vue to update the badge count
    window.dispatchEvent(new CustomEvent('approval-queue-updated'))
  } catch (error) {
    console.error('Failed to approve user', error)
    const message = error instanceof Error ? error.message : 'Failed to approve user'
    showSnackbar(message, 'error')
  } finally {
    approvingUsers.value.delete(user.id)
  }
}

const openRejectDialog = (user: AdminUser) => {
  rejectingUser.value = user
  rejectDialog.value = true
}

const rejectUser = async () => {
  if (!rejectingUser.value) return

  try {
    rejectingLoading.value = true
    // Rejecting = deactivating the account
    await api.admin.updateUser(rejectingUser.value.id, {
      isActive: false,
      roles: ['unverified'],
    })
    showSnackbar(`${rejectingUser.value.displayName} has been rejected`)
    rejectDialog.value = false
    // Remove from pending list
    pendingApprovals.value = pendingApprovals.value.filter(u => u.id !== rejectingUser.value?.id)
    // Notify App.vue to update the badge count
    window.dispatchEvent(new CustomEvent('approval-queue-updated'))
  } catch (error) {
    console.error('Failed to reject user', error)
    const message = error instanceof Error ? error.message : 'Failed to reject user'
    showSnackbar(message, 'error')
  } finally {
    rejectingLoading.value = false
    rejectingUser.value = null
  }
}

// Watch for tab changes to load data
watch(activeTab, async newTab => {
  if (newTab === 'permissions') {
    // Always reload permissions to ensure fresh data
    if (permissionList.value.length === 0) {
      await loadPermissions()
    }
  } else if (newTab === 'users' && rolesModified.value) {
    // Refresh user list to get updated role colors/names
    rolesModified.value = false
    await loadUsers()
  }
})

onMounted(() => {
  loadRoles()
  loadUsers()
  loadPendingApprovals()
})
</script>

<style scoped>
.permission-matrix th,
.permission-matrix td {
  white-space: nowrap;
}

.permission-matrix td:first-child {
  width: 1%;
}
</style>
