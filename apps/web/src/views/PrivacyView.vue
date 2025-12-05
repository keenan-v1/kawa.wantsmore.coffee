<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card>
          <v-card-title class="text-h4">Privacy Policy</v-card-title>
          <v-card-text class="text-body-1">
            <p class="text-caption text-medium-emphasis mb-4">
              Last updated: {{ lastUpdated }}
            </p>

            <h3 class="text-h6 mb-2">1. Data We Collect</h3>
            <p class="mb-4">
              We collect only the minimum information necessary to operate this service:
            </p>
            <ul class="mb-4 ml-4">
              <li>Account information (username, display name, email if provided)</li>
              <li>Discord profile information if you choose to connect your Discord account</li>
              <li>Game data you choose to sync from Prosperous Universe via FIO</li>
              <li>Your marketplace orders and inventory listings</li>
            </ul>

            <h3 class="text-h6 mb-2">2. How We Use Your Data</h3>
            <p class="mb-4">
              Your data is used solely to provide the functionality of this service. We use it to:
            </p>
            <ul class="mb-4 ml-4">
              <li>Authenticate your account</li>
              <li>Display your inventory and orders to other corporation members</li>
              <li>Facilitate trades within the corporation</li>
            </ul>

            <h3 class="text-h6 mb-2">3. Data Sharing</h3>
            <p class="mb-4">
              <strong>We do not sell, trade, or share your data with any third parties.</strong>
              Your information is only visible to other authenticated members of the Kawakawa
              corporation as necessary for the exchange to function.
            </p>

            <h3 class="text-h6 mb-2">4. Data Storage</h3>
            <p class="mb-4">
              Your data is stored on secure servers. We retain your data only as long as your
              account is active. You may request deletion of your account and associated data at
              any time.
            </p>

            <h3 class="text-h6 mb-2">5. Cookies</h3>
            <p class="mb-4">
              We use only essential cookies and local storage for authentication purposes. We do
              not use tracking cookies or analytics that collect personal information.
            </p>

            <h3 class="text-h6 mb-2">6. Your Rights</h3>
            <p class="mb-4">You have the right to:</p>
            <ul class="mb-4 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Disconnect linked services (Discord, FIO)</li>
            </ul>

            <h3 class="text-h6 mb-2">7. Contact</h3>
            <p>
              For privacy concerns or data requests, please contact Kawakawa corporation leadership
              through Discord.
            </p>
          </v-card-text>
          <v-card-actions>
            <v-btn variant="text" to="/login">Back to Login</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
const lastUpdated = 'December 2024'
</script>
