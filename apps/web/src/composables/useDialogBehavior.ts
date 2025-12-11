// Composable for consistent dialog close behavior
// - ESC always closes the dialog
// - Click outside closes based on user setting (default: off)

import { computed, onMounted, onUnmounted, type Ref } from 'vue'
import { useSettingsStore } from '../stores/settings'

export interface UseDialogBehaviorOptions {
  /**
   * The v-model ref controlling the dialog's open state
   */
  modelValue: Ref<boolean>
}

export interface UseDialogBehaviorReturn {
  /**
   * Whether the dialog should be persistent (blocks click-outside)
   * Bind this to v-dialog's :persistent prop
   */
  persistent: Ref<boolean>

  /**
   * Disable the bounce animation when clicking outside
   * Bind this to v-dialog's :no-click-animation prop
   */
  noClickAnimation: boolean
}

/**
 * Provides consistent dialog close behavior across the application.
 *
 * Usage:
 * ```vue
 * <script setup>
 * const dialog = ref(false)
 * const { persistent, noClickAnimation } = useDialogBehavior({ modelValue: dialog })
 * </script>
 *
 * <template>
 *   <v-dialog
 *     v-model="dialog"
 *     :persistent="persistent"
 *     :no-click-animation="noClickAnimation"
 *   >
 *     ...
 *   </v-dialog>
 * </template>
 * ```
 */
export function useDialogBehavior(options: UseDialogBehaviorOptions): UseDialogBehaviorReturn {
  const { modelValue } = options
  const settings = useSettingsStore()

  // Dialog is persistent when click-outside-to-close is disabled
  const persistent = computed(() => !settings.closeDialogOnClickOutside.value)

  // Handle ESC key to close dialog even when persistent
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && modelValue.value) {
      event.preventDefault()
      event.stopPropagation()
      modelValue.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown, { capture: true })
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown, { capture: true })
  })

  return {
    persistent,
    noClickAnimation: true, // Always disable bounce animation
  }
}
