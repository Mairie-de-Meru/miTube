import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// BASE_PATH vide => chemins relatifs ("./") : fonctionne sous https://user.github.io/repo/,
// sur un domaine personnalisé et en ouvrant dist/ depuis n'importe quel sous-dossier.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react()],
  // ffmpeg.wasm lance son propre Worker : il ne doit pas être pré-bundlé.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
})
