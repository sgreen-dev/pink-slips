/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
  /*
   * strictPort so a second `npm run dev` fails instead of walking to the next free port and
   * leaving the first one running: that walk is what let five servers pile up unnoticed, one of
   * them launched with `--port 5173` and answering on 5174. It also keeps the dev server on the
   * one origin the workers allow, since `src/server/http.ts` and `counter/worker.ts` both name
   * localhost:5173, so a drifted port quietly breaks online play and the counter.
   * `npm run dev:stop` clears a server left behind.
   *
   * Source images for the site live under the ignored folders and are not served; a locked file
   * in one of them must not stop the dev server.
   */
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/game-images/**', '**/music/**'] },
  },
  // Pinned for the same reason: both workers allow this one preview origin (backlog Q45), and a
  // drifted port would be refused by both.
  preview: { port: 4173, strictPort: true },
  plugins: [react(), versionFile()],
  // Sent with a crash report so a stack can be read against the code that threw (backlog Q38).
  define: { __COMMIT__: JSON.stringify(commit()) },
  test: {
    environment: 'node',
    // The workers and the scripts keep their own code outside src, so their tests sit beside it.
    include: [
      'src/**/*.test.{ts,tsx}',
      'counter/*.test.ts',
      'server/*.test.ts',
      'scripts/*.test.ts',
    ],
    // The objects under server/ import the platform's own module, which exists only inside a
    // worker; their tests load a stand-in with the same shape instead (backlog Q41).
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./server/testing.ts', import.meta.url)),
    },
  },
})
