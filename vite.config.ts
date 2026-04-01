import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Subpasta no servidor (ex.: /admin/): defina VITE_BASE_URL no build (secret no GitHub Actions).
function baseUrl(): string {
  const v = process.env.VITE_BASE_URL?.trim()
  if (!v || v === '/') return '/'
  return v.endsWith('/') ? v : `${v}/`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: baseUrl(),
})
