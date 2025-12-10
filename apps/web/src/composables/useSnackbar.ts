import { ref } from 'vue'

export interface SnackbarState {
  show: boolean
  message: string
  color: 'success' | 'error' | 'warning' | 'info'
}

/**
 * Composable for managing snackbar notifications.
 * Provides a reactive snackbar state and a showSnackbar function.
 */
export function useSnackbar() {
  const snackbar = ref<SnackbarState>({
    show: false,
    message: '',
    color: 'success',
  })

  const showSnackbar = (message: string, color: SnackbarState['color'] = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  return {
    snackbar,
    showSnackbar,
  }
}
