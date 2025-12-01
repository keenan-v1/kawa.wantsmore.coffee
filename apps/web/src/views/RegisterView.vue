<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="6">
        <v-card>
          <v-card-title class="text-h5">Register</v-card-title>
          <v-card-text>
            <v-alert
              v-if="errorMessage"
              type="error"
              class="mb-4"
              closable
              @click:close="errorMessage = ''"
            >
              {{ errorMessage }}
            </v-alert>
            <v-alert
              v-if="successMessage"
              type="success"
              class="mb-4"
              closable
              @click:close="successMessage = ''"
            >
              {{ successMessage }}
            </v-alert>
            <v-form @submit.prevent="handleRegister">
              <v-text-field
                v-model="profileName"
                label="Profile Name"
                required
                prepend-icon="mdi-account"
                :disabled="loading"
              />
              <v-text-field
                v-model="password"
                label="Password"
                type="password"
                required
                prepend-icon="mdi-lock"
                :disabled="loading"
              />
              <v-text-field
                v-model="confirmPassword"
                label="Confirm Password"
                type="password"
                required
                prepend-icon="mdi-lock-check"
                :disabled="loading"
              />
              <v-btn
                type="submit"
                color="primary"
                block
                class="mt-4"
                :loading="loading"
              >
                Register
              </v-btn>
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text to="/login" :disabled="loading">
              Already have an account? Login
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'

const router = useRouter()
const profileName = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const handleRegister = async () => {
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }

  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await api.auth.register({
      profileName: profileName.value,
      password: password.value
    })

    if (response.ok) {
      successMessage.value = 'Registration successful! Redirecting to login...'
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } else if (response.status === 409) {
      // Profile name already exists
      errorMessage.value = 'Profile name already taken. Please choose a different one.'
    } else if (response.status === 400) {
      const data = await response.json()
      // Check if it's a duplicate username error
      if (data.message && (data.message.includes('already exists') || data.message.includes('already taken'))) {
        errorMessage.value = 'Profile name already taken. Please choose a different one.'
      } else {
        errorMessage.value = data.message || 'Invalid registration data. Please check your input.'
      }
    } else if (response.status === 500) {
      // Backend returns 500 for validation errors, check message
      const data = await response.json()
      if (data.message && (data.message.includes('already exists') || data.message.includes('already taken'))) {
        errorMessage.value = 'Profile name already taken. Please choose a different one.'
      } else if (data.message) {
        errorMessage.value = data.message
      } else {
        errorMessage.value = 'An error occurred during registration. Please try again later.'
      }
    } else {
      errorMessage.value = 'An error occurred during registration. Please try again later.'
    }
  } catch (error) {
    console.error('Registration error:', error)
    errorMessage.value = 'Unable to connect to server. Please try again later.'
  } finally {
    loading.value = false
  }
}
</script>
