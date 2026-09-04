/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://sgreen-dev.github.io/pink-slips/
export default defineConfig({
  base: '/pink-slips/',
  // Source images for the site live here and are not served; a locked file in it must not stop the dev server.
  server: { watch: { ignored: ['**/game-images/**', '**/music/**'] } },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
