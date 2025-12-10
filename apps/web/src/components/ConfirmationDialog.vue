<template>
  <v-dialog
    :model-value="modelValue"
    max-width="400"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon v-if="icon" :color="iconColor" class="mr-2">{{ icon }}</v-icon>
        {{ title }}
      </v-card-title>
      <v-card-text>
        <slot>
          {{ message }}
        </slot>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="$emit('update:modelValue', false)">
          {{ cancelText }}
        </v-btn>
        <v-btn :color="confirmColor" :loading="loading" @click="$emit('confirm')">
          {{ confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    message?: string
    loading?: boolean
    confirmText?: string
    confirmColor?: string
    cancelText?: string
    icon?: string
    iconColor?: string
  }>(),
  {
    message: '',
    loading: false,
    confirmText: 'Confirm',
    confirmColor: 'primary',
    cancelText: 'Cancel',
    icon: '',
    iconColor: '',
  }
)

defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()
</script>
