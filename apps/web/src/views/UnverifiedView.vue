<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card class="pa-4">
          <v-card-text class="text-center">
            <v-icon size="80" color="amber" class="mb-4">mdi-account-clock</v-icon>

            <h1 class="text-h4 mb-4">Registration Pending</h1>

            <p class="text-body-1 mb-6">
              Thank you for registering! Your account is awaiting approval from an administrator.
              We'll get you set up as soon as possible.
            </p>

            <v-divider class="my-6" />

            <p class="text-body-2 text-medium-emphasis mb-4">
              In the meantime, join our Discord community to connect with other members:
            </p>

            <v-btn
              href="https://discord.gg/QmqcS2zgZR"
              target="_blank"
              color="indigo"
              size="large"
              prepend-icon="mdi-discord"
            >
              Join Discord
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
// No logic needed - this is a static informational page
</script>
