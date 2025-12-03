<template>
  <v-chip :color="displayRole?.color || 'grey'" :size="size" :variant="variant">
    {{ displayRole?.name || 'Internal' }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Role } from '@kawakawa/types'
import { roleService } from '../services/roleService'

const props = withDefaults(
  defineProps<{
    role?: Role | null
    roleId?: string | null
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  }>(),
  {
    role: null,
    roleId: null,
    size: 'small',
    variant: 'flat',
  }
)

// Resolve role from either the role prop or by looking up roleId
const displayRole = computed((): Role | null => {
  // If role object is provided directly, use it
  if (props.role) {
    return props.role
  }
  // If roleId is null/undefined, this is an "Internal" order
  if (!props.roleId) {
    return null
  }
  // Try to look up role from cache
  return roleService.getRoleByIdSync(props.roleId)
})
</script>
