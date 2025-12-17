import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['node_modules/', 'dist/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/generated/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts',
        // Re-export files with no logic
        'src/services/discordService.ts',
        'src/services/settingsService.ts',
        'src/utils/permissionService.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
