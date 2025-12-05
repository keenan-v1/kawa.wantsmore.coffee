<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card>
          <v-card-title class="text-h4">Terms of Service</v-card-title>
          <v-card-text class="text-body-1">
            <p class="text-caption text-medium-emphasis mb-4">
              Last updated: {{ lastUpdated }}
            </p>

            <h3 class="text-h6 mb-2">1. Acceptance of Terms</h3>
            <p class="mb-4">
              By accessing or using Kawakawa CX, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use this service.
            </p>

            <h3 class="text-h6 mb-2">2. Description of Service</h3>
            <p class="mb-4">
              Kawakawa CX is an internal commodity exchange platform for coordinating trades within
              the Kawakawa corporation in the game Prosperous Universe. This is a fan-made tool and
              is not affiliated with or endorsed by Simulogics GmbH.
            </p>

            <h3 class="text-h6 mb-2">3. No Warranties</h3>
            <p class="mb-4">
              This service is provided "as is" and "as available" without any warranties of any
              kind, either express or implied. We do not guarantee that the service will be
              uninterrupted, secure, or error-free.
            </p>

            <h3 class="text-h6 mb-2">4. Limitation of Liability</h3>
            <p class="mb-4">
              To the fullest extent permitted by law, Kawakawa CX and its operators shall not be
              liable for any direct, indirect, incidental, special, consequential, or punitive
              damages arising from your use of or inability to use this service.
            </p>

            <h3 class="text-h6 mb-2">5. User Conduct</h3>
            <p class="mb-4">
              You agree to use this service only for its intended purpose and in compliance with
              all applicable laws and the terms of service of Prosperous Universe.
            </p>

            <h3 class="text-h6 mb-2">6. Changes to Terms</h3>
            <p class="mb-4">
              We reserve the right to modify these terms at any time. Continued use of the service
              after changes constitutes acceptance of the new terms.
            </p>

            <h3 class="text-h6 mb-2">7. Contact</h3>
            <p>
              For questions about these terms, please contact Kawakawa corporation leadership
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
