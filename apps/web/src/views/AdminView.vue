<template>
  <v-container>
    <h1 class="text-h4 mb-4">User Administration</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

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
            <span class="text-body-2 text-medium-emphasis">
              {{ total }} user(s) found
            </span>
          </v-col>
        </v-row>
      </v-card-title>

      <v-data-table-server
        v-model:items-per-page="pageSize"
        v-model:page="page"
        :headers="headers"
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
          <v-chip
            v-for="role in item.roles"
            :key="role.id"
            size="small"
            class="mr-1"
            :color="getRoleColor(role.id)"
          >
            {{ role.name }}
          </v-chip>
        </template>

        <template #item.createdAt="{ item }">
          {{ formatDate(item.createdAt) }}
        </template>

        <template #item.actions="{ item }">
          <v-btn icon size="small" @click="openEditDialog(item)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
        </template>
      </v-data-table-server>
    </v-card>

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
            />
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
          <v-btn color="primary" :loading="saving" @click="saveUser">
            Save Changes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Password Reset Link Dialog -->
    <v-dialog v-model="resetLinkDialog" max-width="600">
      <v-card>
        <v-card-title>Password Reset Link Generated</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4">
            Share this link with <strong>{{ resetLinkData?.username }}</strong> to allow them to reset their password.
            The password will NOT be changed until they use this link.
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
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Role } from '../types'
import { api } from '../services/api'

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isActive: boolean
  roles: Role[]
  createdAt: string
}

interface PasswordResetLinkData {
  token: string
  expiresAt: string
  username: string
}

const headers = [
  { title: 'Username', key: 'username', sortable: false },
  { title: 'Display Name', key: 'displayName', sortable: false },
  { title: 'Email', key: 'email', sortable: false },
  { title: 'Status', key: 'isActive', sortable: false },
  { title: 'Roles', key: 'roles', sortable: false },
  { title: 'Created', key: 'createdAt', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, width: 80 },
]

const userList = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const loading = ref(false)
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

const resetLinkUrl = computed(() => {
  if (!resetLinkData.value) return ''
  return `${window.location.origin}/reset-password?token=${resetLinkData.value.token}`
})

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const getRoleColor = (roleId: string): string => {
  const colors: Record<string, string> = {
    administrator: 'red',
    lead: 'purple',
    member: 'blue',
    'trade-partner': 'teal',
    applicant: 'grey',
  }
  return colors[roleId] || 'grey'
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString()
}

const formatDateTime = (dateStr: string | undefined): string => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
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
    const response = await api.admin.listUsers(page.value, pageSize.value, search.value || undefined)
    userList.value = response.users
    total.value = response.total
  } catch (error) {
    console.error('Failed to load users', error)
    showSnackbar('Failed to load users', 'error')
  } finally {
    loading.value = false
  }
}

const loadRoles = async () => {
  try {
    availableRoles.value = await api.admin.listRoles()
  } catch (error) {
    console.error('Failed to load roles', error)
  }
}

const openEditDialog = (user: AdminUser) => {
  editingUser.value = user
  editForm.value = {
    isActive: user.isActive,
    roles: user.roles.map((r) => r.id),
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

onMounted(() => {
  loadRoles()
  loadUsers()
})
</script>
