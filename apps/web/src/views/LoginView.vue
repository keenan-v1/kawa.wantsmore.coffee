<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4">
        <v-card>
          <v-card-title class="text-h5">Login</v-card-title>
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
            <v-form @submit.prevent="handleLogin">
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
              <v-btn
                type="submit"
                color="primary"
                block
                class="mt-4"
                :loading="loading"
              >
                Login
              </v-btn>
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text to="/register" :disabled="loading">
              Don't have an account? Register
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../services/api'
import { useUserStore } from '../stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const profileName = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await api.auth.login({
      profileName: profileName.value,
      password: password.value
    })

    if (response.ok) {
      const data = await response.json()
      // Store JWT token and user data
      localStorage.setItem('jwt', data.token)
      userStore.setUser(data.user)

      // Redirect to the intended destination or default to /market
      const redirectTo = (route.query.redirect as string) || '/market'
      router.push(redirectTo)
    } else if (response.status === 404) {
      // Account doesn't exist - we can indicate this
      errorMessage.value = 'Account not found. Please check your profile name or register.'
    } else if (response.status === 400 || response.status === 401) {
      // Bad credentials - don't indicate which part is wrong
      errorMessage.value = 'Invalid credentials. Please try again.'
    } else {
      errorMessage.value = 'An error occurred. Please try again later.'
    }
  } catch (error) {
    console.error('Login error:', error)
    errorMessage.value = 'Unable to connect to server. Please try again later.'
  } finally {
    loading.value = false
  }
}
</script>
