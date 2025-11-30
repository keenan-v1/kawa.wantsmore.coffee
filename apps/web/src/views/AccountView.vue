<template>
  <v-container>
    <h1 class="text-h4 mb-4">Account Management</h1>

    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Profile Information</v-card-title>
          <v-card-text>
            <v-form>
              <v-text-field
                v-model="account.profileName"
                label="Profile Name"
                prepend-icon="mdi-account"
                readonly
              />
              <v-text-field
                v-model="account.displayName"
                label="Display Name"
                prepend-icon="mdi-card-account-details"
              />
              <v-text-field
                v-model="account.fioUsername"
                label="FIO Username (optional)"
                prepend-icon="mdi-game-controller"
                hint="Link your Prosperous Universe account"
              />
              <v-select
                v-model="account.preferredCurrency"
                :items="currencies"
                label="Preferred Currency"
                prepend-icon="mdi-currency-usd"
                hint="Default currency for your transactions"
              />
              <v-select
                v-model="account.locationDisplayMode"
                :items="locationDisplayModes"
                label="Location Display Mode"
                prepend-icon="mdi-map-marker"
                hint="How to display location names in dropdowns and tables"
              />
              <v-text-field
                :model-value="roleNames"
                label="Roles"
                prepend-icon="mdi-account-group"
                readonly
                hint="Your assigned roles (managed by administrators)"
              />
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" @click="saveProfile">
              Save Changes
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Change Password</v-card-title>
          <v-card-text>
            <v-form>
              <v-text-field
                v-model="passwordForm.current"
                label="Current Password"
                type="password"
                prepend-icon="mdi-lock"
              />
              <v-text-field
                v-model="passwordForm.new"
                label="New Password"
                type="password"
                prepend-icon="mdi-lock-outline"
              />
              <v-text-field
                v-model="passwordForm.confirm"
                label="Confirm New Password"
                type="password"
                prepend-icon="mdi-lock-check"
              />
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" @click="changePassword">
              Update Password
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { roleService } from '../services/roleService'
import { CURRENCIES } from '../types'
import type { Currency, LocationDisplayMode, Role } from '../types'

const userStore = useUserStore()
const currencies = CURRENCIES
const locationDisplayModes: { title: string, value: LocationDisplayMode }[] = [
  { title: 'Names (e.g., Benton Station (Benton))', value: 'names' },
  { title: 'Codes (e.g., BEN (UV-351))', value: 'codes' },
  { title: 'Mixed (names when available, codes otherwise)', value: 'mixed' }
]

const account = ref<{
  profileName: string
  displayName: string
  fioUsername: string
  preferredCurrency: Currency
  locationDisplayMode: LocationDisplayMode
  roles: Role[]
}>({
  profileName: '',
  displayName: '',
  fioUsername: '',
  preferredCurrency: 'CIS',
  locationDisplayMode: 'names',
  roles: []
})

const roleNames = computed(() => {
  return roleService.getRoleNames(account.value.roles)
})

const passwordForm = ref({
  current: '',
  new: '',
  confirm: ''
})

onMounted(() => {
  const user = userStore.getUser()
  if (user) {
    account.value = {
      ...user,
      locationDisplayMode: user.locationDisplayMode || 'names'
    }
  }
})

const saveProfile = () => {
  // TODO: Implement backend integration
  console.log('Saving profile:', account.value)

  // Update user store
  userStore.setUser(account.value)
  userStore.updateCurrency(account.value.preferredCurrency)
  userStore.updateLocationDisplayMode(account.value.locationDisplayMode)

  alert('Profile updated successfully')
}

const changePassword = () => {
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    alert('New passwords do not match')
    return
  }
  // TODO: Implement backend integration
  console.log('Changing password')
  alert('Password updated successfully')
  passwordForm.value = { current: '', new: '', confirm: '' }
}
</script>
