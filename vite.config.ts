/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** The commit this build came from: CI hands it over, and a local build asks git. */
function commit(): string {
  const fromCi = process.env['GITHUB_SHA']
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Writes the commit into the build as a file anyone can fetch, so `scripts/deploy-check.ts` can
 * say whether the site and the two workers are the same commit rather than only that each of
 * them answered (backlog Q36).
 */
function versionFile(): Plugin {
  return {
    name: 'pink-slips-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ commit: commit() }),
      })
    },
  }
}

// Served from https://sgreen-dev.github.io/pink-slips/
export default defineConfig({
  base: '/pink-slips/',
  // Source images for the site live here and are not served; a locked file in it must not stop the dev server.
  server: { watch: { ignored: ['**/game-images/**', '**/music/**'] } },
  plugins: [react(), versionFile()],
  test: {
    environment: 'node',
    // The counter worker is standalone, so its test sits beside it rather than under src.
    include: ['src/**/*.test.{ts,tsx}', 'counter/*.test.ts'],
  },
})
